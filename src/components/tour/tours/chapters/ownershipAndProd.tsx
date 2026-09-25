// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { TourCommand, TourCue } from '../../TourCue';
import type { TourStep } from '../../types';
import { defineTour } from '../../registry';

export const OWNERSHIP_AND_PROD_TOUR_ID = 'ownership-and-prod';

// ============================================================================
// Chapters 9-11 — field ownership + a prod variant
//
// Picks up right where chapters 6-8 leave off: dev exists, has an upstream
// link to base, and was just upgraded once. From here:
//
//   Chapter 9  (`edit-`)   — override one value directly on dev, then mark it
//                            kept on merge. Protection is opt-in, not
//                            automatic — a staged edit alone is still
//                            override-blind — but once kept, an upgrade from
//                            base will never overwrite it again.
//   Chapter 10 (`reedit-`) — base changes twice (the SAME field dev just
//                            overrode, plus a different one), then dev
//                            upgrades again. The overridden field survives;
//                            the other field flows through normally. THAT
//                            is what "field ownership" means in practice.
//   Chapter 11 (`prod-`)   — a variant of DEV (not base), named "prod", with
//                            No target — same composer flow used to clone dev
//                            from base, now used to clone prod from dev. This
//                            is a deliberate change from the original design:
//                            prod used to be a second variant off base,
//                            sibling to dev. Because prod now clones dev's
//                            live state, it also carries dev's LOG_LEVEL
//                            override and dev's already-applied upgrade — the
//                            copy says so.
//
// Split into TWO independently-launchable tours at the chapter 9/10 vs. 11
// seam (`ownershipAndProdSteps`/`OWNERSHIP_AND_PROD_TOUR_ID`, "Field
// ownership" — chapters 9-10, 22 steps — followed by `prodAndNextSteps`/
// `PROD_AND_NEXT_TOUR_ID`, "A prod variant & what's next" — chapter 11, 5
// steps): the combined chapter had grown to a quarter of the whole 5-tour
// sequence with no stopping point, and `reedit-review-fields` is a genuine
// payoff beat to end on rather than a place a user gets stranded mid-arc.
// The split is purely mechanical (two `defineTour` calls, one `nextTourId`
// link) — chapter 11's own content is unchanged, just launched separately.
//
// One step at the very end of chapter 11 (`release-explain-gap`) is chapter
// 5's content ("publish a release"), relocated here from
// deployAndRelease.tsx. It is a pure explanation, not a walkthrough — the
// tutorial's target-less demo component can never reach a real Releases tab
// (see deployAndRelease.tsx's docstring for the full product-gap reasoning)
// — so it was moved as late as it can go while still finishing on
// `prod-review-node`'s "that is the whole tour set" beat: every in-browser
// feature gets shown first, and the one CLI-only concept is the
// second-to-last thing, not the first thing this 5-tour sequence teaches.
//
// Anchoring "the base node" vs "the dev node": reactflow node ids are Space
// UUIDs (flowLayout.ts:126), so no step here can hardcode one. `data-variant`
// on DeploymentFlowNode.tsx's NodeContainer answers "which node is this"
// ('base' for the root node, otherwise the exact variant name typed into
// `composer-variant-name-input', e.g. 'dev', 'prod'). NodeName no longer
// links out (main removed the clickable node-name link this used to have to
// route around — see exploreAndInspect.tsx's header docstring), so a click
// anywhere on a quiet, target-less node's card now bubbles normally and
// selects it — every card/select lookup below excludes only
// `flow-node-select-target` itself (still needed: bare `[data-variant=...]`
// also matches the composer-open handle, a real `:not()` collision confirmed
// live), not the rest of the card.
//
// The example field is the ConfigMap key `data.LOG_LEVEL` from the
// getting-started tour's sample manifest (CreateComponentPane.tsx's
// SAMPLE_MULTI_YAML, resource `checkout-api-config`). `data.TIMEOUT_MS` is
// the second, "flows through normally" field.
//
// Node selection is a TOGGLE (AppComponentView.tsx's handleDeploymentToggle):
// clicking an already-selected node CLOSES its side pane instead of doing
// nothing. Since chapter 8 plausibly leaves dev selected, this chapter never
// click-advances a "select the node" step — it anchors on the node, asks the
// user to click it ONLY if it is not already open, and advances on the
// tooltip's own Next button. Switching to a DIFFERENT node is never a
// toggle risk (it always selects, never closes), so every other node click
// in this chapter advances normally on 'click'.
// ============================================================================

