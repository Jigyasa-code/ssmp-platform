/**
 * node api/_lib/spreadsheet-parser.check.mjs
 *
 * The parser is the only place that knows a student can be listed twice
 * for one course and that the section lives on the row, not in the
 * header. Both are silent failures — wrong numbers, not errors — so they
 * get the one check.
 */
import assert from 'node:assert/strict';
import { parseAttendanceExport, parseMentorMappingFile } from './spreadsheet-parser.js';

const enc = (s) => Buffer.from(s, 'utf8');

const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
const sheet = (header, dataRows) => enc(
  `<table>
     <tr><td>Consolidated Attendance</td><td>Academic Year: 26-27</td></tr>
     <tr><td></td><td>From Date: 23/07/2026</td><td>To Date:18/08/2026</td></tr>
     <tr><td>Course Code: DOA2099</td><td>Course Name: PRINCIPLES OF MANAGEMENT</td><td>Section: ${header}</td></tr>
     ${row(['S.No.', 'Registration No.', 'Name', 'Faculty Name', 'Course Code', 'Section', 'Total Class', 'Present', 'Absent', '%'])}
     ${dataRows.map(row).join('')}
   </table>`
);

let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); }
  catch (error) { failures += 1; console.log(`  FAIL  ${name}\n        ${error.message}`); }
};

console.log('\nConsolidated attendance export');

await check('section comes from the row, not the blank header', async () => {
  const { meta, records } = await parseAttendanceExport(sheet('', [
    ['1', '2502050231', 'A ONE', 'Ritika Bhatia', 'DOA2099', 'B', '8', '7', '1', '87.00'],
    ['2', '2502050232', 'A TWO', 'Anuj Dixit', 'DOA2099', 'N', '8', '4', '4', '50.00']
  ]), 'ConsolidatedAttendance.xls');

  assert.equal(meta.course_code, 'DOA2099');
  assert.equal(meta.course_name, 'PRINCIPLES OF MANAGEMENT');
  assert.equal(meta.period_start, '2026-07-23');
  assert.equal(meta.period_end, '2026-08-18');
  assert.deepEqual(records.map((r) => r.section), ['B', 'N'], 'each row keeps its own section');
  assert.deepEqual(meta.sections, ['B', 'N']);
});

await check('a repeated registration number is summed, not overwritten', async () => {
  // 4/4 and 0/2 for the same student: 66.67%, which is below 75 and
  // therefore at risk. Keeping either row alone gets this wrong in
  // opposite directions (100% or 0%).
  const { records } = await parseAttendanceExport(sheet('', [
    ['1', '2502051271', 'DUPE', 'Ritika Bhatia', 'DOA2099', 'G', '4', '4', '0', '100.00'],
    ['2', '2502051271', 'DUPE', 'Anuj Dixit', 'DOA2099', 'G', '2', '0', '2', '0.00']
  ]), 'x.xls');

  assert.equal(records.length, 1, 'one row per registration number');
  assert.equal(records[0].classes_held, '6');
  assert.equal(records[0].classes_attended, '4');
  assert.equal(records[0].attendance_percent, '66.67');
});

await check('a single row keeps the ERP percentage verbatim', async () => {
  // 7/8 is 87.5, the ERP says 87.00. The ERP wins.
  const { records } = await parseAttendanceExport(sheet('', [
    ['1', '2502050231', 'SOLO', 'Ritika Bhatia', 'DOA2099', 'B', '8', '7', '1', '87.00']
  ]), 'x.xls');
  assert.equal(records[0].attendance_percent, '87');
});

await check('the header section still works as a fallback', async () => {
  const { records } = await parseAttendanceExport(enc(
    `<table>
       <tr><td>Course Code: CS2001</td><td>Course Name: DSA</td><td>Section: R 3</td></tr>
       ${row(['S.No.', 'Registration No.', 'Name', 'Total Class', 'Present', '%'])}
       ${row(['1', '2502050231', 'NO SECTION COLUMN', '10', '6', '60.00'])}
     </table>`
  ), 'x.xls');
  assert.equal(records[0].section, 'R 3');
});

console.log('\nMentor mentee list');

await check('maps registration number to mentor email and ignores the phone', async () => {
  const records = await parseMentorMappingFile(enc(
    `<table>
       ${row(['S.No.', 'Registration No.', 'Name', 'Mentor Name', 'Mentor Phone No.', 'Mentor Email'])}
       ${row(['1', '2502051124', 'SAVI SAINI', 'Dr Bagesh Kumar', '9431645778', 'bagesh.kumar@jaipur.manipal.edu'])}
       ${row(['2', '2502051127', 'FADEEL REZA', 'Mr Chandrapal Singh Dangi', '', 'chandrapalsingh.dangi@jaipur.manipal.edu'])}
     </table>`
  ), 'Mentor Mentee List.xlsx');

  assert.equal(records.length, 2);
  assert.equal(records[0].identifier, '2502051124');
  assert.equal(records[0].mentor_email, 'bagesh.kumar@jaipur.manipal.edu');
  assert.equal(records[1].mentor_email, 'chandrapalsingh.dangi@jaipur.manipal.edu');
  assert.equal(records[1].identifier, '2502051127', 'a blank mentor phone does not shift the columns');
});

console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n');
process.exit(failures ? 1 : 0);
