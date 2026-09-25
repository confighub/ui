// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

// Import the response types from your API
import type { DeleteResponse } from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { getApiErrorMessage } from '@/utility/error-functions';

export interface IBulkOperationMessagingOptions {
  successMessage?: string;
  defaultErrorMessage?: string;
  errorPrefix?: string;
  operationName?: string;
  customErrorMessage?: string;
  onSuccess?: () => void;
  onError?: () => void;
}

/**
 * Custom hook to manage error and success message display for bulk delete operations.
 * Handles arrays of DeleteResponse where each item can be successful or contain an error.
 * Returns errors as a string array.
 */
export const useBulkApiErrorMessage = (
  operationError: FetchBaseQueryError | SerializedError | undefined,
  isSuccess: boolean,
  data: DeleteResponse[] | undefined,
  setSharedMessage: (message: Array<string>) => void,
  options?: IBulkOperationMessagingOptions,
): string[] => {
  const {
    defaultErrorMessage = 'An unexpected error occurred. Please try again.',
    errorPrefix,
    operationName,
    customErrorMessage,
    onSuccess,
    onError,
  } = options || {};

  const errors: string[] = [];

  useEffect(() => {
    if (customErrorMessage) {
      setSharedMessage([customErrorMessage]);
      onError?.();
      return;
    }

    // Handle general operation error (network, etc.)
    if (operationError) {
      const extractedMessage = getApiErrorMessage(operationError, defaultErrorMessage);

      const prefix =
        [errorPrefix, operationName].filter(Boolean).join(' ') +
        (errorPrefix || operationName ? ': ' : '');
      setSharedMessage([`${prefix}${extractedMessage}`]);
      onError?.();
      return;
    }

    // Handle bulk operation results
    if (isSuccess && data) {
      const errorItems = data.filter((item) => item.Error);

      if (errorItems.length > 0) {
        setSharedMessage(
          errorItems.map((item) => item.Error?.Message || item.Message || 'Unknown error'),
        );
        onError?.();

        return;
      } else onSuccess?.();
    }
  }, [operationError, data]);

  // Extract errors for return
  if (data) {
    const errorItems = data.filter((item) => item.Error);
    errors.push(
      ...errorItems.map((item) => item.Error?.Message || item.Message || 'Unknown error'),
    );
  }

  return errors;
};
