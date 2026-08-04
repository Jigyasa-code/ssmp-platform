import React, { useState } from 'react';

/**
 * QuickReplies — canned reply templates dropdown for Faculty ticket chat.
 * Calls onSelect(text) when a template is chosen.
 */
const TEMPLATES = [
  {
    label: 'Acknowledged',
    text: 'Thank you for raising this issue. I have noted your concern and will get back to you within 24 hours.',
  },
  {
    label: 'Need more info',
    text: 'To assist you better, could you please provide additional details? Specifically, share any screenshots or error messages you are seeing.',
  },
  {
    label: 'Forwarded to admin',
    text: 'I have escalated this issue to the department administrator. You should receive a response within 2-3 working days.',
  },
  {
    label: 'Check Teams/ERP',
    text: 'Please check your Microsoft Teams channel and the ERP portal. The relevant materials/updates have been posted there.',
  },
  {
    label: 'Issue resolved',
    text: 'I am glad to inform you that your issue has been resolved. Please let me know if you need any further assistance.',
  },
];

const QuickReplies = ({ onSelect }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-3 py-2 text-xs font-semibold text-on-surface-variant border border-outline-variant rounded-lg hover:bg-surface-container-low transition-colors"
        title="Quick reply templates"
      >
        <span className="material-symbols-outlined text-sm">bolt</span>
        Quick Reply
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 bg-white border border-outline-variant rounded-xl shadow-xl z-50 w-72 overflow-hidden animate-scale-in">
          <div className="px-3 py-2 bg-surface-container-low border-b border-outline-variant">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Template Replies</p>
          </div>
          <ul className="divide-y divide-outline-variant/50 max-h-64 overflow-y-auto custom-scrollbar">
            {TEMPLATES.map((t, i) => (
              <li key={i}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 hover:bg-primary-fixed/30 transition-colors group"
                  onClick={() => {
                    onSelect(t.text);
                    setOpen(false);
                  }}
                >
                  <p className="text-xs font-bold text-primary group-hover:text-primary">{t.label}</p>
                  <p className="text-[11px] text-on-surface-variant leading-snug mt-0.5 line-clamp-2">{t.text}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default QuickReplies;
