// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * HOW THE CHANGE REACHES EACH SPACE, AS THE STATUS BOX STATES IT.
 *
 * A difference in how the change propagates is the one thing a reader must see
 * before promoting, so each kind is split out and named: a different value, a
 * value the Space keeps, a refusal, a resource the Space lacks, and a Space whose
 * change cannot be established, with its cause.
 *
 * ⚠️ AND A CHAINED STAGE IS QUIET. A dry run cannot preview a Space against an
 * upstream the same promotion has not written yet, which is every chained stage.
 * Raising the "can't tell" alarm there would fire on the commonest topology the
 * product has, so that cause is a note, never a problem. It is asserted hardest.
 *
 * Built on the real matrix and outcome, so what is asserted is what the page
 * computes.
 */
import { expect, test } from '@playwright/test';

import { buildChangeOrderOutcome } from '../src/pages/change-orders/changeOrderOutcome';
import {
  acknowledgementText,
  problemItems,
  problemSegments,
  problemSpaceIds,
  propagationHeadline,
  majorityReferenceSpaceId,
  outcomeByMajority,
  stagePropagation,
  type StagePropagationInput,
} from '../src/pages/change-orders/stage/stagePropagation';
import { segmentsText } from '../src/pages/change-orders/stage/stageCardCopy';
import type { PropagationProblem } from '../src/pages/change-orders/stage/stageTypes';
import { buildStageMatrix } from '../src/pages/x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup, ChangeOrderResourceConflict } from '../src/pages/x/apps/change-order/changeOrderTypes';

interface GroupSpec {
  space: string;
  name: string;
  /** path -> [from, to] */
  fields?: Record<string, [string, string]>;
  determinable?: boolean;
  conflicts?: ChangeOrderResourceConflict[];
  identity?: string;
  namespaced?: string;
}

function group(spec: GroupSpec): ChangeOrderChangeGroup {
  return {
    unitId: `${spec.space}/${spec.name}${spec.namespaced === undefined ? '' : `@${spec.namespaced}`}`,
    resourceName: spec.name,
    resourceIdentity: spec.identity ?? `apps/v1/Deployment/${spec.name}`,
    ...(spec.namespaced === undefined ? {} : { resourceIdentityNamespaced: spec.namespaced }),
    fieldDiffs: Object.entries(spec.fields ?? {}).map(([path, [oldValue, newValue]]) => ({ path, oldValue, newValue })),
    written: false,
    determinable: spec.determinable ?? true,
    ...(spec.conflicts === undefined ? {} : { conflicts: spec.conflicts }),
  };
}

function propagationOf(
  specs: GroupSpec[],
  spaceIds: string[],
  over: Partial<Pick<StagePropagationInput, 'unplannedReasonBySpaceId' | 'carriedResourceKeys'>> = {},
) {
  const groups = specs.map(group);
  const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
  const matrix = buildStageMatrix({
    groups,
    spaceIds,
    spaceIdByUnitId,
    spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])),
    stageId: 'prod',
  });
  const outcome = buildChangeOrderOutcome(matrix);
  return stagePropagation({
    outcome,
    matrix,
    groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])),
    spaceIdByUnitId,
    carriedResourceKeys: over.carriedResourceKeys ?? null,
    unplannedReasonBySpaceId: over.unplannedReasonBySpaceId ?? new Map(),
    stageName: 'prod',
  });
}

const tag = (to: string): Record<string, [string, string]> => ({ 'spec.image': ['1.0', to] });

