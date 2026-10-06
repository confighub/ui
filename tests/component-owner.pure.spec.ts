// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Component owner rule (`componentOwner.ts`): the Component's own Owner
// label, else the Owner label all its Spaces share, else "". `cub` applies
// the same rule, so these rows are the contract for both.

import { expect, test } from '@playwright/test';

import {
  buildOwnerByComponentId,
  componentOwner,
  ownerSetCommand,
  ownerValueProblem,
  ownerWrite,
} from '../src/pages/x/apps/componentOwner';

const labeled = (owner?: string): { Labels: Record<string, string> } => ({
  Labels: owner === undefined ? {} : { Owner: owner },
});

interface Row {
  name: string;
  component?: string;
  spaces: (string | undefined)[];
  want: string;
}

const rows: Row[] = [
  { name: 'Component label set, no Spaces', component: 'team-a', spaces: [], want: 'team-a' },
  { name: 'Component label set, Spaces agree on it', component: 'team-a', spaces: ['team-a', 'team-a'], want: 'team-a' },
  { name: 'all Spaces agree', spaces: ['team-a', 'team-a', 'team-a'], want: 'team-a' },
  { name: 'one Space', spaces: ['team-a'], want: 'team-a' },
  { name: 'Spaces disagree', spaces: ['team-a', 'team-b'], want: '' },
  { name: 'one Space has no Owner label', spaces: ['team-a', undefined], want: '' },
  { name: 'first Space has no Owner label', spaces: [undefined, 'team-a'], want: '' },
  { name: 'no Spaces', spaces: [], want: '' },
  { name: 'Component label set and Spaces disagree', component: 'team-c', spaces: ['team-a', 'team-b'], want: 'team-c' },
  { name: 'Component label beats Spaces that agree on another', component: 'team-c', spaces: ['team-a', 'team-a'], want: 'team-c' },
  { name: 'empty Component label falls back to Spaces', component: '  ', spaces: ['team-a'], want: 'team-a' },
  { name: 'values are trimmed before they are compared', spaces: ['team-a', ' team-a '], want: 'team-a' },
];

test.describe('componentOwner', () => {
  for (const row of rows) {
    test(row.name, () => {
      expect(componentOwner(labeled(row.component), row.spaces.map(labeled))).toBe(row.want);
    });
  }

  test('a Component with no Labels and no Spaces has no owner', () => {
    expect(componentOwner(undefined, [])).toBe('');
    expect(componentOwner({ Labels: null }, [{ Labels: null }])).toBe('');
  });
});

test.describe('buildOwnerByComponentId', () => {
  test('reads each Component from its own Spaces, including a Component with none', () => {
    const componentById = new Map([
      ['c-labeled', labeled('team-z')],
      ['c-agree', labeled()],
      ['c-split', labeled()],
      ['c-empty', labeled()],
    ]);
    const spaces = [
      { ComponentID: 'c-labeled', ...labeled('team-a') },
      { ComponentID: 'c-agree', ...labeled('team-a') },
      { ComponentID: 'c-agree', ...labeled('team-a') },
      { ComponentID: 'c-split', ...labeled('team-a') },
      { ComponentID: 'c-split', ...labeled('team-b') },
      // A Space of another Component, or of none, changes nothing here.
      { ComponentID: 'c-unknown', ...labeled('team-q') },
      { ...labeled('team-q') },
    ];
    expect(Object.fromEntries(buildOwnerByComponentId(componentById, spaces))).toEqual({
      'c-labeled': 'team-z',
      'c-agree': 'team-a',
      'c-split': '',
      'c-empty': '',
    });
  });
});

test.describe('ownerWrite', () => {
  test('no requested owner writes nothing', () => {
    expect(ownerWrite(labeled(), [], '')).toEqual({ kind: 'none' });
    expect(ownerWrite(labeled('team-a'), [], '  ')).toEqual({ kind: 'none' });
  });

  test('an unset owner is set', () => {
    expect(ownerWrite(labeled(), [], 'team-a')).toEqual({ kind: 'set' });
    expect(ownerWrite(labeled(), [labeled('team-a'), labeled('team-b')], 'team-c')).toEqual({ kind: 'set' });
  });

  test('the same owner on the Component writes nothing', () => {
    expect(ownerWrite(labeled('team-a'), [labeled('team-b')], 'team-a')).toEqual({ kind: 'none' });
  });

  test('the same owner read from the Spaces is written to the Component', () => {
    expect(ownerWrite(labeled(), [labeled('team-a'), labeled('team-a')], 'team-a')).toEqual({ kind: 'set' });
  });

  test('another owner is a conflict that names the current owner', () => {
    expect(ownerWrite(labeled('team-a'), [], 'team-b')).toEqual({ kind: 'conflict', current: 'team-a' });
    expect(ownerWrite(labeled(), [labeled('team-a')], 'team-b')).toEqual({ kind: 'conflict', current: 'team-a' });
  });
});

test.describe('ownerValueProblem', () => {
  test('a value the server accepts as a label value has no problem', () => {
    for (const owner of ['', '  ', 'team-a', 'Team A', 'platform/core', 'team&ops', 'a', 'x'.repeat(128)]) {
      expect(ownerValueProblem(owner), owner).toBeNull();
    }
  });

  test('a value the server refuses has a problem, so the create writes nothing', () => {
    for (const owner of ['Team*', 'say "hi"', "o'brien", 'back\\slash', 'x'.repeat(129)]) {
      expect(ownerValueProblem(owner), owner).not.toBeNull();
    }
  });

  test('the value is trimmed first, as the create trims it', () => {
    expect(ownerValueProblem('  team-a  ')).toBeNull();
  });
});

test.describe('ownerSetCommand', () => {
  test('a plain owner stays bare', () => {
    expect(ownerSetCommand('checkout', 'team-a')).toBe('cub component update --patch checkout --label Owner=team-a');
  });

  test('an owner with a space is quoted as one argument', () => {
    expect(ownerSetCommand('checkout', 'Team A')).toBe("cub component update --patch checkout --label 'Owner=Team A'");
  });

  test('an owner with a shell character is quoted', () => {
    expect(ownerSetCommand('checkout', 'team&ops')).toBe("cub component update --patch checkout --label 'Owner=team&ops'");
  });
});
