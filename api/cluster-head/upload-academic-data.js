/**
 * POST /api/cluster-head/upload-academic-data
 *
 * The Cluster Head's write path. One file rather than five because of the
 * Vercel function budget (§11.6) — the `action` field selects which kind
 * of upload this is:
 *
 *   { action: 'attendance', filename, file_base64 }
 *   { action: 'gpa',        semester_number?, filename, file_base64 }
 *   { action: 'backlog',    semester_number?, exam_session?, filename, file_base64 }
 *   { action: 'black-dot',  filename, file_base64 }
 *   { action: 'mentor-map', filename, file_base64 }
 *
 * Every one of them takes the file as the ERP (or the Proctorial Board)
 * produces it. Attendance reads its course, dates and sections from the
 * export; GPA reads every semester column of the CGPA / GPA & Credits
 * export; backlogs read the semester and exam from the Defaulter Grade
 * title lines; black dots read case numbers from the notice. The two
 * optional backlog fields are fallbacks for a file that does not say.
 *
 * Students are matched on registration number only, in the database
 * (resolve_student_ids, migration 0035).
 *
 * NO DATE GATE
 * ---------------------------------------------------------------------
 * Attendance may be uploaded on any day of the month — early, late, or
 * more than once. Nothing here checks the calendar, and nothing here
 * touches the 15-day job schedule. The only knock-on effect of an upload
 * is that the students in the file get their risk flags re-evaluated
 * immediately, which happens inside the RPC.
 *
 * WHY THE WORK HAPPENS IN THE DATABASE
 * ---------------------------------------------------------------------
 * This endpoint parses the spreadsheet and then hands the rows to
 * record_attendance_batch / record_gpa_batch / record_backlog_batch /
 * record_black_dot_batch via context.asUser — the caller's own token, so
 * RLS and the function's own authorization check both apply. The service_role client is used for
 * nothing but the audit entry. Matching a row to a student, writing it,
 * recording the batch and re-evaluating risk are one transaction in
 * Postgres rather than a sequence of API calls that could half-fail.
 */
import { withApiDefaults, sendSuccess, ApiError } from '../_lib/http-response.js';
import {
  requireAuthenticatedUser,
  requireRole,
  enforceRateLimit,
  recordAuditEntry
} from '../_lib/request-guards.js';
import {
  parseOrThrow,
  clusterHeadUploadSchema,
  emailSchema,
  sanitizeSingleLine,
  assertBodySize
} from '../_lib/input-validation.js';
import { env } from '../_lib/environment.js';
import { runPool } from '../_lib/concurrency.js';
import {
  parseAttendanceExport,
  parseBacklogExport,
  parseBlackDotNotice,
  parseGpaExport,
  parseMentorMappingFile
} from '../_lib/spreadsheet-parser.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

/**
 * Supabase reports transport problems (a malformed key, a DNS failure) as
 * an ordinary { error } object. Forwarding error.message verbatim once put
 * a raw JWT on a user's screen (§12.5) — log the detail, return something
 * actionable.
 */
function toClientError(error, fallback) {
  const message = String(error?.message ?? '');
  if (/fetch failed|invalid header|ENOTFOUND|ECONNREFUSED/i.test(message)) {
    console.error('[cluster-head-upload] transport failure:', message);
    return new ApiError(
      'Could not reach the database. Check the Supabase configuration at /api/health.',
      502
    );
  }
  return new ApiError(message || fallback, 400);
}

/**
 * Gives every mentor named in the mapping file an account, so the file can
 * be uploaded on its own instead of only after a faculty roster.
 *
 * The mapping RPC matches mentors by email against existing profiles and
 * fails any row it cannot match — which meant this file, which already
 * carries every mentor's address, could not be the thing that introduced
 * them. Creating the missing ones first turns those failures into logins.
 *
 * Addresses go through emailSchema, so the allowed-domain rule applies:
 * an outside address in the spreadsheet cannot mint itself a faculty
 * account. An address that already belongs to a student or the HOD is
 * rejected by Supabase and reported as a row problem rather than being
 * quietly promoted.
 */
