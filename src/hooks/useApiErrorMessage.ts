// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { getApiErrorMessage } from '@/utility/error-functions';

export interface IUseOperationMessagingOptions {
  successMessage?: string;
  defaultErrorMessage?: string;
  errorPrefix?: string;
  operationName?: string;
  customErrorMessage?: string; // Pass a custom error message to display an error even if RTK Query reports success
  onSuccess?: () => void;
  onError?: () => void;
}

/**
 * Custom hook to manage error and success message display for an operation.
 * @param operationError The error object from the operation.
 * @param isSuccess Flag indicating if the operation was successful.
 * @param setSharedMessage State setter function for the message to be displayed.
 * @param options Optional configuration for messages and callbacks.
 */
export const useApiErrorMessage = (
  operationError: FetchBaseQueryError | SerializedError | undefined,
  isSuccess: boolean,
  setSharedMessage: (message: string) => void,
  options?: IUseOperationMessagingOptions,
) => {
  const {
    successMessage = '',
    defaultErrorMessage = 'An unexpected error occurred. Please try again.',
    errorPrefix,
    operationName,
    customErrorMessage,
    onSuccess,
    onError,
  } = options || {};

  useEffect(() => {
    if (customErrorMessage) {
      setSharedMessage(customErrorMessage);
      onError?.();
    } else if (isSuccess) {
      setSharedMessage(successMessage);
      onSuccess?.();
    } else if (operationError) {
      const extractedMessage = getApiErrorMessage(operationError, defaultErrorMessage);

      const prefix =
        [errorPrefix, operationName].filter(Boolean).join(' ') +
        (errorPrefix || operationName ? ': ' : '');
      setSharedMessage(`${prefix}${extractedMessage}`);

      onError?.();
    }
  }, [operationError, isSuccess]);
};
