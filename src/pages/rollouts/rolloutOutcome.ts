// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How a stage's variants come out, grouped — the outcome bar and the group cards
 * beneath it, derived once.
 *
 * ⚠️ THE BAR AND THE CARDS ARE TWO VIEWS OF ONE QUANTITY, AND THEY AGREE BY
 * CONSTRUCTION RATHER THAN BY ARITHMETIC. `groups` below IS the partition: the
 * bar renders each group's `spaceIds.length` as a segment width and the cards
 * render the same array as members, so there is no second count to keep in step.
 *
 * That is not tidiness. `ui-verification-measure-the-thing-not-its-container.md`
 * records a case where two numbers that should have agreed did not, and the
 * "fix" put an incorrect number on the exact control gating the terminal action.
 * This bar sits directly above a promote decision, so the quantity is defined
 * once, partitioned exhaustively, and `assertPartition` proves the segments sum
 * to the variant count instead of anyone summing one to match the other.
 *
 * EVERY VARIANT LANDS IN EXACTLY ONE GROUP, by precedence. The order is
 * deliberate and runs worst-news-first: a variant that is both undeterminable
 * and divergent is reported as undeterminable, because the divergence claim is
 * one we cannot stand behind for it.
 *
 * RULES 6 TO 10 BIND THIS FILE. Rules 1 to 5 bind the row key and rule 11 the
 * payload; all eleven are listed in `rolloutMatrix.ts`'s header, because the key
 * and the filter are one mechanism seen from two ends — a key that cannot be
 * matched and a filter that excludes on a guess put the same false statement on
 * screen. A change here names the rules it protects and the rules it may
 * disturb.
 *
 * 6. EXCLUDE A ROW ONLY WHERE THE CHANGE IS POSITIVELY KNOWN NOT TO CARRY IT.
 *    Anything weaker excludes rows on a guess, and an excluded row cannot raise
 *    the alarm it exists to raise.
 *
 * 7. NEVER EXCLUDE `unknown`. A resource nobody could read has no diffs, so it
 *    looks untouched whatever it really is; excluding it reports `same`, which
 *    asserts the change leaves the variant alone — the one thing missing data
 *    cannot establish.
 *
 * 8. NEVER INFER "NOT CARRIED" FROM AN ABSENT DIFF. Diffs go empty as soon as
 *    every holder already sits at the target value, and the dry run reports any
 *    drift as a diff whatever caused it, so the signal is unsound in both
 *    directions.
 *
 * 9. UNAVAILABLE IS NOT EMPTY. "We have not read the authored change" and "the
 *    change carries nothing" are different claims, and collapsing them silences
 *    every row on the strength of data nobody fetched.
 *
 * 10. ADMIT A ROW ONLY FOR THE RESOURCE THE CHANGE CARRIES, NOT FOR ONE THAT
 *     MERELY SPELLS THE SAME. Rules 6 to 9 all guard against wrongly EXCLUDING a
 *     row; this one guards the other direction, and the other direction has its
 *     own failures. A variant told it is "adding" a resource the promote does
 *     not bring is warned about work nobody asked for, and a reader who follows
 *     one such warning trusts the next one less.
 *     NOT FULLY MET: a resource is carried under every spelling of its identity,
 *     and the namespace-free spelling is shared by every resource of that kind
 *     and name in any namespace. So a change carrying `prod/api` also admits a
 *     row for `staging/api` wherever that row merged onto the bare key. The
 *     breadth is deliberate — see `resourceIdentityJoinKeysOf` — because the
 *     opposite error silences a row instead of letting it state its case. It is
 *     a cost taken knowingly, not a rule satisfied.
 *
 * FOUR OUTCOMES, NOT THREE. `unknown` is never folded into `same`. The whole
 * codebase refuses that collapse — see `RolloutProgressAvailability`,
 * `RolloutCarries`, and `rolloutMatrix.ts`'s own "FOUR CELL STATES, NOT THREE" —
 * because "we looked and it matches" and "we could not look" are different
 * claims and only one of them is reassuring.
 */

