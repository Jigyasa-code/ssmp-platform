/**
 * cluster-head-sample-data.mjs
 * =====================================================================
 * ONE PLACE for every piece of dummy data behind the Cluster Head,
 * at-risk and survey features. Attendance, GPA, backlogs, the subject
 * list, and the upload files a Cluster Head would actually drop into the
 * portal all live here rather than scattered across the seed script, the
 * tests and a folder of loose CSVs.
 *
 * Two ways to use it:
 *
 *   1. As a module. `npm run db:seed` imports these arrays and loads them
 *      through the same RPCs the portal uses, so the seeded data goes
 *      through exactly the code path a real upload does.
 *
 *   2. As a CLI, to write upload-ready files you can drag into the portal
 *      by hand and watch the whole flow happen:
 *
 *          node sample-data/cluster-head-sample-data.mjs
 *
 *      That writes the CSVs into sample-data/generated/.
 *
 * HOW THE DATA IS SHAPED, AND WHY
 * ---------------------------------------------------------------------
 * The at-risk rule fires on ANY ONE of three conditions. Sample data that
 * only contained "one bad student" would demonstrate one of them. So each
 * of the four demo students trips a DIFFERENT condition, and the fourth
 * trips none:
 *
 *   John Doe      2428020221   attendance 64%      -> flagged (attendance)
 *   Jane Smith    2428020222   GPA 5.40            -> flagged (GPA)
 *   Mike Davis    2428020223   one open backlog    -> flagged (backlog)
 *   Emily Wilson  2428020224   88%, GPA 8.2, none  -> NOT flagged
 *
 * Read down the At-Risk Students page after seeding and every branch of
 * the rule is visible at once, including the one that correctly does
 * nothing.
 */

// ---------------------------------------------------------------------
// The demo Cluster Head accounts
// ---------------------------------------------------------------------
export const SAMPLE_CLUSTER_HEADS = [
  {
    email: 'cluster.head1@jaipur.manipal.edu',
    full_name: 'Dr. Neha Sharma',
    login_id: 'CH1001',
    branch: 'IoT & IS'
  },
  {
    email: 'cluster.head2@jaipur.manipal.edu',
    full_name: 'Prof. Rakesh Menon',
    login_id: 'CH1002',
    branch: 'IoT & IS'
  }
];

/**
 * The setup form's answers for cluster.head1. section_count is what the
 * Section dropdown is built from: 3 sections means A, B and C.
 */
export const SAMPLE_CLUSTER_HEAD_COURSES = [
  { course_name: 'Data Structures and Algorithms', course_code: 'CS2001', section_count: 3 },
  { course_name: 'Database Management Systems', course_code: 'CS2003', section_count: 2 },
  { course_name: 'Operating Systems', course_code: 'CS2005', section_count: 2 },
  { course_name: 'Internet of Things', course_code: 'IOT2001', section_count: 2 },
  { course_name: 'Machine Learning', course_code: 'AI3001', section_count: 1 }
];

/** Second cluster head, so the "each cluster head sees only their own" rule is testable. */
export const SAMPLE_CLUSTER_HEAD_2_COURSES = [
  { course_name: 'Computer Networks', course_code: 'CS2007', section_count: 2 },
  { course_name: 'Digital Electronics', course_code: 'EC2001', section_count: 1 }
];

// ---------------------------------------------------------------------
// The students the sample data refers to
// ---------------------------------------------------------------------
// Matched on registration number, exactly as a real upload would be.
export const SAMPLE_STUDENTS = [
  { registration_no: '2428020221', full_name: 'John Doe', section: 'A' },
  { registration_no: '2428020222', full_name: 'Jane Smith', section: 'B' },
  { registration_no: '2428020223', full_name: 'Mike Davis', section: 'A' },
  { registration_no: '2428020224', full_name: 'Emily Wilson', section: 'A' }
];

