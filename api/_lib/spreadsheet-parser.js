/**
 * spreadsheet-parser.js
 * Reads HOD-uploaded roster files. Uses ExcelJS for .xlsx and a small
 * hand-rolled RFC-4180 reader for .csv.
 *
 * Note on the Phase 1 finding: the old code used SheetJS (xlsx) 0.18.5,
 * which carries prototype-pollution and ReDoS advisories. ExcelJS is the
 * replacement, and nothing in this file ever assigns a parsed key onto an
 * object literal without going through a null-prototype map first, so a
 * "__proto__" column header cannot poison anything.
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
  mentor_email: ['mentor email', 'faculty email', 'assigned mentor', 'mentor']
};

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
      'No "Email" column found. Required columns: Email, Name. Optional: Reg No / Faculty ID, Branch, Section, Semester, Phone, Mentor Email.',
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

export async function parseRosterFile(buffer, filename) {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    return rowsToRecords(parseCsv(buffer.toString('utf8')));
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
    return rowsToRecords(rows);
  }

  throw new ApiError('Only .csv and .xlsx roster files are supported (legacy .xls is not).', 400);
}
