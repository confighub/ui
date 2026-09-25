// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The variant matrix: for one rollout stage, how each of its Spaces' incoming
 * change compares to the canonical one, per resource.
 *
 * WHY THIS EXISTS. A stage with 2 Spaces and 4 resources rendered 8 diff
 * sections, and in the common case seven eighths of that is the same change
 * repeated. The divergence is the signal and the repetition is the noise; this
 * regroups the data the pane was already holding so the divergence gets the
 * pixels. Nothing new is fetched — `useRolloutChanges` already returns one
 * `RolloutChangeGroup` per resource across every Space of the selected stage.
 *
 * THE ELEVEN RULES
 * ----------------
 * Five bind the row key, five bind the outcome filter, one binds the payload
 * each of them reads. Each exists because breaking it puts a false statement in
 * front of a reader deciding whether to promote, and each is breakable on its
 * own: a change that protects one rule is free to break another unless it says
 * which. So a change to any of these mechanisms states the rules it protects and
 * the rules it may disturb. A change that cannot say is not ready.
 *
 * Where a rule is not fully met today, it says so under that rule. Read those as
 * the live edges of this file, not as a list of known-acceptable losses.
 *
 * THIS IS THE WHOLE CONTRACT for keying, filtering and reading a payload. It is
 * not the whole contract for the FEATURE: rendering, gates and progress have
 * their own rules stated where they live.
 *
 * THE ROW KEY joins one resource across the variants of a stage.
 *
 * 1. JOIN — two variants' copies of one resource get the same key. Break it and
 *    each variant reads as lacking the other's row, and the outcome reports both
 *    as adding a resource both already hold.
 *    NOT FULLY MET, in three ways. Each is argued where it is taken, and each
 *    names this entry back, so either end of the pair finds the other.
 *
 *    (a) Two variants whose payloads hold genuinely different SETS of documents
 *        key differently and do not join. `Link.WhereResource` selects a subset
 *        for a downstream unit, a protected downstream path refuses an upstream
 *        add, and PostClone triggers can diverge two variants on their first
 *        revision — so the state is reachable by design. 0 occurrences measured
 *        in a real production dataset.
 *
 *    (b) One Space holding two resources under one bare key declines the merge
 *        for EVERY Space, so variants that would otherwise have joined on that
 *        key do not. Argued at the merge, under ONE SPACE CAN DECLINE A MERGE
 *        FOR ALL OF THEM.
 *
 *    (c) Two Spaces each holding two copies under one bare key, whose namespaces
 *        disagree, join on neither of the UNMATCHED copies. They still join on
 *        any copy whose namespace they share. Argued at the merge, under KNOWN
 *        RESIDUAL.
 *
 * 2. SEPARATE — two distinct resources of one Space get different keys. Break it
 *    and one takes the other's row and leaves the grid entirely, so the card
 *    states a verdict over a resource nobody compared. That is worse than any
 *    wrong answer the grid can render, because nothing on screen marks it.
 *
 *    WHERE RULE 2 AND RULE 5 CONFLICT, RULE 2 WINS. Rule 2's last resort keys a
 *    row by its Space-scoped slug, and whether a resource reaches that resort
 *    depends on what else its Space holds — which is a rule 5 violation by
 *    construction. It is taken anyway, on rule 2's own grounds: a wrong answer
 *    is visible and a missing resource is not. The cost is booked against rule 5
 *    below, not waived.
 *
 * 3. MATCH — the same key is derivable from the change as authored at the base.
 *    The outcome filter asks whether the change carries a resource, and it can
 *    only ask that of a key both sides can spell.
 *    NOT FULLY MET: a row that fell to rule 2's last resort is keyed by a
 *    Space-scoped slug, which no authored key can equal. Such a row is filtered
 *    out and its variants read `same`.
 *    A resource is spelled several ways — with and without its namespace, before
 *    and after the change — so a group carries all of them in
 *    `resourceIdentityJoinKeys`. BOTH constructors must set it:
 *    `buildRolloutChangeGroups` for stage groups and the source builder in
 *    `useRolloutConsoleChanges` for the authored change. A carried set built from
 *    groups missing it holds bare spellings alone and silently matches no row
 *    keyed on its namespace, which reads as "the change does not carry this".
 *
 * 4. STABLE — nothing the variant workflow rewrites may decide the key. `cub
 *    variant create --namespace` rewrites every namespace in the units it
 *    clones; `cub unit create --name-prefix` and `--name-pattern` rewrite slugs.
 *    A value a variant is MADE by changing cannot be part of what identifies a
 *    resource across variants. Nor may the list index: two Spaces can hold the
 *    same resources in a different order, and an index-keyed matrix compares a
 *    Deployment against a ConfigMap and calls it divergence.
 *
 * 5. UNIFORM — a resource's key SHAPE must not depend on what else its own Space
 *    holds. Break it and a Space holding two similar copies keys them one way
 *    while a Space holding one keys the same resource another; the two never
 *    join, and both variants are reported as adding a resource neither is
 *    missing. The mismatch is guaranteed precisely when one variant lacks a
 *    member, which is the only case the card exists to detect.
 *    NOT FULLY MET, by rule 2's last resort and only there: reaching the slug
 *    fallback depends on what else the Space holds. Deliberate, and argued under
 *    rule 2. Every other path keys uniformly.
 *
 * THE OUTCOME FILTER decides which rows may speak. Rules 6 to 10, stated in full
 * in `rolloutOutcome.ts` beside the code they bind:
 *
 * 6. Exclude a row only where the change is positively known not to carry it.
 * 7. Never exclude `unknown`.
 * 8. Never infer "not carried" from an absent diff.
 * 9. Unavailable is not empty.
 * 10. Admit a row only for the resource the change carries, not for one that
 *     merely spells the same.
 *
 * THE PAYLOAD is what both mechanisms read. Rule 11, stated in full in
 * `rolloutChanges.ts`:
 *
 * 11. Absent and empty are the same thing, and neither is ever diffed.
 *
 * FOUR CELL STATES, NOT THREE. This codebase does not collapse "we have not
 * looked" into "we looked and found nothing" — see `RolloutProgressAvailability`,
 * `RolloutCarries`, and `stageSettled`'s not-yet-vs-known-no comment. A cell may
 * claim `same` only when BOTH sides are determinable; an undeterminable cell is
 * `unknown`, never `same` and never "unchanged".
 *
 * COLUMNS COME FROM `stage.spaceIds`, NOT FROM WHICH SPACES CONTRIBUTED. A
 * Space of the stage that holds no resources for this ChangeOrder yet
 * contributes no groups and leaves no marker in `useRolloutChanges`'s output
 * (see its assembly loop, which iterates `selectedStage.spaceIds` and pulls
 * whatever exists per Space). Taking the columns from the stage instead means
 * such a Space renders a full column of `new`, which is exactly true of it, and
 * a part-populated stage becomes visible rather than silently averaged away.
 * The COUNTS do not survive it on their own, which is what
 * `contributingSpaceCount` is for: the caller must qualify a resource count as
 * a floor ("3 resources, from 1 of 3 Spaces") whenever `partial` is true, and
 * never present it as the stage's total.
 *
 * Pure, no React, no generated API types — testable by running real inputs
 * through it, the same way every other `rollout*.ts` module is.
 */

