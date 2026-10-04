/**
 * Regression tests for bugs reported from the deployed portals:
 *   1. Panel body had no padding, so text sat flush against the card edge.
 *   2. Typing inside a Modal stole focus back to the header's ✕ button.
 *   3. The HOD's Students page stopped at 1,000 students (PostgREST's
 *      response cap) while the dashboard counted all of them.
 *   4. The student record showed a CGPA of 0 when nothing was uploaded;
 *      plus the arithmetic behind the Academic Performance Overview, and
 *      the student's version of it (no header, no semester picker).
 *   5. The academic-cycle helpers: which semester a date falls in, and
 *      the checks on a new cycle's dates.
 */
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true
});
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element',
                   'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'KeyboardEvent', 'Event', 'FocusEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: Panel } = await import('../src/components/ui/Panel.jsx');
const { default: Modal } = await import('../src/components/ui/Modal.jsx');
const { TextField, TextAreaField } = await import('../src/components/ui/FormControls.jsx');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  PASS  ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── 1. Panel padding ─────────────────────────────────────────────────
console.log('\nPanel body padding');

const bodyClassOf = (markup) => {
  const d = new JSDOM(markup);
  const panel = d.window.document.querySelector('.panel');
  const header = panel.querySelector('.panel-header');
  const body = header ? header.nextElementSibling : panel.firstElementChild;
  return body.getAttribute('class') ?? '';
};

check(
  'omitting bodyClassName gives the standard p-5',
  bodyClassOf(renderToStaticMarkup(<Panel tab="Identity" tabIcon="badge"><p>Dr. Alice Smith</p></Panel>)) === 'p-5',
  `got "${bodyClassOf(renderToStaticMarkup(<Panel tab="Identity"><p>x</p></Panel>))}"`
);
check(
  'no tab, no bodyClassName still gets p-5',
  bodyClassOf(renderToStaticMarkup(<Panel><p>x</p></Panel>)) === 'p-5'
);
check(
  'explicit bodyClassName="" still means edge-to-edge (tables/lists)',
  bodyClassOf(renderToStaticMarkup(<Panel tab="Rows" bodyClassName=""><table /></Panel>)) === ''
);
check(
  'an explicit override is honoured',
  bodyClassOf(renderToStaticMarkup(<Panel tab="X" bodyClassName="p-0 pt-2"><p>x</p></Panel>)) === 'p-0 pt-2'
);

// ── 2. Modal focus ───────────────────────────────────────────────────
console.log('\nModal focus behaviour while typing');

const container = dom.window.document.getElementById('root');
const root = createRoot(container);