async function createMissingMentors(admin, rows) {
  const wanted = new Map();
  for (const row of rows) {
    const parsed = emailSchema.safeParse(row.mentor_email ?? '');
    if (!parsed.success || wanted.has(parsed.data)) continue;
    wanted.set(parsed.data, sanitizeSingleLine(row.mentor_name, 120));
  }
  if (!wanted.size) return { created: 0, errors: [] };

  // Compared in JS rather than with .in(): user_profiles stores the email
  // as it was given and only the unique INDEX is lowercased, so a mentor
  // saved as "Bagesh.Kumar@..." has to match "bagesh.kumar@...".
  const { data: faculty } = await admin.from('user_profiles').select('email').eq('role', 'faculty');
  const known = new Set((faculty ?? []).map((f) => f.email.toLowerCase()));

  // Same reason as the roster import: this is all network wait, and a
  // department with a hundred mentors should not spend half a minute on
  // it. There is no ordering to preserve here — every mentor is
  // independent — so the whole list goes straight through the pool.
  const missing = [...wanted].filter(([email]) => !known.has(email));
  let created = 0;
  const errors = [];
  await runPool(missing, 5, async ([email, name]) => {
    const { error } = await admin.auth.admin.createUser({
      email,
      password: env.TEMPORARY_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: 'faculty',
        full_name: name || email.split('@')[0],
        department: 'IoT & IS',
        must_change_password: true
      },
      app_metadata: { role: 'faculty' }
    });
    if (error) errors.push({ email, reason: error.message });
    else created += 1;
  });
  return { created, errors };
}