test.describe('stagePropagation: the kinds', () => {
  test('every Space takes the same change: no problem', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.0') },
      ],
      ['a', 'b'],
    );
    expect(p.problems).toEqual([]);
    expect(p.quietNotes).toEqual([]);
  });

  test('differs: the path, both values, and the reference', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.1') },
      ],
      ['a', 'b'],
    );
    expect(p.problems).toEqual([
      { kind: 'differs', spaceId: 'b', unitId: 'b/api', resourceName: 'api', path: 'spec.image', label: 'spec.image', isImage: false, from: '1.0', to: '2.1', refFrom: '1.0', refTo: '2.0', refSpaceId: 'a' },
    ]);
    expect(p.marks.get('b')).toEqual({ kind: 'differs' });
    expect(p.marks.has('a')).toBe(false);
  });

  test('kept: a blocking conflict that is a value the Space keeps', () => {
    const kept: ChangeOrderResourceConflict = { reason: 'Subtracted', path: 'spec.replicas', targetValue: '5', sourceValue: '3', blocks: true };
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
        { space: 'b', name: 'api', fields: {}, conflicts: [kept] },
      ],
      ['a', 'b'],
    );
    expect(p.problems).toEqual([
      { kind: 'kept', spaceId: 'b', unitId: 'b/api', resourceName: 'api', path: 'spec.replicas', label: 'spec.replicas', value: '5', valueText: '5', incoming: '3', reason: 'Subtracted' },
    ]);
    expect(p.marks.get('b')).toEqual({ kind: 'keeps', value: '5' });
  });

  test('refused: any other blocking conflict', () => {
    const refusal: ChangeOrderResourceConflict = { reason: 'ReplayFailed', details: 'patch did not apply', blocks: true };
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: {}, conflicts: [refusal] },
      ],
      ['a', 'b'],
    );
    expect(p.problems[0]).toMatchObject({ kind: 'refused', spaceId: 'b', reason: 'ReplayFailed', details: 'patch did not apply' });
    expect(p.marks.get('b')).toEqual({ kind: 'refuses' });
  });

  test('a conflict that does not block is no refusal', () => {
    const benign: ChangeOrderResourceConflict = { reason: 'Overwritten', path: 'x', blocks: false };
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.0'), conflicts: [benign] },
      ],
      ['a', 'b'],
    );
    expect(p.problems).toEqual([]);
  });

  test('adds: a Space that lacks a resource the change carries', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'a', name: 'cache', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.0') },
      ],
      ['a', 'b'],
    );
    expect(p.problems).toEqual([{ kind: 'adds', spaceId: 'b', resourceName: 'cache' }]);
    expect(p.marks.get('b')).toEqual({ kind: 'adds' });
  });

  test('has it: a Space that already holds the value is a mark, never a problem', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: {} },
        { space: 'b', name: 'api', fields: {} },
      ],
      ['a', 'b'],
      { carriedResourceKeys: new Set(['apps/v1/Deployment/api']) },
    );
    expect(p.problems).toEqual([]);
    expect(p.marks.get('a')).toEqual({ kind: 'hasIt' });
    expect(p.marks.get('b')).toEqual({ kind: 'hasIt' });
  });
});