// The card's own NodeContainer, matched without hardcoding its runtime UUID
// — see exploreAndInspect.tsx's `explore-select-base-node` for why this is
// now the whole card, not just the `flow-node-select-target` strip.
const devNode = {
  kind: 'selector',
  css: '[data-testid^="flow-node-"][data-variant="dev"]:not([data-testid="flow-node-select-target"])',
} as const;
const baseNode = {
  kind: 'selector',
  css: '[data-testid^="flow-node-"][data-variant="base"]:not([data-testid="flow-node-select-target"])',
} as const;
const prodCardSpotlight = {
  kind: 'selector',
  css: '[data-testid^="flow-node-"][data-variant="prod"]:not([data-testid="flow-node-select-target"])',
} as const;

// The NodeContainer that owns a given `data-variant` also carries
// `data-selected` (DeploymentFlowNode.tsx) — the one attribute that actually
// tells us the node's side pane is open, as opposed to trusting that a user
// who was told "click if not already open" did the right thing before
// pressing Next. Not scoped `:not([data-testid="flow-node-select-target"])`
// like other bare `[data-variant=...]` lookups elsewhere in these chapters
// need to be: the select-target strip never carries `data-selected`, so
// requiring both attributes together already resolves to the container alone.
const DEV_NODE_SELECTED_CSS = '[data-variant="dev"][data-selected="true"]';
const BASE_NODE_SELECTED_CSS = '[data-variant="base"][data-selected="true"]';

// ----------------------------------------------------------------------------
// Chapter 9 — local edit + field ownership (tutorial step 30)
// ----------------------------------------------------------------------------

