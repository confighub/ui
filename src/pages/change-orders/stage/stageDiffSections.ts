// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the change card's outcome boxes draw: one box per outcome group, the
 * Units each box shows when open, the bar across the groups, and where a field
 * link lands.
 *
 * Pure: no React and no MUI. The browser-free spec imports this module directly.
 *
 * ONE TREE PER GROUP, NOT PER SPACE. Members of a group take the same change by
 * construction, so a box draws its representative Space's Units once and names
 * the Spaces it stands for. A Unit in another group whose change is the Same
 * group's is said in one line rather than drawn a second time, so the trees left
 * on screen are the ones that differ.
 *
 * WHAT IS LISTED. A box lists the Units the change rewrites, then, apart, the ones
 * it tried to alter and could not. Units it leaves alone are not listed: the box
 * reports what the change does. Units the ChangeOrder passed over are never
 * listed; "Passed over" accounts for them.
 *
 * WHAT IS ALWAYS SAID. `unknown` is a box of its own and is never folded into
 * `same`: "we could not look" is not "it matches". The notes that qualify the
 * counts (a floor, omitted and undecided resources, a partition defect) come with
 * the propagation and are said on the card above the boxes.
 */

import { plural } from '../changeOrderHistory';
import { outcomeGroupKey, rowRefusals } from '../changeOrderCard';
import type { ChangeOrderOutcome, ChangeOrderOutcomeGroup, ChangeOrderOutcomeKind } from '../changeOrderOutcome';
import { OUTCOME_META } from '../components/outcomeMeta';
import { partitionSourceUnitsByChange } from '../useChangeOrderConsoleChanges';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import type { ChangeOrderStageMatrix } from '../../x/apps/change-order/changeOrderMatrix';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { diffAnchorId } from './stageLinks';
import type { DiffAnchor } from './stageTypes';

/** The outcome boxes' own words. */
export const stageDiffCopy = {
  open: 'Open',
  close: 'Close',
  fields: (n: number) => (n === 1 ? 'field' : 'fields'),
  unknownTile: 'unknown',
  oneVariant: 'One variant. Nothing to compare.',
  barLabel: (n: number) => `Outcome across ${plural(n, 'Space')}`,
  noFields: 'No fields differ here.',
  spaceCount: (n: number) => plural(n, 'Space'),
  label: (kind: ChangeOrderOutcomeKind) => OUTCOME_META[kind].label,
  sameAsTail: ` the same change as in ${OUTCOME_META.same.label}.`,
  alreadyHolds: (spaces: number) =>
    spaces === 1
      ? 'This Space already has every value. Nothing is written.'
      : 'These Spaces already have every value. Nothing is written.',
  noResources: changeOrderCopy.noResourcesYet,
  unknown: (spaces: number) =>
    spaces === 1
      ? 'Could not establish the change in this Space.'
      : 'Could not establish the change in these Spaces.',
} as const;

/** The boxes' region id: a link to the diff (`#stage-diff`) lands on it. */
export const STAGE_DIFF_ID = 'stage-diff';

/** The id of a box's header: focused, and tinted by a jump to the group. */
export function diffGroupId(kind: ChangeOrderOutcomeKind): string {
  return `stage-diff-group-${kind}`;
}

/** The least a Unit needs to be placed. The card's own rows are `MergedUnit`s. */
export interface StageDiffUnitRef {
  unitId: string;
  spaceId: string;
  slug: string;
}

/** A Unit in another group that takes exactly the Same group's change. */
export interface StageDiffSameAs<TUnit extends StageDiffUnitRef> {
  unit: TUnit;
  /** The Same group's Unit for the same resource, where the tree is drawn. */
  target: TUnit;
}

/**
 * What a section's body holds.
 * - `units`: trees, blocked Units, or same-as lines.
 * - `alreadyHolds`: the representative holds every carried resource at the new value.
 * - `noResources`: the representative holds none of the stage's resources yet.
 * - `unknown`: nothing could be established, so no tree is drawn.
 */
