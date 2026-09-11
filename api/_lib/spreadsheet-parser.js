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
  branch: ['branch', 'dept', 'department', 'discipline',
           'program', 'program name', 'programme', 'programme name'],
  section: ['section', 'sec'],
  semester_label: ['semester', 'sem', 'semester label'],
  phone: ['phone', 'mobile', 'mobile no', 'mobile number', 'contact', 'contact no'],
  mentor_email: ['mentor email', 'faculty email', 'assigned mentor', 'mentor'],
  /**
   * Guardian contact, straight off the Registered Students export. The
   * At-Risk page has always had a Parent Contact column reading Form A,
   * which is blank until the student fills one in — this is what makes
   * that column useful from day one.
   */
  parent_name:   ["father's name", 'father name', 'parent name', 'guardian name'],
  parent_mobile: ["father's number", 'father number', "father's mobile", "father's contact",
                  'parent number', 'parent mobile', 'guardian number', 'guardian mobile'],
  parent_email:  ["father's email", 'father email', 'parent email', 'guardian email'],
  /**
   * Optional. When present, this becomes the account's initial password
   * instead of a generated one, so the HOD can hand out a password they
   * already know. The account is still forced to change it on first
   * sign-in — this replaces the *generation*, not the change-on-first-use
   * rule. Blank cells fall back to a generated password.
   */
  password: ['password', 'initial password', 'temporary password', 'temp password', 'default password'],
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

/**
 * One header normaliser for all four column maps below.
 *
 * The trailing trim() matters: "Registration No." becomes "registration
 * no " once the dot is turned into a space, and without the second trim
 * it matches nothing — which is exactly how the real ERP and roster
 * exports spell that column.
 */
