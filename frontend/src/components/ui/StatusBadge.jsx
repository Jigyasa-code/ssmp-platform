import React from 'react';

/**
 * StatusBadge — shared status chip for ticket status.
 * Used across all three role dashboards for consistency.
 */
const STATUS_CONFIG = {
  'Open': {
    icon: 'radio_button_unchecked',
    classes: 'bg-error-container text-on-error-container border-error/20',
  },
  'In Progress': {
    icon: 'autorenew',
    classes: 'bg-secondary-container text-on-secondary-container border-secondary/20',
  },
  'Resolved': {
    icon: 'check_circle',
    classes: 'bg-[#e6f4ee] text-[#0a6c44] border-[#0a6c44]/20',
  },
};

const StatusBadge = ({ status, size = 'sm' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG['Open'];
  const iconSize = size === 'lg' ? 'text-base' : 'text-xs';
  const textSize = size === 'lg' ? 'text-sm' : 'text-[10px]';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide
        ${config.classes} ${textSize}`}
    >
      <span className={`material-symbols-outlined ${iconSize} ${status === 'In Progress' ? 'animate-spin' : ''}`}
        style={status === 'In Progress' ? { animationDuration: '2s' } : {}}>
        {config.icon}
      </span>
      {status}
    </span>
  );
};

export default StatusBadge;