const chapter9: TourStep[] = [
  {
    id: 'edit-open-dev',
    anchor: devNode,
    title: 'Back to dev',
    body: (
      <>
        Dev's side panel should still be open from the last chapter. If it is not,{' '}
        <TourCommand>click</TourCommand> it to open it. This continues from "Change the base &
        promote" — take that tour first if you have not yet.
      </>
    ),
    // NOT `next`: a plain self-paced Next trusted that the "click if not
    // already open" instruction above actually got followed, with nothing
    // confirming dev's pane was open before the following step
    // (`edit-start-edit`) assumed its anchor — `field-edit-trigger-
    // data.LOG_LEVEL` — would be on screen. Watching directly for dev's own
    // `data-selected="true"` (DeploymentFlowNode.tsx) is genuine
    // verification instead: it is already true the instant this step mounts
    // when dev is still open from the previous chapter (an immediate,
    // silent advance — the same "was already satisfied" behavior an
    // `optional` step has when its anchor is already present), and becomes
    // true the moment the user clicks the dev card otherwise. Not a `click`
    // advance: dev's side pane is a TOGGLE (see this file's header comment)
    // and clicking it while already open would CLOSE it.
    advance: { on: 'selector', css: DEV_NODE_SELECTED_CSS },
  },
  {
    // Confirmed live via the continuous 5-tour walkthrough: dev's pane is
    // still on the Incoming filter left over from chapter 7/8
    // (`stale-incoming-filter`/`promote-upgrade`), and `ComponentSidePane`
    // only auto-expands a unit while on that filter if the unit itself has
    // an incoming change (`isUnitExpandedInPane` — filterMode==='incoming'
    // requires `unit.upgradeEntry`). The ConfigMap unit holding LOG_LEVEL
    // has never had one (nothing has touched it yet — that is the whole
    // point of this chapter), so it stays collapsed and
    // `field-edit-trigger-data.LOG_LEVEL` never mounts at all — the next
    // step's anchor was permanently missing, silently stranding a
    // non-optional step until the user found "Skip this step" themselves.
    // `component-filter-all` is the same real "All" control chapter 7/8
    // never touches; switching to it expands every unit regardless of
    // incoming status. Harmless to click even when already on "All" (e.g.
    // a fresh `?tour=ownership-and-prod` launch, where filterMode defaults
    // to 'all' with nothing incoming) — it is a plain filter button, not a
    // toggle.
    id: 'edit-show-all',
    anchor: { kind: 'selector', css: '[data-testid="component-filter-all"]' },
    title: 'See every field',
    body: (
      <>
        Dev may still be on the Incoming filter from the last chapter, which only shows fields
        base changed — LOG_LEVEL is not one of those. <TourCommand>Click</TourCommand>{' '}
        <TourCue>All</TourCue> to see every field, including ones you have not touched yet.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="component-filter-all"]' } },
  },
  {
    id: 'edit-start-edit',
    anchor: { kind: 'selector', css: '[data-testid="field-edit-trigger-data.LOG_LEVEL"]' },
    title: 'Change a value directly',
    body: (
      <>
        LOG_LEVEL is a plain config value — you do not need a function to change it.{' '}
        <TourCommand>Click</TourCommand> the value to edit it inline.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="field-edit-trigger-data.LOG_LEVEL"]' } },
  },
  {
    id: 'edit-type-value',
    anchor: { kind: 'selector', css: '[data-testid="field-edit-input"]' },
    title: 'Type the new value',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>debug</TourCue>, then{' '}
        <TourCommand>press</TourCommand> <TourCue>Enter</TourCue>. The edit is staged — nothing is
        saved yet, and staging it does not protect it by itself. A future upgrade from base would
        still overwrite it, unless you tell ConfigHub to keep it — that is the next step.
      </>
    ),
    // `selector`, not `next` or `input`: the real completion signal here is
    // Enter committing the edit (the next step's own "Keep 1 on merge"
    // button only renders once it is staged), not the field merely holding
    // the right text — `input` would fire on "debug" alone and jump ahead to
    // a step whose anchor does not exist until Enter is actually pressed. A
    // user who types the value, presses Enter, then clicks "Keep 1 on merge"
    // directly still needs to be caught without a manual Next in between —
    // see changeAndPromote.tsx's `change-search-function` comment for why.
    advance: { on: 'selector', css: '[data-testid="component-keep-staged-edits-button"]' },
  },
  {
    // Protection is opt-in, not automatic: a staged edit is just a staged
    // edit until something marks it "kept on merge" — the same
    // onToggleProtection stagedProtection state ComponentValuesSection.tsx's
    // row kebab ("Keep on merge" / "Let merges update this") and the value
    // tooltip's Protect/Unprotect toggle both write to. This footer button
    // (`barKeepState.showKeepButton`, kind 'editsUnkept') is the
    // one-click version of the same action for every currently
    // staged-but-unkept edit — here, just LOG_LEVEL — and reads "Keep 1 on
    // merge" for exactly that case. It only STAGES the protection; the next
    // step's commit click is what actually writes it, in the same call that
    // saves the edit.
    id: 'edit-keep-on-merge',
    anchor: { kind: 'selector', css: '[data-testid="component-keep-staged-edits-button"]' },
    title: 'Keep it on merge',
    body: (
      <>
        Staging the value is not enough — an upgrade from base would still overwrite it.{' '}
        <TourCommand>Click</TourCommand> <TourCue>Keep 1 on merge</TourCue> to mark it as dev's own.
        You can do the same thing from a row's own <TourCue>⋯</TourCue> menu, or from the value
        itself — this footer button is just the one-click version for what is staged right now.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="component-keep-staged-edits-button"]' } },
  },
  {
    id: 'edit-commit',
    anchor: { kind: 'selector', css: '[data-testid="component-upgrade-button"]' },
    title: 'Save the change',
    body: (
      <>
        This button commits every staged change on dev — upgrades, manual edits, and the
        keep-on-merge you just staged, all together. The number on it is how many are staged.{' '}
        <TourCommand>Click</TourCommand> <TourCue>Upgrade</TourCue> to save it. If it shows a
        spinner instead of its label, the previous save is still finishing — it frees up in a
        moment.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="component-upgrade-button"]' } },
  },
];