export type StageDiffBody = 'units' | 'alreadyHolds' | 'noResources' | 'unknown';

export interface StageDiffSection<TUnit extends StageDiffUnitRef> {
  kind: ChangeOrderOutcomeKind;
  label: string;
  /** `outcomeGroupKey(stageId, kind)`: unique on the page, and the tree rows' key prefix. */
  groupKey: string;
  headingId: string;
  spaceIds: string[];
  representativeSpaceId: string;
  body: StageDiffBody;
  /**
   * Changed fields across the Units the box stands for, its representative
   * Space's: the box draws that Space's rows, so a group-wide total would count
   * rows the reader cannot see. `null` for unknown, which nobody could count.
   */
  fieldCount: number | null;
  /** Units drawn as a tree, in the order the change was assembled. */
  changedUnits: TUnit[];
  /** Units the change tried to alter and could not. */
  blockedUnits: TUnit[];
  sameAs: StageDiffSameAs<TUnit>[];
}

/** One outcome's share of the stage, for the bar above the boxes. */
export interface StageDiffBarSegment {
  kind: ChangeOrderOutcomeKind;
  label: string;
  count: number;
}

export interface StageDiffModel<TUnit extends StageDiffUnitRef> {
  sections: StageDiffSection<TUnit>[];
  /**
   * How the Spaces divide between the comparable outcomes, when there are two or
   * more; `null` otherwise, where one full-width segment would repeat what the one
   * box already says. Unknown is not a way the change can come out, so it is not a segment.
   */
  bar: StageDiffBarSegment[] | null;
  /** Fewer than two Spaces exist at all, so there is nothing to compare. */
  oneVariant: boolean;
  /** One group holds every Space and takes the change identically. */
  sameEverywhere: boolean;
  /** Fields the change writes across the stage's Units, every Space counted. */
  fieldCount: number;
  /** Every Unit of the stage by id, so an anchor in any member Space can be placed. */
  unitById: ReadonlyMap<string, TUnit>;
  rowKeyByUnitId: ReadonlyMap<string, string>;
}

export interface StageDiffSectionsInput<TUnit extends StageDiffUnitRef> {
  stageId: string;
  outcome: ChangeOrderOutcome;
  /** Every Unit of the stage, across its Spaces. */
  units: readonly TUnit[];
  groupsByUnitId: ReadonlyMap<string, Pick<ChangeOrderChangeGroup, 'fieldDiffs' | 'determinable' | 'conflicts' | 'diff'>>;
  /** Units the ChangeOrder passed over: never listed. */
  skippedUnits: Readonly<Record<string, string>>;
  matrix: Pick<ChangeOrderStageMatrix, 'rows' | 'rowKeyByUnitId' | 'unresolvedGroupCount' | 'mergeDeclinedCount'> | null;
  /** Spaces previewed against an earlier variant (`StagePropagation.chainedSpaceIds`). */
  chainedSpaceIds: readonly string[];
}

/**
 * Same first, so the line "the same change as in Same change" refers back to a
 * tree the reader has already passed; the groups that differ follow, and the
 * Spaces nothing could be said about come last.
 */
const SECTION_ORDER: readonly ChangeOrderOutcomeKind[] = ['same', 'differs', 'adds', 'unknown'];

const EMPTY_ROW_KEYS: ReadonlyMap<string, string> = new Map();

/**
 * Whether a Unit of a non-Same group takes exactly the change the Same group draws
 * for its resource: its matrix cell reads `same` against a reference that is the
 * Same group's representative. A Unit with a refusal never collapses, because its
 * tree carries rows (kept values) the Same tree does not.
 */
