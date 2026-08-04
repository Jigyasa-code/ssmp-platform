import React from 'react';

/**
 * EmptyState — consistent empty/error state with icon, heading, subtext.
 */
const EmptyState = ({ icon = 'inbox', heading, subtext, action = null }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
    <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center mb-4 border border-outline-variant">
      <span className="material-symbols-outlined text-3xl text-on-surface-variant">{icon}</span>
    </div>
    <h3 className="font-headline text-lg font-bold text-on-surface mb-1">{heading}</h3>
    {subtext && <p className="text-sm text-on-surface-variant max-w-xs">{subtext}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
