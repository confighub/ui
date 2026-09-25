// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { getApiErrorMessage } from '@/utility/error-functions';

export interface IApiOperationConfig {
  error: FetchBaseQueryError | SerializedError | undefined;
  isSuccess: boolean;
  operationName: string;
  successMessage?: string;
  customErrorMessage?: string;
  onSuccess?: () => void;
  onError?: () => void;
}

export interface IUseMultipleApiErrorsOptions {
  errorPrefix?: string;
  defaultErrorMessage?: string;
  clearErrorAfter?: number; // Auto-clear error after X milliseconds
}

/**
 * Custom hook to manage error and success message display for multiple API operations.
 * Only the most recent error/success message will be displayed.
 * 
 * @param operations Array of operation configurations
 * @param options Global options for error handling
 * @returns Object with current error message and setter function
 */
export const useMultipleApiErrors = (
  operations: IApiOperationConfig[],
  options?: IUseMultipleApiErrorsOptions
) => {
  const {
    errorPrefix = 'Error',
    defaultErrorMessage = 'An unexpected error occurred. Please try again.',
    clearErrorAfter,
  } = options || {};

  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Process operations in reverse order so the first operation in the array takes precedence
    // if multiple operations have errors/success at the same time
    const operationsToProcess = [...operations].reverse();
    
    for (const operation of operationsToProcess) {
      const {
        error: operationError,
        isSuccess,
        operationName,
        successMessage = '',
        customErrorMessage,
        onSuccess,
        onError,
      } = operation;

      // Handle custom error message first (highest priority)
      if (customErrorMessage) {
        setErrorMessage(customErrorMessage);
        onError?.();
        return; // Exit early - custom error takes precedence
      }

      // Handle success
      if (isSuccess) {
        setErrorMessage(successMessage);
        onSuccess?.();
        return; // Exit early - success message found
      }

      // Handle API errors
      if (operationError) {
        const extractedMessage = getApiErrorMessage(operationError, defaultErrorMessage);

        const prefix = [errorPrefix, operationName].filter(Boolean).join(' ') + ': ';
        setErrorMessage(`${prefix}${extractedMessage}`);
        onError?.();
        return; // Exit early - error found
      }
    }
  }, [
    // Create dependencies array from all operation properties
    ...operations.flatMap(op => [op.error, op.isSuccess, op.customErrorMessage]),
    errorPrefix,
    defaultErrorMessage,
  ]);

  // Auto-clear error after specified time
  useEffect(() => {
    if (clearErrorAfter && errorMessage) {
      const timer = setTimeout(() => {
        setErrorMessage('');
      }, clearErrorAfter);

      return () => clearTimeout(timer);
    }
  }, [errorMessage, clearErrorAfter]);

  return {
    errorMessage,
    setErrorMessage,
    clearError: () => setErrorMessage(''),
  };
};

/**
 * Simplified version that only handles errors (no success messages)
 * Useful when you only need error handling and have success handling elsewhere
 */
export const useMultipleApiErrorsOnly = (
  operations: Array<{
    error: FetchBaseQueryError | SerializedError | undefined;
    isSuccess: boolean;
    operationName: string;
    customErrorMessage?: string;
    onError?: () => void;
  }>,
  options?: IUseMultipleApiErrorsOptions
) => {
  const operationsWithDefaults = operations.map(op => ({
    ...op,
    successMessage: '', // No success messages
    onSuccess: undefined,
  }));

  return useMultipleApiErrors(operationsWithDefaults, options);
};