import type { RolloutChangeGroup } from './rolloutTypes';

/**
 * How many Spaces a stage needs before "how do its variants compare" is a
 * question at all.
 *
 * Lives here, with the comparison itself, because two surfaces have to agree on
 * it: the overview suppresses the roster and the grid below this, and the pane
 * suppresses the scope line naming which variant its diff belongs to. A stage
 * with one Space has one answer, and every way of saying "and no other variant
 * differs" is noise about a comparison nobody could have made.
 */
export const MIN_COMPARABLE_VARIANTS = 2;

/**
 * How one variant's incoming change for one resource compares to the
 * canonical variant's.
 */
export type RolloutMatrixCellState =
  /** Identical incoming change: same paths, same new values. */
  | 'same'
  /** Same resource, different incoming change. Drills into that variant. */
  | 'differs'
  /**
   * Another variant of this stage holds this resource and this Space does not.
   * A statement about the variants only: nothing here reads what a promote
   * carries, so this cannot say the promote brings the resource in.
   */
  | 'new'
  /** Could not be established this round. Never rendered as "unchanged". */
  | 'unknown';

export interface RolloutMatrixColumn {
  spaceId: string;
  /** Heading: the slug with the stage name's shared prefix removed. */
  label: string;
  /** The whole slug, for the `title` and the accessible label. */
  fullLabel: string;
  /** False when this Space contributed no resources at all (see the file header). */
  contributing: boolean;
}

export interface RolloutMatrixCell {
  spaceId: string;
  state: RolloutMatrixCellState;
}

