// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How the change reaches each Space of the stage, when that is not the same
 * everywhere: the problems the status box states, the chips in the Spaces list,
 * and the quiet notes.
 *
 * A DIFFERENCE IS LOUD, AND ORDINARY THINGS ARE QUIET. A Space taking a different
 * change, keeping its own value, or refusing part of it is the thing a reader
 * must see before promoting, so it becomes a problem with an "…anyway" confirm.
 * A Space previewed against an earlier variant of the same promotion cannot be
 * shown yet: that is every chained stage, and an alarm there would fire on the
 * commonest topology there is and teach readers to ignore it. It is a note.
 *
 * Built on the outcome partition, so a Space is reported under exactly one kind,
 * and `unknown` is never folded into `same`. After an action the groups are read
 * from what was written, so a difference that landed is still stated.
 */

import { partitionShortfall, type ChangeOrderOutcome } from '../changeOrderOutcome';
import { keptValueOf, rowRefusals } from '../changeOrderCard';
import type { ChangeOrderStageMatrix, ChangeOrderMatrixRow } from '../../x/apps/change-order/changeOrderMatrix';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { stageCardCopy } from './stageCardCopy';
import { changeFieldLabel, imageValueText, isImageField } from './stageChangeLines';
import { problemSpaceIds } from './stageProblems';
import type { PropagationProblem, PropagationProblemKind, SpaceMark, StagePropagation, UnknownCause } from './stageTypes';

export {
  acknowledgementText,
  differsValueTexts,
  needsAcknowledgement,
  problemItems,
  problemSegments,
  problemSpaceIds,
  propagationHeadline,
} from './stageProblems';

/** The dry run's reason for a Space it could not plan because its upstream is promoted first. */
export const CHAINED_REASON = 'UpstreamPromotedFirst';

export interface StagePropagationInput {
  outcome: ChangeOrderOutcome;
  matrix: ChangeOrderStageMatrix | null;
  groupsByUnitId: ReadonlyMap<string, ChangeOrderChangeGroup>;
  spaceIdByUnitId: ReadonlyMap<string, string>;
  /** The resources the change carries (`carriedResourceKeysOf`), or `null` when none could be identified. */
  carriedResourceKeys: ReadonlySet<string> | null;
  /** Why the forced dry run did not plan a Space. */
  unplannedReasonBySpaceId: ReadonlyMap<string, string>;
  stageName: string;
  /**
   * False when the stage before has not taken the change. The dry run then plans
   * against an upstream without it, so an empty plan says nothing about whether a
   * Space has the change. Absent: it has.
   */
  previousLanded?: boolean;
}

/** Worst first: what cannot be established, then what is refused, kept, different, added. */
const KIND_RANK: Record<PropagationProblemKind, number> = { unknown: 0, refused: 1, kept: 2, differs: 3, adds: 4 };

const EMPTY: StagePropagation = { problems: [], marks: new Map(), quietNotes: [], chainedSpaceIds: [], referenceSpaceId: null };

interface PathChangeValue {
  from: string;
  to: string;
  label: string;
  isImage: boolean;
}

/** A group's changes by path: the server's diff where there is one, else its flattened field diffs. */
function changesByPath(group: ChangeOrderChangeGroup | undefined): Map<string, PathChangeValue> {
  const out = new Map<string, PathChangeValue>();
  if (group === undefined) return out;
  if (group.diff !== undefined) {
    for (const resource of group.diff.Resources ?? []) {
      for (const change of resource.Changes ?? []) {
        if (change.ChangeType === 'None') continue;
        const path = change.DisplayPath ?? change.Path ?? '';
        if (path === '') continue;
        out.set(path, {
          from: change.FromValue ?? '',
          to: change.ToValue ?? '',
          label: changeFieldLabel(change.Segments, path),
          isImage: isImageField(change.Segments, path),
        });
      }
    }
    if (out.size > 0) return out;
  }
  for (const diff of group.fieldDiffs) {
    out.set(diff.path, { from: diff.oldValue, to: diff.newValue, label: changeFieldLabel(null, diff.path), isImage: isImageField(null, diff.path) });
  }
  return out;
}

/**
 * The label of a path a conflict names. The group's own diff carries the path's
 * segments when it changes the path; a kept path usually does not change, so the
 * server path itself is read.
 */
