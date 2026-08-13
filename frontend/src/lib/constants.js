/** Shared enums and option lists. Must stay in sync with the Postgres enums. */

export const ROLES = {
  STUDENT: 'student',
  FACULTY: 'faculty',
  HOD: 'hod',
  CLUSTER_HEAD: 'cluster_head'
};

export const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty Mentor',
  hod: 'Head of Department',
  cluster_head: 'Cluster Head'
};

export const TICKET_CATEGORIES = ['Academic', 'ERP/Tech', 'Infrastructure'];
export const TICKET_STATUSES = ['Open', 'In Progress', 'Resolved'];
export const TICKET_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export const RESOLUTION_STATUS_LABELS = {
  none: 'Not resolved',
  pending_confirmation: 'Awaiting your confirmation',
  confirmed: 'Confirmed by student',
  reopened: 'Reopened by student'
};

export const ACHIEVEMENT_CATEGORIES = [
  { value: 'sports', label: 'Sports', icon: 'sports_cricket' },
  { value: 'cultural', label: 'Cultural', icon: 'theater_comedy' },
  { value: 'technical', label: 'Technical', icon: 'code' },
  { value: 'volunteering', label: 'Volunteering', icon: 'volunteer_activism' },
  { value: 'certification', label: 'Certification', icon: 'workspace_premium' },
  { value: 'leadership', label: 'Leadership', icon: 'groups' },
  { value: 'other', label: 'Other', icon: 'star' }
];

export const PARENT_OCCUPATIONS = [
  'Entrepreneur',
  'Family Business',
  'Public Sector',
  'Professional',
  'Govt. Employee',
  'Pvt. Company',
  'Home Maker'
];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/**
 * Course catalogue for the Cluster Head setup form's "Course name"
 * dropdown. Edit this one list to change what the department offers —
 * nothing else reads course names from anywhere. "Other" reveals a free
 * text field so an unlisted subject never blocks setup.
 */
export const COURSE_CATALOGUE = [
  'Programming for Problem Solving',
  'Data Structures and Algorithms',
  'Object Oriented Programming',
  'Database Management Systems',
  'Operating Systems',
  'Computer Networks',
  'Software Engineering',
  'Design and Analysis of Algorithms',
  'Discrete Mathematics',
  'Engineering Mathematics',
  'Digital Electronics',
  'Microcontrollers and Embedded Systems',
  'Internet of Things',
  'Sensors and Actuators',
  'Wireless Sensor Networks',
  'Cloud Computing',
  'Machine Learning',
  'Artificial Intelligence',
  'Data Science and Analytics',
  'Cyber Security',
  'Computer Organisation and Architecture',
  'Web Technologies',
  'Mobile Application Development',
  'Signals and Systems',
  'Control Systems',
  'Technical Communication',
  'Other'
];

export const OTHER_COURSE_OPTION = 'Other';

/** How many blank subject blocks the setup form starts with. */
export const CLUSTER_HEAD_DEFAULT_SUBJECT_ROWS = 5;

export const SECTION_COUNT_OPTIONS = Array.from({ length: 15 }, (_, index) => index + 1);

/**
 * Section labels are positional: 2 sections means A and B, 4 means A-D.
 * The database enforces the same A-O range on student_course_sections.
 */
export function sectionLabelsFor(count) {
  const total = Math.max(1, Math.min(15, Number(count) || 0));
  return Array.from({ length: total }, (_, index) => String.fromCharCode(65 + index));
}

export const SEMESTER_OPTIONS = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: `Semester ${index + 1}`
}));

export const ACADEMIC_UPLOAD_LABELS = {
  attendance: 'Attendance',
  gpa: 'GPA',
  backlog: 'Backlogs'
};

/**
 * The 5-point scale printed on the departmental feedback form. Stored as
 * 1-5 in survey_response_answers so it can be averaged; these are the
 * labels the student actually sees.
 */