export interface RolloutMatrixRow {
  /** Resource identity, and the React key. Never a list index. */
  key: string;
  resourceName: string;
  resourceKind?: string;
  /** Changed paths in the reference variant's own incoming change. */
  fieldCount: number;
  /**
   * Does SOME variant of this stage have a changed path for this resource?
   *
   * A PROXY, AND CONSULTED ONLY WHERE THE REAL ANSWER IS UNAVAILABLE. The
   * question a reader cares about is whether the ChangeOrder carries the
   * resource, and this is not that: it can be false for a resource the change
   * carries (every holder already sits at the target value, so no diff remains)
   * and true for one it does not (the dry run reports any drift between a
   * Space's data and the merged result, whatever caused it).
   *
   * `buildRolloutOutcome` therefore prefers the authored change and falls back
   * to this only when no authored identity could be resolved at all — a stage on
   * a format with no resource identity, where the alternative is to filter on
   * nothing and report every variant as taking the change identically.
   *
   * Asked of every contributing Space, not of the reference: a resource the
   * reference leaves alone while another variant changes it is still changed
   * somewhere, and `fieldCount` above reports the reference only.
   */
  changed: boolean;
  /** One per column, in column order. */
  cells: RolloutMatrixCell[];
  /** True when at least one cell reads `differs`. */
  divergent: boolean;
  /** Space ids whose cell reads `differs`, in column order. */
  differingSpaceIds: string[];
  /**
   * The variant this row's cells are measured against — the canonical one,
   * or, for a resource the canonical variant does not hold, the first
   * contributing Space that does.
   */
  referenceSpaceId: string | null;
}

export interface RolloutStageMatrix {
  /** One per Space of the stage, in graph order. */
  columns: RolloutMatrixColumn[];
  rows: RolloutMatrixRow[];
  /**
   * The variant whose diff the pane shows below the matrix: the first Space in
   * `stage.spaceIds` order that ACTUALLY CONTRIBUTED groups.
   *
   * Restricting to contributing Spaces is load-bearing, not tidiness. Raw graph
   * order is a real defect: if the first Space of a part-populated stage is one
   * of the unpopulated ones, the canonical variant has no resources and the
   * diff tree renders empty directly beneath a matrix showing another Space's
   * real content.
   */
  canonicalSpaceId: string | null;
  /** How many of the stage's Spaces contributed any resource at all. */
  contributingSpaceCount: number;
  /** True when some Space of the stage contributed nothing — qualify every count. */
  partial: boolean;
  /** Rows with at least one `differs` cell. Zero means the grid has nothing to report. */
  divergentRowCount: number;
  /** Space id -> how many of its resources differ from the canonical variant. */
  differsCountBySpaceId: ReadonlyMap<string, number>;
  /**
   * Spaces holding a resource that could be neither read nor identified, and so
   * has no row of its own (see the row-key loop).
   *
   * The caller must read these as `unknown`. Without it the resource leaves no
   * trace at all and the Space reads as though everything about it was checked.
   */
  unreadableSpaceIds: ReadonlySet<string>;
  /**
   * Groups DROPPED because their own Space could not be resolved.
   *
   * ⚠️ THE DROP IS RIGHT AND THE SILENCE WAS NOT. A group assigned to a guessed
   * column would read as that variant's change, which is worse than omitting
   * it. But `contributingSpaceCount` and `partial` are both computed AFTER this
   * point, so a Space whose groups were all dropped is indistinguishable from
   * one that genuinely contributed nothing — and the caller is instructed to
   * qualify its counts as a floor on exactly that signal.
   *
   * Non-zero means the counts below describe less than was asked about.
   */
  unresolvedGroupCount: number;
  /**
   * Bare keys the stage could not collapse onto one row, because some Space
   * holds more than one resource under them.
   *
   * Those rows keep their namespaces and so do not join across variants. The
   * comparison DECLINED rather than found a difference, and a reader shown the
   * split without being told would read it as a difference.
   */
  mergeDeclinedCount: number;
  /**
   * Resources whose NAMESPACED identity did not separate them from a sibling of
   * their own Space, and which were therefore keyed by identity PLUS slug.
   *
   * Needs the same kind, the same name AND the same namespace inside one Space,
   * so a non-zero count reports a genuine clash in the configuration rather than
   * a shortcoming of the key.
   *
   * NOT AN OMISSION. Each one keeps a row of its own, so nothing leaves the
   * comparison; a caller must not report these as resources it did not cover.
   * What it does mean is that those rows carry a Space-scoped slug in their key,
   * so they join no other variant and match no authored key.
   */
  duplicateIdentityCount: number;
  resourceCount: number;
  /** Changed paths across every row, taken from each row's reference variant. */
  totalFieldCount: number;
  /**
   * Which row each group landed on.
   *
   * The ONLY way to ask that question. `rolloutMatrixRowKey` answers what a
   * group's identity spells, not which row it reached — merging and the
   * fallbacks can send it elsewhere — so a caller recomputing the key silently
   * looks up a row that does not exist and renders nothing.
   */
  rowKeyByUnitId: ReadonlyMap<string, string>;
}

export interface BuildStageMatrixInput {
  /** The selected stage's groups — every Space's resources (see `useRolloutChanges`). */
  groups: readonly RolloutChangeGroup[];
  /** Every Space of the stage, in graph order. The matrix's columns. */
  spaceIds: readonly string[];
  /** Unit id -> the Space that unit lives in. A group whose Space is unknown is skipped. */
  spaceIdByUnitId: ReadonlyMap<string, string>;
  spaceNameBySpaceId: ReadonlyMap<string, string>;
  /** The stage's own name. Used only to shorten the column headings. */
  stageId: string;
}