function sameAsTarget<TUnit extends StageDiffUnitRef>(
  unit: TUnit,
  representativeSpaceId: string,
  same: { representativeSpaceId: string; byRowKey: ReadonlyMap<string, TUnit> } | undefined,
  input: StageDiffSectionsInput<TUnit>,
): TUnit | undefined {
  if (same === undefined || input.matrix === null) return undefined;
  const group = input.groupsByUnitId.get(unit.unitId);
  if (group === undefined || !group.determinable || group.fieldDiffs.length === 0) return undefined;
  if (rowRefusals(group).length > 0) return undefined;
  const rowKey = input.matrix.rowKeyByUnitId.get(unit.unitId);
  if (rowKey === undefined) return undefined;
  const row = input.matrix.rows.find((r) => r.key === rowKey);
  if (row === undefined || row.referenceSpaceId !== same.representativeSpaceId) return undefined;
  const cell = row.cells.find((c) => c.spaceId === representativeSpaceId);
  if (cell?.state !== 'same') return undefined;
  return same.byRowKey.get(rowKey);
}

function representativeUnits<TUnit extends StageDiffUnitRef>(
  group: ChangeOrderOutcomeGroup,
  input: StageDiffSectionsInput<TUnit>,
): TUnit[] {
  return input.units.filter((unit) => unit.spaceId === group.representativeSpaceId && !(unit.unitId in input.skippedUnits));
}

/** The boxes, the bar and the anchors of the change card's diff. */
export function stageDiffSections<TUnit extends StageDiffUnitRef>(input: StageDiffSectionsInput<TUnit>): StageDiffModel<TUnit> {
  const rowKeyByUnitId = input.matrix?.rowKeyByUnitId ?? EMPTY_ROW_KEYS;
  const byKind = new Map(input.outcome.groups.map((group) => [group.kind, group]));
  const ordered = SECTION_ORDER.flatMap((kind) => {
    const group = byKind.get(kind);
    return group === undefined || group.spaceIds.length === 0 ? [] : [group];
  });

  // The Same group's drawn Units by matrix row, which the other groups collapse onto.
  let same: { representativeSpaceId: string; byRowKey: Map<string, TUnit> } | undefined;
  const sameGroup = byKind.get('same');
  if (sameGroup !== undefined && sameGroup.spaceIds.length > 0) {
    const { changedUnits } = partitionSourceUnitsByChange(representativeUnits(sameGroup, input), input.groupsByUnitId);
    const byRowKey = new Map<string, TUnit>();
    for (const unit of changedUnits) {
      const group = input.groupsByUnitId.get(unit.unitId);
      const rowKey = rowKeyByUnitId.get(unit.unitId);
      if (rowKey !== undefined && group !== undefined && group.determinable && group.fieldDiffs.length > 0) byRowKey.set(rowKey, unit);
    }
    same = { representativeSpaceId: sameGroup.representativeSpaceId, byRowKey };
  }

  const fieldsOf = (unit: TUnit) => input.groupsByUnitId.get(unit.unitId)?.fieldDiffs.length ?? 0;
  const sections = ordered.map((group): StageDiffSection<TUnit> => {
    const base = {
      kind: group.kind,
      label: stageDiffCopy.label(group.kind),
      groupKey: outcomeGroupKey(input.stageId, group.kind),
      headingId: diffGroupId(group.kind),
      spaceIds: [...group.spaceIds],
      representativeSpaceId: group.representativeSpaceId,
    };
    if (group.kind === 'unknown') {
      return { ...base, body: 'unknown', fieldCount: null, changedUnits: [], blockedUnits: [], sameAs: [] };
    }
    const repUnits = representativeUnits(group, input);
    const partition = partitionSourceUnitsByChange(repUnits, input.groupsByUnitId);
    const changedUnits: TUnit[] = [];
    const sameAs: StageDiffSameAs<TUnit>[] = [];
    for (const unit of partition.changedUnits) {
      const target = group.kind === 'same' ? undefined : sameAsTarget(unit, group.representativeSpaceId, same, input);
      if (target === undefined) changedUnits.push(unit);
      else sameAs.push({ unit, target });
    }
    const drawn = changedUnits.length + partition.blockedUnits.length + sameAs.length;
    const body: StageDiffBody = drawn > 0 ? 'units' : repUnits.length > 0 ? 'alreadyHolds' : 'noResources';
    const fieldCount = [...partition.changedUnits].reduce((n, unit) => n + fieldsOf(unit), 0);
    return { ...base, body, fieldCount, changedUnits, blockedUnits: partition.blockedUnits, sameAs };
  });

  const comparable = sections.filter((section) => section.kind !== 'unknown');
  const variantCount = input.outcome.variantCount;
  return {
    sections,
    bar:
      comparable.length < 2
        ? null
        : comparable.map((section) => ({ kind: section.kind, label: section.label, count: section.spaceIds.length })),
    oneVariant: comparable.length < 2 && input.outcome.tooFewToCompare && variantCount > 0,
    sameEverywhere: sections.length === 1 && sections[0].kind === 'same' && sections[0].spaceIds.length === variantCount,
    fieldCount: input.units.reduce((n, unit) => n + (unit.unitId in input.skippedUnits ? 0 : fieldsOf(unit)), 0),
    unitById: new Map(input.units.map((unit) => [unit.unitId, unit])),
    rowKeyByUnitId,
  };
}

