// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `upgradeButtonState` (upgradeButtonState.ts): the Upgrade button commits what is
// staged, or with nothing staged advances a Unit whose preview offers nothing to stage.
// While a preview is loading, nothing is staged only because nothing is known yet, and
// a click would commit nothing, so the button waits.
//
// Takes no `page` fixture and starts no browser:
//   cd ui && npx playwright test -c playwright.pure.config.ts component-upgrade-button-state

import { expect, test } from '@playwright/test';

import { upgradeButtonState, type UpgradeButtonInputs } from '../src/pages/x/apps/upgradeButtonState';

const idle: UpgradeButtonInputs = {
  totalStaged: 0,
  totalStagedProtection: 0,
  totalUpgradableFields: 0,
  hasUpgradableUnits: false,
  isPreviewPending: false,
  isUpgrading: false,
  isChangeSetView: false,
};

test.describe('upgradeButtonState', () => {
  test('a Unit behind its upstream waits for its preview before the button enables', () => {
    expect(upgradeButtonState({ ...idle, hasUpgradableUnits: true, isPreviewPending: true }))
      .toEqual({ disabled: true, reason: 'preview-pending' });
  });

  test('once the preview offers nothing to stage, the button advances the revision', () => {
    expect(upgradeButtonState({ ...idle, hasUpgradableUnits: true }))
      .toEqual({ disabled: false, reason: 'revision-gap' });
  });

  test('a preview with changes not yet staged leaves the button disabled', () => {
    expect(upgradeButtonState({ ...idle, hasUpgradableUnits: true, totalUpgradableFields: 2 }))
      .toEqual({ disabled: true });
  });

  test('staged changes commit while another preview loads', () => {
    expect(upgradeButtonState({ ...idle, hasUpgradableUnits: true, isPreviewPending: true, totalStaged: 1 }))
      .toEqual({ disabled: false });
    expect(upgradeButtonState({ ...idle, hasUpgradableUnits: true, isPreviewPending: true, totalStagedProtection: 1 }))
      .toEqual({ disabled: false });
  });

  test('nothing behind and nothing staged leaves the button disabled', () => {
    expect(upgradeButtonState(idle)).toEqual({ disabled: true });
  });

  test('a commit in flight or a ChangeSet view disables the button', () => {
    expect(upgradeButtonState({ ...idle, totalStaged: 1, isUpgrading: true })).toEqual({ disabled: true });
    expect(upgradeButtonState({ ...idle, totalStaged: 1, isChangeSetView: true })).toEqual({ disabled: true });
  });
});
