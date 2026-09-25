// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Page } from '@playwright/test';
import { cpuThrottleRate } from '../../playwright.config';

/**
 * Apply CPU throttling via Chrome DevTools Protocol to simulate slow CI.
 *
 * Usage: Call once per page in test setup, or use the auto-applying
 * version via the entity grid fixture.
 *
 *   SLOW_MODE=1 npx playwright test       # 6x CPU throttle
 *   SLOW_MODE=4 npx playwright test       # 4x CPU throttle
 */
export async function applyCpuThrottling(page: Page): Promise<void> {
  if (cpuThrottleRate > 0) {
    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottleRate });
  }
}
