// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// What a publish says about the Units it held back at the Revision before a ChangeSet their head
// is partway through.
import { expect, test } from '@playwright/test';

import { releaseOutcomeText } from '../src/pages/x/apps/releaseHeldBack';

test('a publish that held nothing back says only its outcome', () => {
  expect(releaseOutcomeText('Released rel-4', 'web-dev', undefined)).toBe('Released rel-4');
  expect(releaseOutcomeText('Released rel-4', 'web-dev', [])).toBe('Released rel-4');
});

test('one Unit held back is named with its Space and its ChangeSet', () => {
  expect(
    releaseOutcomeText('Released rel-4', 'web-dev', [
      { UnitSlug: 'backend', ChangeSetSlug: 'tls', RevisionNum: 2, HeadRevisionNum: 3 },
    ]),
  ).toBe('Released rel-4; held back web-dev/backend (ChangeSet tls)');
});

test('more Units held back are counted, with their ChangeSets', () => {
  expect(
    releaseOutcomeText('Released rel-4', 'web-dev', [
      { UnitSlug: 'backend', ChangeSetSlug: 'tls' },
      { UnitSlug: 'frontend', ChangeSetSlug: 'tls' },
    ]),
  ).toBe('Released rel-4; held back 2 Units (ChangeSet tls)');
  expect(
    releaseOutcomeText('Released rel-4', 'web-dev', [
      { UnitSlug: 'backend', ChangeSetSlug: 'tls' },
      { UnitSlug: 'frontend', ChangeSetSlug: 'theme' },
      { UnitSlug: 'worker', ChangeSetSlug: 'tls' },
    ]),
  ).toBe('Released rel-4; held back 3 Units (ChangeSets tls, theme)');
});

test('when nothing changed, the Units held back are why', () => {
  expect(
    releaseOutcomeText('No change: no Release was created', 'web-dev', [
      { UnitSlug: 'backend', ChangeSetSlug: 'tls' },
    ]),
  ).toBe('No change: no Release was created; held back web-dev/backend (ChangeSet tls)');
});
