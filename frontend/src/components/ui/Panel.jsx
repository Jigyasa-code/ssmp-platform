/**
 * Panel — the white card with a small tab label on top, matching the
 * "Class Coordinator Information" block in the SLCM portal.
 */
export default function Panel({ tab, tabIcon, title, actions, children, className = '', bodyClassName = '' }) {
  return (
    <section className={className}>
      {tab && (
        <div className="flex items-end">
          <div className="panel-tab panel-tab-accent">
            {tabIcon && (
              <span className="material-symbols-outlined text-[17px] text-primary" aria-hidden="true">
                {tabIcon}
              </span>
            )}
            {tab}
          </div>
        </div>
      )}
      <div className={`panel ${tab ? 'rounded-tl-none' : ''}`}>
        {(title || actions) && (
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-topbar-border px-4 py-3">
            {title && <h2 className="text-headline-sm text-on-surface">{title}</h2>}
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </header>
        )}
        <div className={bodyClassName ?? 'p-4'}>{children}</div>
      </div>
    </section>
  );
}