test.describe('stagePropagation: the odd Space out is the one named, wherever it is listed', () => {
  const three = (odd: string) =>
    propagationOf(
      ['a', 'b', 'c'].map((space) => ({ space, name: 'api', fields: tag(space === odd ? '2.1' : '2.0') })),
      ['a', 'b', 'c'],
    );

  for (const [where, odd] of [
    ['first', 'a'],
    ['in the middle', 'b'],
    ['last', 'c'],
  ] as const) {
    test(`odd Space ${where}`, () => {
      const p = three(odd);
      expect(problemSpaceIds(p.problems)).toEqual([odd]);
      expect(p.problems[0]).toMatchObject({ kind: 'differs', spaceId: odd, to: '2.1', refTo: '2.0' });
      expect(propagationHeadline(p.problems, 3)).toBe('1 Space takes a different change');
      expect(p.marks.get(odd)).toEqual({ kind: 'differs' });
      for (const other of ['a', 'b', 'c'].filter((id) => id !== odd)) expect(p.marks.has(other)).toBe(false);
      expect(p.referenceSpaceId).not.toBe(odd);
    });
  }

  test('a 2-2 tie goes to the set holding the Space listed first', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.1') },
        { space: 'b', name: 'api', fields: tag('2.0') },
        { space: 'c', name: 'api', fields: tag('2.0') },
        { space: 'd', name: 'api', fields: tag('2.1') },
      ],
      ['a', 'b', 'c', 'd'],
    );
    expect(p.referenceSpaceId).toBe('a');
    expect(problemSpaceIds(p.problems)).toEqual(['b', 'c']);
    expect(p.problems[0]).toMatchObject({ kind: 'differs', to: '2.0', refTo: '2.1', refSpaceId: 'a' });
  });

  test('a Space missing a resource the majority holds is named as lacking it', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'cache', fields: tag('2.0') },
        { space: 'c', name: 'api', fields: tag('2.0') },
        { space: 'c', name: 'cache', fields: tag('2.0') },
      ],
      ['a', 'b', 'c'],
    );
    expect(p.problems).toEqual([{ kind: 'adds', spaceId: 'a', resourceName: 'cache' }]);
  });

  test('outcomeByMajority regroups the diff card the same way', () => {
    const groups = ['a', 'b', 'c'].map((space) => group({ space, name: 'api', fields: tag(space === 'a' ? '2.1' : '2.0') }));
    const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
    const matrix = buildStageMatrix({ groups, spaceIds: ['a', 'b', 'c'], spaceIdByUnitId, spaceNameBySpaceId: new Map(), stageId: 'prod' });
    const outcome = buildChangeOrderOutcome(matrix);
    // The matrix measures against the first Space, so its partition names the two that agree.
    expect(outcome.groups.find((g) => g.kind === 'differs')?.spaceIds).toEqual(['b', 'c']);
    const p = stagePropagation({ outcome, matrix, groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])), spaceIdByUnitId, carriedResourceKeys: null, unplannedReasonBySpaceId: new Map(), stageName: 'prod' });
    const fixed = outcomeByMajority(outcome, p);
    expect(fixed.groups.map((g) => [g.kind, g.spaceIds, g.representativeSpaceId])).toEqual([
      ['differs', ['a'], 'a'],
      ['same', ['b', 'c'], 'b'],
    ]);
    expect(fixed.variantCount).toBe(3);
  });

  test('majorityReferenceSpaceId on its own', () => {
    const sig = (map: Record<string, string>) => (id: string) => map[id];
    expect(majorityReferenceSpaceId(['a'], sig({ a: 'x' }))).toBeNull();
    expect(majorityReferenceSpaceId(['a', 'b', 'c'], sig({ a: 'x', b: 'y', c: 'y' }))).toBe('b');
    expect(majorityReferenceSpaceId(['a', 'b'], sig({ a: 'x', b: 'y' }))).toBe('a');
  });
});

test.describe('stagePropagation: the box names fields as the change lines do', () => {
  const IMAGE = 'spec.template.spec.containers.0.image';

  test('an image difference is labelled "image tag" and shows image tags, the full path as the title', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: { [IMAGE]: ['ghcr.io/acme/api:v0.2.19', 'ghcr.io/acme/api:v0.2.20'] } },
        { space: 'b', name: 'api', fields: { [IMAGE]: ['ghcr.io/acme/api:v0.2.19', 'ghcr.io/acme/api:v0.2.20'] } },
        { space: 'c', name: 'api', fields: { [IMAGE]: ['ghcr.io/acme/api:v0.2.19', 'ghcr.io/acme/api:v0.3.0'] } },
      ],
      ['a', 'b', 'c'],
    );
    expect(p.problems[0]).toMatchObject({ kind: 'differs', spaceId: 'c', path: IMAGE, label: 'image tag', isImage: true });
    const parts = problemSegments(p.problems[0], (spaceId) => ({ spaceId, name: spaceId }), (id) => id);
    expect(segmentsText(parts)).toBe('c: image tag goes v0.2.19 → v0.3.0 here, not v0.2.19 → v0.2.20.');
    expect(parts.find((x) => x.kind === 'link' && x.ref.to === 'field')).toMatchObject({ text: 'image tag', title: IMAGE });
  });

  test('a kept image shows its image tag in the item and the chip, the full reference as the chip title', () => {
    const kept: ChangeOrderResourceConflict = {
      reason: 'ProtectedPath',
      path: 'spec.template.spec.containers.?name=api.image',
      targetValue: 'ghcr.io/acme/api:v0.1.9',
      sourceValue: 'ghcr.io/acme/api:v0.2.20',
      blocks: true,
    };
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: { [IMAGE]: ['ghcr.io/acme/api:v0.2.19', 'ghcr.io/acme/api:v0.2.20'] } },
        { space: 'b', name: 'api', fields: { [IMAGE]: ['ghcr.io/acme/api:v0.2.19', 'ghcr.io/acme/api:v0.2.20'] } },
        { space: 'c', name: 'api', fields: {}, conflicts: [kept] },
      ],
      ['a', 'b', 'c'],
    );
    expect(p.problems[0]).toMatchObject({ kind: 'kept', label: 'image tag', value: 'ghcr.io/acme/api:v0.1.9', valueText: 'v0.1.9' });
    expect(p.marks.get('c')).toEqual({ kind: 'keeps', value: 'v0.1.9', title: 'ghcr.io/acme/api:v0.1.9' });
    const parts = problemSegments(p.problems[0], (spaceId) => ({ spaceId, name: spaceId }), (id) => id);
    expect(segmentsText(parts)).toBe('c: a protected field in c/api keeps image tag at v0.1.9. The other changes still apply.');
    expect(acknowledgementText(p.problems, (id) => id)).toBe('c should keep image tag: v0.1.9.');
  });

  test('a plain value keeps its text and needs no title', () => {
    const kept: ChangeOrderResourceConflict = { reason: 'Subtracted', path: 'spec.replicas', targetValue: '5', blocks: true };
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
        { space: 'b', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
        { space: 'c', name: 'api', fields: {}, conflicts: [kept] },
      ],
      ['a', 'b', 'c'],
    );
    expect(p.marks.get('c')).toEqual({ kind: 'keeps', value: '5' });
  });
});