// ----------------------------------------------------------------------------
// Chapter 10 — two base changes, promote, owned field preserved
// (tutorial steps 31-33)
//
// This chapter's payoff — an override you made on dev survives later upgrades
// from base — now holds for real, because chapter 9's last two steps staged
// AND kept LOG_LEVEL on merge before committing (`edit-keep-on-merge`,
// `edit-commit`). Protection is opt-in, not automatic: a plain staged edit
// with nothing marking it "kept" is override-blind on the next upgrade, the
// same replay-onto-dev behaviour this chapter used to have to warn about.
// Chapter 9 is what makes this chapter's claims true — do not skip it, and do
// not re-add automatic-protection language here without re-verifying chapter
// 9 still stages the keep before its own commit.
// ----------------------------------------------------------------------------

/**
 * Click a function-search result once it appears. Used for the LOG_LEVEL
 * invocation below, walked one click at a time. TIMEOUT_MS never calls this:
 * it reuses the SAME invocation left open by the LOG_LEVEL run rather than
 * searching and picking set-string-path a second time — see
 * `reedit-timeout-path`'s own comment.
 */
const pickFunction = (stepId: string): TourStep => ({
  id: stepId,
  anchor: { kind: 'selector', css: '[data-testid="function-item-set-string-path"]' },
  title: 'Pick the function',
  body: (
    <>
      <TourCommand>Click</TourCommand> <TourCue>set-string-path</TourCue>. It sets one value at
      one path — the same job the field editor just did, but from a function you can re-run.
    </>
  ),
  advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="function-item-set-string-path"]' } },
});

/**
 * Fill the 3 string parameters (resource-type / path / attribute-value) for
 * one invocation — as 3 separate steps, one per field, each anchored on its
 * own input. A single step anchored only on `resource-type` used to ask the
 * user to also fill `path` and `attribute-value`, two fields it never
 * pointed at — confirmed live (adversarial review + this file's own
 * regression spec) that the tooltip card, positioned relative to
 * `resource-type`, physically covers those lower fields inside the narrow
 * Functions sidebar, blocking the click Playwright itself reported
 * ("subtree intercepts pointer events"). Splitting into one step per field
 * means each tooltip is anchored exactly where the user needs to click next,
 * which is also the pattern every other single-field step in these tours
 * already uses (`variant-name`, `edit-type-value`, `prod-name-variant`).
 */
const fillParams = (stepId: string, path: string, value: string): TourStep[] => [
  {
    id: `${stepId}-resource-type`,
    anchor: { kind: 'selector', css: '[data-testid="function-param-resource-type"] input' },
    // Left, not the default bottom: 3 fields stacked in the narrow Functions
    // sidebar leave little room below any one of them before the sidebar's
    // own edge — a card below can end up cramped or spill past it. Left
    // opens into the wide canvas area for all 3 fields, not just this one.
    placement: 'left',
    title: 'Set the resource type',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>v1/ConfigMap</TourCue> for Resource-type — the
        resource's API version and kind together.
      </>
    ),
    // `input`, not `next`: a user typing straight through all 3 fields and
    // into Invoke never pauses to press this tooltip's own Next — see
    // changeAndPromote.tsx's `change-search-function` comment. Waits for the
    // exact instructed value, not just any keystroke into the field.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="function-param-resource-type"] input' },
      value: 'v1/ConfigMap',
    },
  },
  {
    id: `${stepId}-path`,
    anchor: { kind: 'selector', css: '[data-testid="function-param-path"] input' },
    placement: 'left',
    title: 'Set the path',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>{path}</TourCue> for Path — the field this
        change targets.
      </>
    ),
    advance: { on: 'input', anchor: { kind: 'selector', css: '[data-testid="function-param-path"] input' }, value: path },
  },
  {
    id: `${stepId}-attribute-value`,
    anchor: { kind: 'selector', css: '[data-testid="function-param-attribute-value"] input' },
    placement: 'left',
    title: 'Set the new value',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>{value}</TourCue> for Attribute-value — the new
        value to set.
      </>
    ),
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="function-param-attribute-value"] input' },
      value,
    },
  },
];

