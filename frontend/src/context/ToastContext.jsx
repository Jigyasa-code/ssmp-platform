import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let toastId = 0;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = {
    success: (msg, d) => addToast(msg, 'success', d),
    error:   (msg, d) => addToast(msg, 'error', d),
    info:    (msg, d) => addToast(msg, 'info', d),
    warning: (msg, d) => addToast(msg, 'warning', d),
  };

  const ICONS = {
    success: 'check_circle',
    error:   'error',
    info:    'info',
    warning: 'warning',
  };

  const STYLES = {
    success: 'bg-[#0a6c44] text-white border-[#0a6c44]',
    error:   'bg-error text-on-primary border-error',
    info:    'bg-primary text-on-primary border-primary',
    warning: 'bg-[#f47d45] text-white border-[#f47d45]',
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none"
        style={{ maxWidth: '380px' }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl pointer-events-auto
              animate-scale-in ${STYLES[t.type]}`}
            style={{ backdropFilter: 'blur(8px)' }}
          >
            <span className="material-symbols-outlined text-xl mt-0.5 shrink-0">
              {ICONS[t.type]}
            </span>
            <p className="text-sm font-semibold flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => removeToast(t.id)}
              className="material-symbols-outlined text-base opacity-70 hover:opacity-100 transition-opacity shrink-0"
            >
              close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
