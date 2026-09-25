// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Custom hook to manage a message state with automatic clearing functionality.
 * @param autoCloseTimeout Optional timeout in milliseconds after which the message will be automatically cleared.
 * @returns A tuple containing the current message and a setter function with auto-close behavior.
 * @example
 * ```tsx
 * const [errorMessage, setErrorMessage] = useAutoCloseMessage(5000); // 5 seconds
 * ```
 */
// TODO: this hook is currently not used anywhere.
// Use it with `useApiErrorMessage` or on its own if you need to display an auto-closing error message.
export const useAutoCloseMessage = (autoCloseTimeout?: number) => {
  const [message, setMessage] = useState<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setMessageWithAutoClose = useCallback(
    (newMessage: string) => {
      setMessage(newMessage);

      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // Set new timeout if message is not empty and timeout is configured
      if (newMessage && autoCloseTimeout && autoCloseTimeout > 0) {
        timeoutRef.current = setTimeout(() => {
          setMessage('');
        }, autoCloseTimeout);
      }
    },
    [autoCloseTimeout],
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return [message, setMessageWithAutoClose] as const;
};
