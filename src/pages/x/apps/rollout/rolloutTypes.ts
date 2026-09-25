// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Types for a rollout: one ChangeOrder being promoted through a sequence of
 * stages.
 *
 * NAMING, read this before adding anything here
 * ---------------------------------------------
 * The component view ALREADY has a `Stage` type, and it means something else:
 * depth in the upstream DAG (`Stage {label:'Stage N', depth, deploymentIds}` in
 * componentTypes.ts, and the plain `number` on `ComponentDeployment.stage`).
 *
 * A ROLLOUT stage is a different thing entirely: a named step in a promotion
 * sequence, declared by the governing ChangeWorkflow's `Stages` array and
 * ordered by that array's position. Each stage's `WhereSpace` expression is
 * resolved server-side to find its member Spaces — see `rolloutStages.ts`. The
 * two `Stage` concepts are unrelated and can disagree; everything in this folder
 * is prefixed `Rollout` so the two can never be confused at a call site.
 */

/**
 * One step of the promotion sequence: a stage name, and every Space of this
 * component that carries it.
 */
export interface RolloutStage {
  /** The ChangeWorkflow stage's `Name`, verbatim. Also the stage's identity. */
  id: string;
  /**
   * The prior stage's `id` in the ChangeWorkflow's declared order, or
   * `SOURCE_STAGE_ID` for the first real stage. Null only for the synthetic
   * source stage itself, which has no predecessor.
   *
   * ⚠️ A NAME, SO IT IS USER DATA. Stage names come from the ChangeWorkflow and
   * the server accepts `__rollout_source__` among them, so this string can hold
   * the synthetic row's id without the synthetic row being meant. It is here to
   * be PRINTED and to word a gate reason — never to decide whether a stage has a
   * predecessor. `isFirst` answers that.
   */
  previousStageId: string | null;
  /** Space IDs this stage's `WhereSpace` expression resolved to, in graph order. */
  spaceIds: string[];
  /** Zero-based position in the ordered sequence. */
  index: number;
  /**
   * True for the Space the ChangeOrder resides in — the base. It is not a stage
   * and is never a promotion target: it is where the change enters. Rendered as
   * an unnumbered source row rather than a step.
   */
  isSource: boolean;
  /**
   * True for the first promotable stage: the one entered from the base rather
   * than from another stage. `cub` never gates it (`validateStageEntryGates`
   * returns nil on `previousStage == nil`).
   *
   * SET FROM THE WORKFLOW'S ARRAY POSITION, NOT FROM A NAME, and that is the
   * whole point of it existing. The equivalent name test —
   * `previousStageId === SOURCE_STAGE_ID` — was answerable by a user, because a
   * stage may legally be CALLED `__rollout_source__`: naming the first stage
   * that made the second one ungated, and the UI's gate is the only gate there
   * is. A flag the sequence builder writes cannot be reached from a stage name.
   */
  isFirst: boolean;
  /** Gate names (`'released'`, `'healthy'`) the ChangeWorkflow stage declared. Empty for the synthetic source stage. */
  prerequisites: string[];
}

/**
 * Why a stage sequence could not be built, when it could not. Rendered as an
 * honest empty state rather than a fabricated sequence.
 */
export type RolloutSequenceProblem =
  | { kind: 'no-workflow' }
  | { kind: 'stage-selects-nothing'; stageName: string }
  /** The stage's selector names the component, which is the ChangeOrder's to supply. */
  | { kind: 'stage-names-component'; stageName: string };

export interface RolloutSequence {
  stages: RolloutStage[];
  /** Stages dropped from the sequence, with the reason. Never silently discarded. */
  problems: RolloutSequenceProblem[];
}

/**
 * One gate governing entry to a stage.
 *
 * Gates are a client-side derivation with no backend entity behind them. They
 * mirror `validateStageEntryGates` in the `cub` CLI, which is the only
 * authority on this ordering, and they reuse its wording verbatim so the UI and
 * the CLI can never tell a user two different stories.
 */
export interface RolloutGate {
  /** Stable slug used for `data-testid` and as the React key. Never an index. */
  id: string;
  /** Display name, e.g. `check/live-status-green`. */
  name: string;
  /** Satisfied. Only meaningful when `evaluated` is true. */
  ok: boolean;
  /**
   * False when an upstream gate has not been satisfied, so this one has not been
   * assessed. Rendered as "not evaluated", which is the true state — NOT as a
   * failure, and never as a pass.
   */
  evaluated: boolean;
  /** Plain-language reason, in the CLI's own words where one applies. */
  reason: string;
  /** Named approvers, when the gate has any. */
  approvers?: RolloutApprover[];
}

