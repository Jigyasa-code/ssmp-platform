const TONES = {
  primary: { bar: 'bg-primary', icon: 'text-primary', chip: 'bg-primary-fixed text-on-primary-fixed' },
  success: { bar: 'bg-success', icon: 'text-success', chip: 'bg-success-container text-on-success-container' },
  warning: { bar: 'bg-warning', icon: 'text-warning', chip: 'bg-warning-container text-on-warning-container' },
  error: { bar: 'bg-error', icon: 'text-error', chip: 'bg-error-container text-on-error-container' },
  info: { bar: 'bg-info', icon: 'text-info', chip: 'bg-info-container text-on-info-container' },
  slate: { bar: 'bg-tertiary', icon: 'text-tertiary', chip: 'bg-surface-container-high text-on-surface-variant' }
};

export default function StatCard({ label, value, caption, icon, tone = 'primary', trend, onClick }) {
  const style = TONES[tone] ?? TONES.primary;
  const Element = onClick ? 'button' : 'div';

  return (
    <Element
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`panel relative flex w-full items-start gap-3 overflow-hidden p-4 text-left ${
        onClick ? 'transition-shadow hover:shadow-raised' : ''
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${style.bar}`} aria-hidden="true" />
      <div className="min-w-0 flex-1 pl-2">
        <p className="truncate text-label-sm uppercase tracking-wide text-on-surface-variant">{label}</p>
        <p className="mt-1 text-headline-md leading-tight text-on-surface">{value}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {caption && <span className="text-label-sm text-tertiary">{caption}</span>}
          {trend != null && trend !== 0 && (
            <span
              className={`chip ${trend > 0 ? 'bg-success-container text-on-success-container' : 'bg-error-container text-on-error-container'}`}
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                {trend > 0 ? 'trending_up' : 'trending_down'}
              </span>
              {trend > 0 ? '+' : ''}
              {trend}
            </span>
          )}
        </div>
      </div>
      {icon && (
        <span className={`material-symbols-outlined text-[26px] ${style.icon}`} aria-hidden="true">
          {icon}
        </span>
      )}
    </Element>
  );
}