// ---------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------
/** A 15-day reporting window ending today. Purely a label on the data. */
export function sampleAttendancePeriod(reference = new Date()) {
  const end = new Date(reference);
  const start = new Date(end);
  start.setDate(start.getDate() - 14);
  const iso = (date) => date.toISOString().slice(0, 10);
  return { period_start: iso(start), period_end: iso(end) };
}

/**
 * Per course, per section. The overall percentage the at-risk rule reads
 * is total attended / total held across every row for that student, so
 * these numbers are chosen to add up to the intended verdict rather than
 * each being individually below or above the line.
 *
 * John:   26+22+20 of 40+38+36  = 68/114 = 59.6%  -> flagged
 * Jane:   34+33+31 of 40+38+36  = 98/114 = 86.0%  -> fine on attendance
 * Mike:   35+32+30 of 40+38+36  = 97/114 = 85.1%  -> fine on attendance
 * Emily:  36+34+33 of 40+38+36  = 103/114 = 90.4% -> fine on attendance
 */
export const SAMPLE_ATTENDANCE = [
  {
    course_code: 'CS2001',
    section: 'A',
    rows: [
      { identifier: '2428020221', classes_held: '40', classes_attended: '26' },
      { identifier: '2428020223', classes_held: '40', classes_attended: '35' },
      { identifier: '2428020224', classes_held: '40', classes_attended: '36' }
    ]
  },
  {
    course_code: 'CS2001',
    section: 'B',
    rows: [{ identifier: '2428020222', classes_held: '40', classes_attended: '34' }]
  },
  {
    course_code: 'CS2003',
    section: 'A',
    rows: [
      { identifier: '2428020221', classes_held: '38', classes_attended: '22' },
      { identifier: '2428020223', classes_held: '38', classes_attended: '32' },
      { identifier: '2428020224', classes_held: '38', classes_attended: '34' }
    ]
  },
  {
    course_code: 'CS2003',
    section: 'B',
    rows: [{ identifier: '2428020222', classes_held: '38', classes_attended: '33' }]
  },
  {
    course_code: 'IOT2001',
    section: 'A',
    rows: [
      { identifier: '2428020221', classes_held: '36', classes_attended: '20' },
      { identifier: '2428020223', classes_held: '36', classes_attended: '30' },
      { identifier: '2428020224', classes_held: '36', classes_attended: '33' }
    ]
  },
  {
    course_code: 'IOT2001',
    section: 'B',
    rows: [{ identifier: '2428020222', classes_held: '36', classes_attended: '31' }]
  }
];

// ---------------------------------------------------------------------
// GPA
// ---------------------------------------------------------------------
/** Semester 3. Jane is the one below 6, which is what flags her. */
export const SAMPLE_GPA = {
  semester_number: 3,
  rows: [
    { identifier: '2428020221', gpa: '6.80' },
    { identifier: '2428020222', gpa: '5.40' },
    { identifier: '2428020223', gpa: '7.10' },
    { identifier: '2428020224', gpa: '8.20' }
  ]
};

/** A second semester so the GPA trend chart has more than one point. */
export const SAMPLE_GPA_PREVIOUS = {
  semester_number: 2,
  rows: [
    { identifier: '2428020221', gpa: '7.20' },
    { identifier: '2428020222', gpa: '6.10' },
    { identifier: '2428020223', gpa: '7.40' },
    { identifier: '2428020224', gpa: '8.00' }
  ]
};

// ---------------------------------------------------------------------
// Backlogs
// ---------------------------------------------------------------------
/**
 * One uncleared backlog is enough to flag a student, which is the whole
 * point of Mike's row. Emily's row is included and marked cleared so the
 * "cleared backlogs do not count" branch is covered too.
 */