function conflictPathLabel(group: ChangeOrderChangeGroup, path: string): { label: string; isImage: boolean } {
  for (const resource of group.diff?.Resources ?? []) {
    for (const change of resource.Changes ?? []) {
      if (change.DisplayPath === path || change.Path === path) {
        return { label: changeFieldLabel(change.Segments, path), isImage: isImageField(change.Segments, path) };
      }
    }
  }
  return { label: changeFieldLabel(null, path), isImage: isImageField(null, path) };
}

/**
 * The problems, the Space chips and the quiet notes of a stage.
 */
export function stagePropagation(input: StagePropagationInput): StagePropagation {
  const { outcome, matrix } = input;
  if (matrix === null || outcome.groups.length === 0) return EMPTY;

  /** spaceId → row key → its Units in that Space. */
  const unitsBySpaceRow = new Map<string, Map<string, string[]>>();
  /** spaceId → its groups. */
  const groupsBySpace = new Map<string, ChangeOrderChangeGroup[]>();
  for (const [unitId, group] of input.groupsByUnitId) {
    const spaceId = input.spaceIdByUnitId.get(unitId);
    if (spaceId === undefined) continue;
    const list = groupsBySpace.get(spaceId) ?? [];
    list.push(group);
    groupsBySpace.set(spaceId, list);
    const rowKey = matrix.rowKeyByUnitId.get(unitId);
    if (rowKey === undefined) continue;
    const rows = unitsBySpaceRow.get(spaceId) ?? new Map<string, string[]>();
    rows.set(rowKey, [...(rows.get(rowKey) ?? []), unitId]);
    unitsBySpaceRow.set(spaceId, rows);
  }
  const unitsIn = (spaceId: string, rowKey: string) => unitsBySpaceRow.get(spaceId)?.get(rowKey) ?? [];
  const carried = (row: ChangeOrderMatrixRow) =>
    input.carriedResourceKeys !== null ? input.carriedResourceKeys.has(row.key) : row.changed;
  const cellOf = (row: ChangeOrderMatrixRow, spaceId: string) => row.cells.find((c) => c.spaceId === spaceId)?.state;

  const problems: PropagationProblem[] = [];
  const marks = new Map<string, SpaceMark>();
  const chainedSpaceIds: string[] = [];
  const unknownBuckets = new Map<string, Extract<PropagationProblem, { kind: 'unknown' }>>();
  const addUnknown = (spaceId: string, cause: UnknownCause, resourceName?: string, unitId?: string) => {
    const key = `${cause}\u0000${resourceName ?? ''}`;
    const bucket = unknownBuckets.get(key);
    if (bucket !== undefined) {
      if (!bucket.spaceIds.includes(spaceId)) bucket.spaceIds.push(spaceId);
      return;
    }
    const problem: Extract<PropagationProblem, { kind: 'unknown' }> = {
      kind: 'unknown',
      spaceIds: [spaceId],
      cause,
      ...(resourceName === undefined ? {} : { resourceName }),
      ...(unitId === undefined ? {} : { unitId }),
    };
    unknownBuckets.set(key, problem);
    problems.push(problem);
  };

  for (const group of outcome.groups) {
    for (const spaceId of group.spaceIds) {
      switch (group.kind) {
        case 'same':
        case 'differs':
          // Compared below, against the majority rather than the matrix's first Space.
          break;
        case 'adds': {
          for (const row of matrix.rows) {
            if (!carried(row) || cellOf(row, spaceId) !== 'new') continue;
            problems.push({ kind: 'adds', spaceId, resourceName: row.resourceName });
          }
          marks.set(spaceId, { kind: 'adds' });
          break;
        }
        case 'unknown': {
          const reason = input.unplannedReasonBySpaceId.get(spaceId);
          if (reason === CHAINED_REASON) {
            chainedSpaceIds.push(spaceId);
            break;
          }
          marks.set(spaceId, { kind: 'unknown' });
          const column = matrix.columns.find((c) => c.spaceId === spaceId);
          if (column !== undefined && !column.contributing) {
            addUnknown(spaceId, 'noResources');
          } else if (matrix.unreadableSpaceIds.has(spaceId)) {
            addUnknown(spaceId, 'unreadable');
          } else {
            const declined = matrix.mergeDeclinedCount > 0 ? declinedGroupOf(groupsBySpace.get(spaceId) ?? []) : undefined;
            if (declined !== undefined) addUnknown(spaceId, 'mergeDeclined', declined.resourceName, declined.unitId);
            else addUnknown(spaceId, 'unplanned');
          }
          break;
        }
      }
    }
  }

  const referenceSpaceId = compareWithMajority(outcome, matrix, carried, unitsIn, input.groupsByUnitId, groupsBySpace, problems, marks);
  if (input.previousLanded === false) {
    // "Has it" would tell a reviewer the change is already there; nothing has reached this stage yet.
    for (const [spaceId, mark] of marks) if (mark.kind === 'hasIt') marks.delete(spaceId);
  }

  problems.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);

  const quietNotes: string[] = [];
  if (chainedSpaceIds.length > 0) {
    quietNotes.push(changeOrderCopy.previewReach(outcome.variantCount - chainedSpaceIds.length, outcome.variantCount));
  }
  if (outcome.partial) quietNotes.push(stageCardCopy.diff.partial(input.stageName));
  if (matrix.unresolvedGroupCount > 0) quietNotes.push(stageCardCopy.diff.omitted(matrix.unresolvedGroupCount));
  if (matrix.mergeDeclinedCount > 0) quietNotes.push(stageCardCopy.diff.undecided(matrix.mergeDeclinedCount));
  const shortfall = partitionShortfall(outcome);

  return {
    problems,
    marks,
    quietNotes,
    chainedSpaceIds,
    referenceSpaceId,
    ...(shortfall === 0 ? {} : { shortfallNote: stageCardCopy.diff.shortfall(shortfall) }),
  };
}

