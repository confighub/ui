// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Seeding for Rollout-mode specs: a ChangeOrder travelling a stage sequence.
//
// The shape mirrors the approved mockup (mockups/changeorder-rollout/best),
// because the states the mockup draws are the states the specs have to reach:
//
//     base ──▶ dev ──▶ staging ──────▶ prod-us-east
//                  └─▶ staging-canary  ├▶ prod-eu-west
//                                      └▶ prod-ap-south
//
// Two stages fan out (staging has 2 Spaces, prod has 3) on purpose. A stage
// with one Space cannot show the property the whole feature turns on — the
// gate is over EVERY Space in the previous stage, not just the one that
// happens to be furthest ahead — which is the same reason
// test/scripts/test-previous-stage.sh adds a second variant per stage.
//
// ── Four things this file knows that cost real time to find out ──────────
//
// 1. Stage order comes from the ChangeWorkflow's `Stages` array, not from
//    Space labels. `Stage` and `PreviousStage` are still set on each Space,
//    but they are ordinary labels now — read only by the matching stage's
//    `WhereSpace` predicate, not a magic pair the promote path inspects
//    directly. A ChangeWorkflow is an entity of its own; the ChangeOrder names
//    one with `ChangeWorkflowID`, and the server copies that workflow's spec
//    onto the ChangeOrder as `ChangeWorkflow` when the order is created. That
//    frozen copy is what every reader gates on, so a workflow edited later
//    cannot change the rules a rollout already under way is held to. The
//    workflow is seeded into a dedicated `<appLabel>-workflow` Space, which
//    keeps it out of the component's own Space list.
//
// 2. Scope is not optional. `ChangeOrder.InScopeSpaceIDs` is the list of
//    Spaces the change propagates into, supplied by the client at creation
//    (formerly a `SpaceFilterID`, dropped — #5160: "the spaces a change is
//    headed for are a list clients set"); a ChangeOrder without one "names a
//    change without saying where it is headed", and its derived
//    `ResolvedSpaceIDs` never grows past the Space it lives in — which reads,
//    wrongly, as a rollout that never moves. So the literal list of every
//    Space this fixture creates is passed at creation.
//
// 3. Variants are cloned with the BULK endpoint, and only the bulk endpoint:
//
//      POST /api/unit?where=SpaceID='<up>'&where_space=SpaceID IN ('<down>')
//      Content-Type: application/merge-patch+json
//
//    It creates the Units AND their UpgradeUnit Links in one call. Creating a
//    Unit one at a time with `UpstreamUnitID` on the per-Space route looks
//    equivalent and is not: it makes no Link, and the lineage it does record is
//    not one a promotion can replay a change into — the promote then advances
//    every revision pointer, reports 200, and silently leaves the downstream
//    data unchanged. The merge-patch content type is required; without it the
//    call is a 400.
//
// 4. The change has to live inside a ChangeSet, or the ChangeOrder's interval is
//    empty. Open the ChangeSet on the source Units, mutate them, then close it —
//    the open is what lands the start Tag on each head BEFORE the mutation. A
//    ChangeOrder cut over an empty interval carries nothing, so every Space in
//    scope resolves trivially ("carries nothing to merge") and the rollout reads
//    as finished the moment it starts.
//
//    Promotion then names the ChangeOrder explicitly:
//      PATCH /api/unit?where=SpaceID IN (...)&upgrade=true&change_order=<id>
//
// A Space is also a Deployment rather than a Base only if a Unit in it carries a
// TargetID — `buildComponentData` drops live status entirely for a Base. The
// same Target is what `publishRelease` needs, so each deployment Space gets one
// up front and it serves both purposes.
//
// ── Server requirement ──────────────────────────────────────────────────
//
// `ResolvedSpaceIDs` / `ReleasedSpaceIDs` are derived at read time by code that
// landed in #5103 (2026-08-19). Against an older server both fields are absent
// from the response — silently, because the derivation swallows its own
// failures — and every count reads zero. `assertPropagationSupported` fails
// loudly instead, so a spec that depends on movement says WHY it cannot run
// rather than reporting a rollout that never moved.

import { type Page, expect } from '@playwright/test';

import type {
  ChangeWorkflow,
  ChangeWorkflowStage,
  ExtendedReleaseRead,
  ReleaseLiveStatus,
} from '@confighub/rtk-query';

import { ApiHelper } from './api-helper';
import { RandomSlugGenerator } from './utils/random-slug-generator';
import { hubApi } from './test';

/**
 * The stages this fixture's rollouts are governed by.
 *
 * The selectors name no component. A stage's members are its selector's
 * Spaces within the ChangeOrder's `InScopeSpaceIDs`, which this fixture sets to
 * the Spaces it builds, so other runs' Spaces at the same stage stay out.
 *
 * The prerequisite names are the built-ins as the server spells them —
 * capitalised. A workflow naming `released` is refused before it is stored,
 * so this is the only spelling a fixture can seed.
 */
