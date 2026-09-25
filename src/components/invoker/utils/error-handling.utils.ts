// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FunctionInvocationsResponse } from '@confighub/rtk-query';

interface ApiErrorData {
  Message?: string;
  message?: string;
  Error?: {
    Message?: string;
    message?: string;
    Details?: string[];
    ErrorMetadata?: ErrorMetadata;
  };
  Details?: string[];
  ErrorMetadata?: ErrorMetadata;
}

interface ErrorMetadata {
  Items?: Array<{
    Item?: string;
    Description?: string;
  }>;
}

interface ExtractedError {
  message: string;
  responses?: FunctionInvocationsResponse[];
}

/**
 * Extract a user-friendly error message from various API error formats
 */
export function extractApiErrorMessage(error: unknown): ExtractedError {
  let errorMessage = 'An error occurred';
  let errorResponses: FunctionInvocationsResponse[] | undefined;

  if (!error || typeof error !== 'object') {
    if (error instanceof Error) {
      return { message: error.message };
    }
    return { message: errorMessage };
  }

  const apiError = error as { data?: unknown; message?: string; status?: number };

  // Check for RTK Query error structure with data
  if (apiError.data) {
    // If data is an array, it's likely FunctionInvocationsResponse[]
    if (Array.isArray(apiError.data)) {
      errorResponses = apiError.data as FunctionInvocationsResponse[];
      const firstError = errorResponses.find(r => r.Error);
      if (firstError?.Error?.Message) {
        errorMessage = firstError.Error.Message;
      }
    } else if (typeof apiError.data === 'object') {
      const errorData = apiError.data as ApiErrorData;
      errorMessage = extractMessageFromErrorData(errorData);
    }
  } else if (apiError.message) {
    errorMessage = apiError.message;
  }

  return { message: errorMessage, responses: errorResponses };
}

/**
 * Extract error message from structured error data object
 */
function extractMessageFromErrorData(errorData: ApiErrorData): string {
  let errorMessage = 'An error occurred';

  // Extract the main error message
  if (typeof errorData.Message === 'string') {
    errorMessage = errorData.Message;
  } else if (typeof errorData.message === 'string') {
    errorMessage = errorData.message;
  } else if (errorData.Error) {
    if (typeof errorData.Error.Message === 'string') {
      errorMessage = errorData.Error.Message;
    } else if (typeof errorData.Error.message === 'string') {
      errorMessage = errorData.Error.message;
    }
  }

  // Add details if available
  const details = errorData.Details || errorData.Error?.Details;
  if (details && Array.isArray(details) && details.length > 0) {
    errorMessage += '\n\nDetails:\n' + details.map(d => `• ${String(d)}`).join('\n');
  }

  // Add error metadata items if available
  const metadata = errorData.ErrorMetadata || errorData.Error?.ErrorMetadata;
  if (metadata?.Items && metadata.Items.length > 0) {
    errorMessage += '\n\nValidation Errors:';
    metadata.Items.forEach(item => {
      if (item.Item && item.Description) {
        errorMessage += `\n• ${item.Item}:\n  ${item.Description}`;
      } else if (item.Item) {
        errorMessage += `\n• ${item.Item}`;
      } else if (item.Description) {
        errorMessage += `\n• ${item.Description}`;
      }
    });
  }

  return errorMessage;
}

/**
 * Check if API response contains an embedded error (200 with error in body)
 */
export function extractEmbeddedError(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;

  const responseWithError = result as {
    Error?: {
      Message?: string;
      message?: string;
      Details?: string[];
    };
  };

  if (!responseWithError.Error) return null;

  let errorMessage = responseWithError.Error.Message ||
                     responseWithError.Error.message ||
                     'Operation failed';

  if (responseWithError.Error.Details && Array.isArray(responseWithError.Error.Details)) {
    errorMessage += '\n\nDetails:\n' + responseWithError.Error.Details.map(d => `• ${d}`).join('\n');
  }

  return errorMessage;
}