/** A group's own row is one the change carries. */
function carriedGroup(
  group: ChangeOrderChangeGroup,
  matrix: ChangeOrderStageMatrix,
  carried: (row: ChangeOrderMatrixRow) => boolean,
): boolean {
  const key = matrix.rowKeyByUnitId.get(group.unitId);
  const row = key === undefined ? undefined : matrix.rows.find((r) => r.key === key);
  return row !== undefined && carried(row);
}

/**
 * A resource the comparison declined to join in this Space: two of its resources
 * share a bare identity and differ only in namespace.
 */
function declinedGroupOf(groups: readonly ChangeOrderChangeGroup[]): { resourceName: string; unitId: string } | undefined {
  const byBare = new Map<string, Set<string>>();
  for (const group of groups) {
    if (group.resourceIdentity === undefined) continue;
    const namespaced = byBare.get(group.resourceIdentity) ?? new Set<string>();
    namespaced.add(group.resourceIdentityNamespaced ?? group.resourceIdentity);
    byBare.set(group.resourceIdentity, namespaced);
  }
  for (const group of groups) {
    if (group.resourceIdentity !== undefined && (byBare.get(group.resourceIdentity)?.size ?? 0) > 1) {
      return { resourceName: group.resourceName, unitId: group.unitId };
    }
  }
  return undefined;
}

/** What one Space does to one row: its groups' changes and refusals, order-free. */
function rowSignature(unitIds: readonly string[], groupsByUnitId: ReadonlyMap<string, ChangeOrderChangeGroup>): string {
  if (unitIds.length === 0) return '\u0000absent';
  const parts: string[] = [];
  for (const unitId of unitIds) {
    const group = groupsByUnitId.get(unitId);
    if (group === undefined) continue;
    for (const diff of group.fieldDiffs) parts.push(JSON.stringify(['f', diff.path, diff.newValue]));
    for (const conflict of rowRefusals(group)) parts.push(JSON.stringify(['c', conflict.reason, conflict.path ?? '', conflict.targetValue ?? '']));
  }
  return parts.sort().join('');
}

/**
 * Which Space the others are measured against: one of the MAJORITY, the largest
 * set of Spaces that take exactly the same change. Ties go to the set holding the
 * Space listed first. `null` with fewer than two comparable Spaces.
 *
 * NOT the matrix's reference. The matrix measures every Space against the first
 * one listed, which is a fine anchor for drawing cells and the wrong one for
 * saying who is different: when that first Space is the odd one, the other two
 * would be named as taking a different change although they agree.
 */