const STANDARD_STAGES: ChangeWorkflowStage[] = [
  { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
  { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'", Prerequisites: ['Released'] },
  { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'", Prerequisites: ['Released', 'Healthy'] },
];

/**
 * One stage that names no selector: it takes every Space of the component the
 * ChangeOrder is for. The stage's name is the deep-link segment the specs use.
 */
export const WHOLE_COMPONENT_STAGE = 'everywhere';
const WHOLE_COMPONENT_STAGES: ChangeWorkflowStage[] = [{ Name: WHOLE_COMPONENT_STAGE }];

/**
 * A check the workflow declares for itself, as a CEL expression evaluated
 * against the Space, the ChangeOrder and that Space's Release. The expression
 * is compiled when the workflow is written, so it has to be one the server will
 * accept; what it actually asks for is immaterial here, because nothing in
 * `ui/` evaluates it.
 */
export const CUSTOM_PREREQUISITE = {
  Name: 'QA sign-off',
  Description: 'A tester has recorded a pass against this Space.',
  Expression: 'cel:Space.Annotations["confighub.com/qa-sign-off"] == "yes"',
};

/** `dev` is ungated; `prod` gates ONLY on the declared check. */
const CUSTOM_PREREQUISITE_STAGES: ChangeWorkflowStage[] = [
  { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
  {
    Name: 'prod',
    WhereSpace: "Labels.Stage = 'prod'",
    Prerequisites: [CUSTOM_PREREQUISITE.Name],
  },
];

/**
 * The same three stages as `STANDARD_STAGES` with every prerequisite removed,
 * and no `Final` — so nothing anywhere in this workflow asks a health question.
 *
 * ⚠️ THE EMPTINESS IS THE FIXTURE. `evaluatePrerequisites` over an empty
 * prerequisite list checks only that the change arrived
 * (`internal/views/promote_gates.go`), so `cub` promotes into `staging` over a
 * `dev` reporting Degraded — it never reads the annotation. Declare one
 * prerequisite here and the gate channel answers the health question itself,
 * the stage is genuinely held, and the degraded-but-ungated case this shape
 * exists to reach is no longer reachable at all.
 */
const NO_HEALTH_CHECK_STAGES: ChangeWorkflowStage[] = [
  { Name: 'dev', WhereSpace: "Labels.Stage = 'dev'" },
  { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'" },
  { Name: 'prod', WhereSpace: "Labels.Stage = 'prod'" },
];

/** The `workflow` options that actually seed a ChangeWorkflow — everything but `none`. */
type GovernedWorkflow = Exclude<NonNullable<BuildRolloutFixtureOptions['workflow']>, 'none'>;

/**
 * The stages each governed `workflow` option seeds. A record rather than a
 * chain of ternaries so a new shape is one line and cannot be added in the
 * wrong branch of the chain.
 */
const WORKFLOW_STAGES: Record<GovernedWorkflow, ChangeWorkflowStage[]> = {
  standard: STANDARD_STAGES,
  'whole-component': WHOLE_COMPONENT_STAGES,
  'custom-prerequisite': CUSTOM_PREREQUISITE_STAGES,
  'no-health-check': NO_HEALTH_CHECK_STAGES,
};

/**
 * Create a ChangeWorkflow and return its id.
 *
 * Exported so a spec can seed shapes this fixture's own rollout does not use —
 * a stage with no selector, a workflow with no `Final`, a custom prerequisite —
 * without a second copy of the request.
 */
export async function createChangeWorkflow(
  page: Page,
  spaceId: string,
  changeWorkflow: ChangeWorkflow,
): Promise<string> {
  const response = await hubApi.post(`/api/space/${spaceId}/change_workflow`, {
    data: changeWorkflow,
  });
  if (!response.ok()) {
    throw new Error(
      `Failed to create ChangeWorkflow ${changeWorkflow.Slug}: ` +
        `${response.status()} ${await response.text()}`
    );
  }
  const created = (await response.json()) as { ChangeWorkflowID?: string };
  if (created.ChangeWorkflowID === undefined) {
    throw new Error(
      `ChangeWorkflow ${changeWorkflow.Slug} was created without an id: ${JSON.stringify(created)}`
    );
  }
  return created.ChangeWorkflowID;
}

/** Required on the bulk Unit routes; without it they answer 400. */
const MERGE_PATCH = { 'Content-Type': 'application/merge-patch+json' };

/**
 * How long the post-clone readback may lag before it counts as a failure.
 *
 * Raised from 10s, which was measured against a spec running ALONE. Playwright
 * runs `workers: 2` locally and `'100%'` in CI, so several specs build their
 * fixtures against one server at once and the eventual-consistency window
 * widens with the load. At 10s this threw roughly one sweep in four with
 * `--workers=2`, reported against whichever spec happened to lose the race —
 * a fixture-level flake that reads as a failure of the test it lands in, which
 * is the most expensive kind to diagnose.
 *
 * A long ceiling costs nothing on the happy path: the loop polls every 200ms
 * and returns the moment the readback catches up, so this is only ever reached
 * when something is genuinely wrong, and then the message says so.
 */
const CLONE_READBACK_TIMEOUT_MS = 45_000;

/**
 * What a Space's live status reports: the `LiveStatus` on the Release it is
 * running, which is what the server's `Healthy` gate reads.
 *
 * The gate makes separate checks of it, each with its own message, so each
 * value here buys a distinct negative-path test rather than a single generic
 * "unhealthy" one:
 *
 *   absent     -> "Variant '<v>' has no live status for release <n> yet"
 *   outofsync  -> "Variant '<v>' release <n> is not synced (OutOfSync)"
 *   failed     -> "Variant '<v>' release <n> failed to deploy"
 *   unhealthy  -> "Variant '<v>' release <n> is not healthy (Degraded)"
 *   green      -> passes all four
 */
export type LiveHealth = 'green' | 'outofsync' | 'failed' | 'unhealthy' | 'absent';

/** One Space in the sequence. */
export interface RolloutSpace {
  slug: string;
  spaceId: string;
  /** The `Stage` label. `null` for the base, which is not a stage. */
  stage: string | null;
  /** The `PreviousStage` label. `null` where no gate applies. */
  previousStage: string | null;
  /** Slug -> UnitID for the Units seeded into this Space. */
  units: Record<string, string>;
  targetId?: string;
}

export interface RolloutFixture {
  /** The slug of the Component every Space is in, and the graph is keyed on. */
  appLabel: string;
  baseSpaceId: string;
  changeOrderId: string;
  changeOrderSlug: string;
  /** The Space the ChangeOrder resides in — `base` unless `interval: 'none'`. */
  changeOrderSpaceId: string;
  /**
   * The ChangeWorkflow governing the rollout, or `undefined` under
   * `workflow: 'none'`. The ChangeOrder carries a frozen copy of this
   * workflow's spec; the entity itself is what supplies its name.
   */
  changeWorkflowId: string | undefined;
  /**
   * The Space the workflow lives in, so a spec can seed further workflows
   * beside it with `createChangeWorkflow` and have them torn down with the rest.
   */
  workflowSpaceId: string;
  /** Every Space, keyed by its short name (`base`, `dev`, `staging`, …). */
  spaces: Record<string, RolloutSpace>;
  /** Short names of the Spaces in one stage. */
  spacesInStage(stage: string): RolloutSpace[];
  /** Upgrade every Space of a stage from its upstream — the promote leg. */
  promoteStage(stage: string): Promise<void>;
  /**
   * Upgrade only the NAMED Spaces, leaving the rest of their stage untouched.
   *
   * A stage is not always uniformly promoted — a mid-sequence failure (§9.3)
   * or simply promoting one Space at a time can leave a fan-out stage with
   * some Spaces written and others not. That is the one case that tells apart
   * a correct PER-UNIT written/pending distinction from a plausible
   * STAGE-LEVEL one: both pass every test where a stage is promoted all at
   * once or not at all, and only this shape shows a stage-level flag
   * mislabelling the un-written Space as written.
   */
  promoteSpaces(spaceNames: string[]): Promise<void>;
  /**
   * Publish a Release in every Space of a stage — the release leg. Each is
   * published for the fixture's ChangeOrder, which is what advances its
   * recorded Stage.
   */
  releaseStage(stage: string): Promise<void>;
  /**
   * Give one Space a local override — a value edited in that Space only.
   *
   * `untouched` edits a path the ChangeOrder does not carry (replicas), so the
   * promote leaves it alone. `overwritten` edits a path the ChangeOrder DOES
   * carry (the image), so the promote will replace it. The second is the one
   * worth warning a user about, and the one no fixture without per-Space drift
   * can produce.
   *
   * `kept` is `overwritten` written with `protect=true` — the product's
   * `Keep on merge`. It is the ONLY one of the three whose RESULTING value
   * differs from its siblings' after the promote: verified against a live
   * server, an unprotected local edit on a carried path is replaced by the
   * upgrade (so every variant lands on the same new value and the promote is
   * genuinely the same change everywhere), while a protected one survives it.
   * Divergence between variants is the signal the whole comparison exists to
   * show, and protection is the mechanism that produces it.
   */
  setLocalOverride(spaceName: string, kind: 'untouched' | 'overwritten' | 'kept'): Promise<void>;

  /**
   * Delete one resource from one Space, leaving its siblings holding it.
   *
   * The only route to a variant whose resource SET differs from the rest of its
   * stage. Every other shape this fixture builds clones every Space from one
   * upstream in a single bulk call, so all of a stage's variants hold exactly
   * the same resources and a per-resource comparison across them can only ever
   * come out uniform — not because the comparison is right, but because it was
   * never given anything to disagree about.
   */
  dropResource(spaceName: string, resource: string): Promise<void>;

  /**
   * Rewrite one Space's live status, or remove it (`absent`).
   *
   * Written onto the Release the Space is running, as a deploying tool would,
   * and remembered for the Releases `releaseStage` publishes after it. This is
   * how the live status gate messages are reached: changing it changes the
   * verdict without touching anything else. Cheap negative-path coverage.
   */
  setLiveStatus(spaceName: string, health: LiveHealth): Promise<void>;
  /**
   * The live status of the Release the Space is running, read back from the
   * server: `null` when that Release carries none, `undefined` when the Space
   * has published no Release.
   */
  liveStatusOf(spaceName: string): Promise<ReleaseLiveStatus | null | undefined>;
  /**
   * Where the ChangeOrder says it has got to.
   *
   * `derived` is the honest-answer flag: false means the server did not derive
   * the sets at all, which is NOT the same as a rollout that has not moved.
   * A UI that conflates the two renders a confident, plausible, wrong picture.
   */
  propagation(): Promise<{ resolved: string[]; released: string[]; derived: boolean }>;
  /**
   * Fail loudly if the server cannot answer where the ChangeOrder has got to,
   * naming the cause. Call this at the top of any spec whose assertions depend
   * on the rollout MOVING; without it such a spec fails as a UI defect.
   */
  assertPropagationSupported(): Promise<void>;
  teardown(): Promise<void>;
}

/** The resources the mockup's treeview shows, including one it never changes. */
const RESOURCES = {
  app: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: confighub-app
  labels:
    app.kubernetes.io/version: "__VERSION__"
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: app
          image: ghcr.io/confighubai/confighub:v__VERSION__
          resources:
            limits:
              memory: __MEMORY__
`,
  worker: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: confighub-worker
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: worker
          image: ghcr.io/confighubai/confighub-worker:v__VERSION__
`,
  config: `apiVersion: v1
kind: ConfigMap
metadata:
  name: confighub-app-config
data:
  APP_VERSION: "__VERSION__"
`,
  // Deliberately carries no templated value: the ChangeOrder changes nothing
  // here, which is what makes the treeview's "unchanged" row real rather than
  // a rendering special case.
  namespaces: `apiVersion: v1
kind: Namespace
metadata:
  name: confighub-app
`,
};

type ResourceName = keyof typeof RESOURCES;

const ALL_RESOURCES = Object.keys(RESOURCES) as ResourceName[];

/** The version the fixture starts at, and the one the ChangeOrder moves it to. */
const BEFORE = { version: '0.2.19', memory: '512Mi' };
const AFTER = { version: '0.2.20', memory: '768Mi' };

function render(resource: ResourceName, at: { version: string; memory: string }): string {
  return RESOURCES[resource]
    .replaceAll('__VERSION__', at.version)
    .replaceAll('__MEMORY__', at.memory);
}

/**
 * The `LiveStatus` argobot writes onto a Release. Returns null for `absent`,
 * which is its own gate case — a Release nobody has reported on is not the
 * same as an unhealthy one.
 */
function liveStatus(spaceSlug: string, health: LiveHealth): ReleaseLiveStatus | null {
  if (health === 'absent') return null;

  return {
    Reporter: 'argobot',
    DataSource: spaceSlug,
    Sync: health === 'outofsync' ? 'OutOfSync' : 'Synced',
    Health: health === 'unhealthy' ? 'Degraded' : 'Healthy',
    Operation: health === 'failed' ? 'Failed' : 'Succeeded',
    ...(health === 'failed' ? { ReporterOperation: 'Error' } : {}),
    Message: health === 'green' ? 'successfully synced' : `reported ${health}`,
    ObservedAt: '2026-01-01T00:00:00Z',
  };
}

/** The published Release a Space is running: the one with the highest number. */
async function latestPublishedRelease(spaceId: string): Promise<ExtendedReleaseRead | undefined> {
  const resp = await hubApi.get(`/api/space/${spaceId}/release`, {
    params: { where: 'Published = true' },
  });
  if (!resp.ok()) {
    throw new Error(`Failed to list the releases of ${spaceId}: ${resp.status()} ${await resp.text()}`);
  }
  const releases = (await resp.json()) as ExtendedReleaseRead[];
  return releases.reduce<ExtendedReleaseRead | undefined>(
    (latest, entry) =>
      (entry.Release?.ReleaseNum ?? 0) > (latest?.Release?.ReleaseNum ?? 0) ? entry : latest,
    undefined,
  );
}

/**
 * Report `health` on the Release a Space is running, as argobot does once it
 * has deployed it. `absent` clears the status. A Space that has published no
 * Release has nothing to report on, so nothing is written.
 */
async function reportLiveStatus(spaceId: string, spaceSlug: string, health: LiveHealth): Promise<void> {
  const release = (await latestPublishedRelease(spaceId))?.Release;
  if (!release?.ReleaseID) return;
  const resp = await hubApi.patch(`/api/space/${spaceId}/release/${release.ReleaseID}`, {
    headers: { 'Content-Type': 'application/merge-patch+json' },
    data: { LiveStatus: liveStatus(spaceSlug, health) },
  });
  if (!resp.ok()) {
    throw new Error(
      `Failed to report live status on ${spaceSlug} release ${release.ReleaseNum}: ` +
        `${resp.status()} ${await resp.text()}`
    );
  }
}

/**
 * What the Spaces say about stages.
 *
 * `sequence` is the four-stage topology above. The other two are the shapes a
 * rollout takes when it can never move: `unlabelled` writes no `Stage` label
 * at all, `all-none` writes `Stage=None` on every Space — the value an
 * external process writes on Spaces outside any sequence, rather than leaving
 * the label unset.
 */
export type StageLabelling = 'sequence' | 'unlabelled' | 'all-none';

/**
 * How many stages the sequence declares.
 *
 * `four-stage` is the topology drawn at the top of this file. `single-stage` is
 * the shortest thing that is still a rollout: one source Space and one stage
 * holding one variant.
 *
 * Both are worth seeding because everything that varies BY STAGE COUNT is
 * otherwise unexercised rather than passing — a corpus where every ChangeOrder
 * has the same four stages can no more catch a one-stage defect than the
 * all-four-stage corpus could catch the zero-stage crash `stageLabels` exists
 * for. Uniform is not clean.
 */
export type StageDepth = 'four-stage' | 'single-stage';

interface TopologyNode {
  name: string;
  stage: string | null;
  previousStage: string | null;
  upstream: string | null;
  health: LiveHealth;
}

/**
 * The sequence, as Space short-name -> its two labels and its upstream.
 * `labelBaseStage` decides whether the base is a named stage the first
 * promotable stage points back to, or an unlabelled source.
 *
 * `stageLabels` strips the sequence back to a topology that has Spaces, a
 * ChangeOrder and a real scope, but no stages to promote through. The two
 * ways that happens are separate code paths in `scopedSpacesFor` — an absent
 * label leaves the Space in scope with nothing to group it by, while
 * `Stage=None` is filtered out of scope entirely — so both are reachable
 * here rather than only the tidier one.
 */
function topologyFor(
  labelBaseStage: boolean,
  stageLabels: StageLabelling,
  stageDepth: StageDepth,
): TopologyNode[] {
  const base: TopologyNode = { name: 'base', stage: labelBaseStage ? 'base' : null, previousStage: null, upstream: null, health: 'green' };
  const sequence: TopologyNode[] = stageDepth === 'single-stage'
    ? [
      base,
      // One stage, one Space in it. The stage the gate is over is the source
      // itself, so `PreviousStage` has nowhere else to point.
      { name: 'prod', stage: 'prod', previousStage: labelBaseStage ? 'base' : null, upstream: 'base', health: 'green' },
    ]
    : [
      base,
      { name: 'dev', stage: 'dev', previousStage: labelBaseStage ? 'base' : null, upstream: 'base', health: 'green' },
      { name: 'staging', stage: 'staging', previousStage: 'dev', upstream: 'dev', health: 'outofsync' },
      { name: 'staging-canary', stage: 'staging', previousStage: 'dev', upstream: 'dev', health: 'outofsync' },
      { name: 'prod-us-east', stage: 'prod', previousStage: 'staging', upstream: 'staging', health: 'green' },
      { name: 'prod-eu-west', stage: 'prod', previousStage: 'staging', upstream: 'staging', health: 'green' },
      { name: 'prod-ap-south', stage: 'prod', previousStage: 'staging', upstream: 'staging', health: 'green' },
    ];
  if (stageLabels === 'sequence') return sequence;

  // The upstream chain is left alone: it is what clones the Units down, and a
  // rollout with no stages still has to be a rollout over real Spaces.
  return sequence.map((node) => ({
    ...node,
    stage: stageLabels === 'all-none' ? 'None' : null,
    // A `PreviousStage` pointing at a stage nobody is in is a different
    // condition (`rolloutStages.ts` reports it), and not the one under test.
    previousStage: null,
  }));
}

export interface BuildRolloutFixtureOptions {
  /**
   * How many resources to seed per Space. `full` seeds all four, which the
   * treeview assertions need; `minimal` seeds only the app Deployment, which
   * is enough for graph, entry and copy specs and is much quicker.
   */
  resources?: 'full' | 'minimal';
  /**
   * Whether to give each deployment Space an OCI Target and wire it as the
   * Space's ReleaseTargetID. Required for `releaseStage`, and for live status
   * to render at all. On by default.
   */
  releasable?: boolean;
  /**
   * How the ChangeOrder's interval is cut.
   *
   * `changeset` (the default) is the real recipe: open a ChangeSet on the
   * source Units, mutate them, close it, and adopt its end Tag. The interval
   * brackets the change, so the ChangeOrder carries something.
   *
   * `empty` deliberately reproduces the VACUOUS ChangeOrder: mutate the base
   * Units with no ChangeSet open and let the ChangeOrder cut its own Tag over
   * the head Revisions afterwards. The interval then contains nothing, and the
   * consequence is not a visible error but a lie — every Space in scope
   * satisfies "carries nothing to merge", so a UI counting resolved Spaces
   * reports a rollout that is 100% complete the instant it is created.
   *
   * `none` produces a ChangeOrder that NO Revision carries at all, by cutting
   * it in a Space that holds no Units and writing no change. This is the state
   * a "does anything carry this ChangeOrder?" guard exists for, and it is the
   * only route to it I have found: cutting a ChangeOrder over Units that DO
   * exist always tags their head Revision, so something is always carried.
   *
   * That is worth a fixture rather than a footnote: each is reachable in the
   * product, each looks exactly like success, and neither is something a
   * progress count can distinguish on its own.
   */
  interval?: 'changeset' | 'empty' | 'none';
  /**
   * Whether the base Space carries a `Stage` label of its own, with the first
   * promotable stage naming it as its `PreviousStage`.
   *
   * This is the shape the APPROVED DESIGN uses — the mockup's own sample data
   * has `{ id:'base', stage:'base' }` — so a labelled base is the normal case,
   * not an exotic one. The fixture defaulted to an unlabelled base because
   * that was the simpler thing to build, and a real bug lived in the labelled
   * path for exactly as long as neither side's fixture went there: the source
   * Space was renamed to a synthetic id before stages were grouped, so a
   * downstream Space whose PreviousStage said `base` could never resolve it,
   * and the UI blamed the user's labels for a name the code had changed.
   *
   * Off by default so the existing tests keep their topology; the point is
   * that BOTH shapes are legitimate and both need a test.
   */
  labelBaseStage?: boolean;
  /**
   * Whether the Spaces declare a stage sequence at all.
   *
   * Defaults to `sequence`. The other two produce a rollout with real Spaces,
   * a real scope and nowhere to go, which is the one shape every surface
   * derives a state for and no other fixture can reach. `promoteStage`,
   * `releaseStage` and `spacesInStage` have no stages to name then and are
   * not usable.
   */
  stageLabels?: StageLabelling;
  /**
   * How many stages the sequence declares. Defaults to `four-stage`.
   *
   * `single-stage` also gives the ONLY stage exactly one variant, so it is the
   * one shape where the whole comparison apparatus has nothing to compare —
   * see `MIN_COMPARABLE_VARIANTS`. It names its stage `prod`, and the Space is
   * `spaces.prod`; none of `dev`, `staging` or `prod-*` exist in it.
   */
  stageDepth?: StageDepth;
  /**
   * Whether a ChangeWorkflow governs the rollout at all. Defaults to
   * `standard`, the three stages above.
   *
   * `none` leaves `ChangeWorkflowID` unset, so the ChangeOrder reads back
   * carrying neither it nor a frozen copy — a rollout with nothing to promote
   * through, which is what `cub changeorder create` writes when
   * `--change-workflow` is omitted.
   *
   * `whole-component` seeds ONE stage carrying no `WhereSpace` at all. Empty
   * selects every Space of the component, which is a shape the old KRM model
   * refused outright, so nothing else in this suite can reach it.
   *
   * `custom-prerequisite` gates `prod` on a check the workflow declares as a
   * CEL expression. Nothing in `ui/` can evaluate CEL, so this is the shape
   * that decides whether an unevaluated check reads as unknown or as passed.
   *
   * `no-health-check` declares the same three stages with NO prerequisite on
   * any of them. It is the only shape here whose gates stay open over a stage
   * reporting a failure, which is what separates what the row says from what it
   * offers — see `NO_HEALTH_CHECK_STAGES`.
   */
  workflow?: 'standard' | 'none' | 'whole-component' | 'custom-prerequisite' | 'no-health-check';
}

/**
 * Build the whole sequence and open a ChangeOrder over it, leaving it in the
 * state the mockup opens in: the change is in the base, nothing downstream has
 * taken it yet. A spec drives it forward with `promoteStage` / `releaseStage`.
 */
export async function buildRolloutFixture(
  page: Page,
  options: BuildRolloutFixtureOptions = {}
): Promise<RolloutFixture> {
  const {
    resources = 'full',
    releasable = true,
    interval = 'changeset',
    labelBaseStage = false,
    stageLabels = 'sequence',
    stageDepth = 'four-stage',
    workflow = 'standard',
  } = options;
  const api = new ApiHelper(page);
  const appLabel = `e2e-rollout-${RandomSlugGenerator.randomSlugName()}`;
  const seeded: ResourceName[] = resources === 'full' ? ALL_RESOURCES : ['app'];
  const TOPOLOGY = topologyFor(labelBaseStage, stageLabels, stageDepth);
  const spaces: Record<string, RolloutSpace> = {};
  /** What each deployment Space's deploying tool reports, written onto each Release it publishes. */
  const healthByName: Record<string, LiveHealth> = {};
  const createdSpaceIds: string[] = [];

  const teardown = async () => {
    // Reverse order: a Space is deleted after the Spaces that link to it.
    //
    // Failures are swallowed BY DESIGN — teardown runs in `afterAll`, often
    // after the test has already failed, and throwing here replaces the real
    // failure with a cleanup error. But swallowing them silently is how a
    // shared server accumulates orphaned Spaces that the next run collides
    // with, reported as an unrelated test failure days later. So: never throw,
    // always report.
    const failures: string[] = [];
    for (const spaceId of [...createdSpaceIds].reverse()) {
      try {
        await api.deleteSpace(spaceId, true);
      } catch (error) {
        failures.push(`${spaceId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) {
      console.warn(
        `[rollout-fixture] teardown could not delete ${failures.length} of ` +
          `${createdSpaceIds.length} Space(s); they are now orphaned on this ` +
          `server and may collide with a later run:\n  ${failures.join('\n  ')}`,
      );
    }
  };

  try {
    // ── Spaces, in the component, with the two labels that define the sequence ──
    const component = await api.createComponent(appLabel);
    for (const node of TOPOLOGY) {
      const slug = `${appLabel}-${node.name}`;
      const labels: Record<string, string> = { Owner: 'E2E' };
      if (node.stage) labels.Stage = node.stage;
      if (node.previousStage) labels.PreviousStage = node.previousStage;

      /*
       * `UpstreamSpaceID` IS WHAT MAKES A SPACE A VARIANT, AND IT IS NOT
       * DECORATION. `POST /api/promote` reads it to find what each Space takes
       * from, and refuses a Space without one — "only spaces created by
       * `cub variant create` can be promoted". The product's own create-variant
       * flow writes it (`useCreateVariantMutation`), so a fixture that omits it
       * builds Spaces no promotion can act on: every promote test would fail
       * against a topology no user can actually produce.
       *
       * Safe to read `spaces[node.upstream]` here because TOPOLOGY is ordered
       * upstream-first — a node's upstream is always created before it.
       */
      const annotations: Record<string, string> = {};
      const upstream = node.upstream === undefined ? undefined : spaces[node.upstream];
      if (upstream !== undefined) annotations.UpstreamSpaceID = upstream.spaceId;
      // The base has no live status: nothing deploys it. A deployment's is
      // reported on each Release `releaseStage` publishes.
      if (node.upstream) healthByName[node.name] = node.health;

      const created = await api.createSpace({
        space: {
          Slug: slug,
          ComponentID: component.ComponentID,
          Labels: labels,
          ...(Object.keys(annotations).length > 0 ? { Annotations: annotations } : {}),
        } as never,
      });

      const spaceId = (created as { SpaceID: string }).SpaceID;
      createdSpaceIds.push(spaceId);
      spaces[node.name] = {
        slug,
        spaceId,
        stage: node.stage,
        previousStage: node.previousStage,
        units: {},
      };
    }

    // ── The ChangeWorkflow, in a dedicated Space of its own ───────────────
    // A workflow governs a fleet, so it lives wherever the people who maintain
    // it put it rather than in any one component's base Space
    // (`associateChangeWorkflow` omits the Space from its lookup for exactly
    // that reason). A Space of its own also keeps it off the component's own
    // Space list, which is what every stage selector is resolved against.
    //
    // Pushed to `createdSpaceIds` immediately, before anything below it can
    // throw, so a mid-setup failure still tears it down.
    const workflowSpaceSlug = `${appLabel}-workflow`;
    const workflowSpaceCreated = await api.createSpace({
      space: {
        Slug: workflowSpaceSlug,
        ComponentID: component.ComponentID,
        Labels: { Owner: 'E2E' },
      } as never,
    });
    const workflowSpaceId = (workflowSpaceCreated as { SpaceID: string }).SpaceID;
    createdSpaceIds.push(workflowSpaceId);

    // The workflow names neither where the change starts nor which component
    // it is for. The base is the Space the ChangeOrder is created in, and the
    // component is the ChangeOrder's own Space's Component, conjoined onto
    // every stage's selector by the promote path — which is why a stage naming
    // it is refused. That is what lets one workflow govern every component's
    // rollouts unchanged.
    const changeWorkflowId =
      workflow === 'none'
        ? undefined
        : await createChangeWorkflow(page, workflowSpaceId, {
            Slug: `${appLabel}-rollout`,
            Stages: WORKFLOW_STAGES[workflow],
            ...(workflow === 'custom-prerequisite'
              ? { CustomPrerequisites: [CUSTOM_PREREQUISITE] }
              : {}),
          });

    // ── A Target per deployment Space ─────────────────────────────────────
    // Two jobs at once: it is what makes the Space a Deployment rather than a
    // Base (so live status renders), and what publishRelease publishes through.
    if (releasable) {
      for (const node of TOPOLOGY) {
        if (!node.upstream) continue;
        const space = spaces[node.name];

        const target = await api.createTarget({
          spaceId: space.spaceId,
          slug: `${space.slug}-oci`,
        });
        space.targetId = (target as { TargetID: string }).TargetID;

        await api.updateSpace({
          spaceId: space.spaceId,
          space: { ReleaseTargetID: space.targetId } as never,
        });
      }
    }

    // ── Units: seeded in the base at the BEFORE version, then cloned down ──
    // `Data` is not a field of the create body any more (#5140 — Unit.Data is
    // `json:"-"` server-side now), so a `Data:` value on the create call is
    // silently dropped rather than rejected: the Unit is created empty and
    // every downstream clone below inherits that emptiness. Write the BEFORE
    // content through the dedicated data endpoint right after creation.
    for (const resource of seeded) {
      const baseUnit = await api.createUnit({
        spaceId: spaces.base.spaceId,
        unit: {
          Slug: resource,
          ToolchainType: 'Kubernetes/YAML',
        } as never,
      });
      const unitId = (baseUnit as { UnitID: string }).UnitID;
      await api.uploadUnitData({
        spaceId: spaces.base.spaceId,
        unitId,
        body: render(resource, BEFORE),
      });
      spaces.base.units[resource] = unitId;
    }

    // ── Variants, cloned level by level with the BULK route ───────────────
    // Order matters: staging clones from dev, so dev must exist first. Cloning
    // happens BEFORE the change is written, so every downstream Space starts at
    // the state the ChangeOrder will replay a change into.
    // Every Space something clones FROM, in topology order — parents precede
    // children in TOPOLOGY, so this walks the tree top-down. Derived rather
    // than listed, because a hardcoded list of Space names clones NOTHING into
    // a topology whose names it does not happen to contain, and an empty Space
    // reads as a rollout with no content rather than as a broken fixture.
    const levels = TOPOLOGY.map((node) => node.name).filter((name) =>
      TOPOLOGY.some((node) => node.upstream === name),
    );
    for (const upstreamName of levels) {
      const targets = TOPOLOGY.filter((n) => n.upstream === upstreamName);
      if (!targets.length) continue;
      const upstream = spaces[upstreamName];
      const targetIds = targets.map((n) => `'${spaces[n.name].spaceId}'`).join(', ');

      const cloneResp = await hubApi.post('/api/unit', {
        params: {
          where: `SpaceID = '${upstream.spaceId}'`,
          where_space: `SpaceID IN (${targetIds})`,
          include: 'UnitEventID,TargetID,UpstreamUnitID,SpaceID',
        },
        headers: MERGE_PATCH,
        data: {},
      });
      if (!cloneResp.ok()) {
        throw new Error(
          `Failed to clone from ${upstream.slug} into ${targets.map((n) => n.name).join(', ')}: ` +
            `${cloneResp.status()} ${await cloneResp.text()}`
        );
      }

      /*
       * ⚠️ 207 IS NOT SUCCESS, AND `ok()` CANNOT TELL. The bulk route reports
       * PARTIAL success as 207 Multi-Status, with the refusal carried in the
       * failed entry rather than in the status line — and Playwright's `ok()`
       * is true for anything in 200–299. A clone that hit the org's Unit quota
       * therefore read as fine here and surfaced 45 seconds later as "the
       * readback did not catch up", which names the wrong thing entirely: the
       * Unit was never created and no amount of waiting would produce it.
       * Say what the server said, at the moment it said it.
       */
      const cloned = (await cloneResp.json()) as { Unit?: { Slug?: string }; Error?: { Message?: string } }[];
      const refused = cloned.filter((entry) => entry.Error !== undefined && entry.Error !== null);
      if (refused.length > 0) {
        throw new Error(
          `Clone from ${upstream.slug} was refused for ${refused.length} of ${cloned.length} Unit(s): ` +
            refused
              .map((entry) => `${entry.Unit?.Slug ?? 'unknown'}: ${entry.Error?.Message ?? 'no message'}`)
              .join('; ')
        );
      }

      // The bulk route reports what it made in aggregate, so read each Space
      // back for the Unit ids rather than trying to unpick the response.
      //
      // The clone itself is synchronous (the 200 above means it happened),
      // but this readback is a SEPARATE read against storage, and it has been
      // seen live to occasionally return fewer Units than were just created —
      // an eventual-consistency window, not a real clone failure. A single
      // one-shot read treated a still-settling readback as "the clone lost
      // resources", which is the wrong diagnosis for what is actually a wait
      // condition. Poll it the same way `releaseStage` waits out ValidationErrors:
      // bounded, narrow to the specific gap, real errors still fail fast.
      for (const node of targets) {
        const space = spaces[node.name];
        const deadline = Date.now() + CLONE_READBACK_TIMEOUT_MS;
        let missing: string[] = seeded;
        for (;;) {
          const created = await api.listUnits({
            where: `SpaceID = '${space.spaceId}'`,
            select: 'UnitID,Slug',
          });
          for (const entry of created) {
            const slug = entry.Unit?.Slug;
            const unitId = entry.Unit?.UnitID;
            if (slug && unitId) space.units[slug] = unitId;
          }
          missing = seeded.filter((resource) => !space.units[resource]);
          if (missing.length === 0) break;
          if (Date.now() > deadline) {
            throw new Error(
              `Clone into ${space.slug} did not produce ${missing.join(', ')} — ` +
                `got ${Object.keys(space.units).join(', ') || 'nothing'} ` +
                `(waited ${CLONE_READBACK_TIMEOUT_MS / 1000}s for the readback to catch up)`
            );
          }
          await page.waitForTimeout(200);
        }

        // Units must carry the Space's release Target, or releaseBundleFiles
        // bundles nothing and the Space never counts as released.
        if (space.targetId) {
          for (const unitId of Object.values(space.units)) {
            await api.updateUnit({
              spaceId: space.spaceId,
              unitId,
              unit: { TargetID: space.targetId },
            } as never);
          }
        }
      }
    }

    // ── The change itself, written into the base ──────────────────────────
    const changed = seeded.filter((resource) => resource !== 'namespaces');
    let endTagId: string | undefined;

    if (interval === 'changeset') {
      // The real recipe. The open lands the start Tag on each head BEFORE the
      // mutation; without it the ChangeOrder's interval is empty.
      const changeSet = await api.createChangeSet({
        spaceId: spaces.base.spaceId,
        changeSet: { Slug: `${appLabel}-changeset`, Description: `Release v${AFTER.version}` },
      });
      const changeSetId = (changeSet as { ChangeSetID: string }).ChangeSetID;

      const patchBaseUnit = async (unitId: string, body: unknown, inChangeSet: boolean) => {
        const resp = await hubApi.patch(
          `/api/space/${spaces.base.spaceId}/unit/${unitId}`,
          {
            ...(inChangeSet ? { params: { change_set_id: changeSetId } } : {}),
            headers: MERGE_PATCH,
            data: body,
          }
        );
        if (!resp.ok()) {
          throw new Error(
            `ChangeSet step failed on ${unitId}: ${resp.status()} ${await resp.text()}`
          );
        }
      };

      for (const resource of changed) {
        await patchBaseUnit(spaces.base.units[resource], { ChangeSetID: changeSetId }, true);
      }
      // Data is no longer a patchable Unit attribute (#5140) — written through
      // the dedicated endpoint instead. The Unit must already carry this
      // ChangeSetID (the attach above), which is why that step stays a patch.
      for (const resource of changed) {
        await api.uploadUnitData({
          spaceId: spaces.base.spaceId,
          unitId: spaces.base.units[resource],
          body: render(resource, AFTER),
          changeSetId,
        });
      }
      for (const resource of changed) {
        await patchBaseUnit(spaces.base.units[resource], { ChangeSetID: null }, false);
      }

      const closed = await hubApi.get(
        `/api/space/${spaces.base.spaceId}/change_set/${changeSetId}`
      );
      const closedBody = (await closed.json()) as { ChangeSet?: { EndTagID?: string } };
      endTagId = closedBody.ChangeSet?.EndTagID;
      if (!endTagId) {
        throw new Error(
          `Closing the ChangeSet produced no end Tag. Without it the ChangeOrder ` +
            `has no boundary to promote to. Body: ${JSON.stringify(closedBody).slice(0, 200)}`
        );
      }
    } else if (interval === 'empty') {
      // Mutate with no ChangeSet open, then let the ChangeOrder cut its own Tag
      // over the head Revisions below. Data is no longer patchable (#5140) —
      // written through the dedicated endpoint instead.
      for (const resource of changed) {
        await api.uploadUnitData({
          spaceId: spaces.base.spaceId,
          unitId: spaces.base.units[resource],
          body: render(resource, AFTER),
        });
      }
    }
    // interval === 'none' writes no change at all; the ChangeOrder is cut in an
    // empty Space below, so no Revision anywhere carries it.

    // ── The ChangeOrder ───────────────────────────────────────────────────
    // Scope is the literal `InScopeSpaceIDs` list built below. A ChangeOrder
    // used to name a Filter instead (`SpaceFilterID`, dropped in #5160), and a
    // Filter seeded for that purpose is an entity nothing reads — one more per
    // fixture build, against an org-wide ceiling, for a field the product no
    // longer has.

    // `none` cuts the ChangeOrder in a Space with no Units, which is what makes
    // it carry nothing. It is still in the Component, so it is in scope and the
    // component's lanes render exactly as they otherwise would.
    let changeOrderSpaceId = spaces.base.spaceId;
    if (interval === 'none') {
      const orders = await api.createSpace({
        space: {
          Slug: `${appLabel}-orders`,
          ComponentID: component.ComponentID,
          Labels: { Owner: 'E2E' },
        } as never,
      });
      changeOrderSpaceId = (orders as { SpaceID: string }).SpaceID;
      createdSpaceIds.push(changeOrderSpaceId);
    }

    // The literal list `InScopeSpaceIDs` now wants (see file header point 2) —
    // every Space this fixture created, plus the ChangeOrder's own base
    // (already in `spaces` except in the `none` case, where it is the
    // separately-created `orders` Space).
    const inScopeSpaceIds = [
      ...new Set([changeOrderSpaceId, ...Object.values(spaces).map((s) => s.spaceId)]),
    ];

    const changeOrderSlug = `${appLabel}-order`;
    const changeOrder = await api.createChangeOrder({
      spaceId: changeOrderSpaceId,
      changeOrder: {
        Slug: changeOrderSlug,
        Description: `Promote release v${AFTER.version}`,
        InScopeSpaceIDs: inScopeSpaceIds,
        // Naming the workflow is the whole of the association. The server
        // looks it up, checks Use permission, and stores a frozen copy of its
        // spec as the ChangeOrder's own `ChangeWorkflow` — read-only, and what
        // every promotion of this rollout is judged against. `workflow: 'none'`
        // leaves the id unset, which is a rollout nothing governs.
        ...(changeWorkflowId !== undefined ? { ChangeWorkflowID: changeWorkflowId } : {}),
        // Adopt the ChangeSet's end Tag rather than letting the ChangeOrder cut
        // its own over the head Revisions: the ChangeSet's interval is the one
        // that actually brackets the change. Left undefined in the `empty`
        // mode, where the ChangeOrder cuts its own and brackets nothing.
        ...(endTagId ? { EndTagID: endTagId } : {}),
      },
    });
    const changeOrderId = (changeOrder as { ChangeOrderID: string }).ChangeOrderID;

    const spacesInStage = (stage: string) =>
      Object.values(spaces).filter((space) => space.stage === stage);

    const propagation = async () => {
      const read = await api.getChangeOrder({
        spaceId: changeOrderSpaceId,
        changeOrderId,
      });
      const resolved = read.ResolvedSpaceIDs ?? [];
      return {
        resolved,
        released: read.ReleasedSpaceIDs ?? [],
        // The discriminator between "the rollout has not moved" and "the
        // server did not answer". ResolvedSpaceIDs must always contain the
        // Space the ChangeOrder lives in ("plus the Space it resides in"), so
        // its absence means the derivation did not run — and the payload for
        // that case is a 200 with the fields missing, indistinguishable from a
        // rollout at zero unless you check for exactly this.
        derived: resolved.includes(changeOrderSpaceId),
      };
    };

    const promoteSpaceIds = async (spaceIds: string[], label: string) => {
      const inList = spaceIds.map((id) => `'${id}'`).join(', ');

      /*
       * RETRIED ON ONE SPECIFIC 207, and only that one.
       *
       * Promoting a stage queues its Spaces' triggers for evaluation, and that
       * evaluation can advance a DOWNSTREAM Space's head revision. So promoting
       * two stages back to back — `promoteStage('staging')` then
       * `promoteStage('prod')` — races: the upgrade computes against revision N
       * while the evaluator writes N+1, and the server correctly refuses with
       * `Config data changed. Revision 3 vs 2.` Reproduced under parallel
       * workers, where the shared server is slower and the window is wider.
       *
       * That is the sequence working, not failing, so it is waited for rather
       * than treated as an error — the same reasoning `releaseStage` already
       * applies to its `ValidationErrors` 422.
       *
       * WHY THIS IS NOT MASKING A REAL FAULT. The retry is keyed to the
       * revision-mismatch message alone; every other item error, and every
       * non-OK status, still throws on the first response. And a genuine
       * double-promote — the non-idempotent case this fixture warns about —
       * does not self-resolve, so it still fails, just after the deadline and
       * with the server's own message attached.
       */
      const deadline = Date.now() + 30_000;
      for (;;) {
        const resp = await hubApi.patch('/api/unit', {
          params: {
            where: `SpaceID IN (${inList})`,
            upgrade: 'true',
            change_order: changeOrderId,
          },
          headers: MERGE_PATCH,
          data: {},
        });
        if (!resp.ok()) {
          throw new Error(`Failed to promote ${label}: ${resp.status()} ${await resp.text()}`);
        }

        // 200 OR 207 Multi-Status, and a 207 carries per-item Error fields that
        // no status check catches. A partly failed promote must not read as a
        // success — that is the whole point of the 207 case in the spec plan.
        const items = (await resp.json()) as Array<{ Error?: { Message?: string } }>;
        const failed = items.filter((item) => item?.Error);
        if (!failed.length) return;

        const messages = failed.map((f) => f.Error?.Message ?? 'unknown');
        const revisionRace = messages.every((m) => /Config data changed\. Revision/i.test(m));
        if (!revisionRace || Date.now() > deadline) {
          throw new Error(
            `Promote of ${label} returned ${resp.status()} with ${failed.length} ` +
              `item error(s): ${messages.join('; ')}` +
              (revisionRace ? ' (still racing after 30s — the revision never settled)' : '')
          );
        }
        await page.waitForTimeout(500);
      }
    };

    return {
      appLabel,
      baseSpaceId: spaces.base.spaceId,
      changeOrderId,
      changeOrderSlug,
      changeOrderSpaceId,
      changeWorkflowId,
      workflowSpaceId,
      spaces,
      spacesInStage,
      propagation,

      async assertPropagationSupported() {
        const { derived } = await propagation();
        expect(
          derived,
          'The server did not report where the ChangeOrder has got to. ' +
            'ResolvedSpaceIDs should always contain at least the Space the ' +
            'ChangeOrder lives in. An empty result almost always means the ' +
            'server predates #5103 (changeorder_propagation.go, 2026-08-19), ' +
            'whose derivation swallows its own failures and returns 200 with ' +
            'the fields missing. Check the running server build against that ' +
            'commit before treating this as a UI defect.'
        ).toBe(true);
      },

      async promoteStage(stage: string) {
        const targets = spacesInStage(stage);
        if (!targets.length) {
          throw new Error(
            `No Space carries Stage='${stage}' in this fixture. Known stages: ` +
              [...new Set(Object.values(spaces).map((s) => s.stage).filter(Boolean))].join(', ')
          );
        }
        await promoteSpaceIds(
          targets.map((space) => space.spaceId),
          `stage '${stage}'`
        );
      },

      async promoteSpaces(spaceNames: string[]) {
        const targets = spaceNames.map((name) => {
          const space = spaces[name];
          if (!space) {
            throw new Error(`No Space named '${name}'. Known: ${Object.keys(spaces).join(', ')}`);
          }
          return space;
        });
        await promoteSpaceIds(
          targets.map((space) => space.spaceId),
          `Spaces [${spaceNames.join(', ')}]`
        );
      },

      async setLocalOverride(spaceName: string, kind: 'untouched' | 'overwritten' | 'kept') {
        const space = spaces[spaceName];
        if (!space) {
          throw new Error(
            `No Space named '${spaceName}'. Known: ${Object.keys(spaces).join(', ')}`
          );
        }
        const unitId = space.units.app;
        if (!unitId) {
          throw new Error(`Space '${spaceName}' has no 'app' Unit to override.`);
        }

        // Read what the Space actually holds rather than re-rendering the
        // template: by the time an override is applied the Space may already
        // have taken the promotion, and writing a template would silently undo
        // it — the override has to be a local EDIT of the current value.
        // Config Data is its own API now (#5140), not a field of Unit — the
        // response is the raw text directly, not base64 and not JSON-wrapped.
        const read = await hubApi.get(`/api/space/${space.spaceId}/unit/${unitId}/data`);
        if (!read.ok()) {
          throw new Error(
            `Failed to read ${spaceName}'s app Unit data: ${read.status()} ${await read.text()}`
          );
        }
        const current = await read.text();

        const edited =
          kind === 'untouched'
            ? // replicas is carried by no path in this ChangeOrder.
              current.replace(/replicas: \d+/, 'replicas: 3')
            : // the image IS carried, so this drift is in the promote's path.
              current.replace(
                /image: ghcr\.io\/confighubai\/confighub:v[\d.]+/,
                `image: ghcr.io/confighubai/confighub:v0.2.19-${kind === 'kept' ? 'pinned' : 'hotfix'}`
              );

        if (edited === current) {
          throw new Error(
            `The '${kind}' override changed nothing in ${spaceName}. Current data:\n` +
              current.slice(0, 300)
          );
        }

        await api.uploadUnitData({
          spaceId: space.spaceId,
          unitId,
          body: edited,
          // `protect` records the paths THIS write touches as local overrides,
          // which is what makes the upgrade leave them alone. Without it the
          // same edit is simply replaced and the variant rejoins its siblings.
          ...(kind === 'kept' ? { protect: true } : {}),
        });
      },

      async dropResource(spaceName: string, resource: string) {
        const space = spaces[spaceName];
        if (!space) {
          throw new Error(
            `No Space named '${spaceName}'. Known: ${Object.keys(spaces).join(', ')}`
          );
        }
        const unitId = space.units[resource];
        if (!unitId) {
          throw new Error(
            `Space '${space.slug}' holds no '${resource}' to drop. Holds: ` +
              `${Object.keys(space.units).join(', ') || 'nothing'}`
          );
        }
        // Detached, because the next stage's copies link to this one to track
        // it, and the server refuses to delete a Unit anything still links to.
        await api.deleteUnit(space.spaceId, unitId, { detach: true });
        // Dropped from the fixture's own index too, so a later helper that
        // walks `space.units` does not address a Unit the server no longer has.
        delete space.units[resource];
      },

      async setLiveStatus(spaceName: string, health: LiveHealth) {
        const space = spaces[spaceName];
        if (!space) {
          throw new Error(
            `No Space named '${spaceName}' in this fixture. Known: ${Object.keys(spaces).join(', ')}`
          );
        }
        healthByName[spaceName] = health;
        await reportLiveStatus(space.spaceId, space.slug, health);
      },

      async liveStatusOf(spaceName: string) {
        const space = spaces[spaceName];
        if (!space) {
          throw new Error(
            `No Space named '${spaceName}' in this fixture. Known: ${Object.keys(spaces).join(', ')}`
          );
        }
        const release = (await latestPublishedRelease(space.spaceId))?.Release;
        if (!release) return undefined;
        return release.LiveStatus ?? null;
      },

      async releaseStage(stage: string) {
        const targets = spacesInStage(stage);
        if (!targets.length) {
          throw new Error(`No Space carries Stage='${stage}' in this fixture.`);
        }

        for (const space of targets) {
          if (!space.targetId) {
            throw new Error(
              `Cannot release ${space.slug}: the fixture was built with ` +
                `releasable: false, so it has no ReleaseTargetID.`
            );
          }

          // Publishing refuses a Space with outstanding ValidationErrors, and a
          // promote re-queues that Space's triggers for evaluation — so the
          // first attempt right after a promote reliably loses a race with the
          // trigger evaluator:
          //
          //   422 outstanding ValidationErrors; triggers re-queued for evaluation
          //
          // That is the gates working, not a failure, so wait for them rather
          // than treating it as one. Anything else fails immediately: a real
          // error should not be hidden behind a retry loop.
          const deadline = Date.now() + 30_000;
          for (;;) {
            const resp = await hubApi.post(`/api/space/${space.spaceId}/release`, {
              data: { ChangeOrderID: changeOrderId },
            });
            if (resp.ok()) break;

            const body = await resp.text();
            const gatesPending = resp.status() === 422 && body.includes('ValidationErrors');
            if (!gatesPending) {
              throw new Error(
                `Failed to release ${space.slug}: ${resp.status()} ${body}`
              );
            }
            if (Date.now() > deadline) {
              throw new Error(
                `Timed out after 30s waiting for ValidationErrors to clear on ${space.slug}. ` +
                  `Last response: ${resp.status()} ${body}`
              );
            }
            await page.waitForTimeout(500);
          }

          // The deploying tool reports on the Release it now runs. A new
          // Release starts with no status of its own, whatever the last one's was.
          const name = Object.keys(spaces).find((key) => spaces[key] === space);
          const health = name === undefined ? undefined : healthByName[name];
          if (health !== undefined) await reportLiveStatus(space.spaceId, space.slug, health);
        }
      },

      teardown,
    };
  } catch (error) {
    // A half-built fixture leaks Spaces into a shared server, and the next run
    // then collides with them. Clean up before the failure propagates.
    await teardown();
    throw error;
  }
}
