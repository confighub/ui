// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { LiveStatus, LiveStatusProvider } from './liveStatus';

// ============================================================================
// TYPES
// ============================================================================

/**
 * One Target bound to units in a deployment's Space.
 *
 * `targetId` is the identity — display names are NOT unique (several Targets
 * commonly share the same `Labels.DisplayName`, e.g. "US - Dev"), so anything
 * that indexes or keys Targets must use `targetId`.
 */
export interface DeploymentTarget {
  /** Target.TargetID — the only unique handle on this Target. */
  targetId: string;
  /** Display label (Target.Labels.DisplayName ?? Target.Slug). Not unique. */
  name: string;
  /**
   * External deep link derived from the Target's `URL-TargetUI` annotation
   * (with `{slug}` substituted), when the Target carries one. Links the name to
   * whatever UI manages the Target (e.g. ArgoCD, Flux, OpenTofu Cloud).
   */
  url?: string;
}

export interface ComponentDeployment {
  /** Stable id for the deployment node — equals the Space ID */
  deploymentId: string;
  /** Slug used for filter URLs and as a fallback display name */
  slug: string;
  /** Human-readable label for the node (Space.Labels.Variant if set, else slug) */
  displayName: string;
  /** Derived: has-target → Deployment, otherwise Base. */
  type: 'Base' | 'Deployment';
  /**
   * Distinct Targets bound to the units in this Space (usually 0 or 1), sorted
   * by display name. Two entries may share a `name` — they are still distinct
   * Targets, so render/key them by `targetId`.
   */
  targets: DeploymentTarget[];
  /** Space.ReleaseTargetID, when set — signals this node publishes via Release instead of Apply. */
  releaseTargetId?: string;
  /** Space.ReleaseURL (readonly) — the OCI URL Releases publish to, when releaseTargetId is set. */
  releaseUrl?: string;
  /** Display name (DisplayName ?? Slug) of the Target referenced by releaseTargetId, resolved the same way `targets[].name` is. */
  releaseTargetName?: string;
  parentDeploymentId: string | null;
  stage: number;
  upgradeableCount: number;
  unappliedCount: number;
  unitCount: number;
  /**
   * Last observed live-infra status, parsed from the `confighub.com/live-status`
   * Space annotation (written by a reporter such as argobot). Undefined when the
   * Space carries no such annotation or it is malformed.
   */
  liveStatus?: LiveStatus;
  /**
   * Which delivery system this node attributes its live status to, driving the
   * brand mark and the status vocabulary. Resolved primarily from the
   * annotation's own `source` (who actually reported); `'unknown'` when it
   * carries none — see `resolveLiveStatusProvider` in liveStatus.ts.
   */
  liveStatusProvider: LiveStatusProvider;
  /**
   * Staleness timing for the "Stale" chip, aggregated across this Space's stale
   * units (a unit is stale when its merged upstream revision is behind the
   * upstream's head). Both undefined when nothing is stale.
   *
   * `staleUpstreamChangedAt` is the RFC-3339 timestamp of the *newest* upstream
   * change the Space is behind on (the upstream's `HeadRevision.CreatedAt`); it
   * is a lower bound on how long the Space has been stale — "stale for at least
   * this long". `staleRevisionsBehind` is the largest revisions-behind gap
   * (upstream head − merged) across those units.
   */
  staleUpstreamChangedAt?: string;
  staleRevisionsBehind?: number;
}

export interface Stage {
  label: string;
  depth: number;
  deploymentIds: string[];
}

export interface FieldDiff {
  path: string;
  oldValue: string;
  newValue: string;
}

export interface UpgradeEntry {
  unitId: string;
  slug: string;
  deploymentId: string;
  deploymentName: string;
  parentDeploymentName: string;
  upstreamRevisionNum: number;
  upstreamHeadRevisionNum: number;
  /** Space ID of the upstream unit (for linking to its revision viewer). */
  parentSpaceId?: string;
  /** Unit ID of the upstream unit (for linking to its revision viewer). */
  parentUnitId?: string;
  fieldDiffs: FieldDiff[];
  /** All flattened config paths with their current values (sorted), for showing context around diffs */
  allPaths: { path: string; value: string }[];
  /** ISO timestamp when the upstream head revision was created */
  upstreamCreatedAt?: string;
  /** User-provided description of the upstream change */
  upstreamDescription?: string;
  /**
   * Paths where the upstream issued a Delete mutation that was swallowed by the
   * child's local modification (SubtractMutations dropped the delete). These are
   * surfaced as opt-in upgrades so the user can choose to accept the deletion.
   * Populated from the dry-run Conflicts array (Reason='Subtracted', MutationType='Delete').
   */
  blockedDeletePaths?: string[];
  /**
   * True when this diff describes a change that has ALREADY been applied —
   * a record of what happened, not a proposal of what would happen if
   * something acted on it. Deliberately generic, not rollout-specific: the
   * rollout detail page is its first and only caller today (a promoted
   * stage's diff, shown against its pre-promotion revision), but the concept — "this upgrade-shaped diff is historical" —
   * belongs to the diff itself, not to any one caller. Read-only rendering
   * only: `ComponentValuesSection` uses it to pick the 'edit' (yellow)
   * token-diff palette instead of 'upgrade' (purple) for a field diff, the
   * same way it already distinguishes a staged manual edit from a staged
   * upgrade pick — undefined/false renders exactly as before.
   */
  historical?: boolean;
}

export interface ApplyEntry {
  unitId: string;
  slug: string;
  deploymentId: string;
  deploymentName: string;
  headRevision: number;
  appliedRevision: number;
  fieldDiffs: FieldDiff[];
  /** All flattened config paths with their current values (sorted), for showing context around diffs */
  allPaths: { path: string; value: string }[];
  /** ISO timestamp when the head (pending) revision was created */
  headRevisionCreatedAt?: string;
  /** User-provided description of the pending change */
  headRevisionDescription?: string;
}

export interface ApplyEntryWithGates extends ApplyEntry {
  isGated: boolean;
  gateKeys: string[];
}

export interface VariationEntry {
  unitId: string;
  slug: string;
  deploymentId: string;
  deploymentName: string;
  fieldDiffs: FieldDiff[];
  localOnlyPaths: string[];
  allPaths: { path: string; value: string }[];
  /** Fields differing between upstream HEAD and the downstream unit's CURRENT
   *  committed data. Unlike `fieldDiffs` this never consults the dry-run, so it
   *  cannot change meaning when a dry-run lands: a path the pending upgrade is
   *  about to overwrite equals upstream POST-merge and would leave `fieldDiffs`,
   *  even though it differs right now. This is the set the value border reads. */
  liveFieldDiffs: FieldDiff[];
}

export interface MergedUnit {
  unitId: string;
  slug: string;
  spaceId: string;
  hasUpstream: boolean;
  toolchainType?: string;
  data?: string;
  validationErrors?: { [key: string]: boolean };
  upgradeEntry?: UpgradeEntry;
  applyEntry?: ApplyEntryWithGates;
  variationEntry?: VariationEntry;
  isUpgradeLoading: boolean;
  hasAction: boolean;
}
