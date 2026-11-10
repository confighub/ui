// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A fix made outside the ChangeOrder, after the change arrived: a Revision somebody saved
 * by hand (in the Gates tab, say) on top of the one the promotion wrote.
 *
 * The ChangeOrder does not see it. Its change matrix was read from what the promotion
 * wrote, and a Release of the ChangeOrder bundles the Revision its release Tag marks, which
 * the server moves only for Revisions the resolve processor makes. A fix is adopted only by
 * moving the release Tag to it (`UnitTagRequest.Move`), which is a decision for a person,
 * never automatic. So:
 *
 * - a problem line goes away once the Revision the release Tag marks has the value, which is
 *   what a release publishes, and not before (`withoutFixedProblems`);
 * - while only the head has it, the card offers to move the Tag (`releaseFixOffer`).
 *
 * Pure: no React and no MUI (see `stageTypes.ts`).
 */

import { parseAllDocuments } from 'yaml';

import { problemSpaceIds } from './stageProblems';
import type { PropagationProblem, ResourceRef, SpaceMark, StagePropagation } from './stageTypes';

/** A Unit's head, as the page's read of the stage's Units has it. */
export interface UnitHead {
  unitId: string;
  spaceId: string;
  slug: string;
  headRevisionNum: number;
  lastReleasedRevisionNum: number;
  /** The Revision last released in the Unit's Space, by whatever Release published it. */
  lastReleasedRevisionId?: string;
  /** The head has ValidationErrors: it cannot be released. */
  gated: boolean;
}

/** The fields of a row of the stage's Units read that a head is made of. */
export interface UnitHeadRow {
  Unit?: {
    UnitID?: string;
    SpaceID?: string;
    Slug?: string;
    HeadRevisionNum?: number;
    LastReleasedRevisionNum?: number;
    ValidationErrors?: Record<string, boolean> | null;
  };
  LastReleasedRevision?: { RevisionID?: string } | null;
}

/** A row of the Units read as a head, or `undefined` for one with no id or Space. */
export function unitHeadOf(row: UnitHeadRow): UnitHead | undefined {
  const u = row.Unit;
  if (u?.UnitID === undefined || u.SpaceID === undefined) return undefined;
  const lastReleasedRevisionId = row.LastReleasedRevision?.RevisionID;
  return {
    unitId: u.UnitID,
    spaceId: u.SpaceID,
    slug: u.Slug ?? u.UnitID,
    headRevisionNum: u.HeadRevisionNum ?? 0,
    lastReleasedRevisionNum: u.LastReleasedRevisionNum ?? 0,
    ...(lastReleasedRevisionId ? { lastReleasedRevisionId } : {}),
    gated: Object.keys(u.ValidationErrors ?? {}).length > 0,
  };
}

/** The Revision a ChangeOrder's Tag marks on one Unit. */
export interface TagMark {
  revisionNum: number;
  revisionId: string;
  /** The Revision has ValidationErrors. */
  gated: boolean;
}

/** The marks of a ChangeOrder's release Tag and end Tag, by Unit id. */
export interface ChangeMarks {
  release: ReadonlyMap<string, TagMark>;
  end: ReadonlyMap<string, TagMark>;
}

// ---------------------------------------------------------------------------
// The value a problem says a Space does not have
// ---------------------------------------------------------------------------

function unescapeSegment(text: string): string {
  return text.split('~1').join('.');
}

/**
 * The value at a server `DisplayPath` in one document, or `undefined` when the path does
 * not resolve. Map keys have their dots written `~1`; an element of a merge-keyed list is
 * `?key=value[,key=value]`; any other element is its index.
 */
