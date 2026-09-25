// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { TourCommand, TourCue } from '../../TourCue';
import { TourStep } from '../../types';
import { defineTour } from '../../registry';
import { OWNERSHIP_AND_PROD_TOUR_ID } from './ownershipAndProd';

export const CHANGE_AND_PROMOTE_TOUR_ID = 'change-and-promote';

/**
 * Chapters 6-8 — change the base with a function, watch the change reach
 * dev as a Stale/Incoming state, then preview and pull it in.
 *
 * ── Base vs. dev node anchoring ──
 * A reactflow node id equals its Space ID (flow-graph/flowLayout.ts:126) — a
 * runtime UUID a tour step cannot hardcode. DeploymentFlowNode.tsx now stamps
 * a static `data-variant` attribute on the node's own card: `"base"` for the
 * root (no-target) node, and the node's own display name — which for a
 * variant node IS the name typed into the variant composer (e.g. "dev"),
 * since `displayName` only falls back to the Space slug when no
 * `Labels.Variant` is set — for every other node. That attribute already
 * existed when this chapter was authored (a parallel chapter-writing task
 * landed the identical fix first). That same parallel task ALSO stamped
 * `data-variant` onto the node's composer-open handle
 * (`flow-node-composer-handle-<id>`, its own anchor for "open the composer
 * from the base node") — so a bare `[data-variant="base"]` resolves to TWO
 * elements per node, not one (confirmed live: Playwright's strict-mode
 * violation on the first run named exactly this element as the second
 * match). `:not([data-testid*="composer-handle"])` excludes it, since only
 * the composer handle's testid contains that substring — the node's own
 * card testid (`flow-node-<id>`) never does.
 *
 * ── Invoking a function on a selected node ──
 * There is no per-unit "invoke" dialog in the live app — both
 * `InvokeFunctionsModal` components are dead code (their open-state setters
 * are never called with a truthy value). The real path: selecting a
 * deployment node in the flow graph writes that node's units into Redux
 * `selectedUnits` (AppComponentView.tsx's cross-store-sync effect, ~line
 * 492), which feeds the single global `InvokerSidebar` mounted in
 * Layout.tsx. Opening it is the "Functions" button
 * (`invoker-functions-button`, RightSidebar.tsx). Inside: search
 * (`invoker-function-search`) narrows the flat, all-toolchains function
 * list; a result renders as `function-item-<FunctionName>`
 * (FunctionListScreen.tsx); its parameter form renders one
 * `function-param-<ParameterName>` field per declared parameter
 * (FunctionParameterForm.tsx); and `invoker-invoke-button` submits
 * (InvokerContent.tsx). None of these four testids existed before this
 * chapter — added as pure attribute instrumentation, no behavior change.
 *
 * `set-replicas` is the function used: verified live against the running
 * backend's `/api/function` response for the `Kubernetes/YAML` toolchain
 * (the sample manifest's Deployment resource is that toolchain) — it takes
 * exactly one required int parameter, `replicas`, matching the CLI
 * tutorial's own choice of function for this step.
 */

const FUNCTION_NAME = 'set-replicas';

// `flow-node-select-target` is excluded (not `data-variant` alone) because
// that attribute also matches the composer-open handle — a real `:not()`
// collision, confirmed live. NodeName no longer links out (main removed the
// clickable node-name link this used to have to route around — see
// exploreAndInspect.tsx's header docstring), so a click anywhere on the rest
// of a quiet node's card now bubbles normally and selects it; these resolve
// to the card's own NodeContainer, matched without hardcoding its runtime
// UUID.
const BASE_NODE_CSS = '[data-testid^="flow-node-"][data-variant="base"]:not([data-testid="flow-node-select-target"])';
const DEV_NODE_CSS = '[data-testid^="flow-node-"][data-variant="dev"]:not([data-testid="flow-node-select-target"])';

