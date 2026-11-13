// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeSet a function run from the Validation page is made in: which of the Trigger's
// ChangeSets is open, what a new one is named, which Space it goes in, and what a run says when
// it refuses Units in another ChangeSet. No page and no server.

import { expect, test } from '@playwright/test';

import type { ChangeSetRead } from '@confighub/rtk-query';

import {
  heldUnitsRefusal,
  nextTriggerChangeSetSlug,
  splitAcrossTriggerChangeSetsRefusal,
  openTriggerChangeSet,
  triggerChangeSetSpace,
  triggerSlugOf,
} from '../src/components/invoker/utils/triggerChangeSet';

const changeSet = (slug: string, state: string, createdAt: string) =>
  ({ ChangeSetID: slug, Slug: slug, State: state, CreatedAt: createdAt }) as ChangeSetRead;

test('the Trigger\'s open ChangeSet is the newest one not closed', () => {
  expect(
    openTriggerChangeSet([
      changeSet('rule', 'Closed', '2026-11-01T00:00:00Z'),
      changeSet('rule-2', 'Open', '2026-11-02T00:00:00Z'),
      changeSet('rule-3', 'New', '2026-11-03T00:00:00Z'),
    ])?.Slug,
  ).toBe('rule-3');
  expect(openTriggerChangeSet([changeSet('rule', 'Closed', '2026-11-01T00:00:00Z')])).toBeUndefined();
});

test('the first ChangeSet is named after the Trigger, and later ones are numbered', () => {
  expect(triggerSlugOf('platform/no-root')).toBe('no-root');
  expect(nextTriggerChangeSetSlug('no-root', 0, new Set())).toBe('no-root');
  expect(nextTriggerChangeSetSlug('no-root', 1, new Set(['no-root']))).toBe('no-root-2');
  expect(nextTriggerChangeSetSlug('no-root', 2, new Set(['no-root', 'no-root-2']))).toBe('no-root-3');
});

test('a slug some other ChangeSet has is passed over', () => {
  expect(nextTriggerChangeSetSlug('no-root', 0, new Set(['no-root']))).toBe('no-root-2');
  expect(nextTriggerChangeSetSlug('no-root', 1, new Set(['no-root', 'no-root-2']))).toBe('no-root-3');
});

test('a numbered slug is cut short to fit the server\'s limit', () => {
  const long = 'x'.repeat(128);
  const slug = nextTriggerChangeSetSlug(long, 1, new Set([long]));
  expect(slug).toHaveLength(128);
  expect(slug.endsWith('-2')).toBe(true);
});

const space = (spaceId: string, componentId?: string, upstreamSpaceId?: string) => ({ spaceId, slug: spaceId, componentId, upstreamSpaceId });

test('the ChangeSet goes in the Units\' one Space', () => {
  expect(triggerChangeSetSpace([space('dev')])).toEqual({ spaceId: 'dev' });
});

test('Units across one Component\'s Spaces put it in the Component\'s root Space', () => {
  const component = [space('base', 'app'), space('dev', 'app', 'base'), space('prod', 'app', 'dev')];
  expect(triggerChangeSetSpace([space('dev', 'app', 'base'), space('prod', 'app', 'dev')], component)).toEqual({ spaceId: 'base' });
});

test('otherwise the person chooses among the Units\' Spaces', () => {
  // Two Components
  expect(triggerChangeSetSpace([space('web-dev', 'web'), space('api-dev', 'api')], [])).toEqual({
    ask: [space('api-dev', 'api'), space('web-dev', 'web')],
  });
  // One Component with two roots
  const twoRoots = [space('a', 'app'), space('b', 'app')];
  expect('ask' in triggerChangeSetSpace(twoRoots, twoRoots)).toBe(true);
  // No Component
  expect('ask' in triggerChangeSetSpace([space('x'), space('y')])).toBe(true);
});

test('a run refusing Units says which ChangeSets hold them', () => {
  expect(heldUnitsRefusal([{ unitSlug: 'web', changeSetName: 'dev/rollout' }])).toBe(
    "Nothing was run: a Unit is in a ChangeSet other than this Trigger's (web is in dev/rollout). Close that ChangeSet, or take the Unit out of it, and run again.",
  );
});

test('a run refusing Units in two of the Trigger\'s own ChangeSets names them as the Trigger\'s', () => {
  expect(splitAcrossTriggerChangeSetsRefusal(['dev/rule', 'prod/rule'])).toBe(
    "Nothing was run: the Units are in 2 of this Trigger's open ChangeSets (dev/rule, prod/rule), and a run is made in one. Run on the Units of each ChangeSet separately.",
  );
});
