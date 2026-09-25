// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Turn one rollout stage's `RolloutChangeGroup[]` into the `MergedUnit[]` shape
 * `ComponentValuesSection` actually renders (D5) — the only new derivation this
 * redesign adds; everything upstream of it (`rolloutChanges`, `useRolloutBaseline`)
 * is carried forward untouched.
 *
 * Pure, no React — exercised the same way every other `rollout*.ts` module is:
 * bundle the real module and run real inputs through it (predecessor §10.6's
 * counter-practice, which found two defects the running app would not have
 * shown). `useEffect` is avoidable here precisely because this is plain data
 * transformation, not a subscription.
 *
 * FOUR INPUT STATES, FOUR OUTCOMES, NEVER COLLAPSED (§10.1):
 *   - dry run not finished at all      -> no groups reach this module (the
 *     stage-level gate lives in `useRolloutChanges`), so no units at all.
 *   - dry run FAILED, nothing to fall back on for this unit -> the unit IS
 *     still returned (its row still exists) but with no `upgradeEntry`, and
 *     its id is reported in `undeterminedUnitIds` so the caller can render an
 *     explicit "cannot be determined" note. Silence here would make it
 *     indistinguishable from the next state.
 *   - settled, no change for this unit -> an `upgradeEntry` with an EMPTY
 *     diff set, which the tree reads as unchanged. Not the same as the
 *     previous state, even though a bare glance at "no pill" looks identical —
 *     that is exactly why `undeterminedUnitIds` exists as a separate signal.
 *   - settled with changes             -> the real entry.
 */

import { parseUnitData } from '../configParser';
import { buildPaths, computeFieldDiffs } from '../entryBuilders';
import type { MergedUnit, UpgradeEntry, VariationEntry } from '../componentTypes';
import type { RolloutBaselineStatus } from './useRolloutBaseline';
import type { RolloutChangeGroup } from './rolloutTypes';

export interface RolloutUnitContext {
  slug: string;
  spaceId: string;
  data?: string;
  toolchainType?: string;
}

export interface RolloutMergedUnitsInput {
  /** The selected stage's groups — every Space's units, not one representative (see `useRolloutChanges`). */
  groups: readonly RolloutChangeGroup[];
  currentDataByUnitId: ReadonlyMap<string, RolloutUnitContext>;
  deploymentNameBySpaceId: ReadonlyMap<string, string>;
  /** Resource slug -> the base's data immediately before the change. */
  beforeChangeBySlug: ReadonlyMap<string, string>;
  /** Resource slug -> the base's data as it stands now. */
  currentBySlug: ReadonlyMap<string, string>;
  baselineStatus: RolloutBaselineStatus;
  /** Space ids that have taken the change — selects which baseline column a unit's Space is measured against. */
  takenSpaceIds: ReadonlySet<string>;
}

export interface RolloutMergedUnitsResult {
  units: MergedUnit[];
  /** Unit ids carrying a written (already-promoted), not a live-pending, change (ruling 5). */
  writtenUnitIds: ReadonlySet<string>;
  /** Unit ids whose incoming change could not be established this round — render an explicit note, never nothing. */
  undeterminedUnitIds: ReadonlySet<string>;
  /**
   * Unit ids DROPPED because no configuration context could be resolved.
   *
   * ⚠️ DROPPING THEM IS CORRECT; LEAVING NO TRACE WAS THE DEFECT. Without real
   * data there is no tree to render, so the unit genuinely cannot be shown —
   * but a caller counting `units.length` then describes a set the page never
   * fully saw, while reading as complete. That is the same collapse as reading
   * an unanswered unit as unchanged, one pair over: "unreadable" becoming
   * indistinguishable from "absent".
   *
   * A drop is a decision, and a decision that leaves no trace cannot be told
   * apart from never having faced it.
   */
  droppedUnitIds: ReadonlySet<string>;
}

/**
 * `UpgradeEntry.upstreamRevisionNum`/`upstreamHeadRevisionNum` are required by
 * the type but meaningless for a ChangeOrder-driven entry — there is no real
 * upstream Link revision pair. Zero rather than a fabricated-looking number
 * (§10.2): nothing reads these two fields for rollout. `RolloutUnitHeader`
 * (U3) owns the unit's own label and prints nothing rather than a made-up
 * revision; `ComponentValuesSection` itself never reads either field — the
 * only `r{a}->r{b}` construction in the component view is `ComponentSidePane`'s
 * own header row, which rollout does not mount.
 */
const NO_REVISION_PAIR = 0;

function buildUpgradeEntry(
  unitId: string,
  ctx: RolloutUnitContext,
  group: RolloutChangeGroup,
  deploymentName: string,
): UpgradeEntry | undefined {
  if (!group.determinable) return undefined;
  return {
    unitId,
    slug: ctx.slug,
    deploymentId: ctx.spaceId,
    deploymentName,
    parentDeploymentName: deploymentName,
    upstreamRevisionNum: NO_REVISION_PAIR,
    upstreamHeadRevisionNum: NO_REVISION_PAIR,
    // A written unit's diff is a RECORD (what this promotion actually wrote,
    // diffed against its own pre-promotion revision — see useRolloutChanges.ts),
    // not a proposal — rendered in the 'edit'/yellow palette instead of
    // 'upgrade'/purple (user's ruling) via this generic UpgradeEntry field
    // (componentTypes.ts), so ComponentValuesSection stays rollout-agnostic (D1).
    historical: group.written,
    fieldDiffs: group.fieldDiffs,
    // Built through the same memoized helper `AppComponentView` already uses
    // for the real upgradeEntries, so identical Data yields an identical array
    // REFERENCE and the tree's memo chain is not silently defeated (D5/X-K) by
    // a synthetic entry rebuilding its own copy on every render.
    allPaths: buildPaths(ctx.data),
    // Deliberately empty, not omitted: rollout offers no opt-in upgrade of a
    // swallowed upstream deletion, because rollout offers no opt-in to
    // anything (D5). Left as a comment so nobody "fixes" this by populating it.
    blockedDeletePaths: [],
  };
}