// DeploymentFlowNode.tsx's NodeContainer also carries `data-selected` (added
// for ownershipAndProd.tsx's `edit-open-dev`/`reedit-open-base`, reused
// here — see that file for the full rationale). `change-select-base` needs
// it for the identical reason: node selection is a TOGGLE
// (AppComponentView.tsx's `handleDeploymentToggle` — clicking an
// ALREADY-selected node clears the selection instead of doing nothing).
// deployAndRelease.tsx's own last real click (`release-select-base`) selects
// base and nothing after it deselects, so a user who takes these tours back
// to back in order — the exact chain tour-full-walkthrough.spec.ts drives —
// arrives here with base already selected. A plain `click` advance is
// blind to that: it re-fires the click, the toggle clears the selection,
// and every step after it (open Functions, search, pick, fill, Invoke)
// proceeds with `selectedUnits` empty — `InvokerContent.tsx`'s
// `canInvoke = selectedUnits.length > 0` then keeps Invoke permanently
// disabled with no error shown anywhere, hanging the tour on
// `change-invoke` for good. Confirmed live via the continuous 5-tour
// walkthrough. Watching `data-selected="true"` instead sidesteps the click
// entirely when base is already open (an immediate, silent advance) and
// still requires — and confirms — a real click otherwise.
const BASE_NODE_SELECTED_CSS = '[data-variant="base"][data-selected="true"]';