export function valueAtDisplayPath(doc: unknown, path: string): unknown {
  if (path === '') return undefined;
  let node: unknown = doc;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    if (Array.isArray(node)) {
      if (part.startsWith('?')) {
        const keys = part
          .slice(1)
          .split(',')
          .map((pair) => {
            const at = pair.indexOf('=');
            return at < 0 ? undefined : { key: unescapeSegment(pair.slice(0, at)), value: unescapeSegment(pair.slice(at + 1)) };
          });
        if (keys.some((k) => k === undefined)) return undefined;
        node = node.find(
          (element) =>
            element !== null &&
            typeof element === 'object' &&
            keys.every((k) => k !== undefined && String((element as Record<string, unknown>)[k.key]) === k.value),
        );
      } else {
        if (!/^\d+$/.test(part)) return undefined;
        node = node[Number(part)];
      }
    } else {
      node = (node as Record<string, unknown>)[unescapeSegment(part)];
    }
  }
  return node;
}

/** The documents of a configuration, or `undefined` while it is not read or when it cannot be parsed. */
export function parseDocuments(data: string): unknown[] | undefined {
  if (data === '') return undefined;
  try {
    return parseAllDocuments(data).map((d) => d.toJS() as unknown);
  } catch {
    return undefined;
  }
}

/**
 * Whether a document is the resource: its `apiVersion/kind` is the resource's type and its
 * `metadata.name` its name. The namespace is not compared: variants of one resource can be
 * in different namespaces, and the reference Space's diff may name the resource.
 */
export function isResource(doc: unknown, resource: ResourceRef): boolean {
  if (doc === null || typeof doc !== 'object') return false;
  const d = doc as { apiVersion?: unknown; kind?: unknown; metadata?: { name?: unknown } };
  return `${String(d.apiVersion ?? '')}/${String(d.kind ?? '')}` === resource.type && d.metadata?.name === resource.name;
}

/**
 * Whether the configuration holds `value` at `path` in the resource: the resource is there,
 * the path resolves in it to a scalar, and the scalar is the value. A document is found by
 * its identity, never by its position; were the resource there twice, every copy must hold it.
 */
export function documentsHold(docs: readonly unknown[], resource: ResourceRef, path: string, value: string): boolean {
  if (value === '') return false;
  const own = docs.filter((doc) => isResource(doc, resource));
  if (own.length === 0) return false;
  return own.every((doc) => {
    const at = valueAtDisplayPath(doc, path);
    return at !== undefined && at !== null && typeof at !== 'object' && String(at) === value;
  });
}

interface MissingValue {
  unitId: string;
  resource: ResourceRef;
  path: string;
  value: string;
}

/**
 * The value a problem says the Space does not have, and where: for `differs`, what the
 * reference Space ends with; for `kept`, the value the Space kept out. Undefined for a
 * problem a value does not answer, and for one whose resource the server's diff did not name.
 */
function missingValueOf(problem: PropagationProblem): MissingValue | undefined {
  if (problem.kind === 'differs') {
    if (problem.resource === undefined || problem.refTo === '' || problem.to === problem.refTo) return undefined;
    return { unitId: problem.unitId, resource: problem.resource, path: problem.path, value: problem.refTo };
  }
  if (problem.kind === 'kept') {
    if (problem.resource === undefined || problem.incoming === undefined || problem.incoming === '') return undefined;
    return { unitId: problem.unitId, resource: problem.resource, path: problem.path, value: problem.incoming };
  }
  return undefined;
}

/** Reads each Unit's configuration once, however many problems name the Unit. */
function docsReader(dataOf: (unitId: string) => string): (unitId: string) => unknown[] | undefined {
  const cache = new Map<string, unknown[] | undefined>();
  return (unitId) => {
    if (!cache.has(unitId)) cache.set(unitId, parseDocuments(dataOf(unitId)));
    return cache.get(unitId);
  };
}

/** Whether `docsOf(problem's Unit)` holds what the problem says the Space does not take. */
function problemAnswered(problem: PropagationProblem, docsOf: (unitId: string) => unknown[] | undefined): boolean {
  const missing = missingValueOf(problem);
  if (missing === undefined) return false;
  const docs = docsOf(missing.unitId);
  return docs !== undefined && documentsHold(docs, missing.resource, missing.path, missing.value);
}

// ---------------------------------------------------------------------------
// A problem line the release no longer has
// ---------------------------------------------------------------------------