/**
 * Real override data, or nothing — never a fabricated "no overrides" (D6).
 * Per-Space baseline selection (before-change vs current, chosen by whether
 * the Space has taken the change), producing `FieldDiff[]` for the tree's own
 * override machinery.
 *
 * D11: carries only paths the promotion LEAVES ALONE, never ones it will
 * overwrite. A genuine local divergence from the baseline splits into
 * `untouched` (the promote leaves it) and `overwritten` (the promote replaces
 * it), and this function must draw that same line or silently erase it.
 * Without the filter,
 * an overwritten path would reach the tree as a blocked local override,
 * which reads as "your value is protected" about a value the promote is
 * about to replace — the exact fault predecessor §10.1 already paid for
 * once, reintroduced through a component that is behaving correctly by its
 * own rules.
 */
function buildVariationEntry(
  unitId: string,
  ctx: RolloutUnitContext,
  deploymentName: string,
  group: RolloutChangeGroup,
  input: RolloutMergedUnitsInput,
): VariationEntry | undefined {
  if (input.baselineStatus !== 'resolved') return undefined;
  if (ctx.data === undefined) return undefined;

  const baselineBySlug = input.takenSpaceIds.has(ctx.spaceId)
    ? input.currentBySlug
    : input.beforeChangeBySlug;
  const baselineData = baselineBySlug.get(ctx.slug);
  // No starting point recorded for this resource -> cannot tell a genuine
  // override from a Space that simply has not been promoted yet. Absent,
  // never fabricated as "none" (§10.1).
  if (baselineData === undefined) return undefined;

  // Paths this promotion actually writes here — an overwritten override is,
  // for the tree's purposes, a normal incoming change, not a blocked one.
  const writtenPaths = new Set(group.fieldDiffs.map((d) => d.path));

  const fieldDiffs = computeFieldDiffs(baselineData, ctx.data).filter((d) => !writtenPaths.has(d.path));
  const baselinePaths = parseUnitData(baselineData);
  const currentPaths = parseUnitData(ctx.data);
  const localOnlyPaths = Array.from(currentPaths.keys()).filter(
    (k) => !baselinePaths.has(k) && !writtenPaths.has(k),
  );

  if (fieldDiffs.length === 0 && localOnlyPaths.length === 0) return undefined;

  return {
    unitId,
    slug: ctx.slug,
    deploymentId: ctx.spaceId,
    deploymentName,
    fieldDiffs,
    localOnlyPaths,
    allPaths: buildPaths(ctx.data),
    // Rollout has no real upstream Link (see NO_REVISION_PAIR above) for the
    // dashed provenance border to compare against, and read-only mounts never
    // stage or protect anything that would consume it — left empty rather
    // than fabricating a comparison this mode has no baseline for.
    liveFieldDiffs: [],
  };
}

export function buildRolloutMergedUnits(input: RolloutMergedUnitsInput): RolloutMergedUnitsResult {
  const units: MergedUnit[] = [];
  const writtenUnitIds = new Set<string>();
  const undeterminedUnitIds = new Set<string>();
  const droppedUnitIds = new Set<string>();

  for (const group of input.groups) {
    const ctx = input.currentDataByUnitId.get(group.unitId);
    // unit.data is mandatory (D5) — without real context there is no tree to
    // render for this unit at all, so it is dropped rather than rendered empty.
    if (ctx === undefined) {
      droppedUnitIds.add(group.unitId);
      continue;
    }

    const deploymentName = input.deploymentNameBySpaceId.get(ctx.spaceId) ?? ctx.spaceId;
    const upgradeEntry = buildUpgradeEntry(group.unitId, ctx, group, deploymentName);
    const variationEntry = buildVariationEntry(group.unitId, ctx, deploymentName, group, input);

    if (group.written) writtenUnitIds.add(group.unitId);
    if (!group.determinable) undeterminedUnitIds.add(group.unitId);

    units.push({
      unitId: group.unitId,
      slug: ctx.slug,
      spaceId: ctx.spaceId,
      hasUpstream: false,
      toolchainType: ctx.toolchainType,
      data: ctx.data,
      upgradeEntry,
      variationEntry,
      /*
       * `MergedUnit.isUpgradeLoading` is named for the side pane's own builder,
       * where it means a dry run is still in flight. Nothing is loading here:
       * this builder has already resolved the group and found it INDETERMINATE
       * — the upgrade cannot be predicted for it, and no further request would
       * settle the question. Both render the same "not known yet" treatment,
       * which is why the field is reused rather than widened, but do not read
       * this as a pending request.
       */
      isUpgradeLoading: !group.determinable,
      hasAction: !!upgradeEntry,
    });
  }

  return { units, writtenUnitIds, undeterminedUnitIds, droppedUnitIds };
}