function cleanHeader(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseHeader(raw) {
  const cleaned = cleanHeader(raw);
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

/**
 * The ERP's "export to Excel" produces an HTML <table> saved with a .xls
 * extension — not a spreadsheet at all. Neither ExcelJS nor the CSV reader
 * can touch it, so it gets its own reader.
 *
 * Deliberately a small tag-stripper rather than a DOM parser: the input is
 * one machine-generated table with no scripts, no attributes we care about
 * and no nesting beyond the header block, and adding an HTML parser to the
 * serverless bundle for it would be disproportionate. Everything is
 * entity-decoded and tags are discarded, so nothing from the file is ever
 * interpreted as markup.
 */
function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, 2048).toString('utf8').toLowerCase();
  return /<table|<html|<!doctype html|<tr[\s>]/.test(head);
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function parseHtmlTable(text) {
  const rows = [];
  // Rows are delimited by </tr>, cells by </td> or </th>. Nested tables in
  // the header block flatten into the row that contains them, which is
  // exactly what we want: the metadata lines come through as plain cells.
  for (const rawRow of text.split(/<\/tr\s*>/i)) {
    if (!/<t[dh][\s>]/i.test(rawRow)) continue;
    const cells = rawRow
      .split(/<\/t[dh]\s*>/i)
      .slice(0, -1)
      .map((cell) =>
        decodeEntities(cell.replace(/<[^>]*>/g, ' '))
          .replace(/\s+/g, ' ')
          .trim()
      );
    if (cells.some((cell) => cell !== '')) rows.push(cells);
  }
  return rows;
}

/** Reads a .csv, .xlsx or HTML-table-masquerading-as-.xls buffer. */
async function readSheetRows(buffer, filename) {
  const lower = String(filename ?? '').toLowerCase();

  // Extension is a hint, not proof — check the bytes first.
  if (looksLikeHtml(buffer)) {
    return parseHtmlTable(buffer.toString('utf8'));
  }

  if (lower.endsWith('.csv')) {
    return parseCsv(buffer.toString('utf8'));
  }

  if (lower.endsWith('.xls')) {
    // A genuine binary .xls (BIFF, starts with D0 CF 11 E0). ExcelJS cannot
    // read those and adding a reader for a format Excel itself deprecated
    // is not worth it.
    throw new ApiError(
      'This is a legacy binary .xls file. Open it in Excel and save as .xlsx, then upload again.',
      400
    );
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

  throw new ApiError('Only .csv, .xlsx and the ERP .xls export are supported.', 400);
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
  semester: ['semester', 'sem', 'semester number'],
  subject_code: ['subject code', 'course code', 'paper code', 'backlog code', 'code'],
  subject_name: ['subject', 'subject name', 'course name', 'paper name'],
  is_cleared: ['cleared', 'is cleared', 'status', 'result']
};

const CLEARED_WORDS = ['yes', 'y', 'true', 'cleared', 'pass', 'passed', '1'];

function normaliseAcademicHeader(raw) {
  const cleaned = cleanHeader(raw);
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
      // The GPA export names the semester per row ("4th Semester"). When
      // it does, that wins over whatever was picked on the upload screen.
      const semester = parseSemesterLabel(raw.semester);
      record.semester_number = semester == null ? '' : String(semester);
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

// =====================================================================
// The ERP "Class Attendance" export
// =====================================================================
/**
 * Shape of the real "Consolidated Attendance" export:
 *
 *   Consolidated Attendance | Academic Year: 26-27 | Academic Session: JUL-NOV 2026
 *                           | From Date: 23/07/2026 | To Date:18/08/2026
 *   Course Code: DOA2099 | Course Name: PRINCIPLES OF MANAGEMENT | Section:
 *   S.No. | Registration No. | Name | Faculty Name | Course Code | Section | Total Class | Present | Absent | %
 *   1     | 2502050231       | ...  | Ritika Bhatia| DOA2099     | B       | 8           | 7       | 1      | 87.00
 *
 * Two things this file does that the earlier hand-made sample did not:
 *
 *   1. EVERY SECTION OF THE COURSE IS IN ONE FILE, and the header's
 *      "Section:" is blank. The section is a per-row column (B..N here,
 *      "R 3" in other exports). Reading it from the header put all 2,500
 *      students in whichever section happened to be listed first.
 *
 *   2. A STUDENT CAN APPEAR MORE THAN ONCE — same course, same section,
 *      different lecturer, different class count (187 of them do here).
 *      Their real attendance is the combined figure, so rows are summed
 *      per registration number rather than one silently overwriting the
 *      other via ON CONFLICT. 4/4 + 0/2 is 66.7%, not 100% and not 0%.
 *
 * The "%" column is still taken verbatim wherever a student has exactly
 * one row, so the portal never disagrees with the ERP.
 */

/** Pulls "Course Code: IIS3120" style pairs out of the header cells. */
function headerValue(cells, ...labels) {
  for (const cell of cells) {
    for (const label of labels) {
      // Tolerates "Label: value", "Label :-value", "Label:-value".
      //
      // The value must START with something that is not punctuation. With
      // a plain (.+) the optional colon backtracks on an EMPTY field and
      // the separator becomes the value: "Section:" returned ":".
      const match = new RegExp(`${label}\\s*:?\\s*-?\\s*([^\\s:-].*)$`, 'i').exec(cell);
      if (match && match[1].trim()) return match[1].trim();
    }
  }
  return null;
}

/** "23/07/2026" -> "2026-07-23". The export is day-first. */
function parseErpDate(value) {
  if (!value) return null;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(String(value).trim());
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const ATTENDANCE_COLUMNS = {
  identifier: ['registration no.', 'registration no', 'reg no.', 'reg no', 'roll no', 'student id'],
  name: ['name', 'student name'],
  section: ['section', 'sec'],
  classes_held: ['total class', 'total classes', 'classes held', 'total'],
  classes_attended: ['present', 'classes attended', 'attended'],
  classes_absent: ['absent'],
  attendance_percent: ['%', 'percentage', 'attendance %', '% attendance', 'percent']
};

function matchAttendanceColumn(raw) {
  const cleaned = cleanHeader(raw);
  for (const [canonical, aliases] of Object.entries(ATTENDANCE_COLUMNS)) {
    if (aliases.includes(cleaned)) return canonical;
  }
  return null;
}

export async function parseAttendanceExport(buffer, filename) {
  const rows = await readSheetRows(buffer, filename);
  if (!rows.length) throw new ApiError('That attendance file appears to be empty.', 400);

  // Find the header row by looking for the two columns we cannot work
  // without, rather than assuming it is at a fixed offset — the number of
  // metadata lines above it varies between exports.
  let headerIndex = -1;
  let headerMap = null;
  for (let r = 0; r < Math.min(rows.length, 25); r += 1) {
    const mapped = rows[r].map(matchAttendanceColumn);
    if (mapped.includes('identifier') && mapped.includes('attendance_percent')) {
      headerIndex = r;
      headerMap = mapped;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new ApiError(
      'Could not find the attendance table. The file needs a header row with "Registration No." and a "%" column.',
      400
    );
  }

  const headerCells = rows.slice(0, headerIndex).flat();
  const meta = {
    course_code: headerValue(headerCells, 'course code'),
    course_name: headerValue(headerCells, 'course name'),
    section: headerValue(headerCells, 'section'),
    period_start: parseErpDate(headerValue(headerCells, 'from date')),
    period_end: parseErpDate(headerValue(headerCells, 'to date')),
    faculty_name: headerValue(headerCells, 'faculty name'),
    academic_year: headerValue(headerCells, 'academic year'),
    academic_session: headerValue(headerCells, 'academic session')
  };

  if (!meta.course_code) {
    throw new ApiError('No "Course Code:" line found in the file header.', 400);
  }

  // Registration number is the key, not the row number: a student can be
  // listed more than once for the same course.
  const byStudent = new Map();
  for (let r = headerIndex + 1; r < rows.length; r += 1) {
    const raw = Object.create(null);
    for (let c = 0; c < headerMap.length; c += 1) {
      const key = headerMap[c];
      if (!key) continue;
      const value = String(rows[r][c] ?? '').trim();
      if (value) raw[key] = value;
    }
    if (!raw.identifier) continue;

    const key = raw.identifier.toLowerCase();
    const percent = Number(String(raw.attendance_percent ?? '').replace('%', '').trim());
    const held = Number(raw.classes_held);
    const attended = Number(raw.classes_attended);
    const seen = byStudent.get(key);

    if (!seen) {
      byStudent.set(key, {
        rowNumber: r + 1,
        identifier: raw.identifier,
        section: raw.section ?? meta.section ?? '',
        heldSum: Number.isFinite(held) ? held : null,
        attendedSum: Number.isFinite(attended) ? attended : null,
        percent: Number.isFinite(percent) ? percent : null
      });
      continue;
    }

    // Second row for this student. Combining the raw counts is the only
    // honest answer — averaging two percentages taken over different
    // class counts is not the same number.
    if (Number.isFinite(held) && Number.isFinite(attended) && seen.heldSum != null) {
      seen.heldSum += held;
      seen.attendedSum += attended;
      seen.percent = seen.heldSum > 0
        ? Math.round((seen.attendedSum * 10000) / seen.heldSum) / 100
        : 0;
    } else if (Number.isFinite(percent) && seen.percent != null) {
      // No usable counts on one of the rows — fall back to the mean, and
      // stop pretending we still have a verbatim ERP figure.
      seen.percent = Math.round(((seen.percent + percent) / 2) * 100) / 100;
      seen.heldSum = null;
      seen.attendedSum = null;
    }
    if (!seen.section && raw.section) seen.section = raw.section;
  }

  const records = [...byStudent.values()].map((s) => ({
    rowNumber: s.rowNumber,
    identifier: s.identifier,
    section: s.section,
    classes_held: s.heldSum == null ? '' : String(s.heldSum),
    classes_attended: s.attendedSum == null ? '' : String(s.attendedSum),
    attendance_percent: s.percent == null ? '' : String(s.percent)
  }));

  if (!records.length) {
    throw new ApiError('The attendance table has a header but no student rows.', 400);
  }
  if (!meta.section && !records.some((r) => r.section)) {
    throw new ApiError(
      'No section found — the file header has no "Section:" line and the table has no Section column.',
      400
    );
  }
  meta.sections = [...new Set(records.map((r) => r.section).filter(Boolean))].sort();

  // A file with no dates still records fine; the window just defaults to
  // the day of upload rather than blocking a valid roll call.
  const today = new Date().toISOString().slice(0, 10);
  meta.period_start = meta.period_start ?? today;
  meta.period_end = meta.period_end ?? meta.period_start;

  return { meta, records };
}

// =====================================================================
// Mentor–mentee mapping
// =====================================================================
/**
 * The departmental "Mentor Mentee List" sheet:
 *
 *   S.No. | Registration No. | Name | Mentor Name | Mentor Phone No. | Mentor Email
 *
 * Only two columns matter. The mentor is identified by EMAIL, because
 * that is what matches a faculty account — "Dr Bagesh Kumar" spelled
 * three different ways across three files would not. Mentor Phone No. is
 * ignored on purpose: it is often blank or half filled, and the mentor's
 * own profile is where their number belongs.
 */
export async function parseMentorMappingFile(buffer, filename) {
  const rows = await readSheetRows(buffer, filename);
  if (rows.length < 2) {
    throw new ApiError('The file needs a header row and at least one data row.', 400);
  }
  if (rows.length - 1 > MAX_ROWS) {
    throw new ApiError(`Too many rows (${rows.length - 1}). Split the file into batches of ${MAX_ROWS}.`, 400);
  }

  const headerMap = rows[0].map((cell) => {
    const cleaned = cleanHeader(cell);
    if (['mentor email', 'faculty email', 'mentor email id', 'mentor mail'].includes(cleaned)) return 'mentor_email';
    // Only the qualified spellings. A bare "Name" in this file is the
    // student's, and claiming it here would name every mentor account
    // after their first mentee.
    if (['mentor name', 'faculty name', 'mentor'].includes(cleaned)) return 'mentor_name';
    if (HEADER_ALIASES.login_id.includes(cleaned)) return 'identifier';
    if (['email', 'email id', 'e-mail', 'student email'].includes(cleaned)) return 'identifier';
    return null;
  });

  if (!headerMap.includes('identifier') || !headerMap.includes('mentor_email')) {
    throw new ApiError(
      'The file needs a "Registration No." column and a "Mentor Email" column.',
      400
    );
  }

  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    const raw = Object.create(null);
    for (let c = 0; c < headerMap.length; c += 1) {
      const key = headerMap[c];
      if (!key || raw[key]) continue;
      const value = String(rows[r][c] ?? '').trim();
      if (value) raw[key] = value;
    }
    if (!raw.identifier && !raw.mentor_email) continue;
    records.push({
      rowNumber: r + 1,
      identifier: raw.identifier ?? '',
      mentor_email: raw.mentor_email ?? '',
      // Optional: only used when this upload has to create the mentor's
      // account. Blank falls back to the email's local part.
      mentor_name: raw.mentor_name ?? ''
    });
  }

  if (!records.length) throw new ApiError('No usable rows were found in that file.', 400);
  return records;
}

// =====================================================================
// GPA export
// =====================================================================
/** "4th Semester" / "Sem 4" / "4" -> 4. Returns null if unreadable. */
export function parseSemesterLabel(value) {
  if (value == null || String(value).trim() === '') return null;
  const match = /(\d+)/.exec(String(value));
  if (!match) return null;
  const number = Number(match[1]);
  return number >= 1 && number <= 8 ? number : null;
}
