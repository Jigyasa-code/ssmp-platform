/**
 * spreadsheet-parser.js
 * Reads HOD-uploaded roster files and Cluster Head academic-data files.
 * Uses ExcelJS for .xlsx and a small hand-rolled RFC-4180 reader for .csv.
 *
 * Note on the Phase 1 finding: the old code used SheetJS (xlsx) 0.18.5,
 * which carries prototype-pollution and ReDoS advisories. ExcelJS is the
 * replacement, and nothing in this file ever assigns a parsed key onto an
 * object literal without going through a null-prototype map first, so a
 * "__proto__" column header cannot poison anything.
 *
 * Two consumers, one reader: readSheetRows() does the file-format work and
 * both parseRosterFile() (accounts) and parseAcademicDataFile()
 * (attendance / GPA / backlogs) map its output onto their own header
 * vocabulary. Keeping the CSV/XLSX handling in one place means a fix to
 * quoting or date coercion lands for both.
 */

import ExcelJS from 'exceljs';
import { ApiError } from './http-response.js';

const MAX_ROWS = 5000;

/** Column header aliases, so the HOD's spreadsheet doesn't have to be exact. */
const HEADER_ALIASES = {
  email: ['email', 'e-mail', 'email id', 'e-mail id', 'mail', 'email address'],
  full_name: ['name', 'full name', 'student name', 'faculty name', 'staff name'],
  login_id: ['reg no', 'reg. no', 'reg no.', 'registration no', 'registration number',
             'roll no', 'roll number', 'faculty id', 'employee id', 'staff id', 'id'],
  branch: ['branch', 'dept', 'department', 'discipline'],
  section: ['section', 'sec'],
  semester_label: ['semester', 'sem', 'semester label'],
  phone: ['phone', 'mobile', 'mobile no', 'contact', 'contact no'],
  mentor_email: ['mentor email', 'faculty email', 'assigned mentor', 'mentor'],
  /** Only used by a combined import: says whether the row is staff or a student. */
  role: ['role', 'type', 'user type', 'category', 'designation type']
};

/** Free-text role values the combined importer understands. */
const FACULTY_ROLE_WORDS = ['faculty', 'mentor', 'staff', 'teacher', 'professor', 'prof', 'teaching'];
const STUDENT_ROLE_WORDS = ['student', 'mentee', 'learner'];

export function classifyRole(value) {
  const cleaned = String(value ?? '').trim().toLowerCase();
  if (!cleaned) return null;
  if (FACULTY_ROLE_WORDS.some((word) => cleaned.includes(word))) return 'faculty';
  if (STUDENT_ROLE_WORDS.some((word) => cleaned.includes(word))) return 'student';
  return null;
}

function normaliseHeader(raw) {
  const cleaned = String(raw ?? '').trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(cleaned)) return canonical;
  }
  return null;
}

/** RFC-4180-ish CSV reader: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\n') {
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else if (char !== '\r') {
      field += char;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

function rowsToRecords(rows) {
  if (rows.length < 2) {
    throw new ApiError('The spreadsheet needs a header row and at least one data row.', 400);
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new ApiError(`Too many rows (${rows.length - 1}). Split the file into batches of ${MAX_ROWS}.`, 400);
  }

  const headerMap = rows[0].map(normaliseHeader);
  if (!headerMap.includes('email')) {
    throw new ApiError(
      'No "Email" column found. Required columns: Email, Name. Optional: Reg No / Faculty ID, Branch, Section, Semester, Phone, Mentor Email, Role.',
      400
    );
  }

  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    // Object.create(null) — a "__proto__" header cannot pollute anything.
    const record = Object.create(null);
    let hasValue = false;
    for (let c = 0; c < headerMap.length; c += 1) {
      const key = headerMap[c];
      if (!key) continue;
      const value = String(rows[r][c] ?? '').trim();
      if (value) { record[key] = value; hasValue = true; }
    }
    if (hasValue) records.push({ rowNumber: r + 1, ...record });
  }
  return records;
}

/** Reads a .csv or .xlsx buffer into a raw array-of-arrays. */
async function readSheetRows(buffer, filename) {
  const lower = String(filename ?? '').toLowerCase();

  if (lower.endsWith('.csv')) {
    return parseCsv(buffer.toString('utf8'));
  }

  if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new ApiError('The workbook has no sheets.', 400);

    const rows = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value;
        if (v == null) values.push('');
        else if (typeof v === 'object' && 'text' in v) values.push(String(v.text));
        else if (typeof v === 'object' && 'result' in v) values.push(String(v.result ?? ''));
        else if (v instanceof Date) values.push(v.toISOString().slice(0, 10));
        else values.push(String(v));
      });
      rows.push(values);
    });
    return rows;
  }

  throw new ApiError('Only .csv and .xlsx files are supported (legacy .xls is not).', 400);
}

