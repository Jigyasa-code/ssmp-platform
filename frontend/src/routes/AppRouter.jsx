/**
 * AppRouter
 * One route table for all three portals. Every authenticated branch is
 * wrapped in RequireAuth -> RequirePasswordChange -> RequireRole, and the
 * student branch adds RequireOnboarding (Feature 1's Form A gate).
 */

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole, RequireOnboarding, RequirePasswordChange } from './RouteGuards.jsx';
import { PageLoader } from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { HOME_PATH } from '../lib/constants.js';

import LoginPage from '../pages/auth/LoginPage.jsx';
import ChangePasswordPage from '../pages/auth/ChangePasswordPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';

// Code-split every portal so a student never downloads the HOD screens.
const StudentDashboardPage = lazy(() => import('../pages/student/StudentDashboardPage.jsx'));
const StudentTicketsPage = lazy(() => import('../pages/student/StudentTicketsPage.jsx'));
const StudentTicketDetailPage = lazy(() => import('../pages/student/StudentTicketDetailPage.jsx'));
const StudentOnboardingFormPage = lazy(() => import('../pages/student/StudentOnboardingFormPage.jsx'));
const StudentAcademicsPage = lazy(() => import('../pages/student/StudentAcademicsPage.jsx'));
const StudentAchievementsPage = lazy(() => import('../pages/student/StudentAchievementsPage.jsx'));
const StudentProfilePage = lazy(() => import('../pages/student/StudentProfilePage.jsx'));
const StudentGroupTicketsPage = lazy(() => import('../pages/student/StudentGroupTicketsPage.jsx'));
const StudentProfilePhotoPage = lazy(() => import('../pages/student/StudentProfilePhotoPage.jsx'));

const FacultyDashboardPage = lazy(() => import('../pages/faculty/FacultyDashboardPage.jsx'));
const FacultyTicketQueuePage = lazy(() => import('../pages/faculty/FacultyTicketQueuePage.jsx'));
const FacultyTicketDetailPage = lazy(() => import('../pages/faculty/FacultyTicketDetailPage.jsx'));
const FacultyMenteesPage = lazy(() => import('../pages/faculty/FacultyMenteesPage.jsx'));
const FacultyMenteeDetailPage = lazy(() => import('../pages/faculty/FacultyMenteeDetailPage.jsx'));
const FacultyActivityReportPage = lazy(() => import('../pages/faculty/FacultyActivityReportPage.jsx'));
const FacultyProfilePage = lazy(() => import('../pages/faculty/FacultyProfilePage.jsx'));

const HodDashboardPage = lazy(() => import('../pages/hod/HodDashboardPage.jsx'));
const HodFacultyPerformancePage = lazy(() => import('../pages/hod/HodFacultyPerformancePage.jsx'));
const HodFacultyRosterPage = lazy(() => import('../pages/hod/HodFacultyRosterPage.jsx'));
const HodSemesterSetupPage = lazy(() => import('../pages/hod/HodSemesterSetupPage.jsx'));
const HodStudentsPage = lazy(() => import('../pages/hod/HodStudentsPage.jsx'));
const HodProfilePage = lazy(() => import('../pages/hod/HodProfilePage.jsx'));

/** Sends a signed-in user to their own portal root. */
function HomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <PageLoader />;
  return <Navigate to={profile ? (HOME_PATH[profile.role] ?? '/login') : '/login'} replace />;
}

function Protected({ role, children }) {
  return (
    <RequireAuth>
      <RequirePasswordChange>
        <RequireRole role={role}>{children}</RequireRole>
      </RequirePasswordChange>
    </RequireAuth>
  );
}

export default function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/change-password"
          element={
            <RequireAuth>
              <ChangePasswordPage />
            </RequireAuth>
          }
        />
        <Route path="/reset-password" element={<ChangePasswordPage />} />
        <Route path="/" element={<HomeRedirect />} />

        {/* ── Student portal ─────────────────────────────────────────── */}
        <Route
          path="/student/onboarding"
          element={
            <Protected role="student">
              <StudentOnboardingFormPage />
            </Protected>
          }
        />
        <Route
          path="/student/profile-photo"
          element={
            <Protected role="student">
              <StudentProfilePhotoPage />
            </Protected>
          }
        />
        <Route
          path="/student"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentDashboardPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/tickets"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentTicketsPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/tickets/:ticketId"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentTicketDetailPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/group-tickets"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentGroupTicketsPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/academics"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentAcademicsPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/achievements"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentAchievementsPage />
              </RequireOnboarding>
            </Protected>
          }
        />
        <Route
          path="/student/profile"
          element={
            <Protected role="student">
              <RequireOnboarding>
                <StudentProfilePage />
              </RequireOnboarding>
            </Protected>
          }
        />

        {/* ── Faculty portal ─────────────────────────────────────────── */}
        <Route path="/faculty" element={<Protected role="faculty"><FacultyDashboardPage /></Protected>} />
        <Route path="/faculty/tickets" element={<Protected role="faculty"><FacultyTicketQueuePage /></Protected>} />
        <Route path="/faculty/tickets/:ticketId" element={<Protected role="faculty"><FacultyTicketDetailPage /></Protected>} />
        <Route path="/faculty/mentees" element={<Protected role="faculty"><FacultyMenteesPage /></Protected>} />
        <Route path="/faculty/mentees/:studentId" element={<Protected role="faculty"><FacultyMenteeDetailPage /></Protected>} />
        <Route path="/faculty/report" element={<Protected role="faculty"><FacultyActivityReportPage /></Protected>} />
        <Route path="/faculty/profile" element={<Protected role="faculty"><FacultyProfilePage /></Protected>} />

        {/* ── HOD portal ─────────────────────────────────────────────── */}
        <Route path="/hod" element={<Protected role="hod"><HodDashboardPage /></Protected>} />
        <Route path="/hod/tickets" element={<Protected role="hod"><FacultyTicketQueuePage isHodView /></Protected>} />
        <Route path="/hod/tickets/:ticketId" element={<Protected role="hod"><FacultyTicketDetailPage isHodView /></Protected>} />
        <Route path="/hod/performance" element={<Protected role="hod"><HodFacultyPerformancePage /></Protected>} />
        <Route path="/hod/reports" element={<Protected role="hod"><FacultyActivityReportPage isHodView /></Protected>} />
        <Route path="/hod/roster" element={<Protected role="hod"><HodFacultyRosterPage /></Protected>} />
        <Route path="/hod/semester" element={<Protected role="hod"><HodSemesterSetupPage /></Protected>} />
        <Route path="/hod/students" element={<Protected role="hod"><HodStudentsPage /></Protected>} />
        <Route path="/hod/students/:studentId" element={<Protected role="hod"><FacultyMenteeDetailPage isHodView /></Protected>} />
        <Route path="/hod/profile" element={<Protected role="hod"><HodProfilePage /></Protected>} />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
