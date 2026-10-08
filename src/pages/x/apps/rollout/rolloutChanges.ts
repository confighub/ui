// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a promotion carries, per resource, for the step's treeview.
 *
 * VALUES, NOT COUNTS. This reads the actual configuration data on both sides
 * and diffs it. It deliberately does NOT infer "what changed" from the
 * ChangeOrder's `ResolvedSpaceIDs`, because those two can legitimately
 * disagree: resolution means a Space's Links have merged at or past the end
 * Tag, which is a statement about pointers, not about the bytes. A Space can
 * therefore count as resolved while its data still shows the old values.
 *
 * That is not hypothetical. Every fault found while building the test fixture
 * returned 200 OK with entirely plausible counts, and only reading the
 * configuration data revealed that nothing had moved. So the rule here is: if
 * the counts and the values disagree, show the values, because the values are
 * what the user actually gets.
 *
 * The diffing itself is `computeFieldDiffs` from entryBuilders — the same
 * function the rest of the component view uses, so a rollout diff and an
 * upgrade diff can never drift apart.
 *
 * RULE 11 BINDS THIS FILE. The other ten bind the row key and the outcome
 * filter; all eleven are listed in `rolloutMatrix.ts`'s header.
 *
 * 11. ABSENT AND EMPTY ARE THE SAME THING, AND NEITHER IS EVER DIFFED.
 *     `useUnitData`'s accessors end in `|| ''`, so a payload the response did not
 *     carry arrives as `''` and a guard testing `=== undefined` lets it through.
 *     Diffing real data against nothing reports every path as removed, and the
 *     promote preview then shows the reader their entire configuration being
 *     erased. `hasConfig` is the guard; a change that reads a payload states
 *     whether it goes through it.
 */

import type { PromoteResult } from '@confighub/rtk-query';

import { buildPaths, computeFieldDiffs } from '../entryBuilders';
import { parseUnitData, resourceIdentitiesOf } from '../configParser';
import type { RolloutChangeGroup, RolloutResourceConflict } from './rolloutTypes';

/** One resource's before/after, however the caller obtained them. */
export interface RolloutChangeSource {
  unitId: string;
  /** Unit slug — used as the resource name. Never rendered as "unit". */
  slug: string;
  /** Base64 configuration data BEFORE the promotion (or before the change). */
  beforeData: string | undefined;
  /** Base64 configuration data AFTER it. */
  afterData: string | undefined;
  /** True when `afterData` came from a written Revision rather than a dry run. */
  written: boolean;
  /**
   * True when the caller could not establish `afterData` at all this round — the
   * dry run's first attempt failed before any data ever landed for this unit.
   * Distinct from `afterData` simply being `undefined` because a successful dry
   * run found nothing to change here.
   */
  cannotDetermineAfter: boolean;
  /**
   * What the dry run refused to do to this resource, already in UI shape.
   *
   * Absent is the ordinary case. A resource with no changed paths is normally
   * one the change does not touch; this is the exception, and it cannot be
   * inferred from the diffs because a refusal and an untouched resource both
   * produce none.
   */
  conflicts?: readonly RolloutResourceConflict[];
}

/**
 * Reasons that report the change LANDING, not being refused.
 *
 * `ExclusiveCleared` says the patch applied and the variant lost an exclusive
 * value; `DeleteShadowed` says the delete applied and shadowed a target
 * mutation. Both describe a consequence of success. Reading either as "blocked"
 * would tell a reader the promote did not do something it did.
 */
const APPLIED_CONFLICT_REASONS: ReadonlySet<string> = new Set(['ExclusiveCleared', 'DeleteShadowed']);

/**
 * Does this reason mean the promotion was stopped?
 *
 * UNRECOGNISED REASONS BLOCK. The API types `Reason` as a plain string, so this
 * list is a snapshot of what was known when it was written and cannot be
 * exhaustive. Defaulting an unknown reason to "not blocking" would delete it
 * from the screen; defaulting it to blocking says "something stopped this" and
 * shows the reason verbatim, which is true even when we cannot interpret it.
 */
export function conflictBlocks(reason: string | undefined): boolean {
  return reason === undefined || !APPLIED_CONFLICT_REASONS.has(reason);
}

/** What a promote dry run says it would do to each Unit, in the shape the stage tree reads. */
export interface PromotionPreview {
  /** The configuration each Unit the promotion writes would hold. */
  dataByUnitId: Map<string, string>;
  /** What the promotion would withhold from each Unit, where it would withhold anything. */
  conflictsByUnitId: Map<string, RolloutResourceConflict[]>;
  /** Units the promotion would not write: their configuration stays as it is. */
  unchangedUnitIds: Set<string>;
  /**
   * Units the dry run answered for without saying what they would hold: an error, or a
   * write that came back with no configuration.
   */
  undeterminedUnitIds: Set<string>;
  /**
   * Spaces the dry run did not plan — Blocked, because they take from another Space of the
   * same promotion, or Failed — so none of their Units has an answer.
   */
  undeterminedSpaceIds: Set<string>;
}