/** Where a jump into the diff lands, once placed against what the card draws. */
export interface StageDiffTarget {
  kind: ChangeOrderOutcomeKind;
  /** The section heading to focus, and to tint when no Unit is named. */
  headingId: string;
  /** The drawn Unit to scroll to, or `undefined` for the section heading alone. */
  unitId?: string;
  /** `diffAnchorId` of that Unit's block. */
  blockId?: string;
  /** The field to mark inside that Unit's tree. */
  path?: string;
}

function drawnUnits<TUnit extends StageDiffUnitRef>(section: StageDiffSection<TUnit>): TUnit[] {
  return [...section.changedUnits, ...section.blockedUnits];
}

function unitTarget<TUnit extends StageDiffUnitRef>(section: StageDiffSection<TUnit>, unitId: string, path: string | undefined): StageDiffTarget {
  return {
    kind: section.kind,
    headingId: section.headingId,
    unitId,
    blockId: diffAnchorId({ groupKind: section.kind, unitId }),
    ...(path === undefined ? {} : { path }),
  };
}

/**
 * Place an anchor on what the card draws.
 *
 * A link names the Unit it was built from, which may sit in a member Space the
 * section does not draw. The section is chosen by that Unit's Space when it is
 * known, else by the anchor's group. Inside it, the Unit itself when drawn; else
 * the drawn Unit on the same matrix row; else, for a Unit said as "the same change
 * as in Same change", the Same tree it points to. With none of those, the jump
 * lands on the section heading.
 */
export function resolveDiffTarget<TUnit extends StageDiffUnitRef>(
  model: StageDiffModel<TUnit>,
  anchor: Pick<DiffAnchor, 'groupKind' | 'path'> & { unitId?: string },
): StageDiffTarget | null {
  const unit = anchor.unitId === undefined ? undefined : model.unitById.get(anchor.unitId);
  const section =
    (unit === undefined ? undefined : model.sections.find((s) => s.spaceIds.includes(unit.spaceId))) ??
    model.sections.find((s) => s.kind === anchor.groupKind);
  if (section === undefined) return null;
  const heading: StageDiffTarget = { kind: section.kind, headingId: section.headingId };
  if (anchor.unitId === undefined) return heading;

  const drawn = drawnUnits(section);
  if (drawn.some((u) => u.unitId === anchor.unitId)) return unitTarget(section, anchor.unitId, anchor.path);

  const rowKey = model.rowKeyByUnitId.get(anchor.unitId);
  if (rowKey !== undefined) {
    const onRow = drawn.find((u) => model.rowKeyByUnitId.get(u.unitId) === rowKey);
    if (onRow !== undefined) return unitTarget(section, onRow.unitId, anchor.path);
    const collapsed = section.sameAs.find((entry) => model.rowKeyByUnitId.get(entry.unit.unitId) === rowKey);
    const sameSection = model.sections.find((s) => s.kind === 'same');
    if (collapsed !== undefined && sameSection !== undefined) return unitTarget(sameSection, collapsed.target.unitId, anchor.path);
  }
  return heading;
}
