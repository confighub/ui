// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * WHAT THE CHANGE CARD'S OUTCOME BOXES DRAW, GROUP BY GROUP.
 *
 * One tree per outcome group, drawn from its representative Space. A Unit in
 * another group that takes exactly the Same group's change is said in one line
 * pointing at that tree, so the trees on screen are the ones that differ. A Unit
 * the change tried to alter and could not stays drawn, apart. A Unit the change
 * leaves alone is not listed, and a Unit the ChangeOrder passed over never is.
 *
 * ⚠️ AND NOTHING IS LOST QUIETLY. `unknown` keeps a box of its own and is
 * never folded into `same`; partial counts, omitted and undecided resources are
 * said on the card above the boxes, with the propagation.
 *
 * Built on the real matrix and outcome, so what is asserted is what the page
 * computes.
 */
import { expect, test } from '@playwright/test';

import { buildChangeOrderOutcome, type ChangeOrderOutcome } from '../src/pages/change-orders/changeOrderOutcome';
import {
  diffGroupId,
  resolveDiffTarget,
  stageDiffSections,
  type StageDiffSectionsInput,
  type StageDiffUnitRef,
} from '../src/pages/change-orders/stage/stageDiffSections';
import { buildStageMatrix } from '../src/pages/x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup, ChangeOrderResourceConflict } from '../src/pages/x/apps/change-order/changeOrderTypes';

interface GroupSpec {
  space: string;
  name: string;
  /** path -> [from, to] */
  fields?: Record<string, [string, string]>;
  determinable?: boolean;
  conflicts?: ChangeOrderResourceConflict[];
  /** Unchanged paths returned as context in the server's diff. */
  context?: boolean;
}

function group(spec: GroupSpec): ChangeOrderChangeGroup {
  const fieldDiffs = Object.entries(spec.fields ?? {}).map(([path, [oldValue, newValue]]) => ({ path, oldValue, newValue }));
  return {
    unitId: `${spec.space}/${spec.name}`,
    resourceName: spec.name,
    resourceIdentity: `apps/v1/Deployment/${spec.name}`,
    fieldDiffs,
    written: false,
    determinable: spec.determinable ?? true,
    ...(spec.conflicts === undefined ? {} : { conflicts: spec.conflicts }),
    ...(spec.context === true
      ? {
          diff: {
            Resources: [
              {
                Changes: [
                  { ChangeType: 'None', DisplayPath: 'metadata.name', ToValue: spec.name },
                  ...fieldDiffs.map((d) => ({ ChangeType: 'Change' as const, DisplayPath: d.path, FromValue: d.oldValue, ToValue: d.newValue })),
                ],
              },
            ],
          },
        }
      : {}),
  };
}

interface Built {
  input: StageDiffSectionsInput<StageDiffUnitRef>;
  outcome: ChangeOrderOutcome;
}

function build(
  specs: GroupSpec[],
  spaceIds: string[],
  over: Partial<Pick<StageDiffSectionsInput<StageDiffUnitRef>, 'skippedUnits' | 'chainedSpaceIds'>> & { outcome?: ChangeOrderOutcome } = {},
): Built {
  const groups = specs.map(group);
  const spaceIdByUnitId = new Map(groups.map((g) => [g.unitId, g.unitId.split('/')[0]]));
  const matrix = buildStageMatrix({
    groups,
    spaceIds,
    spaceIdByUnitId,
    spaceNameBySpaceId: new Map(spaceIds.map((id) => [id, id])),
    stageId: 'prod',
  });
  const outcome = over.outcome ?? buildChangeOrderOutcome(matrix);
  const units = groups.map((g) => ({ unitId: g.unitId, spaceId: g.unitId.split('/')[0], slug: g.resourceName }));
  return {
    outcome,
    input: {
      stageId: 'prod',
      outcome,
      units,
      groupsByUnitId: new Map(groups.map((g) => [g.unitId, g])),
      skippedUnits: over.skippedUnits ?? {},
      matrix,
      chainedSpaceIds: over.chainedSpaceIds ?? [],
    },
  };
}

const image = (to: string): Record<string, [string, string]> => ({ 'spec.image': ['1.0', to] });
const ids = (units: readonly StageDiffUnitRef[]) => units.map((u) => u.unitId);

