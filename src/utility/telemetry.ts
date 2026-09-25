// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { runtimePosthogKey } from '@/auth/config';

/**
 * The PostHog project key, or '' when telemetry is off. A deployment reports only
 * where its `/config.json` says, so a self-hosted UI sends nothing by default.
 * Read after `loadRuntimeConfig()`.
 */
export const posthogKey = (): string => runtimePosthogKey() ?? '';

export const telemetryEnabled = (): boolean => posthogKey() !== '';