export interface RolloutApprover {
  /** User ID — the only unique handle. */
  userId: string;
  /** Resolved display name, or a shortened user ID when it cannot be resolved. */
  name: string;
  /** Up-to-two-letter monogram for the avatar. */
  initials: string;
}

export interface RolloutGateTally {
  total: number;
  satisfied: number;
}

/**
 * Where one Space has got to. Ordered loosely from "not started" to "finished"
 * but treated as an enum, never compared with `<`.
 */
export type RolloutSpaceVerdict =
  | 'source' // the base — where the change enters
  | 'gated' // blocked by the stage sequence
  | 'waiting' // gates satisfied, not promoted yet
  | 'promoting' // our own promote is in flight
  | 'promoted' // took the change, not released
  | 'released' // took the change and released it
  | 'restored' // the change was taken back out again, and the undoing is not released
  | 'restore-released' // the change was taken back out and the undoing released
  | 'unknown'; // progress could not be derived — see RolloutProgressAvailability

/** Where a whole stage has got to, aggregated over its Spaces. */
export type RolloutStageVerdict =
  | 'source'
  | 'gated'
  | 'waiting'
  | 'in-progress'
  | 'promoted'
  | 'released'
  | 'restored'
  | 'restore-released'
  | 'unknown';

export interface RolloutSpaceState {
  spaceId: string;
  verdict: RolloutSpaceVerdict;
  /** One-line strip copy for the node card. */
  strip: string;
  /** Trailing detail on the strip (a time, or a sequence position). May be empty. */
  detail: string;
}

export interface RolloutStageState {
  stageId: string;
  verdict: RolloutStageVerdict;
  /** Short label, e.g. "In progress". */
  label: string;
  /** Progress clause, e.g. "1 of 2 spaces promoted · 1 in flight". */
  progress: string;
  promotedCount: number;
  /**
   * Spaces the change has been taken back out of. Excluded from `promotedCount`
   * rather than added to it: a restored Space no longer holds the change, so
   * counting it as promoted is the "N of N promoted" beside a stage that has
   * been undone.
   */
  restoredCount: number;
  inFlightCount: number;
  spaceCount: number;
  gates: RolloutGate[];
  gateTally: RolloutGateTally;
  /** True when every gate that has been evaluated is satisfied. */
  gatesOpen: boolean;
}

/**
 * Whether the ChangeOrder's progress could be trusted at all.
 *
 * `ResolvedSpaceIDs` / `ReleasedSpaceIDs` are derived server-side when the
 * ChangeOrder is read, and `setChangeOrderPropagation` deliberately swallows
 * derivation failures — "a failure to derive them is not a failure to read the
 * ChangeOrder". So a server that cannot answer returns **200 with the fields
 * absent**, which is indistinguishable from "nothing has been promoted yet"
 * unless you look for it.
 *
 * The discriminator: `ResolvedSpaceIDs` is documented to contain the Spaces that
 * have taken the change "plus the Space it resides in", so the ChangeOrder's own
 * Space is ALWAYS a member. If it is missing, the derivation did not run, and the
 * honest answer is "unavailable" — never a confident "0 of N promoted".
 */
export type RolloutProgressAvailability = 'available' | 'unavailable';

/**
 * Whether the ChangeOrder actually carries a change.
 *
 * A ChangeOrder cut over a Space that holds no Units carries nothing: no
 * Revision belongs to its interval, so there is no change to promote. This is
 * reachable — the test fixture reproduces it deliberately — and it is what this
 * flag detects, by asking whether any Revision carries the ChangeOrder.
 *
 * What it means for the reader is the point. Such an order reports 0 of N stages
 * promoted, which is *arithmetically* correct and *substantively* misleading: it
 * describes a rollout that is waiting to happen, when in fact there is nothing
 * to roll out and nothing will ever move. "Carries no change" is the honest
 * headline; a progress count is not.
 *
 * A NOTE ON PROVENANCE, since the comment here previously said otherwise. This
 * guard was first written against a report that a vacuous ChangeOrder came back
 * with `ResolvedSpaceIDs` FULL — every Space resolved the instant it was
 * created, reading as a rollout that reached production before anyone touched
 * it. That turned out to be a fixture artefact (downstream Units built through
 * a non-product endpoint, leaving no Link to carry the order), not a product
 * behaviour, and it has not been reproducible through legitimate paths: a
 * genuinely empty ChangeOrder resolves only its own Space. The guard is kept
 * because the state it detects is real and the copy it produces is more honest,
 * not because it averts that much larger failure. Do not restore the stronger
 * claim without evidence for it.
 */
export type RolloutCarries = 'unknown' | 'empty' | 'nonempty';