/**
 * The actions that write nothing to a Unit's configuration. A Mark only moves the
 * ChangeOrder's Tags onto a Unit that already holds the change.
 */
const NON_WRITING_UNIT_ACTIONS: ReadonlySet<string> = new Set(['Mark', 'Unchanged', 'Skip']);

/** The Space actions under which the dry run planned each of the Space's Units. */
const PLANNED_SPACE_ACTIONS: ReadonlySet<string> = new Set(['Promote', 'Unchanged', 'Skipped']);

/**
 * Read a `POST /promote` dry run made with `include=ConfigData` into what each Unit would
 * hold.
 *
 * ⚠️ A UNIT WITH NO CONFIGURATION IS ONE OF TWO THINGS. The server returns `ConfigData`
 * only for a Unit the promotion writes, so a Unit it marks, skips or leaves unchanged has
 * none and is unchanged. One it would write and still has none for, or reports an error
 * for, is not: it is undetermined, and must not read as "this promotion changes nothing
 * here".
 */
export function readPromotionPreview(result: PromoteResult | undefined): PromotionPreview {
  const preview: PromotionPreview = {
    dataByUnitId: new Map(),
    conflictsByUnitId: new Map(),
    unchangedUnitIds: new Set(),
    undeterminedUnitIds: new Set(),
    undeterminedSpaceIds: new Set(),
  };
  for (const space of result?.Spaces ?? []) {
    if (space.SpaceID !== undefined && !PLANNED_SPACE_ACTIONS.has(space.Action ?? '')) {
      preview.undeterminedSpaceIds.add(space.SpaceID);
    }
    for (const unit of space.Units ?? []) {
      const unitId = unit.UnitID;
      // A clone the dry run would make has no id yet, and no current Unit to stand beside.
      if (unitId === undefined) continue;
      const conflicts = (unit.Conflicts ?? []).map((conflict) => ({
        reason: conflict.Reason ?? '',
        resourceName: conflict.Resource?.ResourceName,
        path: conflict.Path,
        details: conflict.Details,
        blocks: conflictBlocks(conflict.Reason),
      }));
      if (conflicts.length > 0) preview.conflictsByUnitId.set(unitId, conflicts);
      if (unit.Error !== undefined) {
        preview.undeterminedUnitIds.add(unitId);
      } else if (unit.ConfigData !== undefined && unit.ConfigData !== '') {
        preview.dataByUnitId.set(unitId, unit.ConfigData);
      } else if (NON_WRITING_UNIT_ACTIONS.has(unit.Action ?? '')) {
        preview.unchangedUnitIds.add(unitId);
      } else {
        preview.undeterminedUnitIds.add(unitId);
      }
    }
  }
  return preview;
}

/**
 * Kubernetes-style `kind`, when the data has one.
 *
 * Purely a display nicety for the resource row's badge. Absent for formats that
 * have no such concept (ini, properties, plain JSON), and its absence is not an
 * error — the resource still renders, just without a kind badge.
 */
function resourceKindOf(data: string | undefined): string | undefined {
  if (data === undefined) return undefined;
  const parsed = parseUnitData(data);
  const kind = parsed.get('kind');
  return typeof kind === 'string' && kind.length > 0 ? kind : undefined;
}

/**
 * Is there configuration here to read?
 *
 * The empty string is not an empty configuration, it is a missing one.
 * `useUnitData`'s accessors end in `|| ''`, so a row the response did not carry
 * arrives as `''` rather than as `undefined`, and the two cases are
 * indistinguishable by the time they reach here. Testing only for `undefined`
 * lets a missing payload through as if it were real, and diffing real data
 * against nothing reports every path as removed — the failure this file's header
 * describes.
 */
function hasConfig(data: string | undefined): boolean {
  return data !== undefined && data !== '';
}

