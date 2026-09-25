# Error Retry Logic for Bulk Unit Operations

## Overview

The bulk unit operations system now implements intelligent error classification to determine which errors should be retried and which should fail immediately. This prevents unnecessary retries for permanent configuration errors while still retrying transient failures.

## Architecture

### Error Classification System

**Location:** `src/pages/unit-list/utils/error-classification.ts`

The error classification system analyzes error messages from bridge worker operations and categorizes them into:

1. **Permanent Errors** - Should NOT be retried

   - Configuration errors (wrong Kubernetes context, bad credentials)
   - Parse errors (invalid YAML/JSON syntax)
   - Worker/target configuration issues

2. **Transient Errors** - May benefit from retry
   - Timeout waiting for resources
   - Network connectivity issues
   - Resources not ready yet

### Integration with useBulkUnitActions

**Location:** `src/pages/unit-list/hooks/useBulkUnitActions.ts`

The hook's `awaitBulkCompletion` function now:

1. Polls for UnitEvents as before
2. When a Failed event is received, calls `isPermanentError(message)` to check error type
3. For permanent errors: Fails immediately with helpful explanation
4. For transient errors: Continues retry logic (up to 5 retries)

## Error Categories

### Configuration Errors (Permanent)

These indicate fundamental misconfiguration that won't resolve without user intervention:

```typescript
// Kubernetes context errors
"context 'chubby-bear-infra' does not exist";
'failed to get Kubernetes config';

// Authentication/authorization errors
'Unauthorized: authentication required';
'Forbidden: permission denied';

// Certificate errors
'certificate has expired';
'invalid certificate';

// Applier creation errors
'failed to create applier: connection refused';
'failed to create kubernetes client and manager';
```

**User Action Required:**

- Verify Kubernetes context exists and is spelled correctly
- Check credentials and authentication
- Verify bridge worker has proper permissions
- Check certificate validity

### Parse Errors (Permanent)

These indicate malformed input data that won't change between retries:

```typescript
// YAML errors
'failed to parse YAML resources: syntax error';
'invalid yaml: mapping values not allowed';

// JSON errors
'failed to parse target params: json: unexpected end';
'unmarshal error: invalid character';
```

**User Action Required:**

- Check YAML/JSON syntax in unit configuration
- Validate target parameters structure
- Use a YAML/JSON validator

### Worker Configuration Errors (Permanent)

These suggest the bridge worker or target is not properly set up:

```typescript
// Worker not running
'Worker may not be running or target is not properly configured';
'No events received after 60 seconds';
```

**User Action Required:**

- Verify bridge worker is running and healthy
- Check target configuration matches bridge worker capabilities
- Ensure network connectivity between ConfigHub and bridge worker

### Transient Errors (Retryable)

These may resolve on subsequent attempts:

```typescript
// Timeout errors
'timeout waiting for resources';
'resources not ready after 2 minutes';
'deadline exceeded';

// Network errors
'connection refused';
'network timeout';
'dial tcp: connection timeout';
```

**Retry Behavior:**

- Backend retries up to 5 times with exponential backoff
- UI shows retry count: "timeout waiting for resources (retry 2/5)"
- After 5 failures, marked as permanently failed

## Backend Correlation

This frontend error classification mirrors the backend's error handling in:

- `public/bridge-impl/kubernetes.go`

  - Lines 366-370: Parse errors marked as `backoff.Permanent()`
  - Lines 382-389: Object parsing errors marked as `backoff.Permanent()`

- `public/bridge-impl/k8s_cliutils_applier.go`

  - Configuration errors when creating Kubernetes client
  - Invalid kubeconfig or context errors

- `public/core/worker/lib/client_bridge.go`
  - Lines 90-114: Watch operations with exponential backoff retry
  - Uses `backoff.RetryAfter()` for transient errors
  - Uses `backoff.Permanent()` for permanent failures

## User Experience

### Before This Change

**Problem:** Users would see operations retry 5 times even for permanent errors like:

- "context 'my-context' does not exist" (retries 5 times over ~11 minutes)
- "invalid YAML syntax" (retries 5 times)
- "Worker not running" (retries 5 times)

### After This Change

**Improvement:** Permanent errors fail immediately with helpful explanation:

```
Error: failed to create applier: failed to get Kubernetes config:
context "chubby-bear-infra" does not exist

Configuration error - please check your Kubernetes context,
credentials, and target settings.
```

**Transient errors still retry** with progress indication:

```
Status: Progressing
Message: timeout waiting for resources (retry 2/5)
```

## Adding New Error Patterns

To add detection for new error patterns:

1. **Update the appropriate function** in `error-classification.ts`:

   - `isConfigError()` for configuration issues
   - `isParseError()` for parsing issues
   - `isWorkerConfigError()` for worker/target issues
   - `isTransientError()` for retryable issues

2. **Update explanation** in `getPermanentErrorExplanation()` if needed

## Future Enhancements

Potential improvements:

1. **Structured error codes** from backend instead of parsing messages
2. **Error analytics** to track most common permanent vs transient errors
3. **Configurable retry counts** per error category
4. **Circuit breaker** for repeated permanent failures
5. **User notification** when permanent error suggests specific fix action

## References

- Backend retry logic: `public/bridge-impl/kubernetes.go`
- Backoff library: `github.com/cenkalti/backoff/v5`
- Bridge worker error handling: `public/core/worker/lib/safe_send_status.go`
