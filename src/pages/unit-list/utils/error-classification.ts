// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Error Classification Utilities
 *
 * Determines whether bridge worker errors are retryable or permanent failures.
 * This helps the UI make intelligent decisions about retry behavior for bulk operations.
 *
 * Based on bridge worker error handling patterns from:
 * - public/bridge-worker/impl/kubernetes.go
 * - public/bridge-worker/impl/k8s_cliutils_applier.go
 * - public/bridge-worker/impl/k8s_flux_ssa_applier_impl.go
 */

/**
 * Error Categories
 *
 * Configuration Errors: Invalid setup that won't resolve with retries
 * - Missing or invalid Kubernetes context
 * - Invalid kubeconfig
 * - Authentication/authorization failures
 * - Certificate errors
 *
 * Parse Errors: Malformed data that won't change
 * - Invalid YAML syntax
 * - Malformed JSON
 * - Invalid object structures
 *
 * Transient Errors: Temporary issues that may resolve
 * - Timeout waiting for resources
 * - Network connectivity issues
 * - Resources not ready yet
 */

/**
 * Checks if an error message indicates a permanent configuration failure
 * that should NOT be retried.
 *
 * These errors indicate fundamental misconfiguration (wrong context, bad credentials,
 * etc.) that won't resolve without user intervention.
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns true if error is a permanent configuration error
 */
export const isConfigError = (errorMessage: string): boolean => {
  if (!errorMessage) return false;

  const msg = errorMessage.toLowerCase();

  // Kubernetes context errors
  if (
    (msg.includes('context') && msg.includes('does not exist')) ||
    msg.includes('not found')
  ) {
    return true;
  }

  // Kubeconfig errors
  if (
    msg.includes('failed to get kubernetes config') ||
    msg.includes('invalid configuration') ||
    msg.includes('no configuration has been provided') ||
    msg.includes('kubeconfig')
  ) {
    return true;
  }

  // Authentication/authorization errors
  if (
    msg.includes('unauthorized') ||
    msg.includes('authentication required') ||
    msg.includes('authentication failed') ||
    msg.includes('forbidden') ||
    msg.includes('permission denied')
  ) {
    return true;
  }

  // Certificate errors
  if (msg.includes('certificate') && (msg.includes('invalid') || msg.includes('expired'))) {
    return true;
  }

  // Applier creation errors (often indicate missing CRDs or invalid config)
  if (
    msg.includes('failed to create applier') ||
    msg.includes('failed to create kubernetes client')
  ) {
    return true;
  }

  // Apply operation failures (permanent errors from the applier)
  if (msg.includes('failed to apply resources')) {
    return true;
  }

  return false;
};

/**
 * Checks if an error message indicates a parsing failure
 * that should NOT be retried.
 *
 * These errors indicate malformed input data that won't change between retries.
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns true if error is a permanent parse error
 */
export const isParseError = (errorMessage: string): boolean => {
  if (!errorMessage) return false;

  const msg = errorMessage.toLowerCase();

  // YAML/JSON parsing errors
  if (
    msg.includes('failed to parse') ||
    msg.includes('invalid yaml') ||
    msg.includes('yaml') ||
    msg.includes('json') ||
    msg.includes('unmarshal') ||
    msg.includes('syntax error') ||
    msg.includes('malformed')
  ) {
    return true;
  }

  // Invalid target parameters
  if (msg.includes('failed to parse target params')) {
    return true;
  }

  return false;
};

/**
 * Checks if an error indicates a worker/target configuration issue
 * that should NOT be retried indefinitely.
 *
 * These errors suggest the bridge worker or target is not properly set up.
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns true if error indicates worker/target misconfiguration
 */
export const isWorkerConfigError = (errorMessage: string): boolean => {
  if (!errorMessage) return false;

  const msg = errorMessage.toLowerCase();

  // Worker not running or target misconfigured
  if (
    msg.includes('worker may not be running') ||
    msg.includes('target is not properly configured') ||
    msg.includes('no events received')
  ) {
    return true;
  }

  return false;
};

/**
 * Determines if an error is a permanent failure that should NOT be retried.
 *
 * Permanent errors include:
 * - Configuration errors (wrong context, bad auth, etc.)
 * - Parse errors (invalid YAML, malformed JSON)
 * - Worker/target configuration issues
 *
 * This is the main function to use for retry decision-making.
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns true if error should NOT be retried
 */
export const isPermanentError = (errorMessage: string): boolean => {
  return (
    isConfigError(errorMessage) ||
    isParseError(errorMessage) ||
    isWorkerConfigError(errorMessage)
  );
};

/**
 * Determines if an error is transient and may benefit from retry.
 *
 * Transient errors include:
 * - Timeout waiting for resources
 * - Resources not ready
 * - Temporary network issues
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns true if error might resolve with retry
 */
export const isTransientError = (errorMessage: string): boolean => {
  if (!errorMessage) return false;

  const msg = errorMessage.toLowerCase();

  // Timeout errors (resources not ready yet)
  if (
    msg.includes('timeout waiting for resources') ||
    msg.includes('resources not ready') ||
    msg.includes('not ready') ||
    msg.includes('deadline exceeded')
  ) {
    return true;
  }

  // Network errors
  if (
    msg.includes('connection refused') ||
    msg.includes('network') ||
    msg.includes('dial tcp')
  ) {
    return true;
  }

  return false;
};

/**
 * Gets a user-friendly explanation for why an operation won't be retried.
 *
 * This provides context to help users understand permanent failures.
 *
 * @param errorMessage - Error message from UnitEvent.Message field
 * @returns User-friendly explanation string, or null if error is retryable
 */
export const getPermanentErrorExplanation = (errorMessage: string): string | null => {
  if (!isPermanentError(errorMessage)) return null;

  if (isConfigError(errorMessage)) {
    return 'Configuration error - please check your Kubernetes context, credentials, and target settings.';
  }

  if (isParseError(errorMessage)) {
    return 'Parse error - please check your YAML/JSON configuration for syntax errors.';
  }

  if (isWorkerConfigError(errorMessage)) {
    return 'Worker or target configuration issue - please verify your bridge worker is running and target is properly configured.';
  }

  return 'Permanent error - this operation cannot be retried automatically.';
};