/**
 * The Revisions of a Unit whose configuration settles a problem line: the one the
 * ChangeOrder's release Tag marks, which a release of the ChangeOrder publishes, and the one
 * the Space last released when that came at or after the change (the end Tag's mark), by any
 * Release, a fix released outside the ChangeOrder too. An earlier release is from before the
 * change and says nothing about it.
 */
export function settlingRevisionIds(unitId: string, head: UnitHead | undefined, marks: ChangeMarks): string[] {
  const ids: string[] = [];
  const release = marks.release.get(unitId);
  if (release !== undefined) ids.push(release.revisionId);
  const end = marks.end.get(unitId);
  const released = head?.lastReleasedRevisionId;
  if (released !== undefined && end !== undefined && head !== undefined && head.lastReleasedRevisionNum >= end.revisionNum && !ids.includes(released)) {
    ids.push(released);
  }
  return ids;
}

/**
 * The problems without those that are fixed where it counts: a configuration that settles
 * the line (`settlingDataOf`, see `settlingRevisionIds`; '' for one not read yet) holds the
 * value the problem says the Space does not take. That is after the release Tag moved to a
 * fix, after the resolve processor moved it, or after the fix was released outside the
 * ChangeOrder. A fix only the head has is not enough: a release would still publish the old
 * value, so the line stays, with the offer to release the fix next to it. The same array
 * when nothing is dropped, so a caller's memo keeps its identity.
 */
export function withoutFixedProblems(
  problems: readonly PropagationProblem[],
  settlingDataOf: (unitId: string) => string | readonly string[],
): readonly PropagationProblem[] {
  const all = (unitId: string): readonly string[] => {
    const data = settlingDataOf(unitId);
    return typeof data === 'string' ? [data] : data;
  };
  const readers = new Map<number, (unitId: string) => unknown[] | undefined>();
  const readerAt = (i: number) => {
    let reader = readers.get(i);
    if (reader === undefined) {
      reader = docsReader((unitId) => all(unitId)[i] ?? '');
      readers.set(i, reader);
    }
    return reader;
  };
  const fixed = (problem: PropagationProblem) => {
    const missing = missingValueOf(problem);
    if (missing === undefined) return false;
    return all(missing.unitId).some((_, i) => problemAnswered(problem, readerAt(i)));
  };
  const kept = problems.filter((p) => !fixed(p));
  return kept.length === problems.length ? problems : kept;
}

const MARK_RANK: Record<PropagationProblem['kind'], number> = { unknown: 0, refused: 1, kept: 2, differs: 3, adds: 4 };

/** A Space's chip from its problems, worst first, as `stagePropagation` gives it. */
function markOf(problems: readonly PropagationProblem[]): SpaceMark | undefined {
  const worst = [...problems].sort((a, b) => MARK_RANK[a.kind] - MARK_RANK[b.kind])[0];
  if (worst === undefined) return undefined;
  switch (worst.kind) {
    case 'unknown':
      return { kind: 'unknown' };
    case 'refused':
      return { kind: 'refuses' };
    case 'kept':
      return { kind: 'keeps', value: worst.valueText, ...(worst.valueText === worst.value ? {} : { title: worst.value }) };
    case 'differs':
      return { kind: 'differs' };
    case 'adds':
      return { kind: 'adds' };
  }
}

/**
 * The propagation with `problems` in place of its own, and the chip of each Space that lost
 * a problem worked out again from what is left: "has the change" when nothing is. The diff
 * sections and the Spaces list then say what the log says.
 */
export function withProblems(propagation: StagePropagation, problems: readonly PropagationProblem[]): StagePropagation {
  if (problems === propagation.problems) return propagation;
  const marks = new Map(propagation.marks);
  const of = (list: readonly PropagationProblem[], spaceId: string) => list.filter((p) => problemSpaceIds([p]).includes(spaceId));
  for (const spaceId of problemSpaceIds(propagation.problems)) {
    const left = of(problems, spaceId);
    if (left.length === of(propagation.problems, spaceId).length) continue;
    // A Space whose lines were all settled has the change now, and the amber line says so.
    marks.set(spaceId, markOf(left) ?? { kind: 'hasIt' });
  }
  return { ...propagation, problems: [...problems], marks };
}

