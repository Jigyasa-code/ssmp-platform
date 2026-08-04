import React, { useEffect, useRef, useState } from 'react';

/**
 * StatCard — animated count-up metric card.
 * Animates from 0 to `value` over ~800ms on mount.
 */
const StatCard = ({ icon, label, value, subtext, color = 'primary', trend = null }) => {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef(null);

  useEffect(() => {
    const target = Number(value) || 0;
    if (target === 0) { setDisplay(0); return; }

    const duration = 800;
    const start = performance.now();
    const animate = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value]);

  const COLOR_MAP = {
    primary:   { bg: 'bg-primary-fixed',    text: 'text-primary' },
    secondary: { bg: 'bg-secondary-fixed',  text: 'text-secondary' },
    error:     { bg: 'bg-error-container',  text: 'text-error' },
    success:   { bg: 'bg-[#e6f4ee]',        text: 'text-[#0a6c44]' },
    accent:    { bg: 'bg-[#fff2ec]',        text: 'text-[#f47d45]' },
  };
  const c = COLOR_MAP[color] || COLOR_MAP.primary;

  return (
    <div className="bg-white border border-outline-variant rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center`}>
          <span className={`material-symbols-outlined ${c.text}`}>{icon}</span>
        </div>
        {trend !== null && (
          <span className={`text-xs font-bold flex items-center gap-0.5 ${trend >= 0 ? 'text-[#0a6c44]' : 'text-error'}`}>
            <span className="material-symbols-outlined text-xs">
              {trend >= 0 ? 'trending_up' : 'trending_down'}
            </span>
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl font-extrabold text-on-surface font-headline">{display}</p>
        <p className="text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider text-[11px] mt-0.5">{label}</p>
        {subtext && <p className="text-[10px] text-on-surface-variant mt-1">{subtext}</p>}
      </div>
    </div>
  );
};

export default StatCard;
