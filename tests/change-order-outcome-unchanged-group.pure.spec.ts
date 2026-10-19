// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The outcome card's own unchanged group, on the ChangeOrder detail page: the same
// split `partitionSourceUnitsByChange` gives "At the source", applied instead
// to ONE card's representative Space, plus the name a card's rows give that
// Space (`changeOrderCard.ts`).
//
// WHY THIS IS A PLAYWRIGHT SPEC AND NOT A UNIT-TEST FILE. The UI has no unit-test
// runner (no Jest), so `*.test.ts` files expecting one would never run.
// `change-order-source-unchanged-group.pure.spec.ts`,
// `change-order-stage-matrix.pure.spec.ts` and `change-order-outcome.pure.spec.ts` already
// take this shape: the Playwright runner, no `page` fixture, no browser.
//
// WHY THE PAGE ITSELF IS NOT DRIVEN HERE. `ChangeOrdersPage.tsx` cannot be
// imported by this runner at all — MUI's directory imports do not resolve as ES
// modules — so everything a card decides for itself lives in a pure function
// and is checked here, and the file keeps only the markup.

import { expect, test } from '@playwright/test';

import {
  cardRepresentativeSpaceId,
  cardRepresentativeUnits,
  cardSpaceLabel,
  keptValueOf,
} from '../src/pages/change-orders/changeOrderCard';
import { partitionSourceUnitsByChange } from '../src/pages/change-orders/useChangeOrderConsoleChanges';
import type { ChangeOrderChangeGroup } from '../src/pages/x/apps/change-order/changeOrderTypes';

/** Just enough of a stage unit for the card: the Space it belongs to, and its id. */
interface StageUnitStub {
  unitId: string;
  spaceId: string;
}

/**
 * The card's own two steps, run on a fixture: the REAL filter the page's memo
 * calls, then the split downstream of it.
 *
 * ⚠️ NEITHER STEP IS RESTATED HERE. A copy of the filter would pass this file
 * happily while the page drifted underneath it, which is the one failure a test
 * of this logic exists to catch. Only the fixture shapes — the skipped map the
 * ChangeOrder carries, and the diffs per unit — are built locally.
 *
 * ⚠️ THE SKIPPED FILTER GOVERNS FIRST and the split runs downstream of it. A
 * skipped unit belongs to "Passed over"; a unit with an empty diff is in scope
 * and already holds the value. Collapsing the two hid a fully-landed ChangeOrder's
 * own units once already.
 */
function cardUnits(
  units: StageUnitStub[],
  representativeSpaceId: string,
  skippedUnitIds: string[],
  changedPathsByUnitId: Record<string, string[]>,
  undeterminableUnitIds: string[] = [],
) {
  const groups = new Map<string, Pick<ChangeOrderChangeGroup, 'fieldDiffs' | 'determinable'>>();
  for (const [unitId, paths] of Object.entries(changedPathsByUnitId)) {
    groups.set(unitId, {
      fieldDiffs: paths.map((path) => ({ path, oldValue: 'before', newValue: 'after' })),
      determinable: true,
    });
  }
  // `buildChangeOrderChangeGroups` empties `fieldDiffs` for an undeterminable
  // resource, which is the whole reason emptiness cannot stand in for
  // "unchanged" — so the fixture reproduces that shape exactly.
  for (const unitId of undeterminableUnitIds) {
    groups.set(unitId, { fieldDiffs: [], determinable: false });
  }
  // The ChangeOrder carries the passed-over units as a map of unit id → reason;
  // only membership is read, so any reason stands in for the real one.
  const skippedUnits = Object.fromEntries(skippedUnitIds.map((unitId) => [unitId, 'not in scope']));
  const repUnits = cardRepresentativeUnits<StageUnitStub>(
    units,
    representativeSpaceId,
    skippedUnits,
  );
  return partitionSourceUnitsByChange<StageUnitStub>(repUnits, groups);
}

/** Unit ids in the order the card renders them: changed rows, then the group's contents. */
function renderOrder(result: ReturnType<typeof cardUnits>): string[] {
  return [...result.changedUnits, ...result.unchangedUnits].map((u) => u.unitId);
}

const STAGE_UNITS: StageUnitStub[] = [
  { unitId: 'rep-quiet-a', spaceId: 'space-rep' },
  { unitId: 'rep-moves', spaceId: 'space-rep' },
  { unitId: 'other-moves', spaceId: 'space-other' },
  { unitId: 'rep-quiet-b', spaceId: 'space-rep' },
  { unitId: 'rep-passed-over', spaceId: 'space-rep' },
];