// ---------------------------------------------------------------------------
// A fix the release Tag can move to
// ---------------------------------------------------------------------------

/**
 * Why the server would refuse to move the release Tag to the Unit's head
 * (`CheckReleaseTagMove`, and the move's own rule that the Tag must mark the Unit), or
 * why there is nothing to move:
 *
 * - `notMarked`: the release Tag marks no Revision of the Unit;
 * - `notNewer`: the head is the Revision the Tag marks, or older;
 * - `beforeEnd`: the head is older than the Revision the end Tag marks;
 * - `beforeReleased`: the head is older than the Unit's last released Revision;
 * - `gated`: the head has ValidationErrors.
 *
 * A Release published at the Tag in the Space fixes every mark there; that is asked per
 * Space, in `releaseFixOffer`.
 */
export type MoveRefusal = 'notMarked' | 'notNewer' | 'beforeEnd' | 'beforeReleased' | 'gated';

export function moveRefusal(head: UnitHead, marks: ChangeMarks): MoveRefusal | undefined {
  const mark = marks.release.get(head.unitId);
  if (mark === undefined) return 'notMarked';
  if (head.headRevisionNum <= mark.revisionNum) return 'notNewer';
  const end = marks.end.get(head.unitId);
  if (end !== undefined && head.headRevisionNum < end.revisionNum) return 'beforeEnd';
  if (head.headRevisionNum < head.lastReleasedRevisionNum) return 'beforeReleased';
  if (head.gated) return 'gated';
  return undefined;
}

/** One Unit whose release Tag moves to its head. */
export interface FixUnit {
  unitId: string;
  slug: string;
  /** The Revision the release Tag marks now, which a release would publish. */
  fromRevisionNum: number;
  /** The head, which the Tag moves to. */
  toRevisionNum: number;
  /** `gate`: the marked Revision has ValidationErrors and the head has none. `problem`: the head has a value a problem line says is missing. */
  reason: 'gate' | 'problem';
}

export interface FixSpace {
  spaceId: string;
  units: FixUnit[];
}

/** The fix the card can offer: each Space whose release Tag moves, and its Units. */
export interface ReleaseFix {
  spaces: FixSpace[];
}

export interface ReleaseFixInput {
  /** The Spaces whose release is waiting: failed, or not yet published. */
  spaceIds: readonly string[];
  /** The heads of the Units in those Spaces. */
  heads: readonly UnitHead[];
  marks: ChangeMarks;
  /** Spaces where a Release was published at the release Tag, a withdrawn one too. */
  releasedAtTagSpaceIds: ReadonlySet<string>;
  /** The problem lines the card shows (`withoutFixedProblems`). */
  problems: readonly PropagationProblem[];
  /** A Unit's head configuration; '' while it is read. */
  headDataOf: (unitId: string) => string;
}

/**
 * The fix to offer, or `undefined`. A Unit is part of it when the server would move the
 * release Tag to its head and the head is a fix: it clears a gate the marked Revision has,
 * or it holds a value a problem line says the Space does not take. A Space is offered when
 * it has such a Unit and no gated Unit left behind, since one gated Revision fails the whole
 * release again. Another Unit's later head is somebody's edit that nothing asks for, and
 * adopting it is a separate decision.
 */