/**
 * The row a group belongs to.
 *
 * `resourceIdentity` is read from the configuration, so two variants holding one
 * resource land on one row whatever each Space calls it. That is the whole job
 * of this key.
 *
 * The slug is the fallback, and only for a payload that carries no identity at
 * all — a format with no such concept, or data that could not be read. The
 * fallback is safe where every variant falls back the same way, which is what a
 * whole stage on one such format does. It is NOT safe to compare against a row
 * that did resolve an identity, so `buildStageMatrix` never reports a variant as
 * lacking a row whose reference could not be read.
 *
 * JSON rather than a delimiter join, because a resource name can contain any
 * character at all: `a-b` + kind `c` and name `a` + kind `b-c` must not collide
 * on one row, which is exactly the sort of quiet mis-join this key exists to
 * prevent. Treated as opaque everywhere — built here, compared here, never
 * parsed back apart.
 */
export function rolloutMatrixRowKey(group: RolloutChangeGroup): string {
  return group.resourceIdentity ?? JSON.stringify([group.resourceName, group.resourceKind ?? null]);
}

/**
 * What makes two incoming changes "the same change".
 *
 * Path and NEW value only. The old value is deliberately excluded: two variants
 * that arrive at the same value from different starting points ARE taking the
 * same change, and flagging that as divergence would report a difference in
 * where they were, not in what the promote does to them.
 *
 * Sorted, because `fieldDiffs` order follows each Space's own document order,
 * and two Spaces can legitimately hold the same paths in a different sequence.
 */
function diffSignature(group: RolloutChangeGroup): string {
  return group.fieldDiffs
    .map((diff) => JSON.stringify([diff.path, diff.newValue]))
    .sort()
    .join('');
}

/** What counts as a segment break in a Space slug. */
const SLUG_DELIMITERS = new Set(['-', '_', '.', '/']);

function isSegmentBoundary(char: string | undefined): boolean {
  return char === undefined || SLUG_DELIMITERS.has(char);
}

/**
 * `…-prod-us-east` in the `prod` stage becomes `us-east`, which is what makes a
 * column legible in 60px.
 *
 * THE STAGE SEGMENT IS USUALLY IN THE MIDDLE, NOT AT THE FRONT. Real Spaces are
 * named `<component>-<stage>-<variant>`
 * (`e2e-rollout-swift-piano-prod-us-east`), so an earlier prefix-only version of
 * this never fired on a real slug at all — every heading rendered at full length
 * and pushed the grid off the side of the pane.
 *
 * Matched as a delimited SEGMENT, so `prod` does not match inside `myprodx`,
 * and by scanning rather than by building a `RegExp`: a stage id is a label
 * value the user chose and can contain `.`, `+`, `(` or anything else, which
 * would be metacharacters in a pattern.
 *
 * Takes the LAST qualifying occurrence. A component whose own name contains the
 * stage word (`prod-tools` in stage `prod`, giving `prod-tools-prod-us-east`)
 * would otherwise shorten to `tools-prod-us-east` — technically a match, and the
 * wrong one.
 *
 * Falls back to the whole slug when there is no segment match or nothing after
 * it: guessing further would truncate something meaningful, and the caller caps
 * the heading's width with an ellipsis and keeps the whole value in `title`, so
 * a long fallback costs legibility rather than information.
 */
export function shortenVariantLabel(slug: string, stageId: string): string {
  if (stageId.length === 0) return slug;

  let shortened: string | null = null;
  for (let from = 0; ; ) {
    const at = slug.indexOf(stageId, from);
    if (at === -1) break;
    from = at + 1;

    const end = at + stageId.length;
    const startsSegment = isSegmentBoundary(at === 0 ? undefined : slug[at - 1]);
    const endsSegment = isSegmentBoundary(end >= slug.length ? undefined : slug[end]);
    if (!startsSegment || !endsSegment) continue;

    const rest = slug.slice(end).replace(/^[-_./]+/, '');
    if (rest.length > 0) shortened = rest;
  }

  return shortened ?? slug;
}

