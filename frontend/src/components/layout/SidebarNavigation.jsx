/**
 * SidebarNavigation
 * The SLCM-style left rail: white logo panel on top, terracotta menu
 * beneath. Same component for all three portals; only the item list
 * differs, which comes from NAVIGATION in lib/constants.js.
 */

import { NavLink } from 'react-router-dom';
import mujLogo from '../../assets/manipal-university-jaipur-logo.png';
import { NAVIGATION, ROLE_LABELS } from '../../lib/constants.js';

export default function SidebarNavigation({ role, isOpen, onToggle, onNavigate }) {
  const items = NAVIGATION[role] ?? [];

  return (
    <>
      {/* Mobile scrim */}
      {isOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onToggle}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col bg-sidebar transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo panel — white, matching the SLCM header block */}
        <div className="flex items-center gap-3 border-b border-sidebar-border bg-white px-4 py-3">
          <img
            src={mujLogo}
            alt="Manipal University Jaipur"
            className="h-10 w-auto max-w-[168px] object-contain"
          />
          <button
            type="button"
            onClick={onToggle}
            className="ml-auto rounded p-1.5 text-primary hover:bg-surface-container lg:hidden"
            aria-label="Close menu"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <nav className="custom-scrollbar flex-1 overflow-y-auto pb-6" aria-label="Main menu">
          <p className="px-5 pb-2 pt-5 text-label-sm uppercase tracking-[0.14em] text-sidebar-muted">
            Menu
          </p>

          <ul>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
                  }
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

        <div className="border-t border-sidebar-border px-5 py-4">
          <p className="text-label-sm text-sidebar-muted">Signed in as</p>
          <p className="text-body-sm font-semibold text-white">{ROLE_LABELS[role] ?? 'User'}</p>
          <p className="mt-2 text-[11px] leading-4 text-sidebar-muted">
            Student Support &amp; Mentorship Portal
          </p>
        </div>
      </aside>
    </>
  );
}