export function releaseFixOffer(input: ReleaseFixInput): ReleaseFix | undefined {
  const headDocsOf = docsReader(input.headDataOf);
  const spaces: FixSpace[] = [];
  for (const spaceId of input.spaceIds) {
    if (input.releasedAtTagSpaceIds.has(spaceId)) continue;
    const units: FixUnit[] = [];
    let blocked = false;
    for (const head of input.heads) {
      if (head.spaceId !== spaceId) continue;
      const mark = input.marks.release.get(head.unitId);
      if (mark === undefined) continue;
      const movable = moveRefusal(head, input.marks) === undefined;
      let reason: FixUnit['reason'] | undefined;
      if (mark.gated) {
        if (!movable) {
          blocked = true;
          break;
        }
        reason = 'gate';
      } else if (movable && input.problems.some((p) => p.kind !== 'unknown' && p.spaceId === spaceId && p.unitId === head.unitId && problemAnswered(p, headDocsOf))) {
        reason = 'problem';
      }
      if (reason !== undefined) {
        units.push({ unitId: head.unitId, slug: head.slug, fromRevisionNum: mark.revisionNum, toRevisionNum: head.headRevisionNum, reason });
      }
    }
    if (!blocked && units.length > 0) spaces.push({ spaceId, units });
  }
  return spaces.length === 0 ? undefined : { spaces };
}

/** The same Units, moving between the same Revisions: what a confirm showed is still what is offered. */
export function sameFix(a: ReleaseFix | undefined, b: ReleaseFix | undefined): boolean {
  const key = (fix: ReleaseFix | undefined) =>
    JSON.stringify((fix?.spaces ?? []).map((s) => [s.spaceId, s.units.map((u) => [u.unitId, u.fromRevisionNum, u.toRevisionNum])]));
  return key(a) === key(b);
}

/** Where the offer goes: next to the problem line it answers, when that line shows; else on the release line. */
export function fixOfferPlace(fix: ReleaseFix, problemLineShown: boolean): 'problem' | 'release' {
  const answersProblem = fix.spaces.some((s) => s.units.some((u) => u.reason === 'problem'));
  return answersProblem && problemLineShown ? 'problem' : 'release';
}

export interface MoveRequest {
  unitIds: string[];
  where: string;
  unitTagRequest: { TagID: string; Revision: string; Move: true };
}

/**
 * The bulk tag requests that move the release Tag in one Space, as `cub unit tag
 * ChangeOrder:<slug> --move --revision <n> --space <space> --unit <units>` sends them: one
 * for each Revision number the confirm showed, so a Revision saved since is never adopted
 * unseen. The server refuses a number that is not the Unit's.
 */
export function moveRequestsOf(space: FixSpace, releaseTagId: string): MoveRequest[] {
  const byRevision = new Map<number, string[]>();
  for (const unit of space.units) byRevision.set(unit.toRevisionNum, [...(byRevision.get(unit.toRevisionNum) ?? []), unit.unitId]);
  return [...byRevision].map(([revisionNum, unitIds]) => ({
    unitIds,
    where: `UnitID IN (${unitIds.map((id) => `'${id}'`).join(', ')}) AND SpaceID = '${space.spaceId}'`,
    unitTagRequest: { TagID: releaseTagId, Revision: String(revisionNum), Move: true },
  }));
}

/** One item of a bulk tag answer: the server names the Unit by id in `Message`. */
export interface TagResponseItem {
  Message?: string;
  Error?: { Message?: string };
}

/**
 * What a bulk tag answer says of the Units sent. The answer has one item for each Unit the
 * where clause selected and the person can View, so a Unit that is gone, moved Space, or
 * cannot be seen has no item at all: it counts as not moved, as an error item does.
 */
export function moveOutcome(unitIds: readonly string[], items: readonly TagResponseItem[]): { moved: string[]; errors: string[]; missing: string[] } {
  const moved: string[] = [];
  const errors: string[] = [];
  const missing: string[] = [];
  for (const unitId of unitIds) {
    const own = items.filter((item) => (item.Message ?? '').includes(unitId));
    const failed = own.find((item) => item.Error !== undefined);
    if (failed !== undefined) errors.push(failed.Error?.Message || failed.Message || 'the move was refused');
    else if (own.length > 0) moved.push(unitId);
    else missing.push(unitId);
  }
  // An error item that names no Unit sent still says why something was refused.
  for (const item of items) {
    if (item.Error !== undefined && !unitIds.some((id) => (item.Message ?? '').includes(id))) errors.push(item.Error.Message || item.Message || 'the move was refused');
  }
  return { moved, errors, missing };
}
