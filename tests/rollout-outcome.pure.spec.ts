// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `buildRolloutOutcome` (rolloutOutcome.ts) — the rollout detail page's outcome
// bar and group-card partition — exercised directly, same pure-derivation
// pattern as `rollout-stage-matrix.spec.ts` and `rollout-completion.spec.ts`:
// no page, no browser, built on the same `buildStageMatrix` those cell-state
// rules are already proven against.
//
// UNCOVERED UNTIL NOW. `buildStageMatrix`'s own cell states (`same`/`differs`/
// `new`/`unknown`) are thoroughly tested, but nothing had exercised the layer
// built on top of them — grouping those per-variant states into the four
// outcome kinds a reader actually sees on the page. That gap sat one file away
// from a real regression: `RolloutsPage.tsx` briefly filtered a group's
// representative units by "has empty `fieldDiffs`", which emptied the `same`
// group's own card for a stage where every variant legitimately already held
// the value being promoted. This file exists so a variant that DID take a
// different change — the case this spec is named for — is proven to land in
// `differs`, not silently folded into `same` or dropped from the partition.

import { expect, test } from '@playwright/test';

import { buildStageMatrix } from '../src/pages/x/apps/rollout/rolloutMatrix';
import type { BuildStageMatrixInput } from '../src/pages/x/apps/rollout/rolloutMatrix';
import type { RolloutChangeGroup } from '../src/pages/x/apps/rollout/rolloutTypes';
import { buildRolloutOutcome, partitionShortfall } from '../src/pages/rollouts/rolloutOutcome';

// Same builder shape as `rollout-stage-matrix.spec.ts`: unit ids are
// `<space>/<resource>` so a failure names the offending group without a
// lookup table.

interface GroupSpec {
  space: string;
  name: string;
  fields?: Record<string, string>;
  determinable?: boolean;
}

function group(spec: GroupSpec): RolloutChangeGroup {
  const fields = spec.fields ?? {};
  return {
    unitId: `${spec.space}/${spec.name}`,
    resourceName: spec.name,
    fieldDiffs: Object.entries(fields).map(([path, newValue]) => ({
      path,
      oldValue: 'before',
      newValue,
    })),
    written: false,
    determinable: spec.determinable ?? true,
  };
}

function outcomeOf(
  specs: GroupSpec[],
  spaceIds: string[],
  overrides: Partial<BuildStageMatrixInput> = {},
) {
  const groups = specs.map(group);
  const matrix = buildStageMatrix({
    groups,
    spaceIds,
    spaceIdByUnitId: new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]])),
    spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])),
    stageId: 'staging',
    ...overrides,
  });
  return buildRolloutOutcome(matrix);
}

/** Which group a Space landed in, or `undefined` if the partition dropped it. */
function groupKindFor(outcome: ReturnType<typeof outcomeOf>, spaceId: string): string | undefined {
  return outcome.groups.find((g) => g.spaceIds.includes(spaceId))?.kind;
}

test.describe('buildRolloutOutcome — a variant that took a different change', () => {
  test('lands in `differs`, separately from the variants that match', () => {
    const outcome = outcomeOf(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
        { space: 'c', name: 'app', fields: { '/image': 'v2-hotfix' } },
      ],
      ['a', 'b', 'c'],
    );

    expect(groupKindFor(outcome, 'a')).toBe('same');
    expect(groupKindFor(outcome, 'b')).toBe('same');
    expect(groupKindFor(outcome, 'c')).toBe('differs');

    const differs = outcome.groups.find((g) => g.kind === 'differs');
    expect(differs?.spaceIds).toEqual(['c']);
    // The card renders THIS variant's own tree — the one that actually
    // diverged, not a same-group member mistaken for it.
    expect(differs?.representativeSpaceId).toBe('c');

    // The partition accounts for every variant exactly once: this is the
    // number the promote decision sits directly beneath.
    expect(partitionShortfall(outcome)).toBe(0);
    expect(outcome.variantCount).toBe(3);
  });

  test('two variants that each took their OWN different change are two separate `differs` members, not merged', () => {
    // `differs` is one group by kind, but `kindForSpace` never claims two
    // divergent variants took the SAME different change — the group's
    // `representativeSpaceId` renders only one tree, so both must still be
    // counted as members even though only one is shown.
    const outcome = outcomeOf(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2-hotfix' } },
        { space: 'c', name: 'app', fields: { '/image': 'v2-canary' } },
      ],
      ['a', 'b', 'c'],
    );

    const differs = outcome.groups.find((g) => g.kind === 'differs');
    expect(differs?.spaceIds.sort()).toEqual(['b', 'c']);
    expect(partitionShortfall(outcome)).toBe(0);
  });

  test('a variant undeterminable AND divergent is reported `unknown`, never `differs`', () => {
    // `kindForSpace`'s own stated precedence: an unresolved comparison must
    // not be reported as a comparison that resolved to "different" — that
    // would assert a divergence claim the data cannot back up.
    const outcome = outcomeOf(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: {}, determinable: false },
        { space: 'c', name: 'app', fields: { '/image': 'v2-hotfix' } },
      ],
      ['a', 'b', 'c'],
    );

    expect(groupKindFor(outcome, 'b')).toBe('unknown');
    expect(groupKindFor(outcome, 'c')).toBe('differs');
    expect(partitionShortfall(outcome)).toBe(0);
  });

  test('every variant taking the identical change reports no `differs` group at all', () => {
    // The control: without a genuine divergence anywhere, `differs` must not
    // appear in the partition — an empty group masking as "no divergence"
    // would be indistinguishable from this from the bar's width alone.
    const outcome = outcomeOf(
      [
        { space: 'a', name: 'app', fields: { '/image': 'v2' } },
        { space: 'b', name: 'app', fields: { '/image': 'v2' } },
      ],
      ['a', 'b'],
    );

    expect(outcome.groups.map((g) => g.kind)).toEqual(['same']);
    expect(outcome.groups.some((g) => g.kind === 'differs')).toBe(false);
  });
});