test.describe('stageDiffSections: what each group draws', () => {
  test('Same first, then the groups that differ; the representative draws once', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'b', name: 'api', fields: image('2.0') },
        { space: 'c', name: 'api', fields: image('2.1') },
      ],
      ['a', 'b', 'c'],
    );
    const model = stageDiffSections(input);
    expect(model.sections.map((s) => s.kind)).toEqual(['same', 'differs']);
    expect(model.sections[0].spaceIds).toEqual(['a', 'b']);
    expect(ids(model.sections[0].changedUnits)).toEqual(['a/api']);
    expect(ids(model.sections[1].changedUnits)).toEqual(['c/api']);
    expect(model.sections[0].label).toBe('Same change');
    expect(model.sections[0].headingId).toBe(diffGroupId('same'));
  });

  test('a Unit that takes the Same change in another group collapses into one line', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: { 'spec.replicas': ['3', '4'] } },
        { space: 'a', name: 'worker', fields: image('2.0') },
        { space: 'b', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
        { space: 'b', name: 'worker', fields: image('2.0') },
      ],
      ['a', 'b'],
    );
    const differs = stageDiffSections(input).sections.find((s) => s.kind === 'differs');
    expect(ids(differs?.changedUnits ?? [])).toEqual(['b/api']);
    expect(differs?.sameAs.map((e) => [e.unit.unitId, e.target.unitId])).toEqual([['b/worker', 'a/worker']]);
  });

  test('a Unit with a refusal is drawn, never collapsed: its tree holds rows the Same tree lacks', () => {
    const kept: ChangeOrderResourceConflict = { reason: 'Subtracted', path: 'spec.replicas', targetValue: '6', sourceValue: '4', blocks: true };
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'b', name: 'api', fields: image('2.0'), conflicts: [kept] },
        { space: 'b', name: 'worker', fields: image('3.0') },
        { space: 'a', name: 'worker', fields: image('2.0') },
      ],
      ['a', 'b'],
    );
    const differs = stageDiffSections(input).sections.find((s) => s.kind === 'differs');
    expect(ids(differs?.changedUnits ?? [])).toContain('b/api');
    expect(differs?.sameAs.map((e) => e.unit.unitId)).not.toContain('b/api');
  });

  test('blocked Units are kept, apart from the changed ones', () => {
    const refused: ChangeOrderResourceConflict = { reason: 'ProtectedPath', path: 'spec.image', blocks: true };
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'a', name: 'worker', fields: {}, conflicts: [refused] },
      ],
      ['a'],
    );
    const [section] = stageDiffSections(input).sections;
    expect(ids(section.changedUnits)).toEqual(['a/api']);
    expect(ids(section.blockedUnits)).toEqual(['a/worker']);
  });

  test('Units the change leaves alone are not listed', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'a', name: 'scheduler', fields: {} },
      ],
      ['a'],
    );
    const [section] = stageDiffSections(input).sections;
    expect(ids(section.changedUnits)).toEqual(['a/api']);
    expect(ids(section.blockedUnits)).toEqual([]);
    expect(section.body).toBe('units');
  });

  test('an undeterminable Unit is not read as untouched: its Space is said, under unknown', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'b', name: 'api', fields: {}, determinable: false },
      ],
      ['a', 'b'],
    );
    const model = stageDiffSections(input);
    const unknown = model.sections.find((s) => s.kind === 'unknown');
    expect(unknown?.spaceIds).toEqual(['b']);
    expect(model.sections.find((s) => s.kind === 'same')?.spaceIds ?? []).not.toContain('b');
  });

  test('passed-over Units never appear', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'a', name: 'worker', fields: image('2.0') },
      ],
      ['a'],
      { skippedUnits: { 'a/worker': 'passed over' } },
    );
    const [section] = stageDiffSections(input).sections;
    expect(ids(section.changedUnits)).toEqual(['a/api']);
  });

  test('a representative that already holds every value says so; one with no resources says that', () => {
    const holds = stageDiffSections(build([{ space: 'a', name: 'api', fields: {} }], ['a']).input);
    expect(holds.sections[0].body).toBe('alreadyHolds');
    const { input } = build([{ space: 'a', name: 'api', fields: image('2.0') }], ['a']);
    const none = stageDiffSections({ ...input, units: [] });
    expect(none.sections[0].body).toBe('noResources');
  });
});

