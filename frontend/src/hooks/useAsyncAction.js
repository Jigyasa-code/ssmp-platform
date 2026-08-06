import { useCallback, useState } from 'react';
import { describeError } from '../lib/formatters.js';
import { useToast } from '../context/ToastProvider.jsx';

/**
 * Wraps an async action with a pending flag and consistent error toasts,
 * so every button in the app behaves the same way when something fails.
 */
export function useAsyncAction() {
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async (action, { successMessage, onSuccess, errorMessage } = {}) => {
      setPending(true);
      try {
        const result = await action();
        if (successMessage) toast.success(successMessage);
        if (onSuccess) await onSuccess(result);
        return result;
      } catch (error) {
        toast.error(errorMessage ?? describeError(error));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [toast]
  );

  return { run, pending };
}