export const SAMPLE_BACKLOGS = {
  semester_number: 2,
  exam_session: 'Even 2025-26',
  rows: [
    {
      identifier: '2428020223',
      subject_code: 'MA1002',
      subject_name: 'Engineering Mathematics II',
      is_cleared: 'false'
    },
    {
      identifier: '2428020224',
      subject_code: 'PH1001',
      subject_name: 'Engineering Physics',
      is_cleared: 'true'
    }
  ]
};

// ---------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------
/**
 * Two of four students answer, so the completion tracking the star mentee
 * and the mentor see reads 2/4 rather than 0 or 100 — both of which hide
 * bugs in the counting.
 */
export const SAMPLE_SURVEY_RESPONSES = [
  { registration_no: '2428020221', ratings: [4, 4, 3, 5, 4, 4, 5, 3, 4, 4] },
  { registration_no: '2428020224', ratings: [5, 5, 4, 5, 5, 4, 5, 4, 5, 5] }
];

// =====================================================================
// CSV generation — the files a Cluster Head would actually upload
// =====================================================================
function toCsv(headers, rows) {
  const escape = (value) => {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(','), ...rows.map((row) => row.map(escape).join(','))].join('\n') + '\n';
}

/** Header names deliberately differ from the canonical keys, to exercise the alias table. */
export function buildAttendanceCsv(courseCode, section) {
  const block = SAMPLE_ATTENDANCE.find((b) => b.course_code === courseCode && b.section === section);
  if (!block) throw new Error(`No sample attendance for ${courseCode} section ${section}`);
  const nameOf = (reg) => SAMPLE_STUDENTS.find((s) => s.registration_no === reg)?.full_name ?? '';
  return toCsv(
    ['Reg No', 'Name', 'Classes Held', 'Classes Attended'],
    block.rows.map((row) => [row.identifier, nameOf(row.identifier), row.classes_held, row.classes_attended])
  );
}

export function buildGpaCsv(dataset = SAMPLE_GPA) {
  const nameOf = (reg) => SAMPLE_STUDENTS.find((s) => s.registration_no === reg)?.full_name ?? '';
  return toCsv(
    ['Reg No', 'Name', 'GPA'],
    dataset.rows.map((row) => [row.identifier, nameOf(row.identifier), row.gpa])
  );
}

export function buildBacklogCsv(dataset = SAMPLE_BACKLOGS) {
  const nameOf = (reg) => SAMPLE_STUDENTS.find((s) => s.registration_no === reg)?.full_name ?? '';
  return toCsv(
    ['Reg No', 'Name', 'Subject Code', 'Subject Name', 'Cleared'],
    dataset.rows.map((row) => [
      row.identifier,
      nameOf(row.identifier),
      row.subject_code,
      row.subject_name,
      row.is_cleared === 'true' ? 'Yes' : 'No'
    ])
  );
}

/** Every upload-ready file, keyed by the filename it should be written as. */
export function buildAllSampleFiles() {
  const files = {
    'gpa-semester-3-sample.csv': buildGpaCsv(SAMPLE_GPA),
    'gpa-semester-2-sample.csv': buildGpaCsv(SAMPLE_GPA_PREVIOUS),
    'backlogs-semester-2-sample.csv': buildBacklogCsv(SAMPLE_BACKLOGS)
  };
  for (const block of SAMPLE_ATTENDANCE) {
    files[`attendance-${block.course_code}-section-${block.section}-sample.csv`] = buildAttendanceCsv(
      block.course_code,
      block.section
    );
  }
  return files;
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  process.argv[1].endsWith('cluster-head-sample-data.mjs');

if (isDirectRun) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const outputDir = resolve(dirname(fileURLToPath(import.meta.url)), 'generated');
  mkdirSync(outputDir, { recursive: true });

  const files = buildAllSampleFiles();
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(resolve(outputDir, name), contents, 'utf8');
    console.log(`  + ${name}`);
  }
  console.log(`\n${Object.keys(files).length} sample file(s) written to sample-data/generated/`);
  console.log('Upload them from the Cluster Head portal to watch the whole at-risk flow run.\n');
}