/**
 * The key that joins one resource across variants.
 *
 * Read from the configuration, never from the slug. A slug belongs to one Space,
 * so two variants can hold one resource under two different slugs. Keying on the
 * slug then splits one resource into two rows, and each variant reads as lacking
 * the other's row — which the outcome bar reports as "adds resources" about
 * variants that hold the resource already.
 *
 * A multi-document payload is keyed on EVERY document it holds, so a payload is
 * identified by its contents rather than by whichever document leads it.
 *
 * ⚠️ THE NAMESPACE IS DELIBERATELY NOT PART OF THIS KEY. `cub variant create
 * --namespace` rewrites every namespace in the units it clones and records the
 * value as the new Space's label, so a per-variant namespace is the documented,
 * first-class way to make a variant. Keying on it splits one resource across
 * exactly the variants the feature exists to compare, and the reader is told
 * both of them are "adding" a resource both already hold.
 *
 * Measured on a real production dataset: of the 4 units two real Spaces
 * share, 3 split on the namespace alone and 0 differ in any other way.
 *
 * "Compare the namespace only where both sides declare one" was the narrower
 * rule available and it is not enough: the same corpus holds
 * `confighub-prod/confighub-api-https` against `default/confighub-api-https`,
 * where both sides declare and still disagree. Two variants that each name their
 * own namespace are the ordinary case, not the exception.
 *
 * The cost is that two resources of one Space sharing a kind and a name in
 * different namespaces now key alike. They are genuinely different resources, so
 * `buildStageMatrix` separates them by slug rather than letting one take the
 * other's row. Measured occurrences of that clash in the corpus: 0 in each
 * Space.
 *
 * KNOWN RESIDUAL, recorded rather than designed around: two variants whose
 * payloads hold genuinely different SETS of documents still key differently and
 * will not join. The product supports reaching that state — `Link.WhereResource`
 * selects a subset for a downstream unit, a protected downstream path refuses an
 * upstream add, and PostClone triggers can diverge two variants on their first
 * revision. It has 0 occurrences in the corpus measured above. One row per
 * document is the model that fixes it, and it would not fix the namespace split,
 * which is why the namespace comes first.
 *
 * `undefined` when the configuration carries no identity. The caller must not
 * invent one: a guessed key joins two resources that are not the same.
 */
/**
 * `namespace/name` -> `name`. `extractResourceIdentity` joins the two with a
 * `/`, and a Kubernetes name cannot contain one, so the first separator is the
 * only one.
 */
function withoutNamespace(resourceName: string): string {
  const at = resourceName.indexOf('/');
  return at === -1 ? resourceName : resourceName.slice(at + 1);
}

function identityKey(data: string | undefined, keepNamespace: boolean): string | undefined {
  const named = resourceIdentitiesOf(data).filter((i) => i.ResourceName !== undefined);
  if (named.length === 0) return undefined;
  // SORTED, so the key describes WHICH resources the payload holds and not the
  // order it happens to list them in. Two variants that hold the same documents
  // in a different sequence hold the same thing, and a positional key would
  // split them into two rows that each variant reads as missing.
  const parts = named
    .map((i) => {
      const name = i.ResourceName as string;
      return JSON.stringify([i.ResourceType ?? null, keepNamespace ? name : withoutNamespace(name)]);
    })
    .sort();
  return JSON.stringify(parts);
}

export function resourceIdentityKeyOf(data: string | undefined): string | undefined {
  return identityKey(data, false);
}

/**
 * The same key with the namespace kept, for telling apart two resources of ONE
 * Space that the namespace-free key cannot separate.
 *
 * The namespace is the only thing that distinguishes them, so it is the only
 * honest tiebreak. It is also the RIGHT tiebreak for a key that has to join
 * across Spaces: the slug was the obvious alternative and it is Space-scoped,
 * which is the defect this whole key exists to remove — disambiguating by it
 * would have put every multi-namespace Space back into the split it fixes.
 */
export function resourceIdentityNamespacedKeyOf(data: string | undefined): string | undefined {
  return identityKey(data, true);
}

/**
 * Every spelling a payload may be joined under, for a caller that tests
 * membership rather than equality.
 *
 * Both sides and both forms. A row keys from the BEFORE side, and a change that
 * alters identity — a rename, a namespace rewrite, a document added to a bundle
 * — makes the two sides disagree; a row keyed on its namespace needs that form.
 *
 * BREADTH IS NOT FREE, and the cost runs one way. Every extra spelling widens
 * what counts as carried, so a change carrying `prod/api` also admits any row
 * keyed on the bare `api` — which is right where that row IS the same resource
 * under a rewritten namespace, and wrong where it is a different one. The error
 * therefore admits rows rather than silencing them, and an admitted row states
 * its own comparison for the reader to judge, where a silenced one states
 * nothing. That asymmetry is the whole justification; it is not that the entries
 * are cheap.
 */
export function resourceIdentityJoinKeysOf(
  ...data: (string | undefined)[]
): string[] {
  const keys = new Set<string>();
  for (const one of data) {
    const bare = resourceIdentityKeyOf(one);
    if (bare !== undefined) keys.add(bare);
    const namespaced = resourceIdentityNamespacedKeyOf(one);
    if (namespaced !== undefined) keys.add(namespaced);
  }
  return [...keys];
}

