/**
 * POST /api/admin/import-roster-spreadsheet
 * HOD-only. Parses an uploaded faculty or student roster (.csv / .xlsx),
 * creates Supabase Auth accounts, links students to their mentor and
 * records the batch (successes and per-row failures) for the audit trail.
 *
 * Body: {
 *   import_type: 'faculty' | 'student',
 *   filename: string,
 *   file_base64: string,
 *   semester_cycle_id?: uuid,
 *   default_mentor_id?: uuid,      // fallback when a row has no Mentor Email
 *   create_accounts?: boolean      // false = dry run / validation only
 * }
 */
import { withApiDefaults, sendSuccess, ApiError } from '../_lib/http-response.js';
import { requireAuthenticatedUser, requireRole, enforceRateLimit, recordAuditEntry } from '../_lib/request-guards.js';
import { parseOrThrow, rosterImportSchema, emailSchema, generateTemporaryPassword, assertBodySize, sanitizeSingleLine } from '../_lib/input-validation.js';
import { parseRosterFile } from '../_lib/spreadsheet-parser.js';

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default withApiDefaults(['POST'], async (req, res) => {
  assertBodySize(req);

  const context = await requireAuthenticatedUser(req);
  requireRole(context, 'hod');
  await enforceRateLimit(context, { key: 'roster-import', max: 10, windowSeconds: 300 });

  const body = parseOrThrow(rosterImportSchema, req.body ?? {});
  const { admin } = context;

  let buffer;
  try {
    buffer = Buffer.from(body.file_base64, 'base64');
  } catch {
    throw new ApiError('The uploaded file could not be decoded.', 400);
  }
  if (!buffer.length) throw new ApiError('The uploaded file is empty.', 400);
  if (buffer.length > 10 * 1024 * 1024) throw new ApiError('The file is larger than 10 MB.', 413);

  const records = await parseRosterFile(buffer, body.filename);

  // Pre-load faculty so we can resolve "Mentor Email" without N queries.
  const { data: facultyRows } = await admin
    .from('user_profiles')
    .select('id, email, full_name, employment_status')
    .eq('role', 'faculty');
  const facultyByEmail = new Map((facultyRows ?? []).map((f) => [f.email.toLowerCase(), f]));

  const { data: existingRows } = await admin.from('user_profiles').select('email');
  const existingEmails = new Set((existingRows ?? []).map((r) => r.email.toLowerCase()));

  const created = [];
  const skipped = [];
  const failed = [];

  for (const record of records) {
    const rowLabel = `Row ${record.rowNumber}`;
    try {
      const emailResult = emailSchema.safeParse(record.email ?? '');
      if (!emailResult.success) {
        failed.push({ row: record.rowNumber, email: record.email ?? '', reason: emailResult.error.issues[0].message });
        continue;
      }
      const email = emailResult.data;

      if (!record.full_name || record.full_name.length < 2) {
        failed.push({ row: record.rowNumber, email, reason: 'Missing or too-short Name' });
        continue;
      }
      if (existingEmails.has(email)) {
        skipped.push({ row: record.rowNumber, email, reason: 'Account already exists' });
        continue;
      }

      let mentorId = null;
      if (body.import_type === 'student') {
        if (record.mentor_email) {
          const mentor = facultyByEmail.get(record.mentor_email.toLowerCase());
          if (!mentor) {
            failed.push({ row: record.rowNumber, email, reason: `Mentor "${record.mentor_email}" is not a registered faculty member. Import the faculty roster first.` });
            continue;
          }
          if (mentor.employment_status !== 'active') {
            failed.push({ row: record.rowNumber, email, reason: `Mentor "${record.mentor_email}" is marked ${mentor.employment_status}` });
            continue;
          }
          mentorId = mentor.id;
        } else if (body.default_mentor_id) {
          mentorId = body.default_mentor_id;
        }
      }

      if (!body.create_accounts) {
        created.push({ row: record.rowNumber, email, full_name: record.full_name, dry_run: true });
        existingEmails.add(email);
        continue;
      }

      const temporaryPassword = generateTemporaryPassword();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          role: body.import_type,
          full_name: sanitizeSingleLine(record.full_name, 120),
          login_id: record.login_id ? sanitizeSingleLine(record.login_id, 40) : null,
          branch: record.branch ? sanitizeSingleLine(record.branch, 60) : null,
          section: record.section ? sanitizeSingleLine(record.section, 10) : null,
          semester_label: record.semester_label ? sanitizeSingleLine(record.semester_label, 40) : null,
          phone: /^[0-9]{10}$/.test(record.phone ?? '') ? record.phone : null,
          department: 'IoT & IS',
          must_change_password: true
        },
        app_metadata: { role: body.import_type }
      });

      if (error) {
        failed.push({ row: record.rowNumber, email, reason: error.message });
        continue;
      }

      if (mentorId) {
        await admin.from('user_profiles').update({ assigned_mentor_id: mentorId }).eq('id', data.user.id);
      }
      if (body.import_type === 'faculty') {
        facultyByEmail.set(email, { id: data.user.id, email, full_name: record.full_name, employment_status: 'active' });
      }

      existingEmails.add(email);
      created.push({
        row: record.rowNumber,
        id: data.user.id,
        email,
        full_name: record.full_name,
        login_id: record.login_id ?? null,
        temporary_password: temporaryPassword
      });
    } catch (error) {
      failed.push({ row: record.rowNumber, email: record.email ?? '', reason: `${rowLabel}: ${error.message}` });
    }
  }

  const { data: batch } = await admin
    .from('roster_import_batches')
    .insert({
      semester_cycle_id: body.semester_cycle_id ?? null,
      import_type: body.import_type,
      original_filename: sanitizeSingleLine(body.filename, 255),
      total_rows: records.length,
      created_count: created.length,
      skipped_count: skipped.length,
      failed_count: failed.length,
      row_errors: failed.slice(0, 200),
      uploaded_by: context.profile.id
    })
    .select()
    .single();

  if (body.semester_cycle_id && body.create_accounts) {
    const column = body.import_type === 'faculty' ? 'faculty_imported_count' : 'student_imported_count';
    const { data: cycle } = await admin
      .from('semester_cycles').select('*').eq('id', body.semester_cycle_id).maybeSingle();
    if (cycle) {
      await admin
        .from('semester_cycles')
        .update({
          [column]: (cycle[column] ?? 0) + created.length,
          current_step: Math.max(cycle.current_step, body.import_type === 'faculty' ? 3 : 4)
        })
        .eq('id', body.semester_cycle_id);
    }
  }

  await recordAuditEntry(context, req, `admin.import_${body.import_type}_roster`, {
    type: 'roster_import_batches',
    id: batch?.id,
    metadata: { filename: body.filename, total: records.length, created: created.length, failed: failed.length, dry_run: !body.create_accounts }
  });

  sendSuccess(
    res,
    body.create_accounts
      ? `Imported ${created.length} of ${records.length} rows. ${skipped.length} already existed, ${failed.length} failed.`
      : `Validated ${records.length} rows. ${created.length} ready to import, ${skipped.length} already exist, ${failed.length} have problems.`,
    { batch_id: batch?.id ?? null, total_rows: records.length, created, skipped, failed },
    201
  );
});