export async function parseRosterFile(buffer, filename) {
  return rowsToRecords(await readSheetRows(buffer, filename));
}

// =====================================================================
// Cluster Head academic data
// =====================================================================
/**
 * Header aliases for the three Cluster Head uploads. A student is matched
 * on registration number OR email, so either column is enough — the
 * departmental attendance export usually has the registration number and
 * nothing else.
 */
const ACADEMIC_HEADER_ALIASES = {
  identifier: [
    'reg no', 'reg. no', 'reg no.', 'registration no', 'registration number',
    'roll no', 'roll number', 'student id', 'id', 'email', 'e-mail', 'email id',
    'email address', 'student email'
  ],
  full_name: ['name', 'full name', 'student name'],
  classes_held: ['classes held', 'total classes', 'classes conducted', 'lectures held', 'total', 'held'],
  classes_attended: ['classes attended', 'attended', 'present', 'lectures attended', 'attendance'],
  attendance_percent: ['attendance %', 'attendance percent', 'attendance percentage', '% attendance', 'percentage'],
  gpa: ['gpa', 'sgpa', 'cgpa', 'grade point average', 'semester gpa'],
  subject_code: ['subject code', 'course code', 'paper code', 'backlog code', 'code'],
  subject_name: ['subject', 'subject name', 'course name', 'paper name'],
  is_cleared: ['cleared', 'is cleared', 'status', 'result']
};

const CLEARED_WORDS = ['yes', 'y', 'true', 'cleared', 'pass', 'passed', '1'];

function normaliseAcademicHeader(raw) {
  const cleaned = String(raw ?? '').trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ');
  for (const [canonical, aliases] of Object.entries(ACADEMIC_HEADER_ALIASES)) {
    if (aliases.includes(cleaned)) return canonical;
  }
  return null;
}

/**
 * Turns an uploaded attendance / GPA / backlog sheet into the row shape the
 * record_*_batch RPCs expect. Rows are built on Object.create(null) for the
 * same prototype-pollution reason as the roster parser.
 *
 * `kind` is 'attendance' | 'gpa' | 'backlog'.
 */
export async function parseAcademicDataFile(buffer, filename, kind) {
  const rows = await readSheetRows(buffer, filename);

  if (rows.length < 2) {
    throw new ApiError('The file needs a header row and at least one data row.', 400);
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new ApiError(`Too many rows (${rows.length - 1}). Split the file into batches of ${MAX_ROWS}.`, 400);
  }

  const headerMap = rows[0].map(normaliseAcademicHeader);
  if (!headerMap.includes('identifier')) {
    throw new ApiError(
      'No student column found. Add a "Reg No" (or "Email") column so each row can be matched to a student.',
      400
    );
  }

  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    const raw = Object.create(null);
    let hasValue = false;
    for (let c = 0; c < headerMap.length; c += 1) {
      const key = headerMap[c];
      if (!key) continue;
      const value = String(rows[r][c] ?? '').trim();
      if (value) { raw[key] = value; hasValue = true; }
    }
    if (!hasValue) continue;

    const record = { rowNumber: r + 1, identifier: raw.identifier ?? '' };

    if (kind === 'attendance') {
      // Preferred form: the two raw counts, which make the percentage
      // recomputable and let the DB weight courses by size. If the export
      // only carries a percentage, fall back to a synthetic /100 so the
      // upload still works rather than rejecting the whole file.
      if (raw.classes_held != null && raw.classes_attended != null) {
        record.classes_held = String(Math.trunc(Number(raw.classes_held)));
        record.classes_attended = String(Math.trunc(Number(raw.classes_attended)));
      } else if (raw.attendance_percent != null) {
        const percent = Number(String(raw.attendance_percent).replace('%', '').trim());
        record.classes_held = '100';
        record.classes_attended = Number.isFinite(percent)
          ? String(Math.max(0, Math.min(100, Math.round(percent))))
          : '';
      } else {
        record.classes_held = '';
        record.classes_attended = '';
      }
    } else if (kind === 'gpa') {
      record.gpa = raw.gpa ?? '';
    } else if (kind === 'backlog') {
      record.subject_code = raw.subject_code ?? '';
      record.subject_name = raw.subject_name ?? '';
      record.is_cleared = String(CLEARED_WORDS.includes(String(raw.is_cleared ?? '').toLowerCase()));
    }

    records.push(record);
  }

  if (!records.length) {
    throw new ApiError('No usable data rows were found in that file.', 400);
  }
  return records;
}
