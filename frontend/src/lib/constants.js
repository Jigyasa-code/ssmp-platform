/** Shared enums and option lists. Must stay in sync with the Postgres enums. */

export const ROLES = { STUDENT: 'student', FACULTY: 'faculty', HOD: 'hod' };

export const ROLE_LABELS = {
  student: 'Student',
  faculty: 'Faculty Mentor',
  hod: 'Head of Department'
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

export const EMPLOYMENT_STATUS_LABELS = {
  active: 'Active',
  on_leave: 'On leave',
  departed: 'Departed'
};

export const CHART_COLORS = {
  academic: '#a43700',
  erpTech: '#fd7039',
  infrastructure: '#5b5c5c',
  open: '#ba1a1a',
  inProgress: '#b47a00',
  resolved: '#1b7340',
  primary: '#a43700',
  secondary: '#fd7039',
  slate: '#5b5c5c',
  series: ['#a43700', '#fd7039', '#5b5c5c', '#cd4800', '#b47a00', '#1b7340']
};

/** Sidebar menu per role — the SLCM "MENU" list. */
export const NAVIGATION = {
  student: [
    { to: '/student', label: 'Home', icon: 'home', end: true },
    { to: '/student/tickets', label: 'My Tickets', icon: 'confirmation_number' },
    { to: '/student/academics', label: 'Academics', icon: 'school' },
    { to: '/student/achievements', label: 'Achievements', icon: 'military_tech' },
    { to: '/student/onboarding', label: 'Form A', icon: 'assignment' },
    { to: '/student/profile', label: 'My Profile', icon: 'account_circle' }
  ],
  faculty: [
    { to: '/faculty', label: 'Home', icon: 'home', end: true },
    { to: '/faculty/tickets', label: 'Ticket Queue', icon: 'inbox' },
    { to: '/faculty/mentees', label: 'My Mentees', icon: 'groups' },
    { to: '/faculty/report', label: 'My Report', icon: 'analytics' },
    { to: '/faculty/profile', label: 'My Profile', icon: 'account_circle' }
  ],
  hod: [
    { to: '/hod', label: 'Home', icon: 'home', end: true },
    { to: '/hod/tickets', label: 'All Tickets', icon: 'inbox' },
    { to: '/hod/performance', label: 'Faculty Performance', icon: 'leaderboard' },
    { to: '/hod/roster', label: 'Faculty Roster', icon: 'badge' },
    { to: '/hod/semester', label: 'Semester Setup', icon: 'event_note' },
    { to: '/hod/students', label: 'Students', icon: 'school' },
    { to: '/hod/profile', label: 'My Profile', icon: 'account_circle' }
  ]
};

export const HOME_PATH = { student: '/student', faculty: '/faculty', hod: '/hod' };