const chapter10: TourStep[] = [
  {
    id: 'reedit-open-base',
    anchor: baseNode,
    title: 'Switch to base',
    body: (
      <>
        Base is where changes start. <TourCommand>Click</TourCommand> it if base is not already
        open, then open its Functions panel.
      </>
    ),
    // Same reasoning as `edit-open-dev` above: `invoker-functions-button`
    // (the very next step's anchor) is a global, always-rendered sidebar
    // button — it exists whether or not base is actually selected, so it
    // cannot itself prove this step's instruction was followed. Watching
    // base's own `data-selected="true"` is the genuine check, and — like
    // `edit-open-dev` — advances immediately, with nothing to click, when
    // base is already open (e.g. a user who just finished chapter 9 on dev
    // and is required to switch away first, or, on the rarer path, base was
    // already selected coming in).
    advance: { on: 'selector', css: BASE_NODE_SELECTED_CSS },
  },
  {
    id: 'reedit-open-functions',
    anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' },
    title: 'Open Functions',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Functions</TourCue>. This runs a function on
        the unit you selected — the same panel chapter 6 used.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' } },
  },
  {
    // Chained-journey step: arriving here straight from chapter 8, the
    // Functions sidebar is still showing chapter 6's set-replicas RESULT
    // screen, because it retains its screen across close/reopen. The search
    // box the next step anchors on therefore is not on screen at all, and a
    // non-optional step would strand the user with nothing to click.
    //
    // `optional: true` makes this free in the isolated case: the back arrow
    // only exists once the panel is off its list screen, so on a fresh
    // `?tour=ownership-and-prod` launch the anchor never resolves and the
    // engine skips it silently. Same shape as `promote-select-all` — a step
    // that exists only for the state the real chapter-to-chapter journey
    // leaves behind.
    //
    // The retained-screen behaviour itself may well be intentional; it is
    // routed separately as a product question rather than worked around
    // anywhere but here.
    id: 'reedit-back-to-list',
    anchor: { kind: 'selector', css: 'button[aria-label="back"]' },
    title: 'Back to the function list',
    body: (
      <>
        The panel is still showing the result of the last function you ran.{' '}
        <TourCommand>Click</TourCommand> the back arrow to return to the function list. If you do
        not see it, the list is already showing.
      </>
    ),
    // Advances on the function LIST being back on screen, not on the back
    // arrow being clicked. That matters for the isolated case: a fresh
    // `?tour=ownership-and-prod` launch already shows the list, so this
    // condition is satisfied the instant the step opens and the tour moves on
    // with no visible pause. A `click` advance could not do that — with no
    // back arrow to click, the step would sit there for the whole
    // ANCHOR_RESOLVE_TIMEOUT_MS grace period before `optional` skipped it,
    // putting a multi-second dead beat into every fresh run of this chapter.
    // `optional` is kept as the backstop for the case where neither the arrow
    // nor the list ever appears. Same "watch for the outcome, stay agnostic
    // about the gesture" pattern as deployAndRelease's `variant-open-composer`.
    advance: { on: 'selector', css: '[data-testid="invoker-function-search"]' },
    optional: true,
  },
  {
    id: 'reedit-search-loglevel',
    anchor: { kind: 'selector', css: '[data-testid="invoker-function-search"] input' },
    title: 'Find set-string-path',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>set-string-path</TourCue> to find it in the
        list.
      </>
    ),
    // `input`, not `next` — see changeAndPromote.tsx's `change-search-function`
    // comment. A user who types the search text and clicks the matching
    // result directly never presses this tooltip's own Next.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="invoker-function-search"] input' },
      value: 'set-string-path',
    },
  },
  pickFunction('reedit-pick-loglevel'),
  ...fillParams('reedit-fill-loglevel', 'data.LOG_LEVEL', 'warn'),
  {
    id: 'reedit-invoke-loglevel',
    anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' },
    title: 'Change base too',
    body: (
      <>
        This changes the SAME field you overrode on dev. <TourCommand>Click</TourCommand>{' '}
        <TourCue>Invoke</TourCue>. When dev upgrades next, watch this field — dev's own value
        wins, not base's.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' } },
  },
  {
    // NOT a repeat of the whole search-and-pick walkthrough: `selectedFunction`
    // stays set after a successful invoke (InvokerContent.tsx never clears it
    // on success, and nothing resets the parameter form's values either — the
    // same populated set-string-path form from the LOG_LEVEL invocation is
    // still on screen). So re-running it for TIMEOUT_MS is editing 2 of its 3
    // fields in place, not navigating back to the list — the back-arrow
    // instruction this step used to give was unnecessary work. Resource-type
    // is left untouched: v1/ConfigMap is still correct.
    id: 'reedit-timeout-path',
    anchor: { kind: 'selector', css: '[data-testid="function-param-path"] input' },
    placement: 'left',
    title: 'Change the path',
    body: (
      <>
        Same form, same invocation — no need to search again. TIMEOUT_MS has no override on dev,
        unlike LOG_LEVEL. <TourCommand>Change</TourCommand> Path to <TourCue>data.TIMEOUT_MS</TourCue>.
      </>
    ),
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="function-param-path"] input' },
      value: 'data.TIMEOUT_MS',
    },
  },
  {
    id: 'reedit-timeout-attribute-value',
    anchor: { kind: 'selector', css: '[data-testid="function-param-attribute-value"] input' },
    placement: 'left',
    title: 'Change the value',
    body: (
      <>
        <TourCommand>Change</TourCommand> Attribute-value to <TourCue>5000</TourCue>.
      </>
    ),
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="function-param-attribute-value"] input' },
      value: '5000',
    },
  },
  {
    id: 'reedit-timeout-invoke',
    anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' },
    title: 'Run it again',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Invoke</TourCue> to apply it — this time to
        TIMEOUT_MS.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' } },
  },
  {
    // Functions has no further use in this chapter — see changeAndPromote.tsx's
    // identical `change-close-functions` step for why leaving it open risks
    // stranding `reedit-upgrade` with nothing on screen to point at.
    id: 'reedit-close-functions',
    anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' },
    title: 'Close Functions',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Functions</TourCue> again to close it.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' } },
  },
  {
    // Used to be followed by `reedit-incoming-tab` (click 'Incoming') and
    // `reedit-select-all` (click 'Select all'). Both removed for the same
    // reason as changeAndPromote.tsx's identical pair: `ComponentSidePane`
    // resets filterMode to 'incoming' automatically on every node switch
    // whenever the node has an upgradable unit, and entering Incoming
    // auto-stages everything the moment it becomes active. Both are
    // structurally true here — dev has two upgradable fields by
    // construction — so neither click has anything left to do, and the
    // 'Select all' button's own render condition is always false on this
    // path. This step's body now says directly what's already true when it
    // opens, instead of asking for two clicks that don't do anything.
    id: 'reedit-open-dev',
    anchor: devNode,
    title: 'Back to dev',
    body: (
      <>
        Base now has two changes waiting. <TourCommand>Click</TourCommand> dev — its panel opens
        straight to <TourCue>Incoming</TourCue>, with both fields already staged.
      </>
    ),
    advance: { on: 'click', anchor: devNode },
  },
  {
    id: 'reedit-upgrade',
    anchor: { kind: 'selector', css: '[data-testid="component-upgrade-button"]' },
    title: 'Upgrade dev',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Upgrade</TourCue>. TIMEOUT_MS updates to base's
        new value. LOG_LEVEL does not — it stays debug, the value you set in the last chapter.
        That is field ownership: an override you made on dev keeps winning over base, upgrade
        after upgrade, until you remove it yourself.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="component-upgrade-button"]' } },
  },
  {
    // The field-ownership payoff itself — arguably the most important "look
    // at this" moment in the whole tour set, and until now it was only ever
    // NARRATED in `reedit-upgrade`'s own body, in future tense, before the
    // click happened. Nothing paused afterward to let the user actually SEE
    // both outcomes: dev's ConfigMap unit stays expanded right after a commit
    // (ComponentSidePane's `recentlyUpgradedUnitIds`, independent of which
    // filter is active), so `field-edit-trigger-data.LOG_LEVEL` is still on
    // screen here — the same anchor `edit-start-edit` used two chapters ago.
    // Self-paced: there is nothing left to click, only two values to compare.
    id: 'reedit-review-fields',
    anchor: { kind: 'selector', css: '[data-testid="field-edit-trigger-data.LOG_LEVEL"]' },
    title: 'See what changed and what did not',
    body: (
      <>
        LOG_LEVEL still reads debug — the value you set on dev survived this upgrade untouched.
        TIMEOUT_MS, right below it, picked up base's new value 5000. Same upgrade, two different
        outcomes: that difference is field ownership in practice.
      </>
    ),
    advance: { on: 'next' },
  },
];

