import React from 'react';

/**
 * SkeletonLoader — layout-matching shimmer placeholder.
 * `variant` options: 'table', 'cards', 'stat-row'
 */
const shimmer = 'bg-gradient-to-r from-surface-container via-surface-container-highest to-surface-container bg-[length:400%_100%] animate-[shimmer_1.4s_ease-in-out_infinite]';

const SkeletonBox = ({ className = '' }) => (
  <div className={`rounded-lg ${shimmer} ${className}`} />
);

const SkeletonLoader = ({ variant = 'table', rows = 5 }) => {
  if (variant === 'cards') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white border border-outline-variant rounded-xl p-5 space-y-3">
            <div className="flex justify-between">
              <SkeletonBox className="w-10 h-10" />
              <SkeletonBox className="w-12 h-4" />
            </div>
            <SkeletonBox className="w-16 h-7" />
            <SkeletonBox className="w-24 h-3" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'stat-row') {
    return (
      <div className="flex gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex-1 bg-white border border-outline-variant rounded-xl p-4 space-y-2">
            <SkeletonBox className="h-3 w-20" />
            <SkeletonBox className="h-7 w-12" />
          </div>
        ))}
      </div>
    );
  }

  // Default: table
  return (
    <div className="space-y-2 p-4">
      {/* Header row */}
      <div className="flex gap-4 pb-2 border-b border-outline-variant">
        {[30, 20, 25, 15, 10].map((w, i) => (
          <SkeletonBox key={i} className={`h-4`} style={{ width: `${w}%` }} />
        ))}
      </div>
      {[...Array(rows)].map((_, r) => (
        <div key={r} className="flex gap-4 py-3 border-b border-outline-variant/50">
          {[30, 20, 25, 15, 10].map((w, i) => (
            <SkeletonBox key={i} className="h-4" style={{ width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
};

export default SkeletonLoader;
