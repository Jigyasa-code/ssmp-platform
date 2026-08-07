/**
 * SidebarNavigation
 * The SSMP Nexus left rail: white background, brand block at the top,
 * an orange pill marking the current page, and a user card with Sign Out
 * pinned to the bottom.
 *
 * One component for all three portals; only the item list differs, which
 * comes from NAVIGATION in lib/constants.js.
 */

import { NavLink } from 'react-router-dom';
import mujLogo from '../../assets/manipal-university-jaipur-logo.png';
import { NAVIGATION, ROLE_LABELS } from '../../lib/constants.js';
import { initialsOf } from '../../lib/formatters.js';
import { useAuth } from '../../context/AuthProvider.jsx';

const ROLE_SUBTITLE = {
  student: 'Student Portal',
  faculty: 'Faculty Mentor',
  hod: 'Department Admin'
};

export default function SidebarNavigation({ role, profile, isOpen, onToggle, onNavigate }) {
  const { signOut } = useAuth();
  // `when` lets an item appear only for some users — e.g. Group Tickets,
  // which only the star mentee can see.
  const items = (NAVIGATION[role] ?? []).filter((item) => (item.when ? item.when(profile) : true));

  return (
    <>
      {/* Mobile scrim */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onToggle}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col border-r border-sidebar-border bg-sidebar transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand block */}
        <div className="px-5 pb-4 pt-5">
          <div className="flex items-start gap-3">
            <img
              src={mujLogo}
              alt="Manipal University Jaipur"
              className="h-9 w-auto max-w-[150px] object-contain"
            />
            <button
              type="button"
              onClick={onToggle}
              className="ml-auto rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container lg:hidden"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
          <p className="mt-4 text-headline-sm leading-tight text-primary">SSMP Portal</p>
          <p className="text-label-sm uppercase tracking-[0.12em] text-tertiary">
            {ROLE_SUBTITLE[role] ?? 'Portal'}
          </p>
        </div>

        <nav className="custom-scrollbar flex-1 overflow-y-auto px-3 pb-4" aria-label="Main menu">
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* User card */}
        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-xl bg-surface-container-low p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-label-sm text-white">
                {initialsOf(profile?.full_name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-label-md text-on-surface">{profile?.full_name}</span>
                <span className="block truncate text-label-sm uppercase tracking-wide text-tertiary">
                  {ROLE_LABELS[role] ?? 'User'}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-label-md text-error transition-colors hover:bg-error-container/50"
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
              Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
