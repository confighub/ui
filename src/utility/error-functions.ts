// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

/**
 * Extracts an error message from RTK Query error objects or generic error types.
 * Handles FetchBaseQueryError (with data.message), SerializedError (with message),
 * Error objects, and unknown values from catch blocks.
 *
 * @param error - The error from an RTK Query mutation/query or a catch block
 * @param defaultMessage - The message to return if no error message can be extracted
 * @returns The extracted error message or the default message
 *
 * @example
 * ```ts
 * // With RTK Query errors
 * const [submitData, { error }] = useSubmitDataMutation();
 * const errorMessage = getApiErrorMessage(error, 'Failed to submit data');
 *
 * // With catch block errors
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   const errorMessage = getApiErrorMessage(error, 'Operation failed');
 * }
 * ```
 */
export function getApiErrorMessage(
  error: FetchBaseQueryError | SerializedError | Error | unknown,
  defaultMessage = 'An unexpected error occurred',
): string {
  // Handle null, undefined, or non-object types
  if (error == null || typeof error !== 'object') {
    return defaultMessage;
  }

  // Check for FetchBaseQueryError with data.message (API errors from RTK Query)
  if ('data' in error) {
    const fetchError = error as FetchBaseQueryError;
    if (
      typeof fetchError.data === 'object' &&
      fetchError.data != null &&
      'message' in fetchError.data
    ) {
      const message = (fetchError.data as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  }

  // Check for Error or SerializedError with message property
  if ('message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }

  return defaultMessage;
}

/**
 * True when a request stopped because its caller aborted it, which RTK Query
 * reports as a `SerializedError` named `AbortError`. A cancel the user asked
 * for is not a failure, so the caller must not show it as one.
 */
export function isAbortedRequestError(error: unknown): boolean {
  return (
    error != null &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: unknown }).name === 'AbortError'
  );
}

export interface QueryErrorClassification {
  /** Plain-language statement of what went wrong. */
  headline: string;
  /** One suggested action. For a 400, this is the server's own message. */
  suggestion: string;
}

export interface QueryErrorDisplay extends QueryErrorClassification {
  /**
   * The server's own message, kept as secondary detail because it names the
   * cause the plain-language copy cannot — for a failed pull, the part after
   * `failed to pull <ref>: `, such as `unauthorized` or `manifest unknown`.
   * Absent when the server said nothing, or when the suggestion already is
   * the server's message, so no caller prints the same text twice.
   */
  detail?: string;
}

/**
 * Maps an RTK Query error to a headline and a suggested action for display in
 * `QueryErrorState`. A 401 or 403 never reaches this function in practice —
 * both are caught globally by `confighubapi.ts` and redirect the user before
 * any component renders an error state — so those statuses are not handled
 * here as special cases; they fall through to the generic message below.
 *
 * @param error - The error from an RTK Query query, or `undefined` if none.
 * @param context - What failed to load, used in the fallback headline, e.g. `components`.
 */
export function classifyQueryError(
  error: FetchBaseQueryError | SerializedError | undefined,
  context: string,
): QueryErrorClassification {
  const fallback: QueryErrorClassification = {
    headline: `Could not load ${context}`,
    suggestion: 'Try again.',
  };

  if (!error || !('status' in error)) {
    return fallback;
  }

  const { status } = error;

  if (status === 'FETCH_ERROR') {
    return {
      headline: 'Cannot reach the ConfigHub server',
      suggestion: 'Check your network. Confirm the server runs.',
    };
  }
  if (status === 'TIMEOUT_ERROR') {
    return {
      headline: 'The server took too long to answer',
      suggestion: 'The server may be busy. Try again.',
    };
  }
  if (status === 'PARSING_ERROR') {
    return {
      headline: 'The server sent an answer we cannot read',
      suggestion: 'Usually a version mismatch or a proxy problem.',
    };
  }
  if (status === 404) {
    return {
      headline: 'This Space was not found',
      suggestion: 'It may be deleted or renamed. Check the URL.',
    };
  }
  if (status === 400) {
    return {
      headline: 'The request was rejected',
      suggestion: getApiErrorMessage(error, 'Check the request and try again.'),
    };
  }
  // A 422 is a source the server could not pull, and a 504 is a source that
  // took too long to pull. Neither is a fault of ConfigHub, so they must not
  // read as "the request was rejected" or as an internal error.
  if (status === 422) {
    return {
      headline: 'The bundle could not be pulled',
      suggestion: 'Check that the reference is correct and that the registry can be reached. A private registry also needs credentials.',
    };
  }
  if (status === 504) {
    return {
      headline: 'The registry took too long to answer',
      suggestion: 'Try again. A very large bundle can be too large to pull in the time limit.',
    };
  }
  if (typeof status === 'number' && status >= 500) {
    return {
      headline: 'The server had an internal error',
      suggestion: 'Not your fault. Try again, then report it.',
    };
  }

  return fallback;
}

/**
 * Classifies an error and keeps the server's own message alongside it, for a
 * caller that shows all three in one banner instead of the `QueryErrorState`
 * panel. Takes `unknown` so it can be called straight from a `catch`.
 *
 * @param error - The error from an RTK Query call or a catch block.
 * @param context - What failed, used in the fallback headline, e.g. `the bundle`.
 */
export function describeQueryError(error: unknown, context: string): QueryErrorDisplay {
  const queryError =
    error != null && typeof error === 'object' ? (error as FetchBaseQueryError | SerializedError) : undefined;
  const classification = classifyQueryError(queryError, context);
  const serverMessage = getApiErrorMessage(error, '');
  if (!serverMessage || serverMessage === classification.suggestion) {
    return classification;
  }
  return { ...classification, detail: serverMessage };
}