export function buildStageMatrix(input: BuildStageMatrixInput): RolloutStageMatrix {
  const { groups, spaceIds, spaceIdByUnitId, spaceNameBySpaceId, stageId } = input;

  // Space -> resource identity -> that Space's group for it. A group whose own
  // Space cannot be resolved is dropped rather than assigned to a guess: it
  // would otherwise land in some column and read as that variant's change.
  const groupsBySpaceId = new Map<string, Map<string, RolloutChangeGroup>>();
  const rowOrderBySpaceId = new Map<string, string[]>();
  let unresolvedGroupCount = 0;
  let duplicateIdentityCount = 0;
  let mergeDeclinedCount = 0;

  /*
   * Each group's row key, decided in a pass of its own.
   *
   * ONE SHAPE FOR EVERY RESOURCE. The key is the identity WITH the namespace,
   * always. Nothing here asks what else a Space holds, and that is the point:
   * deciding the shape per Space made a resource's key depend on whether some
   * sibling happened to collide with it, so a Space holding two copies keyed
   * them one way while a Space holding one keyed the same resource another, the
   * two never joined, and both variants were reported as adding a resource
   * neither was missing.
   *
   * THEN MERGE, symmetrically. Keeping the namespace would split the variants
   * the page exists to compare, because `cub variant create --namespace`
   * rewrites it by design. So two Spaces' rows collapse onto the namespace-free
   * key when each contributing Space holds AT MOST ONE row under it — the
   * condition that makes the join unambiguous. Counting decides it, both sides
   * are weighed alike, and neither is privileged, so the merge cannot invert a
   * verdict whichever order the Spaces or their resources arrive in.
   *
   * WHERE IT DECLINES IT IS SAYING SO HONESTLY. A Space holding `prod/api` and
   * `staging/api` has two rows under `api`, so nothing merges and both keep
   * their namespaces — which is right: a variant holding only one of them is
   * genuinely missing the other, and that is the news the card carries.
   *
   * ONE SPACE CAN DECLINE A MERGE FOR ALL OF THEM — rule 1 (JOIN) entry (b).
   * A third Space holding two copies under a bare key stops two OTHER Spaces
   * joining on it, because the decision is global. That is deliberate: a
   * per-pair merge is a per-Space decision wearing a different hat, and it is
   * what this design removes.
   *
   * What the reader is then told depends on the counts, not on the decline: a
   * variant holding fewer copies than the most any variant holds is short one
   * however the copies map, and reads as adding a resource; a variant holding as
   * many is short of nothing and reads as undeterminable. `mergeDeclinedCount`
   * reports the decline itself, so neither reading is left to look like a
   * difference the comparison found.
   *
   * A MERGE CAN JOIN TWO RESOURCES THAT ARE NOT THE SAME — `Deployment/api` in
   * namespace `app` and in namespace `billing`, in two Spaces, are joined even
   * where they are unrelated workloads that happen to share a name. Nothing in
   * the configuration separates "one resource under a rewritten namespace" from
   * "two resources sharing a name", so this is a trade rather than a defect. It
   * runs in the benign direction: a false join shows as `differs` on every
   * field, which a reader sees and can investigate. The harmful direction — a
   * false `same` — needs the two to carry identical field diffs as well.
   *
   * KNOWN RESIDUAL — rule 1 (JOIN) entry (c). Where TWO Spaces each hold two
   * copies under one bare key and
   * the copies do not agree — `prod/api` + `staging/api` against `dev/api` +
   * `staging/api` — the merge declines on both sides and neither variant joins
   * on the unmatched copies. Both then read as undeterminable: each holds as
   * many copies as the other, so neither is short of anything, and nothing in
   * the configuration says whether `prod/api` and `dev/api` are one resource
   * renamed or two resources. The Space's `Namespace` label could say, and it is
   * optional and often absent.
   * Measured occurrences in a real production dataset: 0.
   */
  const rowKeyByUnitId = new Map<string, string>();
  /*
   * Rows under a bare key the stage could not collapse.
   *
   * A variant absent from such a row may hold the resource under a namespace we
   * declined to reconcile, so "this variant does not hold it" is a claim the
   * comparison did not make. Rule 7: a thing we could not establish is reported
   * as `unknown`, never rendered as a verdict.
   */
  const declinedRowKeys = new Set<string>();
  const declinedBareKeys = new Set<string>();
  /** Space -> bare key -> the row keys that Space holds under it. */
  const rowKeysByBareBySpace = new Map<string, Map<string, Set<string>>>();
  /** Row key -> the bare key it came from, for the rows a decline touched. */
  const bareKeyByRowKey = new Map<string, string>();
  /** Bare key -> the most rows any one Space holds under it. */
  const maxRowsUnderBare = new Map<string, number>();
  {
    // The identity WITHOUT the namespace, which is what a merge collapses onto.
    // A payload with no identity at all has only its slug, and merging it would
    // join two Spaces' unrelated resources, so it never participates.
    const bareKeyOf = (group: RolloutChangeGroup): string | undefined =>
      group.resourceIdentity;
    const primaryKeyOf = (group: RolloutChangeGroup): string =>
      group.resourceIdentityNamespaced ?? rolloutMatrixRowKey(group);

    /*
     * GROUPS under each bare key, not distinct identities under it. Counting
     * identities lets two resources that share one collapse onto a single merged
     * row, where the second silently takes the first's place and leaves the grid
     * — the failure the slug fallback below exists to prevent. One row per Space
     * is the condition, so one GROUP per Space is what has to be counted.
     */
    const groupsPerBareBySpace = new Map<string, Map<string, number>>();
    for (const group of groups) {
      const spaceId = spaceIdByUnitId.get(group.unitId);
      const bare = bareKeyOf(group);
      if (spaceId === undefined || bare === undefined) continue;
      const byBare = groupsPerBareBySpace.get(spaceId) ?? new Map<string, number>();
      byBare.set(bare, (byBare.get(bare) ?? 0) + 1);
      groupsPerBareBySpace.set(spaceId, byBare);
    }

    /*
     * ONE GLOBAL PASS, over every Space of the stage at once.
     *
     * The merge is the one place that asks what a Space holds, and it is
     * tolerable only because it is a SINGLE decision about a set of rows rather
     * than a decision each Space makes for itself. Evaluated per Space and
     * combined pairwise, two Spaces would reach different answers about the same
     * resource and stop joining — the very failure uniform keying removes.
     */
    const mergeableBareKeys = new Set<string>();
    for (const byBare of groupsPerBareBySpace.values()) {
      for (const bare of byBare.keys()) mergeableBareKeys.add(bare);
    }
    for (const byBare of groupsPerBareBySpace.values()) {
      for (const [bare, count] of byBare) {
        if (count > 1 && mergeableBareKeys.delete(bare)) {
          mergeDeclinedCount += 1;
          declinedBareKeys.add(bare);
        }
      }
    }

    /*
     * Two resources of one Space whose namespaced identities are IDENTICAL.
     * Nothing in the configuration can tell them apart, so the Space-scoped slug
     * is the last resort — it joins nothing and matches no authored key, which
     * costs those rows their place in the outcome, but losing the resource from
     * the grid altogether is worse. Unreachable where the namespace separates
     * them, which is why the merge collapses onto the bare key rather than
     * keying on it: 0 occurrences in a real production dataset.
     *
     * Applied to BOTH members, never to the later arrival alone, so the answer
     * does not turn on the order the groups are listed in.
     */
    const contestedPrimaries = new Map<string, Set<string>>();
    {
      const seen = new Map<string, Set<string>>();
      for (const group of groups) {
        const spaceId = spaceIdByUnitId.get(group.unitId);
        if (spaceId === undefined) continue;
        const primary = primaryKeyOf(group);
        const once = seen.get(spaceId) ?? new Set<string>();
        if (once.has(primary)) {
          const contested = contestedPrimaries.get(spaceId) ?? new Set<string>();
          contested.add(primary);
          contestedPrimaries.set(spaceId, contested);
        }
        once.add(primary);
        seen.set(spaceId, once);
      }
    }

    for (const group of groups) {
      const spaceId = spaceIdByUnitId.get(group.unitId);
      const bare = bareKeyOf(group);
      if (bare !== undefined && mergeableBareKeys.has(bare)) {
        // Merging requires one row per Space under this key, so nothing can
        // collide here.
        rowKeyByUnitId.set(group.unitId, bare);
        continue;
      }
      const primary = primaryKeyOf(group);
      if (spaceId !== undefined && contestedPrimaries.get(spaceId)?.has(primary) === true) {
        duplicateIdentityCount += 1;
        rowKeyByUnitId.set(group.unitId, JSON.stringify([primary, group.resourceName]));
        continue;
      }
      rowKeyByUnitId.set(group.unitId, primary);
    }

    for (const group of groups) {
      const spaceId = spaceIdByUnitId.get(group.unitId);
      const bare = bareKeyOf(group);
      const key = rowKeyByUnitId.get(group.unitId);
      if (spaceId === undefined || bare === undefined || key === undefined) continue;
      const byBare = rowKeysByBareBySpace.get(spaceId) ?? new Map<string, Set<string>>();
      const keys = byBare.get(bare) ?? new Set<string>();
      keys.add(key);
      byBare.set(bare, keys);
      rowKeysByBareBySpace.set(spaceId, byBare);
      maxRowsUnderBare.set(bare, Math.max(maxRowsUnderBare.get(bare) ?? 0, keys.size));
      if (declinedBareKeys.has(bare)) {
        declinedRowKeys.add(key);
        bareKeyByRowKey.set(key, bare);
      }
    }
  }

  /*
   * Is this Space's absence from a declined row a real shortfall, or an artifact
   * of the decline?
   *
   * It is real where the Space holds FEWER copies under that bare key than the
   * MOST any variant holds: however the copies map to each other, one of them
   * has no partner, so the shortfall survives the decline. It is an artifact
   * where the Space holds as many as anyone, because then it may hold this very
   * resource under a namespace nobody reconciled, and "does not hold it" is a
   * claim the comparison declined to make.
   *
   * MEASURED AGAINST THE MAXIMUM, NOT AGAINST THE ROW'S REFERENCE. The reference
   * is whichever Space contributed first, so comparing against it made an absent
   * Space's verdict turn on the order the Spaces are listed in — the defect class
   * that has cost this file more than any other. A maximum over the contributing
   * Spaces names no Space and has no order.
   *
   * Suppressing every absence under a declined key would be the easier rule and
   * the wrong one: it hides a variant that genuinely holds one fewer copy, which
   * is the case this grid exists to report.
   */
  const absenceIsRealShortfall = (spaceId: string, rowKey: string): boolean => {
    const bare = bareKeyByRowKey.get(rowKey);
    if (bare === undefined) return false;
    const mine = rowKeysByBareBySpace.get(spaceId)?.get(bare)?.size ?? 0;
    return mine < (maxRowsUnderBare.get(bare) ?? 0);
  };

  for (const group of groups) {
    const spaceId = spaceIdByUnitId.get(group.unitId);
    if (spaceId === undefined) {
      unresolvedGroupCount += 1;
      continue;
    }
    let byKey = groupsBySpaceId.get(spaceId);
    if (byKey === undefined) {
      byKey = new Map();
      groupsBySpaceId.set(spaceId, byKey);
      rowOrderBySpaceId.set(spaceId, []);
    }
    const key = rowKeyByUnitId.get(group.unitId) ?? rolloutMatrixRowKey(group);
    /*
     * Same namespaced identity AND same slug. Unreachable while a slug is unique
     * within its Space, which it is — kept as a guard rather than as working
     * code, because the alternative to a guard here is a silent overwrite, and a
     * resource that leaves the grid takes the card's verdict with it.
     */
    if (byKey.has(key)) continue;
    byKey.set(key, group);
    rowOrderBySpaceId.get(spaceId)?.push(key);
  }

  const contributingSpaceIds = spaceIds.filter((id) => (groupsBySpaceId.get(id)?.size ?? 0) > 0);

  /*
   * Which kinds of key each Space built.
   *
   * A row keyed on resolved identity and a row keyed on the slug fallback CANNOT
   * be compared: the same resource held as Kubernetes YAML in one Space and as a
   * properties file in another resolves an identity on one side only, so the two
   * land on different rows and each Space reads as lacking the other's. Absence
   * is only evidence of absence when the Space could not have filed the resource
   * under the other kind of key.
   *
   * Tracked per Space rather than per stage so a stage that mixes formats keeps
   * reporting honest absence everywhere the mixture cannot reach — a Space with
   * no fallback-keyed group of its own is genuinely missing an identity row.
   */
  const identityKeyedSpaceIds = new Set<string>();
  const fallbackKeyedSpaceIds = new Set<string>();
  for (const [spaceId, byKey] of groupsBySpaceId) {
    for (const group of byKey.values()) {
      if (group.resourceIdentity === undefined) fallbackKeyedSpaceIds.add(spaceId);
      else identityKeyedSpaceIds.add(spaceId);
    }
  }
  const canonicalSpaceId = contributingSpaceIds[0] ?? null;

  const columns: RolloutMatrixColumn[] = spaceIds.map((spaceId) => {
    const slug = spaceNameBySpaceId.get(spaceId) ?? spaceId;
    return {
      spaceId,
      label: shortenVariantLabel(slug, stageId),
      fullLabel: slug,
      contributing: (groupsBySpaceId.get(spaceId)?.size ?? 0) > 0,
    };
  });

  // Row order: the canonical variant's own resource order first (it is the
  // first contributing Space, so its keys come first), then any resource only a
  // later Space holds. A resource nobody but the third Space carries is still a
  // row — omitting it would hide exactly the divergence this exists to show.
  const unreadableSpaceIds = new Set<string>();
  const rowKeys: string[] = [];
  const seenRowKeys = new Set<string>();
  for (const spaceId of spaceIds) {
    for (const key of rowOrderBySpaceId.get(spaceId) ?? []) {
      if (seenRowKeys.has(key)) continue;
      /*
       * A group that is BOTH unreadable and unidentifiable earns no row of its
       * own. Its key is the slug, so it cannot be joined to the identity row the
       * same resource occupies elsewhere, and giving it a row renders the
       * resource a second time under a heading that is all `unknown`. The reader
       * sees one resource name twice and no extra fact.
       *
       * Dropping the ROW does not drop the news: the Space still reads `unknown`
       * through `unreadableSpaceIds` below, which is the whole of what such a
       * group establishes.
       */
      const holders = contributingSpaceIds.filter((id) => groupsBySpaceId.get(id)?.has(key) === true);
      const phantom = holders.every((id) => {
        const g = groupsBySpaceId.get(id)?.get(key);
        return g !== undefined && !g.determinable && g.resourceIdentity === undefined;
      });
      if (phantom) {
        for (const id of holders) unreadableSpaceIds.add(id);
        continue;
      }
      seenRowKeys.add(key);
      rowKeys.push(key);
    }
  }

  const differsCountBySpaceId = new Map<string, number>();
  let divergentRowCount = 0;
  let totalFieldCount = 0;

  const rows: RolloutMatrixRow[] = rowKeys.map((key) => {
    // Reference for THIS row: the canonical variant when it holds the resource,
    // otherwise the first contributing Space that does. Without the fallback a
    // resource the canonical variant lacks would have nothing to compare
    // against, and every other variant's real change would read as `new`.
    const referenceSpaceId =
      canonicalSpaceId !== null && groupsBySpaceId.get(canonicalSpaceId)?.has(key) === true
        ? canonicalSpaceId
        : contributingSpaceIds.find((id) => groupsBySpaceId.get(id)?.has(key) === true) ?? null;

    const reference =
      referenceSpaceId === null ? undefined : groupsBySpaceId.get(referenceSpaceId)?.get(key);
    const referenceSignature =
      reference !== undefined && reference.determinable ? diffSignature(reference) : null;
    const referenceKeyedByIdentity = reference?.resourceIdentity !== undefined;

    const differingSpaceIds: string[] = [];
    const cells: RolloutMatrixCell[] = columns.map((column) => {
      const group = groupsBySpaceId.get(column.spaceId)?.get(key);
      // A row whose reference could not be read supports NO claim about any
      // variant, including a variant that holds nothing under this key. Saying
      // "this variant does not hold it" needs to know what "it" is, and here we
      // do not. This test comes before the absence test for that reason: the
      // other order reports the absence as `new`, and the outcome bar then tells
      // the reader a variant lacks a resource nobody established.
      if (referenceSignature === null) return { spaceId: column.spaceId, state: 'unknown' };
      if (group === undefined) {
        // Could this Space be holding the resource under the OTHER kind of key?
        // If so its absence here proves nothing, and `new` would report a
        // missing resource that the Space holds under a name we could not join.
        const couldBeFiledElsewhere = referenceKeyedByIdentity
          ? fallbackKeyedSpaceIds.has(column.spaceId)
          : identityKeyedSpaceIds.has(column.spaceId);
        const declinedAndUnmatched =
          declinedRowKeys.has(key)
          && !absenceIsRealShortfall(column.spaceId, key);
        return {
          spaceId: column.spaceId,
          state: couldBeFiledElsewhere || declinedAndUnmatched ? 'unknown' : 'new',
        };
      }
      // `same` requires BOTH sides determinable. An undetermined group on
      // either side is `unknown` — the honest answer, and never a quiet `same`.
      if (!group.determinable) {
        return { spaceId: column.spaceId, state: 'unknown' };
      }
      if (column.spaceId === referenceSpaceId) return { spaceId: column.spaceId, state: 'same' };
      if (diffSignature(group) === referenceSignature) {
        return { spaceId: column.spaceId, state: 'same' };
      }
      differingSpaceIds.push(column.spaceId);
      differsCountBySpaceId.set(
        column.spaceId,
        (differsCountBySpaceId.get(column.spaceId) ?? 0) + 1,
      );
      return { spaceId: column.spaceId, state: 'differs' };
    });

    const fieldCount = reference?.fieldDiffs.length ?? 0;
    totalFieldCount += fieldCount;
    const changed = contributingSpaceIds.some(
      (id) => (groupsBySpaceId.get(id)?.get(key)?.fieldDiffs.length ?? 0) > 0,
    );
    if (differingSpaceIds.length > 0) divergentRowCount += 1;

    return {
      key,
      // Every row key came from a real group, so `reference` is only ever
      // absent if no contributing Space holds the row — unreachable, since the
      // key list is built from the contributing Spaces themselves.
      resourceName: reference?.resourceName ?? '',
      resourceKind: reference?.resourceKind,
      fieldCount,
      changed,
      cells,
      divergent: differingSpaceIds.length > 0,
      differingSpaceIds,
      referenceSpaceId,
    };
  });

  return {
    columns,
    rows,
    canonicalSpaceId,
    contributingSpaceCount: contributingSpaceIds.length,
    partial: contributingSpaceIds.length > 0 && contributingSpaceIds.length < spaceIds.length,
    divergentRowCount,
    differsCountBySpaceId,
    unreadableSpaceIds,
    unresolvedGroupCount,
    duplicateIdentityCount,
    mergeDeclinedCount,
    resourceCount: rows.length,
    totalFieldCount,
    rowKeyByUnitId,
  };
}