// ----------------------------------------------------------------------------
// Chapter 11 — a prod variant (tutorial step 26)
// ----------------------------------------------------------------------------

const chapter11: TourStep[] = [
  {
    // Prod is made from DEV, not base — the operator's usual next step:
    // promote what's running in dev straight to prod. Anchored on DEV's own
    // composer-open HANDLE for the same reason deployAndRelease's
    // `variant-open-composer` anchors on base's: the step asks the user to
    // hover a handle and press 'V', so the spotlight has to ring that handle,
    // not the node's select strip (a different element from the one the copy
    // names). `data-handle-variant` carries the same per-node value as
    // `data-variant` (DeploymentFlowNode.tsx) — 'dev' for the dev node here.
    //
    // Verified the composer itself is upstream-agnostic before relying on
    // this: `composerParentId` (ComponentFlowGraph.tsx) is set generically by
    // `onConnectStart`/the 'V' handler from whichever node/handle the gesture
    // started on — it is never hardcoded to "must be base" — and flows
    // through to `useCreateVariantMutation`'s `upstreamSpaceId` unchanged.
    // Opening the composer from dev's handle therefore sets prod's
    // `Annotations.UpstreamSpaceID` to dev's Space, the same mechanism that
    // already sets it to base's when opened from base's handle.
    //
    // Because prod clones dev's CURRENT units, it also clones dev's own local
    // state at that moment: the LOG_LEVEL override from chapter 9 and dev's
    // already-applied TIMEOUT_MS from chapter 10. The copy says so plainly
    // rather than leaving the user to discover it.
    id: 'prod-open-composer',
    anchor: { kind: 'selector', css: '[data-handle-variant="dev"]' },
    title: 'Make a production variant',
    body: (
      <>
        Continues from "Field ownership" — take that tour first if you have not. Prod is made
        from dev this time — the usual next step once dev looks right, promoting it to prod. Same
        gesture you used to make dev from base: <TourCommand>hover</TourCommand> dev's own handle,
        then <TourCommand>press</TourCommand> <TourCue>V</TourCue>. Dragging works too. Prod will
        start as a full clone of dev, right down to the LOG_LEVEL override you gave it earlier.
      </>
    ),
    // Not `next`: hover+V has no click handler to confirm it worked (see
    // deployAndRelease.tsx's identical `variant-open-composer`, which
    // established this pattern for the exact same gesture). A `next` advance
    // here lets a fumbled hover+V strand the user on a step whose Next button
    // they can still press, sending them into the next step's anchor
    // (the composer's own name field) before the composer has actually
    // opened. Watching for that field directly is agnostic to whether the
    // user actually managed the gesture yet.
    advance: { on: 'selector', css: '[data-testid="composer-variant-name-input"]' },
  },
  {
    id: 'prod-name-variant',
    anchor: { kind: 'selector', css: '[data-testid="composer-variant-name-input"]' },
    title: 'Name it prod',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>prod</TourCue>.
      </>
    ),
    // `input`, not `next` — see deployAndRelease.tsx's identical `variant-name`
    // comment: a user who types the name and clicks Create variant directly
    // never presses this tooltip's own Next.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="composer-variant-name-input"]' },
      value: 'prod',
    },
  },
  {
    id: 'prod-submit',
    anchor: { kind: 'selector', css: '[data-testid="composer-submit-button"]' },
    title: 'Create prod',
    body: (
      <>
        Leave <TourCue>Target (optional)</TourCue> empty, same as dev. A real production variant
        would also get a delete gate so it cannot be removed by accident — that is CLI-only for
        now (<code>--unit-delete-gate critical</code>).{' '}
        <TourCommand>Click</TourCommand> <TourCue>Create variant</TourCue>. ConfigHub clones dev's
        units into a new prod space, with no target and nothing applied.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="composer-submit-button"]' } },
  },
  {
    // Chapter 5 ("publish a release") relocated here — see the file header
    // comment and deployAndRelease.tsx's docstring for why. A pure
    // explanation, not a walkthrough: this tutorial's target-less demo
    // component can never reach a real Releases tab, so this points back at
    // the base node one last time and explains the concept and the real
    // (CLI) path instead.
    id: 'release-explain-gap',
    // Deliberately ANCHORLESS. This step explains publishing a release — a
    // CLI-only concept with nothing on screen to point at — so it used to ring
    // the base node purely for want of a target. Two problems, both confirmed
    // live: the ring pointed at something the copy never discusses, and the
    // body is long enough (~455 chars) that Popper's bottom-fit failed and the
    // tooltip flipped ABOVE its anchor, landing squarely on the base card it
    // was ringing. With no anchor the engine draws no spotlight and centres the
    // card, which is both the semantically honest presentation for a pure
    // explanation and immune to the flip.
    title: 'One more thing: publishing a release',
    body: (
      <>
        Everything in this tour set happened in the browser. One thing did not: publishing a{' '}
        <strong>release</strong>, a fixed snapshot of the base's configuration — the kind of
        thing a real deployment tool, like Argo CD, pulls from. Publishing needs a release
        target wired to the Space first, done with{' '}
        <code>cub space update --release-target &lt;target&gt;</code> — not something this demo
        component has. Once a target is attached, a <TourCue>Releases</TourCue> tab with a{' '}
        <TourCue>Release</TourCue> button appears on that Space.
      </>
    ),
    advance: { on: 'next' },
  },
  {
    // Without this, the tour — and the whole 5-tour sequence — ended the
    // instant Create variant was clicked: no step ever waited for the clone
    // to finish, let alone showed it. `flow-node-select-target` is the same
    // click-safe, always-present anchor every other node lookup in this file
    // uses; polling for it doubles as the missing "wait for the clone to
    // finish" step (deployAndRelease.tsx's `variant-wait-success` needed one
    // for the exact same reason) and, once it resolves, gives the user a
    // beat to see it before the tour set ends. Self-paced (`next`): the Next
    // button is available immediately, so a slow clone never strands anyone.
    id: 'prod-review-node',
    anchor: { kind: 'selector', css: '[data-testid="flow-node-select-target"][data-variant="prod"]' },
    // Self-paced review, never asks the user to click — safe to widen the
    // ring with no copy caveat needed, same as ch3's `variant-review-dev`.
    spotlightAnchor: prodCardSpotlight,
    title: 'prod now exists',
    body: (
      <>
        There it is — prod, cloned straight from dev with no target, the same way dev came from
        base. Base, dev and prod: one component, one line of promotion. That is the whole tour
        set.
      </>
    ),
    advance: { on: 'next' },
  },
];

export const ownershipAndProdSteps: TourStep[] = [...chapter9, ...chapter10];

export const PROD_AND_NEXT_TOUR_ID = 'prod-and-next';
export const prodAndNextSteps: TourStep[] = [...chapter11];

export const ownershipAndProdTour = defineTour({
  id: OWNERSHIP_AND_PROD_TOUR_ID,
  nextTourId: PROD_AND_NEXT_TOUR_ID,
  title: 'Field ownership',
  steps: ownershipAndProdSteps,
});

export const prodAndNextTour = defineTour({
  id: PROD_AND_NEXT_TOUR_ID,
  title: 'A prod variant & what’s next',
  steps: prodAndNextSteps,
});