/**
 * Build the treeview groups.
 *
 * A resource whose data is identical on both sides is KEPT, with no rows. That
 * is deliberate: the design calls for an explicit "no path in this resource
 * changes under this ChangeOrder" row, and dropping such resources instead
 * would leave the reader unable to tell "this resource is untouched" from "this
 * resource was not considered".
 *
 * ABSENT `afterData` MEANS "THIS PROMOTION DOES NOT CHANGE THIS RESOURCE",
 * NOT "EVERYTHING IS DELETED". Diffing real data against nothing reports every
 * path as removed, which rendered as this promotion wiping the reader's entire
 * configuration — the exact failure the component view's hard rule 16 exists to
 * prevent ("absent dry-run data flags every field as removed → a transient
 * 'everything removed' preview").
 *
 * It is also not merely transient here. A resource the promotion does not touch
 * can stay absent from the dry run's response permanently, so its `afterData`
 * never arrives. Treating that absence as deletion would have shown an untouched
 * Namespace being erased, forever, on every stage.
 *
 * ⚠️ THE ORIGINAL WORDING HERE SAID THE DRY RUN "RETURNS ONLY THE UNITS IT
 * CHANGED". THAT IS MEASURED FALSE. Intercepted against a live server, an
 * upgrade dry run over a stage where nothing changes returned every unit in
 * scope, each WITH its configuration. So absence from the response no longer
 * implies "unchanged", and presence no longer implies "changed" — the rule the
 * paragraph above rests on is weaker than it was written to be.
 *
 * What still holds is the conclusion: absence must never render as destruction.
 * What does not hold is using absence as positive evidence of no change. A unit
 * the response NAMES and gives nothing for is a third case, and it is now
 * carried separately — see `answeredWithNoDataUnitIds` in `useRolloutChanges`.
 *
 * The caller is responsible for not asking at all until the dry-run has landed —
 * see `useRolloutChanges`. This function guarantees only that absence is never
 * rendered as destruction.
 */
export function buildRolloutChangeGroups(sources: RolloutChangeSource[]): RolloutChangeGroup[] {
  return sources.map((source) => {
    // Rule 16's mirror image: no "before" data means there is nothing honest to
    // diff against, so this resource's fate is undetermined too — never "every
    // path is new", which is what diffing against absence would report.
    const determinable = hasConfig(source.beforeData) && !source.cannotDetermineAfter;
    return {
      unitId: source.unitId,
      resourceName: source.slug,
      resourceKind: resourceKindOf(source.afterData ?? source.beforeData),
      // Either side identifies the resource, and the two agree wherever both can
      // be read. The BEFORE side is preferred because it is what the Space holds
      // now, which is the thing the row claims to be about.
      resourceIdentity:
        resourceIdentityKeyOf(source.beforeData) ?? resourceIdentityKeyOf(source.afterData),
      resourceIdentityNamespaced:
        resourceIdentityNamespacedKeyOf(source.beforeData)
        ?? resourceIdentityNamespacedKeyOf(source.afterData),
      // Set HERE as well as on the source groups. A carried set built from stage
      // groups would otherwise hold bare spellings alone and silently fail to
      // match any row keyed on its namespace — a trap that leaves no trace,
      // because a missing spelling reads as "the change does not carry this".
      resourceIdentityJoinKeys: resourceIdentityJoinKeysOf(source.beforeData, source.afterData),
      // Carried through untouched. Nothing here decides whether a conflict is
      // shown — the group records what the dry run said, and the card decides
      // what to do with it.
      conflicts: source.conflicts,
      fieldDiffs:
        !determinable || !hasConfig(source.afterData)
          ? []
          : computeFieldDiffs(source.beforeData, source.afterData),
      // Same guard as `fieldDiffs`: undetermined or absent AFTER data has
      // nothing honest to build a context list from either.
      allPaths:
        !determinable || !hasConfig(source.afterData) ? undefined : buildPaths(source.afterData),
      written: source.written,
      determinable,
    };
  });
}

/** Total changed paths across every resource — the step header's count. */
export function countChangedPaths(groups: RolloutChangeGroup[]): number {
  let total = 0;
  for (const group of groups) total += group.fieldDiffs.length;
  return total;
}

/**
 * Do the values agree with the claim that this stage has taken the change?
 *
 * Used to catch the disagreement described in the file header: a stage the
 * ChangeOrder reports as resolved, whose resources still differ from the
 * source. When that happens the UI says so rather than quietly showing an empty
 * diff and letting the stepper's "Promoted" stand unchallenged.
 */
export function hasOutstandingDifferences(groups: RolloutChangeGroup[]): boolean {
  return groups.some((group) => group.fieldDiffs.length > 0);
}
