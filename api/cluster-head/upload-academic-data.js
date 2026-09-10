/**
 * POST /api/cluster-head/upload-academic-data
 *
 * The Cluster Head's write path. One file rather than four because of the
 * Vercel function budget (§11.6) — the `action` field selects which kind
 * of upload this is:
 *
 *   { action: 'attendance', filename, file_base64 }
 *   { action: 'gpa',        semester_number?, filename, file_base64 }
 *   { action: 'backlog',    semester_number, exam_session?, filename, file_base64 }
 *   { action: 'mentor-map', filename, file_base64 }
 *
 * Attendance takes nothing but the file: the course code, course name,
 * reporting window and every section are read out of the export itself.
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
 * record_attendance_batch / record_gpa_batch / record_backlog_batch via
 * context.asUser — the caller's own token, so RLS and the function's own
 * authorization check both apply. The service_role client is used for
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
  assertBodySize
} from '../_lib/input-validation.js';
import {
  parseAcademicDataFile,
  parseAttendanceExport,
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
    rpcName = 'map_students_to_mentors';
    rpcArgs = { p_rows: rows };
  } else if (body.action === 'gpa') {
    rows = await parseAcademicDataFile(buffer, body.filename, 'gpa');
    rpcName = 'record_gpa_batch';
    rpcArgs = {
      p_semester_number: body.semester_number ?? null,
      p_filename: body.filename,
      p_rows: rows
    };
  } else {
    rows = await parseAcademicDataFile(buffer, body.filename, body.action);
    rpcName = 'record_backlog_batch';
    rpcArgs = {
      p_semester_number: body.semester_number,
      p_exam_session: body.exam_session ?? null,
      p_filename: body.filename,
      p_rows: rows
    };
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
      failed: data?.failed ?? 0
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
        (unchanged ? ` ${unchanged} were already correct.` : '') +
        (failed ? ` ${failed} could not be matched.` : ''),
      data ?? {}
    );
  }

  sendSuccess(
    res,
    failed
      ? `${matched} row(s) recorded${scope}, ${failed} could not be matched.`
      : `${matched} row(s) recorded${scope}.`,
    data ?? {}
  );
});
