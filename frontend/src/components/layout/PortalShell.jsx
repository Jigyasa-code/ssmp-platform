/**
 * PortalShell
 * The frame every signed-in page renders inside. Identical chrome for
 * student, faculty and HOD — only the sidebar menu changes — so the three
 * portals look and behave like one product.
 */

import { useState } from 'react';
import SidebarNavigation from './SidebarNavigation.jsx';
import TopBar from './TopBar.jsx';
import { useAuth } from '../../context/AuthProvider.jsx';
import StudentOnboardingModal from '../student/StudentOnboardingModal.jsx';

export default function PortalShell({ children, searchPlaceholder, onSearch }) {
  const { profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isOnboarding = profile?.role === 'student' && !profile?.form_a_completed;

  return (
    <div className="min-h-screen bg-background">
      <SidebarNavigation
        role={profile?.role}
        profile={profile}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((value) => !value)}
        onNavigate={() => setSidebarOpen(false)}
      />

      <div className="lg:pl-sidebar">
        <TopBar
          onToggleSidebar={() => setSidebarOpen((value) => !value)}
          searchPlaceholder={searchPlaceholder}
          onSearch={onSearch}
        />
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-6">
          {isOnboarding ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[48px] text-tertiary animate-pulse">
                pending_actions
              </span>
              <span className="text-body-md text-tertiary">Please complete your onboarding Form A.</span>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {isOnboarding && <StudentOnboardingModal />}
    </div>
  );
}