function AchievementDialog() {
  // An inline arrow, exactly as every caller writes it — this identity
  // changing on each render is what used to re-run the focus effect.
  const [title, setTitle] = React.useState('');
  const [note, setNote] = React.useState('');
  return (
    <Modal open onClose={() => {}} title="Add an achievement">
      <TextField name="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField name="note" label="What should the HOD know?" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

await act(async () => { root.render(<AchievementDialog />); });
await act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const doc = dom.window.document;
const titleInput = doc.querySelector('input[name="title"]');
const closeButton = doc.querySelector('button[aria-label="Close"]');

check('the first form field receives focus on open, not the ✕',
  doc.activeElement === titleInput,
  `focus was on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);

// Type three characters, re-rendering between each one.
for (const char of ['f', 'd', 's']) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(titleInput, titleInput.value + char);
    titleInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 45)); });
}

check('focus stays in the input after typing (did not jump to ✕)',
  doc.activeElement === titleInput,
  `focus ended on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);
check('the typed characters actually landed', titleInput.value === 'fds', `value was "${titleInput.value}"`);
check('the ✕ button is not focused', doc.activeElement !== closeButton);

// Same check for the textarea used by "Report to HOD".
const textarea = doc.querySelector('textarea[name="note"]');
await act(async () => { textarea.focus(); });
for (const char of ['n', 'o']) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, textarea.value + char);
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 45)); });
}
check('focus stays in the Report-to-HOD textarea while typing',
  doc.activeElement === textarea,
  `focus ended on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);
check('the textarea kept its text', textarea.value === 'no', `value was "${textarea.value}"`);

// ── 3. Every student, not the first 1,000 ────────────────────────────
// The HOD's Students page showed 1,000 students and 296 without a mentor
// while the dashboard, which counts in SQL, showed 1,949 and 597: PostgREST
// hands back at most 1,000 rows per request, without an error.
console.log('\nPaging past the 1,000-row response cap');

const { fetchAllRows } = await import('../src/lib/fetchAllRows.js');

/** A PostgREST stand-in that, like a stock Supabase project, caps every response. */
function cappedTable(total, cap = 1000) {
  const requests = [];
  const make = (withCount) => ({
    range(from, to) {
      requests.push({ from, to, withCount });
      const end = Math.min(to + 1, from + cap, total);
      const rows = Array.from({ length: Math.max(0, end - from) }, (_, i) => ({ id: from + i }));
      return Promise.resolve({ data: rows, error: null, count: withCount ? total : null });
    }
  });
  return { make, requests };
}

{
  const table = cappedTable(1949);
  const { data, count, error } = await fetchAllRows(table.make);
  check('all 1,949 students come back, not 1,000', data.length === 1949 && count === 1949 && !error, `got ${data.length}`);
  check('no student comes back twice', new Set(data.map((row) => row.id)).size === data.length);
  check('only the first request asks for the exact count', table.requests.filter((r) => r.withCount).length === 1);
}
{
  const { data } = await fetchAllRows(cappedTable(1949, 500).make);
  check('a server page smaller than ours still returns everyone', data.length === 1949, `got ${data.length}`);
}
{
  const table = cappedTable(0);
  const { data, error } = await fetchAllRows(table.make);
  check('an empty list is one request and no rows', data.length === 0 && !error && table.requests.length === 1);
}

// ── 4. Academic performance overview ─────────────────────────────────
console.log('\nAcademic performance overview');

const record = await import('../src/lib/academicRecord.js');

check('"3rd Semester" is semester 3', record.parseSemesterNumber('3rd Semester') === 3);
check('"Sem III" and "V Sem" are read too',
  record.parseSemesterNumber('Sem III') === 3 && record.parseSemesterNumber('V Sem') === 5);
check('"2nd Year" does not say which semester', record.parseSemesterNumber('2nd Year') === null);
check('a year in the label is not taken for a semester', record.parseSemesterNumber('Odd Semester 2025') === null);
check('74.96% is shown as 74.9%, never as 75%', record.formatPercent(74.96) === '74.9%', record.formatPercent(74.96));

check('overall attendance is the mean of the subject percentages',
  record.summariseAttendance([{ attendance_percent: 80 }, { attendance_percent: '70' }]).average === 75);

{
  const gpas = [{ semester: 1, gpa: '7.68' }, { semester: 2, gpa: 7.28 }];
  const view = record.gpaForView(gpas, null);
  check('the current GPA is the latest graded semester, compared with the one before',
    view.entry.semester === 2 && view.previous.semester === 1 && view.change === -0.4, JSON.stringify(view));
  const points = record.gpaTrendPoints([{ semester: 1, gpa: 7.68 }], 3);
  check('a semester without a GPA gets no point on the trend (not a zero)',
    points.length === 3 && points[1].gpa === null && points[2].gpa === null);
}
{
  const backlogs = [
    { subject_code: 'PH1001', semester: 1, is_cleared: true },
    { subject_code: 'MA1002', semester: 2, is_cleared: false },
    { subject_code: 'CS1001', semester: 1, is_cleared: false }
  ];
  const now = record.backlogsForView(backlogs, null);
  check('open backlogs are listed before cleared ones',
    now.rows.map((row) => row.subject_code).join() === 'MA1002,CS1001,PH1001' && now.open === 2 && now.cleared === 1);
  const sem1 = record.backlogsForView(backlogs, 1);
  check('a past semester shows only the backlogs recorded against it',
    sem1.rows.length === 2 && sem1.rows.every((row) => row.semester === 1));
}
{
  const choices = record.semesterChoices({ currentSemester: 3, semesterGpas: [{ semester: 1 }], backlogs: [] });
  check('the picker offers Sem 1, Sem 2 and "Sem 3 (Current)"',
    choices.map((c) => c.label).join('|') === 'Sem 1|Sem 2|Sem 3 (Current)', choices.map((c) => c.label).join('|'));
}

const { default: AcademicOverview } = await import('../src/components/academics/AcademicOverview.jsx');

{
  const markup = renderToStaticMarkup(<AcademicOverview semesterLabel="3rd Semester" />);
  check('with nothing uploaded there is no CGPA of 0, only a dash',
    !markup.includes('0.00') && markup.includes('No GPA recorded yet'));
}
const sampleRecord = {
  semesterLabel: '3rd Semester',
  attendance: [
    { course_id: 'a', course_code: 'IT2101', course_name: 'Data Structures', attendance_percent: 80, classes_held: 10, classes_attended: 8 },
    { course_id: 'b', course_code: 'IT2102', course_name: 'Computer Organisation', attendance_percent: 70, classes_held: 10, classes_attended: 7 }
  ],
  semesterGpas: [{ semester: 1, gpa: 7.68, source: 'cluster_head' }, { semester: 2, gpa: 7.28, source: 'cluster_head' }],
  cgpa: { value: 7.49, official: true, earnedCredits: 38 },
  backlogs: [
    { subject_code: 'MA1002', subject_name: 'ENGINEERING MATHEMATICS II', semester: 2, grade: 'F', is_cleared: false },
    { subject_code: 'PH1001', subject_name: 'ENGINEERING PHYSICS', semester: 1, grade: 'UFM', is_cleared: true }
  ],
  blackDots: [{ case_number: '012/Odd Sem/2026', case_details: 'Found with banned items', incident_date: '2026-09-10' }]
};

{
  const markup = renderToStaticMarkup(<AcademicOverview audience="student" {...sampleRecord} />);
  check('the picker opens on the current semester', markup.includes('Sem 3 (Current)'));
  check('the attendance tile shows the average and the short subject',
    markup.includes('75%') && markup.includes('Below 75% in 1 subject'));
  check('the GPA tile shows the latest GPA and the change', markup.includes('7.28') && markup.includes('Down 0.40 from Sem 1'));
  check('the backlog tile counts open backlogs only', markup.includes('Open from Sem 2'));
  check('the subject table lists every subject', markup.includes('IT2101') && markup.includes('IT2102'));
  check('the black dot is listed with its case number', markup.includes('Case 012/Odd Sem/2026'));
}
{
  // The student's Academics page: the heading is the page title, so the
  // block drops its own header and, with it, the semester picker.
  const markup = renderToStaticMarkup(<AcademicOverview audience="student" showHeader={false} {...sampleRecord} />);
  check('without the header there is no semester picker', !markup.includes('<select') && !markup.includes('Sem 3 (Current)'));
  check('without the header the heading is not repeated', !markup.includes('<h2'));
  check('without the header the block is still labelled', markup.includes('aria-label="Academic performance overview"'));
  check('without the header the view is the current semester', markup.includes('Current GPA') && markup.includes('Open backlogs'));
  check('the student is not told they can record a GPA',
    !renderToStaticMarkup(<AcademicOverview audience="student" showHeader={false} />).includes('record below'));
}

// ── 5. Academic cycles ───────────────────────────────────────────────
console.log('\nAcademic cycles');

const cycles = await import('../src/lib/academicCycles.js');
{
  const cycle = { label: '2026-27', start_year: 2026, starts_on: '2026-07-01', even_starts_on: '2027-01-01', ends_on: '2027-06-30' };
  check('the label is written with an en dash', cycles.cycleLabel(cycle.label) === '2026–27');
  check('the semesters are named with their calendar year',
    cycles.semesterTitle(cycle, 'Odd') === 'Odd semester 2026' && cycles.semesterTitle(cycle, 'Even') === 'Even semester 2027');
  check('a date before the even semester starts is in the odd one',
    cycles.semesterOn(cycle, '2026-12-31') === 'Odd' && cycles.semesterOn(cycle, '2027-01-01') === 'Even');
  const odd = cycles.semesterRange(cycle, 'Odd');
  check('the odd semester ends the day before the even one starts', odd.from === '2026-07-01' && odd.to === '2026-12-31', JSON.stringify(odd));
  check('India is ahead of UTC: 20:00 UTC on 31 Dec is already 1 Jan',
    cycles.todayInIndia(new Date('2026-12-31T20:00:00Z')) === '2027-01-01');
  check('July starts a new academic year', cycles.academicYearOf('2027-06-30') === 2026 && cycles.academicYearOf('2027-07-01') === 2027);
  check('the next cycle comes after the latest one, not after today',
    cycles.nextCycleYear([{ start_year: 2026 }, { start_year: 2025 }], '2030-08-01') === 2027);
  check('with no cycle yet, the next one is the current academic year', cycles.nextCycleYear([], '2026-09-28') === 2026);
  check('labels match the database: 2027-28, 2009-10',
    cycles.labelForYear(2027) === '2027-28' && cycles.labelForYear(2009) === '2009-10');
  check('an attendance upload is named by its subject and section',
    cycles.uploadScope({ upload_type: 'attendance', course_code: 'IT2101', section_label: 'A' }) === 'IT2101 · Section A');
  check('other uploads keep the scope their upload function wrote',
    cycles.uploadScope({ upload_type: 'gpa', scope_label: 'Semesters 1, 2 + CGPA' }) === 'Semesters 1, 2 + CGPA'
    && cycles.uploadScope({ upload_type: 'backlog', semester_number: 3 }) === 'Semester 3');
  check('the default dates pass the checks', cycles.validateCycleDates(2027, cycles.defaultCycleDates(2027)) === null);
  check('dates out of order are refused',
    /out of order/.test(cycles.validateCycleDates(2027, { starts_on: '2027-07-01', even_starts_on: '2027-06-01', ends_on: '2028-06-30' }) ?? ''));
  check('dates far from the year are refused',
    /fall around 2027–28/.test(cycles.validateCycleDates(2027, { starts_on: '2027-07-01', even_starts_on: '2028-01-01', ends_on: '2029-01-01' }) ?? ''));
}

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