test.describe('stageDiffSections: what is always said', () => {
  const outcome = (groups: ChangeOrderOutcome['groups'], variantCount: number, partial = false): ChangeOrderOutcome => ({
    groups,
    variantCount,
    tooFewToCompare: variantCount < 2,
    partial,
  });
  const g = (kind: ChangeOrderOutcome['groups'][number]['kind'], spaceIds: string[]) => ({
    kind,
    spaceIds,
    labels: spaceIds,
    representativeSpaceId: spaceIds[0],
  });

  test('unknown keeps its own section, last, with no tree, and is never folded into same', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'b', name: 'api', fields: image('2.0') },
      ],
      ['a', 'b', 'c'],
      { outcome: outcome([g('unknown', ['c']), g('same', ['a', 'b'])], 3) },
    );
    const model = stageDiffSections(input);
    expect(model.sections.map((s) => s.kind)).toEqual(['same', 'unknown']);
    const unknown = model.sections[1];
    expect(unknown.spaceIds).toEqual(['c']);
    expect(unknown.body).toBe('unknown');
    expect(unknown.changedUnits).toEqual([]);
    expect(model.sections[0].spaceIds).not.toContain('c');
  });

  test('the bar shows two or more comparable outcomes, never unknown; one Space is said once', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: image('2.0') },
        { space: 'b', name: 'api', fields: image('2.0') },
        { space: 'c', name: 'api', fields: image('2.1') },
      ],
      ['a', 'b', 'c', 'd'],
      { outcome: outcome([g('differs', ['c']), g('unknown', ['d']), g('same', ['a', 'b'])], 4) },
    );
    expect(stageDiffSections(input).bar).toEqual([
      { kind: 'same', label: 'Same change', count: 2 },
      { kind: 'differs', label: 'Differs', count: 1 },
    ]);
    const one = stageDiffSections(build([{ space: 'a', name: 'api', fields: image('2.0') }], ['a']).input);
    expect(one.bar).toBeNull();
    expect(one.oneVariant).toBe(true);
    expect(one.sameEverywhere).toBe(true);
  });

  test('each box counts the fields of its representative Space, collapsed Units included; unknown has no count', () => {
    const { input } = build(
      [
        { space: 'a', name: 'api', fields: { 'spec.replicas': ['3', '4'], 'spec.image': ['1', '2'] } },
        { space: 'a', name: 'worker', fields: image('2.0') },
        { space: 'b', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
        { space: 'b', name: 'worker', fields: image('2.0') },
      ],
      ['a', 'b', 'c'],
      { outcome: outcome([g('differs', ['b']), g('unknown', ['c']), g('same', ['a'])], 3) },
    );
    const model = stageDiffSections(input);
    expect(model.sections.map((s) => [s.kind, s.fieldCount])).toEqual([
      ['same', 3],
      ['differs', 2],
      ['unknown', null],
    ]);
    expect(model.fieldCount).toBe(5);
    expect(model.sameEverywhere).toBe(false);
  });
});

test.describe('resolveDiffTarget: where a link lands', () => {
  const specs: GroupSpec[] = [
    { space: 'a', name: 'api', fields: { 'spec.replicas': ['3', '4'] } },
    { space: 'a', name: 'worker', fields: image('2.0') },
    { space: 'b', name: 'api', fields: { 'spec.replicas': ['3', '4'] } },
    { space: 'b', name: 'worker', fields: image('2.0') },
    { space: 'c', name: 'api', fields: { 'spec.replicas': ['2', '3'] } },
    { space: 'c', name: 'worker', fields: image('2.0') },
  ];

  test('anchor ids are unique across the card', () => {
    const model = stageDiffSections(build(specs, ['a', 'b', 'c']).input);
    const blockIds = model.sections.flatMap((s) =>
      [...s.changedUnits, ...s.blockedUnits].map((u) => resolveDiffTarget(model, { groupKind: s.kind, unitId: u.unitId })?.blockId),
    );
    expect(new Set(blockIds).size).toBe(blockIds.length);
    expect(blockIds).toEqual(['diff-same-a/api', 'diff-same-a/worker', 'diff-differs-c/api']);
    const headings = model.sections.map((s) => s.headingId);
    expect(new Set(headings).size).toBe(headings.length);
  });

  test('a drawn Unit lands on itself, with the field', () => {
    const model = stageDiffSections(build(specs, ['a', 'b', 'c']).input);
    expect(resolveDiffTarget(model, { groupKind: 'differs', unitId: 'c/api', path: 'spec.replicas' })).toEqual({
      kind: 'differs',
      headingId: diffGroupId('differs'),
      unitId: 'c/api',
      blockId: 'diff-differs-c/api',
      path: 'spec.replicas',
    });
  });

  test('a Unit of a member Space that is not drawn lands on the drawn Unit of the same resource', () => {
    const model = stageDiffSections(build(specs, ['a', 'b', 'c']).input);
    expect(resolveDiffTarget(model, { groupKind: 'same', unitId: 'b/api', path: 'spec.replicas' })?.blockId).toBe('diff-same-a/api');
  });

  test('a collapsed Unit lands on the Same tree it points to', () => {
    const model = stageDiffSections(build(specs, ['a', 'b', 'c']).input);
    const target = resolveDiffTarget(model, { groupKind: 'differs', unitId: 'c/worker', path: 'spec.image' });
    expect(target?.kind).toBe('same');
    expect(target?.blockId).toBe('diff-same-a/worker');
  });

  test('a group jump lands on the heading; an unknown group too', () => {
    const model = stageDiffSections(build(specs, ['a', 'b', 'c']).input);
    expect(resolveDiffTarget(model, { groupKind: 'differs' })).toEqual({ kind: 'differs', headingId: diffGroupId('differs') });
    expect(resolveDiffTarget(model, { groupKind: 'unknown' })).toBeNull();
  });
});