test.describe('stagePropagation: a stage the change has not reached', () => {
  test('no Space is told it "has it"', () => {
    const specs = [
      { space: 'a', name: 'api', fields: {} },
      { space: 'b', name: 'api', fields: {} },
    ];
    const carried = { carriedResourceKeys: new Set(['apps/v1/Deployment/api']) };
    expect(propagationOf(specs, ['a', 'b'], carried).marks.get('a')).toEqual({ kind: 'hasIt' });
    const groups = specs.map(group);
    const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
    const matrix = buildStageMatrix({ groups, spaceIds: ['a', 'b'], spaceIdByUnitId, spaceNameBySpaceId: new Map(), stageId: 'prod' });
    const p = stagePropagation({
      outcome: buildChangeOrderOutcome(matrix, carried.carriedResourceKeys),
      matrix,
      groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])),
      spaceIdByUnitId,
      carriedResourceKeys: carried.carriedResourceKeys,
      unplannedReasonBySpaceId: new Map(),
      stageName: 'prod',
      previousLanded: false,
    });
    expect(p.marks.size).toBe(0);
    expect(p.problems).toEqual([]);
  });

  test('a partition that misses a Space carries the defect note', () => {
    const groups = [group({ space: 'a', name: 'api', fields: tag('2.0') })];
    const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, 'a']));
    const matrix = buildStageMatrix({ groups, spaceIds: ['a'], spaceIdByUnitId, spaceNameBySpaceId: new Map(), stageId: 'prod' });
    const outcome = { ...buildChangeOrderOutcome(matrix), variantCount: 2 };
    const p = stagePropagation({ outcome, matrix, groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])), spaceIdByUnitId, carriedResourceKeys: null, unplannedReasonBySpaceId: new Map(), stageName: 'prod' });
    expect(p.shortfallNote).toContain('1 unaccounted');
    expect(propagationOf([{ space: 'a', name: 'api', fields: tag('2.0') }], ['a']).shortfallNote).toBeUndefined();
  });
});