export function majorityReferenceSpaceId(
  spaceIds: readonly string[],
  signatureOf: (spaceId: string) => string,
): string | null {
  if (spaceIds.length < 2) return null;
  const classes = new Map<string, string[]>();
  for (const id of spaceIds) {
    const sig = signatureOf(id);
    classes.set(sig, [...(classes.get(sig) ?? []), id]);
  }
  let best: string[] | undefined;
  for (const members of classes.values()) {
    // Map order is first-seen order, so on a tie the set with the first-listed Space stays.
    if (best === undefined || members.length > best.length) best = members;
  }
  return best?.[0] ?? null;
}

/**
 * The Spaces that could be compared (outcome `same` and `differs`), measured
 * against the majority: its members get no problem, every other one gets the
 * rows where it does something else. Returns the reference Space.
 */
function compareWithMajority(
  outcome: ChangeOrderOutcome,
  matrix: ChangeOrderStageMatrix,
  carried: (row: ChangeOrderMatrixRow) => boolean,
  unitsIn: (spaceId: string, rowKey: string) => string[],
  groupsByUnitId: ReadonlyMap<string, ChangeOrderChangeGroup>,
  groupsBySpace: ReadonlyMap<string, ChangeOrderChangeGroup[]>,
  problems: PropagationProblem[],
  marks: Map<string, SpaceMark>,
): string | null {
  const comparable = new Set(outcome.groups.filter((g) => g.kind === 'same' || g.kind === 'differs').flatMap((g) => g.spaceIds));
  const spaceIds = matrix.columns.map((c) => c.spaceId).filter((id) => comparable.has(id));
  const rows = matrix.rows.filter(carried);
  const rowSig = (spaceId: string, row: ChangeOrderMatrixRow) => rowSignature(unitsIn(spaceId, row.key), groupsByUnitId);
  const spaceSig = (spaceId: string) => rows.map((row) => `${row.key}\u0001${rowSig(spaceId, row)}`).join('\u0002');
  const reference = majorityReferenceSpaceId(spaceIds, spaceSig);
  const referenceSig = reference === null ? undefined : spaceSig(reference);

  for (const spaceId of spaceIds) {
    if (reference === null || spaceSig(spaceId) === referenceSig) {
      const own = (groupsBySpace.get(spaceId) ?? []).filter((g) => carriedGroup(g, matrix, carried));
      if (own.length > 0 && own.every((g) => g.determinable && g.fieldDiffs.length === 0 && rowRefusals(g).length === 0)) {
        marks.set(spaceId, { kind: 'hasIt' });
      }
      continue;
    }
    marks.set(spaceId, differsProblems(spaceId, reference, rows, rowSig, unitsIn, groupsByUnitId, problems));
  }
  return reference;
}

/**
 * The problems of one Space whose change differs from the reference, row by row.
 * A blocking conflict that is a value the Space keeps is `kept`; any other
 * blocking conflict is `refused`; a resource the reference holds and the Space
 * does not is `adds`; otherwise the paths are compared.
 */