export interface RolloutProgress {
  availability: RolloutProgressAvailability;
  /** Spaces that have taken the change. Empty when unavailable. */
  resolvedSpaceIds: ReadonlySet<string>;
  /** Spaces that have released it. Empty when unavailable. */
  releasedSpaceIds: ReadonlySet<string>;
  /**
   * Spaces the change has since been taken back out of, read off the restore
   * Tag. A restore mints a NEW Revision and leaves the end Tag where it was, so
   * a restored Space stays in both sets above — which is why nothing here can
   * be read as promoted or released without consulting this first.
   */
  restoredSpaceIds: ReadonlySet<string>;
  /** Spaces whose undoing has been released. A subset of `restoredSpaceIds`. */
  releasedRestoredSpaceIds: ReadonlySet<string>;
}

/** One resource's worth of incoming change, grouped for the treeview. */
/**
 * One thing the promotion could not do to a resource, as the dry run reported it.
 *
 * A resource with no changed paths is normally one the change does not touch.
 * This is the exception: the change DID touch it and something refused. The two
 * are indistinguishable by their field diffs — both are empty — so the refusal
 * has to be carried, not inferred.
 */
export interface RolloutResourceConflict {
  /**
   * Verbatim from the API, which types it as a plain string rather than an enum.
   * Carried as it arrived so a reason we do not model still reaches the reader —
   * a tenth reason must not vanish because nine were known when this was written.
   */
  reason: string;
  /** `namespace/name` inside the payload, when the conflict names a resource. */
  resourceName?: string;
  /** The path inside that resource. Absent means the whole resource. */
  path?: string;
  /** What the reason alone cannot say — the only content a `ReplayFailed` carries. */
  details?: string;
  /**
   * False ONLY for the reasons that report the change landing and say what the
   * variant lost. Everything else blocks, including a reason we do not
   * recognise: "something stopped this and we cannot say what" is the safe
   * reading, and silence is not.
   */
  blocks: boolean;
}

export interface RolloutChangeGroup {
  /** Unit ID — the identity TreeDiffSection keys on. Never shown to the user. */
  unitId: string;
  /** Resource name, shown as the section label. */
  resourceName: string;
  /** Resource kind (`Deployment`, `ConfigMap`, …) when it can be determined. */
  resourceKind?: string;
  /**
   * Resource identity read from the configuration, and the ONLY key that joins
   * one resource across Spaces. `resourceName` above is a Space-scoped slug and
   * cannot do it: two variants can hold one resource under different slugs.
   *
   * `undefined` when the configuration carries no identity — a format with no
   * such concept, or data that could not be read. A row keyed on the fallback
   * can only be compared against variants that fell back the same way, so
   * `buildStageMatrix` refuses to call any variant "missing" such a row.
   */
  resourceIdentity?: string;
  /**
   * The same identity with the namespace kept.
   *
   * Only a tiebreak: two resources of ONE Space that `resourceIdentity` cannot
   * separate differ in nothing BUT the namespace, so it is the only honest way
   * to tell them apart — and unlike the slug it is not Space-scoped, so the two
   * still join across variants.
   */
  resourceIdentityNamespaced?: string;
  /**
   * Every spelling this resource may be joined under, for a caller matching by
   * membership. Set on the groups describing the change AS AUTHORED, where both
   * sides and both forms have to be reachable; a stage row keys on one spelling
   * and needs no list.
   */
  resourceIdentityJoinKeys?: readonly string[];
  fieldDiffs: { path: string; oldValue: string; newValue: string }[];
  /**
   * Every flattened path/value pair of the AFTER side, for `TreeDiffSection`'s
   * context expansion — the folder-row "show N more" affordance and
   * `injectKeyContext`'s array-element identifying sibling. `undefined` when
   * `afterData` could not be read at all (mirrors `fieldDiffs` being empty in
   * that same case): a tree with no context list falls back to changed-paths-only,
   * which is the honest answer when there is nothing to expand into.
   */
  allPaths?: { path: string; value: string }[];
  /**
   * True when `fieldDiffs` was computed against a written Revision (a promotion
   * that already ran), false when it came from a live dry run. Per-resource, not
   * per-stage: promote is two calls, and a mid-sequence failure can leave a stage
   * with some resources written and others not — a stage-level flag would mark
   * the un-written ones as written too.
   */
  written: boolean;
  /**
   * What the promotion could not do to this resource, from the dry run.
   *
   * Empty or absent is the ordinary case and must stay ordinary: the field is
   * unverified against a live dry run, so nothing may depend on it arriving.
   */
  conflicts?: readonly RolloutResourceConflict[];
  /**
   * False when this resource's change could not be established at all this round
   * — the dry run's first attempt failed before any data ever landed, or there
   * was no "before" data to diff against. `fieldDiffs` is empty either way this
   * happens, but that emptiness must be read as "cannot be determined", never as
   * "unchanged" or "everything is new".
   */
  determinable: boolean;
}