test.describe('an outcome card\'s unchanged group', () => {
  test('lists only the representative Space, minus the units passed over', () => {
    const result = cardUnits(STAGE_UNITS, 'space-rep', ['rep-passed-over'], {
      'rep-moves': ['/spec/image'],
      'other-moves': ['/spec/image'],
      'rep-quiet-a': [],
      'rep-quiet-b': [],
      'rep-passed-over': ['/spec/replicas'],
    });

    // Another Space's unit is another card's business; the passed-over one is
    // "Passed over"'s. Neither may appear in either half here.
    expect(renderOrder(result)).toEqual(['rep-moves', 'rep-quiet-a', 'rep-quiet-b']);
  });

  test('sinks the unchanged units below the changed ones, in their incoming order', () => {
    const result = cardUnits(STAGE_UNITS, 'space-rep', [], {
      'rep-moves': ['/spec/image'],
      'rep-passed-over': ['/spec/replicas'],
      'rep-quiet-a': [],
      'rep-quiet-b': [],
    });

    // `rep-quiet-a` arrives FIRST in the stage list and still renders last:
    // only the split may move a unit, and nothing re-sorts either half.
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['rep-moves', 'rep-passed-over']);
    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['rep-quiet-a', 'rep-quiet-b']);
  });

  test('a card the change does not move has nothing to render', () => {
    // Every member already holds the value. The card lists what the promote
    // does, so a card it does nothing to lists nothing -- and nothing is
    // blocked either, which is what keeps that honest.
    const result = cardUnits(STAGE_UNITS, 'space-rep', ['rep-passed-over'], {});

    expect(result.changedUnits).toHaveLength(0);
    expect(result.blockedUnits).toHaveLength(0);
    expect(result.unchangedUnits).toHaveLength(3);
  });

  test('has no group to render when every unit on the card changed', () => {
    // `unchangedUnits` empty is the card's own guard for rendering no
    // disclosure at all: it never appears with a count of zero.
    const result = cardUnits(STAGE_UNITS, 'space-rep', ['rep-passed-over'], {
      'rep-moves': ['/spec/image'],
      'rep-quiet-a': ['/spec/replicas'],
      'rep-quiet-b': ['/metadata/labels/team'],
    });

    expect(result.unchangedUnits).toEqual([]);
  });

  test('keeps an undeterminable resource out of the unchanged group', () => {
    // `unknown` has no bar segment and no card of its own precisely because it
    // is not a comparison result. Sinking one into this card's collapsed group
    // would hide it just as thoroughly, under a label that claims the opposite.
    const result = cardUnits(
      STAGE_UNITS,
      'space-rep',
      ['rep-passed-over'],
      { 'rep-moves': ['/spec/image'], 'rep-quiet-a': [] },
      ['rep-quiet-b'],
    );

    expect(result.unchangedUnits.map((u) => u.unitId)).toEqual(['rep-quiet-a']);
    expect(result.changedUnits.map((u) => u.unitId)).toEqual(['rep-moves', 'rep-quiet-b']);
  });

  test('does not treat a card as all-unchanged when its rest is undeterminable', () => {
    // Every unit on this card is either moving or unreadable: there is nothing
    // to put behind the disclosure, so it must not open onto an empty list.
    const result = cardUnits(
      STAGE_UNITS,
      'space-rep',
      ['rep-passed-over'],
      { 'rep-moves': ['/spec/image'] },
      ['rep-quiet-a', 'rep-quiet-b'],
    );

    expect(result.unchangedUnits).toEqual([]);
    expect(result.blockedUnits).toEqual([]);
  });
});

test.describe('the name a card\'s rows give its Space', () => {
  const SPACES = [
    { spaceId: 'space-rep', labels: { Variant: 'prod' } },
    { spaceId: 'space-unlabelled', labels: { Owner: 'platform' } },
  ];
  const DISPLAY_NAMES = new Map([
    ['space-rep', 'base-rds-checkout'],
    ['space-unlabelled', 'staging-rds-checkout'],
  ]);

  test('prefers the Variant label, which is what the Space is called in its Component', () => {
    // The slug the fallback would give is `base-rds-checkout`: accurate,
    // and no help at all in telling this card's Space from the next one's.
    expect(cardSpaceLabel('space-rep', SPACES, DISPLAY_NAMES)).toBe('prod');
  });

  test('falls back to the display name when the Space carries no Variant label', () => {
    // The label is optional, so an unlabelled Space still has to name itself —
    // an empty chip names nothing.
    expect(cardSpaceLabel('space-unlabelled', SPACES, DISPLAY_NAMES)).toBe(
      'staging-rds-checkout',
    );
  });
});

test.describe('the variant a card shows', () => {
  const GROUP = { spaceIds: ['space-a', 'space-b', 'space-c'], representativeSpaceId: 'space-b' };

  test('is the group\'s own representative when the caller chose none', () => {
    expect(cardRepresentativeSpaceId(GROUP, undefined)).toBe('space-b');
  });

  test('is the caller\'s choice when it is a member of the group', () => {
    expect(cardRepresentativeSpaceId(GROUP, 'space-c')).toBe('space-c');
  });

  test('ignores a choice outside the group, which the card does not stand for', () => {
    expect(cardRepresentativeSpaceId(GROUP, 'space-elsewhere')).toBe('space-b');
  });
});

test.describe('a refusal that is a kept value', () => {
  const base = {
    resourceName: 'payments/payments-api',
    path: 'spec.template.spec.containers.?name=api;@0.resources.limits.memory',
    targetValue: '1Gi',
    sourceValue: '768Mi',
    blocks: true,
  };

  test('a protected path is a row: kept on merge, with the value kept and the value refused', () => {
    expect(keptValueOf({ ...base, reason: 'ProtectedPath', targetProtected: true })).toMatchObject({
      resourceName: 'payments/payments-api',
      path: base.path,
      value: '1Gi',
      incoming: '768Mi',
      label: 'kept on merge',
    });
  });

  test('a subtracted mutation is a row: a local override', () => {
    expect(keptValueOf({ ...base, reason: 'Subtracted', sourceValue: '' })).toMatchObject({ label: 'local override', incoming: undefined });
  });

  test('any other refusal, or one with no path or value, stays a sentence', () => {
    expect(keptValueOf({ ...base, reason: 'UnresolvedPath' })).toBeUndefined();
    expect(keptValueOf({ ...base, reason: 'ProtectedPath', path: '' })).toBeUndefined();
    expect(keptValueOf({ ...base, reason: 'ProtectedPath', targetValue: undefined })).toBeUndefined();
  });
});