function differsProblems(
  spaceId: string,
  refSpaceId: string,
  rows: readonly ChangeOrderMatrixRow[],
  rowSig: (spaceId: string, row: ChangeOrderMatrixRow) => string,
  unitsIn: (spaceId: string, rowKey: string) => string[],
  groupsByUnitId: ReadonlyMap<string, ChangeOrderChangeGroup>,
  problems: PropagationProblem[],
): SpaceMark {
  let mark: SpaceMark | undefined;
  const rank = (m: SpaceMark) => (m.kind === 'refuses' ? 0 : m.kind === 'keeps' ? 1 : m.kind === 'differs' ? 2 : 3);
  const raise = (next: SpaceMark) => {
    if (mark === undefined || rank(next) < rank(mark)) mark = next;
  };
  for (const row of rows) {
    if (rowSig(spaceId, row) === rowSig(refSpaceId, row)) continue;
    const refGroup = groupsByUnitId.get(unitsIn(refSpaceId, row.key)[0] ?? '');
    const unitIds = unitsIn(spaceId, row.key);
    if (unitIds.length === 0) {
      problems.push({ kind: 'adds', spaceId, resourceName: row.resourceName });
      raise({ kind: 'adds' });
      continue;
    }
    let found = false;
    for (const unitId of unitIds) {
      const group = groupsByUnitId.get(unitId);
      if (group === undefined) continue;
      const blocking = rowRefusals(group);
      for (const conflict of blocking) {
        const kept = keptValueOf(conflict);
        if (kept !== undefined) {
          const field = conflictPathLabel(group, kept.path);
          const valueText = field.isImage ? imageValueText(kept.value, kept.incoming) : kept.value;
          problems.push({
            kind: 'kept',
            spaceId,
            unitId,
            resourceName: group.resourceName,
            path: kept.path,
            label: field.label,
            value: kept.value,
            valueText,
            reason: conflict.reason,
            ...(kept.incoming === undefined ? {} : { incoming: kept.incoming }),
          });
          raise({ kind: 'keeps', value: valueText, ...(valueText === kept.value ? {} : { title: kept.value }) });
        } else {
          problems.push({
            kind: 'refused',
            spaceId,
            unitId,
            resourceName: group.resourceName,
            reason: conflict.reason,
            ...(conflict.path === undefined ? {} : { path: conflict.path }),
            ...(conflict.details === undefined ? {} : { details: conflict.details }),
          });
          raise({ kind: 'refuses' });
        }
        found = true;
      }
      if (blocking.length > 0) continue;
      const own = changesByPath(group);
      const ref = changesByPath(refGroup);
      for (const path of new Set([...own.keys(), ...ref.keys()])) {
        const a = own.get(path);
        const b = ref.get(path);
        if (a !== undefined && b !== undefined && a.from === b.from && a.to === b.to) continue;
        problems.push({
          kind: 'differs',
          spaceId,
          unitId,
          resourceName: group.resourceName,
          path,
          label: a?.label ?? b?.label ?? path,
          isImage: a?.isImage ?? b?.isImage ?? false,
          from: a?.from ?? '',
          to: a?.to ?? '',
          refFrom: b?.from ?? '',
          refTo: b?.to ?? '',
          refSpaceId,
        });
        raise({ kind: 'differs' });
        found = true;
      }
    }
    if (!found) {
      // The signatures differ in something the payloads cannot name: still a difference, said at resource level.
      problems.push({
        kind: 'differs',
        spaceId,
        unitId: unitIds[0],
        resourceName: row.resourceName,
        path: row.resourceName,
        label: row.resourceName,
        isImage: false,
        from: '',
        to: '',
        refFrom: '',
        refTo: '',
        refSpaceId,
      });
      raise({ kind: 'differs' });
    }
  }
  return mark ?? { kind: 'differs' };
}

/**
 * The outcome partition with `same` and `differs` measured against the majority,
 * so a view that draws the groups (the Full diff card) agrees with the status box
 * about which Spaces take a different change. `adds` and `unknown` are kept as
 * they are. Unchanged when fewer than two Spaces could be compared.
 */
export function outcomeByMajority(outcome: ChangeOrderOutcome, propagation: Pick<StagePropagation, 'referenceSpaceId' | 'problems'>): ChangeOrderOutcome {
  const reference = propagation.referenceSpaceId;
  if (reference === null) return outcome;
  const comparable = outcome.groups.filter((g) => g.kind === 'same' || g.kind === 'differs');
  const odd = new Set(problemSpaceIds(propagation.problems));
  const members = comparable.flatMap((g) => g.spaceIds.map((spaceId, i) => ({ spaceId, label: g.labels[i] ?? spaceId })));
  const build = (kind: 'same' | 'differs', list: typeof members) => ({
    kind,
    spaceIds: list.map((m) => m.spaceId),
    labels: list.map((m) => m.label),
    representativeSpaceId: kind === 'same' ? reference : (list[0]?.spaceId ?? ''),
  });
  const same = build('same', members.filter((m) => !odd.has(m.spaceId)));
  const differs = build('differs', members.filter((m) => odd.has(m.spaceId)));
  const rest = outcome.groups.filter((g) => g.kind !== 'same' && g.kind !== 'differs');
  // The partition's own order: differs, adds, unknown, same.
  const groups = [differs, ...rest.filter((g) => g.kind === 'adds'), ...rest.filter((g) => g.kind === 'unknown'), same].filter((g) => g.spaceIds.length > 0);
  return { ...outcome, groups };
}