export default withApiDefaults(['POST'], async (req, res) => {
  assertBodySize(req);

  const context = await requireAuthenticatedUser(req);
  // The HOD is included so the department can correct an upload without
  // borrowing the Cluster Head's account. No other role can reach this.
  requireRole(context, 'cluster_head', 'hod');
  await enforceRateLimit(context, { key: 'academic-upload', max: 30, windowSeconds: 300 });

  const body = parseOrThrow(clusterHeadUploadSchema, req.body ?? {});

  if (context.profile.role === 'cluster_head' && !context.profile.cluster_head_setup_completed) {
    throw new ApiError('Complete the cluster head setup form before uploading data.', 403);
  }

  let buffer;
  try {
    buffer = Buffer.from(body.file_base64, 'base64');
  } catch {
    throw new ApiError('The uploaded file could not be decoded.', 400);
  }
  if (!buffer.length) throw new ApiError('The uploaded file is empty.', 400);
  if (buffer.length > 10 * 1024 * 1024) throw new ApiError('The file is larger than 10 MB.', 413);

  let rows;
  let rpcName;
  let rpcArgs;
  // What the parser read out of the file itself (semesters, exam, cases),
  // echoed back so the Cluster Head can confirm it was the file they meant.
  let fileMeta = null;
  let mentors = { created: 0, errors: [] };

  if (body.action === 'attendance') {
    // Course, dates and every section are read out of the export's own
    // header and rows. Nothing is supplied by the client. meta.section is
    // only a fallback for a single-section export that fills the header
    // in — the consolidated one leaves it blank and puts the section on
    // each row instead.
    const { meta, records } = await parseAttendanceExport(buffer, body.filename);
    rows = records;
    rpcName = 'record_attendance_batch';
    rpcArgs = {
      p_course_code: meta.course_code,
      p_course_name: meta.course_name,
      p_section: meta.section,
      p_period_start: meta.period_start,
      p_period_end: meta.period_end,
      p_filename: body.filename,
      p_rows: records
    };
  } else if (body.action === 'mentor-map') {
    rows = await parseMentorMappingFile(buffer, body.filename);
    // Before the mapping, not after: the RPC needs the accounts to exist.
    mentors = await createMissingMentors(context.admin, rows);
    rpcName = 'map_students_to_mentors';
    rpcArgs = { p_rows: rows };
  } else if (body.action === 'gpa') {
    // Every graded semester in the file, with credits, plus the official
    // CGPA. The semester of each GPA comes from the header above it.
    const { meta, records } = await parseGpaExport(buffer, body.filename);
    rows = records;
    fileMeta = meta;
    rpcName = 'record_gpa_batch';
    rpcArgs = {
      p_semester_number: body.semester_number ?? null,
      p_filename: body.filename,
      p_rows: records
    };
  } else if (body.action === 'backlog') {
    const { meta, records } = await parseBacklogExport(buffer, body.filename);
    // The file's own title wins for the semester; the dropdown is only for
    // a file that does not name one. The exam label is free text, so what
    // the Cluster Head typed wins over the title.
    const semester = meta.semester ?? body.semester_number ?? null;
    if (!semester) {
      throw new ApiError('The file does not say which semester it is for. Choose the semester, then upload it again.', 400);
    }
    rows = records;
    fileMeta = { ...meta, semester };
    rpcName = 'record_backlog_batch';
    rpcArgs = {
      p_semester_number: semester,
      p_exam_session: body.exam_session || meta.exam_session || null,
      p_filename: body.filename,
      p_rows: records,
      // Every subject column: what lets the database clear a backlog this
      // defaulter list no longer marks. Null for a hand-made list.
      p_subject_codes: meta.subject_codes
    };
  } else {
    const { meta, records } = await parseBlackDotNotice(buffer, body.filename);
    rows = records;
    fileMeta = meta;
    rpcName = 'record_black_dot_batch';
    rpcArgs = { p_filename: body.filename, p_rows: records };
  }

  const { data, error } = await context.asUser.rpc(rpcName, rpcArgs);
  if (error) throw toClientError(error, 'The upload could not be recorded.');

  await recordAuditEntry(context, req, `cluster_head.upload_${body.action}`, {
    type: 'academic_upload_batches',
    id: data?.batch_id ?? null,
    metadata: {
      action: body.action,
      filename: body.filename,
      total_rows: data?.total_rows ?? rows.length,
      matched: data?.matched ?? 0,
      failed: data?.failed ?? 0,
      ...(body.action === 'backlog' ? { semester: data?.semester_number, cleared: data?.backlogs_cleared ?? 0 } : {}),
      ...(body.action === 'black-dot' ? { cases: data?.case_numbers ?? [] } : {}),
      // Account creation is privileged; it belongs in the audit trail
      // even when the upload itself was routine.
      mentor_accounts_created: mentors.created
    }
  });

  const matched = data?.matched ?? 0;
  const failed = data?.failed ?? 0;
  // Naming the course and the sections back to the Cluster Head is how
  // they confirm the file they picked was the one they meant, given they
  // no longer choose either from a dropdown.
  const scope = data?.course_code
    ? ` for ${data.course_code}${data.section ? ` (section ${data.section})` : ''}`
    : '';

  if (body.action === 'mentor-map') {
    const unchanged = data?.unchanged ?? 0;
    return sendSuccess(
      res,
      `${matched} student(s) mapped to their mentor.` +
        (mentors.created
          ? ` ${mentors.created} mentor account(s) created — they sign in with the temporary password.`
          : '') +
        (unchanged ? ` ${unchanged} were already correct.` : '') +
        (failed ? ` ${failed} could not be matched.` : ''),
      {
        ...(data ?? {}),
        mentors_created: mentors.created,
        mentor_errors: mentors.errors
      }
    );
  }

  const payload = { ...(data ?? {}), file_meta: fileMeta };

  if (body.action === 'gpa') {
    const semesters = data?.semesters ?? [];
    const what = [
      semesters.length ? `semester ${semesters.join(', ')} GPA` : null,
      data?.cgpa_recorded ? 'CGPA' : null
    ].filter(Boolean).join(' and ');
    const skipped = data?.skipped ?? 0;
    return sendSuccess(
      res,
      `${matched} student(s) recorded${what ? ` (${what})` : ''}.` +
        (failed ? ` ${failed} could not be recorded.` : '') +
        (skipped ? ` ${skipped} had nothing graded yet.` : ''),
      payload
    );
  }

  if (body.action === 'backlog') {
    const cleared = data?.backlogs_cleared ?? 0;
    return sendSuccess(
      res,
      `${data?.backlogs_recorded ?? 0} backlog(s) recorded for semester ${data?.semester_number}` +
        (cleared ? `, ${cleared} cleared.` : '.') +
        (failed ? ` ${failed} row(s) could not be matched.` : ''),
      payload
    );
  }

  if (body.action === 'black-dot') {
    return sendSuccess(
      res,
      `${matched} black dot(s) recorded across ${data?.cases ?? 0} case(s).` +
        (failed ? ` ${failed} row(s) could not be recorded.` : ''),
      payload
    );
  }

  sendSuccess(
    res,
    failed
      ? `${matched} row(s) recorded${scope}, ${failed} could not be matched.`
      : `${matched} row(s) recorded${scope}.`,
    payload
  );
});