export const SURVEY_SCALE = [
  { value: 1, label: 'Poor' },
  { value: 2, label: 'Fair' },
  { value: 3, label: 'Satisfactory' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Excellent' }
];

/** The recurring jobs the HOD can fire on demand. Mirrors cycle_job_type. */
export const CYCLE_JOBS = [
  {
    value: 'at_risk_sweep',
    label: 'Re-evaluate at-risk students',
    icon: 'rule',
    description: 'Runs the attendance / GPA / backlog rule over every student and updates their flags.'
  },
  {
    value: 'at_risk_meeting_dispatch',
    label: 'Dispatch at-risk meetings',
    icon: 'event_available',
    description: 'Raises a mentor-owned meeting for each flagged student and notifies the mentor. Safe to run repeatedly.'
  },
  {
    value: 'survey_cycle',
    label: 'Open a new survey cycle',
    icon: 'ballot',
    description: 'Closes the current window, opens the next one and notifies every student.'
  },
  {
    value: 'survey_reminder_sweep',
    label: 'Send survey reminders',
    icon: 'notifications_active',
    description: 'Nudges only the students who have not yet answered the open survey.'
  }
];

export const AT_RISK_MEETING_STATUS_LABELS = {
  awaiting_link: 'Awaiting meeting link',
  scheduled: 'Scheduled',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

export const EMPLOYMENT_STATUS_LABELS = {
  active: 'Active',
  on_leave: 'On leave',
  departed: 'Departed'
};

export const CHART_COLORS = {
  academic: '#c2410c',
  erpTech: '#f97316',
  infrastructure: '#a8a29e',
  open: '#dc2626',
  inProgress: '#d97706',
  resolved: '#16a34a',
  primary: '#c2410c',
  secondary: '#f97316',
  slate: '#a8a29e',
  series: ['#c2410c', '#f97316', '#a8a29e', '#ea580c', '#d97706', '#16a34a']
};

/**
 * Sidebar menu per role — the SLCM "MENU" list.
 * An item may carry a `when` predicate; it is only rendered if that returns
 * true for the signed-in profile. Form A is deliberately absent: it is a
 * one-time full-screen step before the portal opens, and afterwards it
 * lives inside My Profile rather than as a menu entry of its own.
 */
export const NAVIGATION = {
  student: [
    { to: '/student', label: 'Home', icon: 'home', end: true },
    { to: '/student/tickets', label: 'My Tickets', icon: 'confirmation_number' },
    {
      to: '/student/group-tickets',
      label: 'Group Tickets',
      icon: 'groups',
      when: (profile) => Boolean(profile?.is_star_mentee)
    },
    { to: '/student/academics', label: 'Academics', icon: 'school' },
    { to: '/student/survey', label: 'Feedback Survey', icon: 'ballot' },
    {
      to: '/student/survey-tracking',
      label: 'Survey Tracking',
      icon: 'fact_check',
      when: (profile) => Boolean(profile?.is_star_mentee)
    },
    { to: '/student/achievements', label: 'Achievements', icon: 'military_tech' },
    { to: '/student/profile', label: 'My Profile', icon: 'account_circle' }
  ],
  faculty: [
    { to: '/faculty', label: 'Home', icon: 'home', end: true },
    { to: '/faculty/tickets', label: 'Ticket Queue', icon: 'inbox' },
    { to: '/faculty/mentees', label: 'My Mentees', icon: 'groups' },
    { to: '/faculty/at-risk', label: 'At-Risk Students', icon: 'e911_emergency' },
    { to: '/faculty/report', label: 'My Report', icon: 'analytics' },
    { to: '/faculty/profile', label: 'My Profile', icon: 'account_circle' }
  ],
  hod: [
    { to: '/hod', label: 'Home', icon: 'home', end: true },
    { to: '/hod/tickets', label: 'All Tickets', icon: 'inbox' },
    { to: '/hod/performance', label: 'Faculty Performance', icon: 'leaderboard' },
    { to: '/hod/reports', label: 'Faculty Reports', icon: 'analytics' },
    { to: '/hod/roster', label: 'Faculty Roster', icon: 'badge' },
    { to: '/hod/semester', label: 'Semester Setup', icon: 'event_note' },
    { to: '/hod/students', label: 'Students', icon: 'school' },
    { to: '/hod/at-risk', label: 'At-Risk Students', icon: 'e911_emergency' },
    { to: '/hod/operations', label: 'Scheduled Jobs', icon: 'settings_suggest' },
    { to: '/hod/profile', label: 'My Profile', icon: 'account_circle' }
  ],
  // Deliberately short. A Cluster Head uploads two kinds of data and does
  // nothing else — no tickets, no student profiles, no reports.
  cluster_head: [
    { to: '/cluster-head', label: 'Home', icon: 'home', end: true },
    { to: '/cluster-head/attendance', label: 'Upload Attendance', icon: 'fact_check' },
    { to: '/cluster-head/gpa', label: 'Upload GPA', icon: 'grade' },
    { to: '/cluster-head/backlogs', label: 'Upload Backlogs', icon: 'assignment_late' },
    { to: '/cluster-head/courses', label: 'My Subjects', icon: 'menu_book' },
    { to: '/cluster-head/profile', label: 'My Profile', icon: 'account_circle' }
  ]
};

export const HOME_PATH = {
  student: '/student',
  faculty: '/faculty',
  hod: '/hod',
  cluster_head: '/cluster-head'
};