import type { RolloutStageMatrix } from '../x/apps/rollout/rolloutMatrix';
import type { RolloutChangeGroup } from '../x/apps/rollout/rolloutTypes';

export type RolloutOutcomeKind = 'same' | 'differs' | 'adds' | 'unknown';

export interface RolloutOutcomeGroup {
  kind: RolloutOutcomeKind;
  /** Variants in this group, in column order. The cards' members AND the bar's width. */
  spaceIds: string[];
  labels: string[];
  /**
   * The one variant whose tree the group renders.
   *
   * A group's members take the SAME change by construction, so rendering all of
   * them would repeat one diff N times — which is the complaint this whole
   * grouping exists to answer. The canonical variant is preferred where it is a
   * member, so the card and the matrix agree on which variant is the reference.
   */
  representativeSpaceId: string;
}

export interface RolloutOutcome {
  groups: RolloutOutcomeGroup[];
  /** Total variants partitioned — the denominator every segment is a fraction of. */
  variantCount: number;
  /**
   * True when the stage has too few variants for "how do they compare" to be a
   * question at all. `MIN_COMPARABLE_VARIANTS` lives with the comparison itself
   * so every surface suppressing a comparison agrees on when to.
   */
  tooFewToCompare: boolean;
  /**
   * True when some Space of the stage contributed nothing, so every count here
   * is a floor rather than the stage's total. The caller MUST qualify counts
   * when this is set — presenting a partial count as the whole is exactly the
   * failure `rolloutMatrix.ts` introduced `contributingSpaceCount` to prevent.
   */
  partial: boolean;
}

const ORDER: RolloutOutcomeKind[] = ['differs', 'adds', 'unknown', 'same'];

/**
 * Which single group a variant belongs to.
 *
 * WHAT THE CHANGE CARRIES IS THE ONLY SOUND ANSWER, AND A STAGE ROW'S OWN DIFFS
 * ARE NOT IT. A diff is a proxy for "the ChangeOrder touches this resource", and
 * it is neither necessary nor sufficient.
 *
 * Not necessary: every diff goes empty once each holder already sits at the
 * target value — a hand edit, or an earlier ChangeOrder that set it — and a
 * variant that does not hold the resource at all would then read as taking the
 * change identically. That false all-clear is reachable in ordinary use.
 *
 * Not sufficient: the dry run computes a merged result, so ANY drift between a
 * Space's data and that result shows as a diff whatever caused it. A resource
 * the ChangeOrder never mentions can carry one, and a variant lacking that
 * resource is then warned it is "adding" something the change does not bring —
 * the very class of error this filter exists to remove.
 *
 * So the filter reads `carriedResourceKeys`, taken from the change as authored
 * at the base and stage-invariant by construction.
 *
 * A PARTIALLY IDENTIFIED STAGE SILENCES ITS UNIDENTIFIED HALF. One resource
 * resolving an identity makes the set non-null, and every resource that resolved
 * none then matches nothing in it and is filtered out. A stage mixing Kubernetes
 * units with ini or properties units therefore reports only on the Kubernetes
 * ones. Narrower than the all-unidentified case below, which `null` covers, and
 * not closed: the two halves would need separate treatment, not a single flag.
 *
 * `null` MEANS "WE COULD NOT ESTABLISH WHAT THE CHANGE CARRIES", NOT "IT CARRIES
 * NOTHING". An empty set is the second claim and silences every row, so the two
 * must never be collapsed: a stage on a format with no resource identity — ini,
 * properties, toml, env — resolves no key for anything it carries, and reading
 * that as "carries nothing" reports every such stage as taking the change
 * identically however far its variants have diverged.
 *
 * Where the authored change is unavailable the filter falls back to
 * `row.changed`. That proxy is unsound in both directions (see its own doc) and
 * is never preferred to the real answer — but filtering on nothing at all is
 * worse, because it puts variants back in `adds` for holding different furniture
 * the promote never mentions, which is the complaint this filter exists to
 * answer.
 *
 * ONLY THE RESOURCES THIS CHANGE TOUCHES DECIDE THIS. Two variants of a stage
 * can legitimately hold different resources — a Space with its own database, a
 * Space with an extra cache — and a promote that mentions neither has nothing to
 * say about them. Weighing those resources put variants in `adds` for holding
 * different furniture, which reads as a warning about a promote that does not
 * involve them.
 *
 * The filter applies to every state alike, not just to `new`. A resource the
 * change never mentions cannot make a variant divergent either.
 *
 * EXCEPT `unknown`, WHICH COUNTS WHETHER OR NOT WE COULD ESTABLISH IT. Both
 * signals are read from field diffs, and a resource we could not read has none — so
 * an undeterminable row looks untouched no matter what it really is. Skipping it
 * would report `same`, asserting the change leaves the variant alone, which is
 * the one thing the missing data cannot tell us. So an undeterminable cell is
 * still `unknown`: this file already refuses to fold "we could not look" into
 * "we looked and found nothing", and a filter is not a reason to start.
 *
 * Precedence, worst news first. A variant with any undeterminable cell is
 * `unknown` even if other cells differ, because reporting it as divergent would
 * assert a comparison that did not complete for it.
 *
 * A variant with no touched rows at all is `same`: the change does nothing to
 * it, which is exactly what "takes the change identically" means when the change
 * asks nothing of it.
 */