export const changeAndPromoteSteps: TourStep[] = [
  // ── Chapter 6 — change the base with a function ──
  {
    id: 'change-select-base',
    anchor: { kind: 'selector', css: BASE_NODE_CSS },
    title: 'Select the base',
    body: (
      <>
        Continues from "Deploy to dev" — take that tour first if you have not.
        The base holds the configuration every variant starts from.{' '}
        <TourCommand>Click</TourCommand> it to select the node.
      </>
    ),
    advance: { on: 'selector', css: BASE_NODE_SELECTED_CSS },
  },
  {
    id: 'change-open-functions',
    anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' },
    title: 'Open Functions',
    body: (
      <>
        A function runs one small, tested operation on the selected
        component's files. <TourCommand>Click</TourCommand>{' '}
        <TourCue>Functions</TourCue> to open it.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' } },
  },
  {
    id: 'change-search-function',
    anchor: { kind: 'selector', css: '[data-testid="invoker-function-search"]' },
    title: 'Find the function',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>set-replicas</TourCue> in the
        search box. This function sets the replica count on a workload.
      </>
    ),
    // `input`, not `next`: a user who types the search text and then clicks
    // the matching result directly — the next step's own anchor — never
    // presses this tooltip's Next button. With `next` here, that click does
    // nothing for the tour (this step's listener does not watch it), and the
    // tour is left stranded a step behind the app it is supposed to be
    // narrating.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="invoker-function-search"] input' },
      value: FUNCTION_NAME,
    },
  },
  {
    id: 'change-select-function',
    anchor: { kind: 'selector', css: `[data-testid="function-item-${FUNCTION_NAME}"]` },
    title: 'Choose set-replicas',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>set-replicas</TourCue> in
        the results. The next screen asks for its one parameter.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: `[data-testid="function-item-${FUNCTION_NAME}"]` } },
  },
  {
    id: 'change-fill-replicas',
    anchor: { kind: 'selector', css: '[data-testid="function-param-replicas"]' },
    // Left, not the default bottom: the Functions sidebar is narrow, and this
    // field is often the last visible one before the sidebar's own bottom
    // edge — a card below it can run past the sidebar and over the app
    // content beneath, or simply feel cramped against the edge. Left opens
    // into the wide canvas area instead.
    placement: 'left',
    title: 'Set the replica count',
    body: (
      <>
        <TourCommand>Type</TourCommand> <TourCue>5</TourCue> in the Replicas
        field. The base is set to 2 today, so this is a real change.
      </>
    ),
    // `input`, not `next` — see `change-search-function`'s comment. Here a
    // user who types the value and clicks Invoke directly, without pressing
    // this tooltip's Next first, would otherwise strand the tour on this step
    // forever: `change-invoke`'s own click listener for that same button is
    // not mounted yet when that click actually lands.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="function-param-replicas"] input' },
      value: '5',
    },
  },
  {
    id: 'change-invoke',
    anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' },
    title: 'Run the function',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Invoke</TourCue> to run it.
        This changes the base — every variant made from it, like dev, will
        then be one change behind.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-invoke-button"]' } },
  },
  {
    // Functions has no further use in this chapter — closing it here, not
    // leaving it open to be closed incidentally by something else later, is
    // what keeps the right-hand panel showing dev's Component pane (with the
    // Upgrade button `promote-upgrade` needs) once dev is selected below.
    // Confirmed live: left open, the tour can reach `promote-upgrade` with
    // nothing selected and Functions still the visible panel, landing on
    // TourHost's "this part of the app is not on screen" fallback instead
    // of the real Upgrade button.
    id: 'change-close-functions',
    anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' },
    // Titled for the result, not the housekeeping: the step's real job is
    // showing WHAT the function changed; closing the panel is the tidy-up
    // afterwards. Same reasoning as gettingStartedTour's
    // 'Three resources, two units'.
    title: 'Replicas: 2 → 5',
    body: (
      <>
        The result shows exactly what changed: replicas <strong>2 → 5</strong> in the base's
        main unit, and the pane behind it already carries the new value.{' '}
        <TourCommand>Click</TourCommand> <TourCue>Functions</TourCue> again to close it.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="invoker-functions-button"]' } },
  },

  // ── Chapter 7 — spot the stale/upgrade state on dev ──
  {
    // Used to be followed by a `stale-incoming-filter` step telling the user
    // to click 'Incoming'. Removed: `ComponentSidePane`'s filterMode now
    // resets to 'incoming' automatically whenever the newly-selected node has
    // an upgradable unit (the effect keyed on `[selectedDeploymentIds,
    // hasUpgradableUnits]`) — true here by construction, since this chapter's
    // whole premise is that dev just went stale. So the pane is already on
    // Incoming the instant dev is selected; a step telling the user to click
    // a tab that's already active is a step with nothing to do. Its one bit
    // of real content — what "Incoming" means — is folded into this step's
    // own body instead of losing it outright.
    id: 'stale-select-dev',
    anchor: { kind: 'selector', css: DEV_NODE_CSS },
    title: 'Select dev',
    body: (
      <>
        dev was made from the base, so it is now behind by the change you just made.{' '}
        <TourCommand>Click</TourCommand> it to select the node. Its panel opens straight to{' '}
        <TourCue>Incoming</TourCue> — the changes base has that dev does not yet have.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: DEV_NODE_CSS } },
  },

  // ── Chapter 8 — preview the diff, then upgrade (the CLI's "promote") ──
  {
    id: 'promote-preview-diff',
    anchor: { kind: 'selector', css: '[data-testid="component-leaf-row"][data-change-type="upgrade"]' },
    title: 'Preview the change',
    // States dev's CURRENT value (2) explicitly. The row itself shows only the
    // incoming value once it is staged — `.current-preview`, which carries the
    // current→proposed inline diff, stays `display: none` on this row — so copy
    // that told the user to "read the change" was pointing at half of one.
    body: (
      <>
        The purple row is the incoming change: base now sets replicas to <strong>5</strong>,
        while dev is still on <strong>2</strong>. It is already ticked, so it is staged and
        ready to bring in.
      </>
    ),
    advance: { on: 'next' },
  },
  {
    // A `promote-select-all` step used to sit here, telling the user to click
    // 'Select all' to stage the incoming field. Removed outright, not just
    // left `optional`: `ComponentSidePane` auto-stages every incoming field
    // the instant a node opens already on the Incoming filter
    // (`didInitialStageAllRef`) — which, per `stale-select-dev` above, is now
    // EVERY time this chapter reaches this point. The button's own render
    // condition (`totalStaged < totalUpgradableFields`) is therefore always
    // false here: it never merely fails to appear sometimes, it structurally
    // cannot appear on this path. `optional: true` was masking a step that
    // had become permanently dead rather than genuinely conditional.
    id: 'promote-upgrade',
    anchor: { kind: 'selector', css: '[data-testid="component-upgrade-button"]' },
    title: 'Upgrade dev',
    body: (
      <>
        <TourCommand>Click</TourCommand> <TourCue>Upgrade</TourCue> to merge
        the base's change into dev. The CLI calls this same action "promote".
      </>
    ),
    // Waits for the mutation to resolve (the success flash), not the click
    // itself — the changed row must actually leave the Incoming set before
    // the next chapter's steps assume it is gone.
    advance: { on: 'selector', css: '[data-testid="component-action-success"]' },
  },
];

export const changeAndPromoteTour = defineTour({
  id: CHANGE_AND_PROMOTE_TOUR_ID,
  nextTourId: OWNERSHIP_AND_PROD_TOUR_ID,
  title: 'Change the base & promote',
  steps: changeAndPromoteSteps,
});
