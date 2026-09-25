// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The browser-free specs, run WITHOUT a server.
//
// Several rollout specs exercise pure derivation: they import product modules
// from `../src`, take no `page` fixture, and start no browser. They still could
// not run on their own, because `playwright.config.ts` names a `globalSetup`
// that logs in against a live server and throws when `TEST_USER` /
// `TEST_PASSWORD` are unset. That made a few milliseconds of pure assertion
// depend on a running deployment.
//
// This config is the same runner with no `globalSetup` and no `use` block, so
// the pure specs run anywhere:
//
//   cd ui && npx playwright test -c playwright.pure.config.ts
//
// `playwright.config.ts` still runs everything, these included, so a spec is
// never covered by only one of the two.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /*
   * A PATTERN, NOT A LIST. A named list silently omits the next browser-free
   * spec somebody writes: it still runs under the main config, so nothing fails
   * and nobody learns it stopped running here. Any spec whose derivation is pure
   * should be reachable without a server, so the suffix carries the contract.
   */
  testMatch: /\.pure\.spec\.ts$/,
  reporter: [['list']],
  workers: 1,
  retries: 0,
});