function kindForSpace(
  matrix: RolloutStageMatrix,
  spaceId: string,
  carriedResourceKeys: ReadonlySet<string> | null,
): RolloutOutcomeKind {
  /*
   * A Space that contributed NO groups is not a Space that takes the change
   * identically — it is a Space we hold nothing about. Reading it as `same`
   * averages a part-populated stage away, which is the failure
   * `contributingSpaceCount` exists to make visible.
   *
   * It cannot be seen from the rows: such a Space has a cell in every row, and
   * once the filter removes the rows it reads as though nothing was wrong.
   */
  const contributed = matrix.columns.find((c) => c.spaceId === spaceId)?.contributing ?? false;
  // A resource this Space holds that could be neither read nor identified. It
  // has no row to carry the news, so the news is carried here instead.
  let sawUnknown = !contributed || matrix.unreadableSpaceIds.has(spaceId);
  let sawDiffers = false;
  let sawNew = false;

  for (const row of matrix.rows) {
    const cell = row.cells.find((c) => c.spaceId === spaceId);
    if (cell === undefined) continue;
    if (cell.state === 'unknown') {
      sawUnknown = true;
      continue;
    }
    /*
     * A row that took the slug disambiguation is keyed `[identity, slug]`, which
     * no authored key can equal, so it always falls to the proxy. Deliberate:
     * the alternative is to compare a disambiguated row against a plain identity
     * and join two resources that the configuration could not tell apart.
     */
    const carried = carriedResourceKeys !== null ? carriedResourceKeys.has(row.key) : row.changed;
    if (!carried) continue;
    if (cell.state === 'differs') sawDiffers = true;
    else if (cell.state === 'new') sawNew = true;
  }

  if (sawUnknown) return 'unknown';
  if (sawDiffers) return 'differs';
  if (sawNew) return 'adds';
  return 'same';
}