test.describe('stagePropagation: what cannot be established, by cause', () => {
  test('⚠️ chained (previewed against an earlier variant) is a quiet note, never a problem', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', determinable: false },
      ],
      ['a', 'b'],
      { unplannedReasonBySpaceId: new Map([['b', 'UpstreamPromotedFirst']]) },
    );
    expect(p.problems).toEqual([]);
    expect(p.marks.has('b')).toBe(false);
    expect(p.chainedSpaceIds).toEqual(['b']);
    expect(p.quietNotes).toEqual([
      'Previewed 1 of 2. The other takes from a variant earlier in this promotion, so what it receives cannot be shown until that one is promoted.',
    ]);
  });

  test('a Space with no resources yet is loud, as noResources', () => {
    const p = propagationOf([{ space: 'a', name: 'api', fields: tag('2.0') }], ['a', 'b']);
    expect(p.problems).toEqual([{ kind: 'unknown', spaceIds: ['b'], cause: 'noResources' }]);
    expect(p.marks.get('b')).toEqual({ kind: 'unknown' });
    expect(p.quietNotes).toContain('Some Spaces in prod hold no resources yet, so more may change than shown.');
  });

  test('a dry run that did not plan a Space for another reason is unplanned', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', determinable: false },
        { space: 'c', name: 'api', determinable: false },
      ],
      ['a', 'b', 'c'],
      { unplannedReasonBySpaceId: new Map([['b', 'UpstreamFailed'], ['c', 'Failed']]) },
    );
    expect(p.problems).toEqual([{ kind: 'unknown', spaceIds: ['b', 'c'], cause: 'unplanned' }]);
  });

  test('a resource held under two namespaces is mergeDeclined', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.0'), namespaced: 'apps/v1/Deployment/ns1/api' },
        { space: 'b', name: 'api', fields: tag('2.0'), namespaced: 'apps/v1/Deployment/ns2/api' },
      ],
      ['a', 'b'],
    );
    const unknown = p.problems.find((x) => x.kind === 'unknown');
    expect(unknown).toMatchObject({ kind: 'unknown', spaceIds: ['b'], cause: 'mergeDeclined', resourceName: 'api' });
  });
});

test.describe('stagePropagation: reading the problems', () => {
  const problems: PropagationProblem[] = [
    { kind: 'adds', spaceId: 'c', resourceName: 'cache' },
    { kind: 'differs', spaceId: 'b', unitId: 'b/api', resourceName: 'api', path: 'spec.image', label: 'spec.image', isImage: false, from: '1', to: '3', refFrom: '1', refTo: '2', refSpaceId: 'a' },
    { kind: 'unknown', spaceIds: ['d'], cause: 'unreadable' },
  ];

  test('worst first, whatever order they were found in', () => {
    const p = propagationOf(
      [
        { space: 'a', name: 'api', fields: tag('2.0') },
        { space: 'a', name: 'cache', fields: tag('2.0') },
        { space: 'b', name: 'api', fields: tag('2.1') },
        { space: 'b', name: 'cache', fields: tag('2.0') },
        { space: 'c', name: 'api', fields: tag('2.0') },
      ],
      ['a', 'b', 'c', 'd'],
    );
    expect(p.problems.map((x) => x.kind)).toEqual(['unknown', 'differs', 'adds']);
  });

  test('one kind names itself; several are "take the change differently"', () => {
    expect(propagationHeadline([problems[1]], 4)).toBe('1 Space takes a different change');
    expect(propagationHeadline([problems[2]], 4)).toBe("Can't tell what changes in 1 of 4 Spaces");
    expect(propagationHeadline(problems, 4)).toBe('3 Spaces take the change differently');
    expect(problemSpaceIds(problems)).toEqual(['c', 'b', 'd']);
  });

  test('the box lists at most five, and counts the rest', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ kind: 'adds' as const, spaceId: `s${i}`, resourceName: 'x' }));
    const { shown, more } = problemItems(many);
    expect(shown).toHaveLength(5);
    expect(more).toBe(2);
  });

  test('the acknowledgement is specific for one problem and general for several', () => {
    const nameOf = (id: string) => `space-${id}`;
    expect(acknowledgementText([problems[1]], nameOf)).toBe('space-b should get spec.image 1 → 3.');
    expect(acknowledgementText([problems[2]], nameOf)).toBe('Promote without knowing what changes in 1 Space.');
    expect(acknowledgementText(problems, nameOf)).toBe('I checked the differences above.');
  });

  test('after an action the written groups still state the difference', () => {
    const written = (spec: GroupSpec) => ({ ...group(spec), written: true });
    const groups = [written({ space: 'a', name: 'api', fields: tag('2.0') }), written({ space: 'b', name: 'api', fields: tag('2.1') })];
    const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
    const matrix = buildStageMatrix({ groups, spaceIds: ['a', 'b'], spaceIdByUnitId, spaceNameBySpaceId: new Map(), stageId: 'prod' });
    const p = stagePropagation({
      outcome: buildChangeOrderOutcome(matrix),
      matrix,
      groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])),
      spaceIdByUnitId,
      carriedResourceKeys: null,
      unplannedReasonBySpaceId: new Map(),
      stageName: 'prod',
    });
    expect(p.problems.map((x) => x.kind)).toEqual(['differs']);
  });
});
