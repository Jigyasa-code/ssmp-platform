/**
 * input-validation.js
 * Zod schemas for every request body the API accepts. Validation happens
 * before anything touches the database, so malformed input produces a
 * clean 400 rather than a raw Postgres error.
 */

import { z } from 'zod';
import { ApiError } from './http-response.js';

const uuid = z.string().uuid('Must be a valid ID');

/** Institutional email. Domain allow-list is configurable via env. */
const allowedEmailDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(255)
  .refine(
    (value) =>
      allowedEmailDomains.length === 0 ||
      allowedEmailDomains.some((domain) => value.endsWith(`@${domain}`)),
    {
      message: `Email must belong to one of: ${allowedEmailDomains.join(', ') || 'any domain'}`
    }
  );

export const provisionUserSchema = z.object({
  email: emailSchema,
  full_name: z.string().trim().min(2, 'Name is too short').max(120),
  role: z.enum(['student', 'faculty', 'hod', 'cluster_head']),
  login_id: z.string().trim().min(1).max(40).optional().nullable(),
  branch: z.string().trim().max(60).optional().nullable(),
  section: z.string().trim().max(10).optional().nullable(),
  semester_label: z.string().trim().max(40).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9]{10}$/, 'Phone must be 10 digits')
    .optional()
    .nullable(),
  assigned_mentor_id: uuid.optional().nullable(),
  send_invite_email: z.boolean().optional().default(false)
});

export const provisionBatchSchema = z.object({
  accounts: z.array(provisionUserSchema).min(1).max(500)
});

export const rosterImportSchema = z.object({
  import_type: z.enum(['faculty', 'student', 'combined']),
  filename: z.string().trim().min(1).max(255),
  /** base64 of the .csv / .xlsx file, capped well under the Vercel body limit */
  file_base64: z.string().min(1).max(8_000_000),
  semester_cycle_id: uuid.optional().nullable(),
  default_mentor_id: uuid.optional().nullable(),
  create_accounts: z.boolean().optional().default(true)
});

export const facultyStatusSchema = z.object({
  faculty_id: uuid,
  employment_status: z.enum(['active', 'on_leave', 'departed']),
  available_for_reassignment: z.boolean().optional()
});

export const reassignmentSchema = z.object({
  student_ids: z.array(uuid).min(1, 'Select at least one student').max(500),
  from_faculty_id: uuid.optional().nullable(),
  to_faculty_id: uuid,
  reason: z.string().trim().max(500).optional().nullable()
});

export const facultyReportQuerySchema = z.object({
  /** 'all' asks for the consolidated department report (HOD only). */
  faculty_id: z.union([uuid, z.literal('all')]).optional().nullable(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional().nullable(),
  format: z.enum(['json', 'pdf']).optional().default('json')
});

export const studentReportQuerySchema = z.object({
  student_id: uuid,
  format: z.enum(['json', 'pdf']).optional().default('json')
});

// ---------------------------------------------------------------------
// Cluster Head uploads
// ---------------------------------------------------------------------
/**
 * There is deliberately NO date constraint anywhere in these schemas. A
 * Cluster Head may upload attendance on any day — early, late, or twice in
 * one afternoon. The 15-day cadence belongs to cycle_job_schedule, not to
 * the upload.
 */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const clusterHeadSetupSchema = z.object({
  courses: z
    .array(
      z.object({
        course_name: z.string().trim().min(2, 'Course name is too short').max(160),
        course_code: z.string().trim().min(1, 'Course code is required').max(40),
        section_count: z.coerce.number().int().min(1, 'At least 1 section').max(15, 'At most 15 sections')
      })
    )
    .min(1, 'Add at least one subject')
    .max(60, 'That is more subjects than one cluster head can handle')
});

const uploadFileSchema = {
  filename: z.string().trim().min(1).max(255),
  file_base64: z.string().min(1).max(8_000_000)
};

export const attendanceUploadSchema = z.object({
  action: z.literal('attendance'),
  course_id: uuid,
  section: z.string().trim().regex(/^[A-O]$/, 'Pick a section from the dropdown'),
  period_start: isoDate,
  period_end: isoDate,
  ...uploadFileSchema
});

export const gpaUploadSchema = z.object({
  action: z.literal('gpa'),
  semester_number: z.coerce.number().int().min(1).max(8),
  ...uploadFileSchema
});

export const backlogUploadSchema = z.object({
  action: z.literal('backlog'),
  semester_number: z.coerce.number().int().min(1).max(8),
  exam_session: z.string().trim().max(60).optional().nullable(),
  ...uploadFileSchema
});

export const clusterHeadUploadSchema = z.discriminatedUnion('action', [
  attendanceUploadSchema,
  gpaUploadSchema,
  backlogUploadSchema
]);

/** On-demand trigger for anything that normally runs on the 15-day cycle. */
export const cycleJobSchema = z.object({
  job_type: z.enum([
    'survey_cycle',
    'survey_reminder_sweep',
    'at_risk_sweep',
    'at_risk_meeting_dispatch',
    'all'
  ]),
  /**
   * 'manual' does the work but leaves next_run_due_on alone, which is what
   * makes repeated testing safe. 'scheduled' is what a cron would send.
   */
  trigger_source: z.enum(['manual', 'scheduled']).optional().default('manual'),
  note: z.string().trim().max(300).optional().nullable()
});

/** Parses and throws a 400 with a readable list of problems. */
export function parseOrThrow(schema, payload) {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`
    );
    throw new ApiError(`Invalid request — ${problems.join('; ')}`, 400);
  }
  return result.data;
}

/** Guards against oversized JSON bodies before parsing them. */
export function assertBodySize(req, maxBytes = 10 * 1024 * 1024) {
  const declared = Number(req.headers['content-length'] || 0);
  if (declared > maxBytes) {
    throw new ApiError('Request body is too large', 413);
  }
}

/** Strips characters that could break a downstream CSV / header. */
export function sanitizeSingleLine(value, maxLength = 200) {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Generates a password that satisfies Supabase's default policy. */
export function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*';
  const all = upper + lower + digits + symbols;
  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