/**
 * The row keys the change carries, read from the change as authored at the base.
 *
 * `null` when NOTHING resolved an identity, which is not the same as carrying
 * nothing. A stage on a format with no resource identity — ini, properties,
 * toml, env — has a source group for everything it carries and a key for none of
 * them, and handing back an empty set there claims the change carries nothing
 * and reports the whole stage as taking the change identically however far its
 * variants have diverged.
 *
 * A CREATED RESOURCE IS CARRIED, AND IT ARRIVES SEPARATELY. A resource with no
 * recorded starting point has no honest diff, so it never becomes a source
 * group — see `useRolloutConsoleChanges`, which drops it from the tree for that
 * reason and records it here instead. Taking the carried set from the groups
 * alone therefore missed exactly the resources the change INTRODUCES, and a
 * variant that did not hold one read as taking the change identically. That is
 * the "Adds resources" case this page exists to report.
 *
 * EVERY SPELLING OF A RESOURCE IS CARRIED, not one chosen side. A stage row may
 * key from either side of the change and may have needed the namespace tiebreak,
 * and a set that holds only one form silently fails to match the others — which
 * filters the row out and reports its variants as taking the change identically.
 * Membership is the only question asked of this set, so breadth is free.
 *
 * Lives here rather than in the page because these distinctions are the whole of
 * the function and a rule nothing can exercise is a rule nothing can hold to.
 */
export function carriedResourceKeysOf(
  sourceGroups: Iterable<RolloutChangeGroup>,
  createdResourceKeys: Iterable<string> = [],
): ReadonlySet<string> | null {
  const keys = new Set<string>();
  let anyIdentified = false;
  for (const group of sourceGroups) {
    const spellings = group.resourceIdentityJoinKeys ?? (
      group.resourceIdentity === undefined ? [] : [group.resourceIdentity]
    );
    if (spellings.length === 0) continue;
    anyIdentified = true;
    // A rewrite is carried only where it actually rewrites something.
    if (group.fieldDiffs.length > 0) for (const key of spellings) keys.add(key);
  }
  for (const key of createdResourceKeys) {
    // A creation is carried unconditionally: there is no "unchanged" reading of
    // a resource that did not exist before this change.
    anyIdentified = true;
    keys.add(key);
  }
  return anyIdentified ? keys : null;
}

/**
 * `carriedResourceKeys` are the row keys the change carries, as authored at the
 * base Space. `null` -- the default -- means the authored change has not been
 * read yet, and filters nothing. An EMPTY SET is a different claim: the change
 * is known and carries nothing, so every row is excluded.
 */
export function buildRolloutOutcome(
  matrix: RolloutStageMatrix | null,
  carriedResourceKeys: ReadonlySet<string> | null = null,
): RolloutOutcome {
  if (matrix === null || matrix.columns.length === 0) {
    return { groups: [], variantCount: 0, tooFewToCompare: true, partial: false };
  }

  const bySpace = new Map<RolloutOutcomeKind, RolloutOutcomeGroup>();
  for (const kind of ORDER) {
    bySpace.set(kind, { kind, spaceIds: [], labels: [], representativeSpaceId: '' });
  }

  for (const column of matrix.columns) {
    const kind = kindForSpace(matrix, column.spaceId, carriedResourceKeys);
    const group = bySpace.get(kind);
    if (group === undefined) continue;
    group.spaceIds.push(column.spaceId);
    group.labels.push(column.label);
  }

  const groups = ORDER.map((kind) => bySpace.get(kind)).filter(
    (g): g is RolloutOutcomeGroup => g !== undefined && g.spaceIds.length > 0,
  );

  for (const group of groups) {
    const canonicalIsMember =
      matrix.canonicalSpaceId !== null && group.spaceIds.includes(matrix.canonicalSpaceId);
    group.representativeSpaceId = canonicalIsMember
      ? (matrix.canonicalSpaceId as string)
      : group.spaceIds[0];
  }

  return {
    groups,
    variantCount: matrix.columns.length,
    tooFewToCompare: matrix.columns.length < 2,
    partial: matrix.partial,
  };
}

/**
 * The segments sum to the variant count.
 *
 * Exported so a spec can assert it rather than trusting the partition, and
 * because the one number that must never drift here is the one beside Promote.
 * Returns the shortfall, so a failure says how far out it is rather than only
 * that it is out.
 */
export function partitionShortfall(outcome: RolloutOutcome): number {
  const summed = outcome.groups.reduce((total, group) => total + group.spaceIds.length, 0);
  return outcome.variantCount - summed;
}
