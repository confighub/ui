// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Link from '@mui/material/Link';

import { TourCommand, TourCue } from '../../TourCue';
import { TourStep } from '../../types';
import { defineTour } from '../../registry';
import { CHANGE_AND_PROMOTE_TOUR_ID } from './changeAndPromote';

export const DEPLOY_AND_RELEASE_TOUR_ID = 'deploy-and-release';

/**
 * Chapter 4 — make a "dev" variant of the base component.
 *
 * Chapter 5 ("publish a release") is NOT here: it is a pure explanation, not
 * an interactive walkthrough (see ownershipAndProd.tsx's docstring for why),
 * and explaining a CLI-only concept this early would interrupt the run of
 * in-browser chapters that follow it. It now lives at the very end of the
 * whole 5-tour sequence — ownershipAndProdSteps' `release-explain-gap`,
 * placed right before the final "prod now exists" step — so every in-browser
 * feature this app has gets shown before the one thing this tour set cannot
 * demonstrate live.
 *
 * ── Base-node anchoring ──
 * A reactflow node id is the underlying Space ID
 * (flow-graph/flowLayout.ts:126) — a runtime UUID a tour step cannot
 * hardcode. DeploymentFlowNode.tsx already stamps a static `data-variant`
 * attribute on the node's card (`"base"` for the root/no-target node, the
 * node's own display name for every other node) — landed by a parallel
 * chapter-writing task solving the identical problem for chapters 6-8
 * (see changeAndPromote.tsx's docstring, which relies on
 * `[data-variant="base"]` uniquely matching the card to click-select it).
 * This chapter reuses that exact attribute/value for the same "which node
 * is the base" question, and separately needs one thing changeAndPromote.tsx
 * didn't: the node's own composer-open handle (`flow-node-composer-handle-
 * <id>`, also UUID-keyed). That handle carries the SAME base/name value
 * but under a DIFFERENT attribute, `data-handle-variant` — reusing
 * `data-variant` there would have made changeAndPromote.tsx's
 * `[data-variant="base"]` match two elements (the card AND the handle,
 * which sit as DOM siblings, not nested) once this chapter's own edit
 * landed; discovered by this chapter's own Playwright run, which is why
 * the two names are kept distinct. Both attributes are pure instrumentation
 * — see the diff in DeploymentFlowNode.tsx.
 *
 * ── Opening the composer is NOT a click ──
 * The composer-open handle has no onClick at all — ComponentFlowGraph.tsx
 * wires it as a real drag source (onConnectStart/onConnectEnd) plus a 'V'
 * keyboard shortcut while hovering the node; the handle's own tooltip says
 * so verbatim ("Drag to clone, or press V" — DeploymentFlowNode.tsx). A
 * `click`-kind Advance on that handle would therefore fire the moment the
 * user's click event lands there even though nothing opened — so chapter 4's
 * first step spotlights the handle but advances on a `selector` watch for
 * the composer's own name field appearing, which is agnostic to which of
 * the two real gestures (drag vs. 'V') the user actually used.
 *
 * ── Never attach a Target ──
 * `composer-target-select`'s Select is unfiltered — nothing stops a step
 * from picking a real Target, which would leave the new variant's units with
 * a permanently-unresolvable "unapplied changes" badge (no live worker
 * behind it). This chapter never clicks that Select at all; the instructional
 * step only explains that its default is what to keep. That default renders as
 * an EMPTY field: the Select has no `displayEmpty`, so its `value=''` shows
 * nothing, and the "No target" MenuItem label is visible only once the
 * dropdown is opened — which is why the copy says to leave
 * "Target (optional)" empty rather than to set it to "No target".
 *
 * ── Why "publish a release" moved out of this chapter ──
 * The Releases tab / Release button only render when the selected
 * deployment's Space has `ReleaseTargetID` set (ComponentSidePane.tsx:
 * `canRelease = !!selectedDeployment?.releaseTargetId`). Grepped the whole
 * `ui/src` tree (target-list, add-target, the create-component wizard,
 * useCreateComponentMutation.ts, useCreateVariantMutation.ts): there is no
 * UI action anywhere that sets `Space.ReleaseTargetID` — every place that
 * does (component-release.spec.ts's own fixtures) does it with a direct
 * `PATCH /api/space/:id { ReleaseTargetID }` call, bypassing the UI
 * entirely. The tutorial's own "cubbychat" base (built by earlier chapters,
 * never given a Target) will therefore never satisfy `canRelease`, so
 * `component-pane-tab-releases` will never exist for it in the live app —
 * this is a genuine product gap, not something a tour step can route around
 * (TourStep has no side-effect/API hook, only navigateTo + anchor +
 * advance). An earlier version of this chapter tried to walk through the
 * real Releases tab / Release button / release lane anyway, marking each of
 * those three steps `optional: true` so the chapter would self-skip past
 * whichever ones the missing target hid rather than hang. In practice that
 * self-skipped ALL THREE every single run, so the chapter taught nothing
 * about releases at all — three steps that silently vanished is worse than
 * one step that explains why. Replaced with a single explanatory step, and
 * relocated to the very end of the 5-tour sequence (see the top of this
 * file) rather than staying attached to chapter 4.
 */

/** The base node's composer-open handle — see docstring. */
const BASE_COMPOSER_HANDLE_CSS = '[data-handle-variant="base"]';

const VARIANT_NAME = 'dev';

export const deployAndReleaseSteps: TourStep[] = [
  // ── Chapter 4 — create the dev variant ──
  {
    // A real Target needs a real cluster/worker behind it, and there is no
    // in-browser way to create one — same product reality
    // `release-explain-gap` documents for release targets, one step earlier
    // in the journey. Anchorless for the same reason that step is: a pure
    // explanation with nothing on screen to honestly point at. Placed here,
    // before the first variant is ever made, because this is the first point
    // in the whole 5-tour sequence a Target becomes relevant at all — every
    // later "leave Target empty" instruction assumes the user read this.
    id: 'target-explain-gap',
    title: 'Want this to deploy for real?',
    body: (
      <>
        Continues from "Explore your component" — take that tour first if you have not. Every
        variant in this tour set is made with <TourCue>No target</TourCue> — safe to follow along
        with nothing connected. If you want one to actually deploy,{' '}
        <TourCommand>run</TourCommand> <code>cub cluster up --name dev</code> in a terminal
        first. That one command creates a local cluster and a real target named{' '}
        <code>dev/target</code>, which then appears in the composer's{' '}
        <TourCue>Target (optional)</TourCue> dropdown for any variant you make afterward. Full
        instructions:{' '}
        <Link href="https://docs.confighub.com/get-started/tutorial/cluster/" target="_blank" rel="noopener noreferrer">
          Set up your cluster
        </Link>
        .
      </>
    ),
    advance: { on: 'next' },
  },
  {
    id: 'variant-open-composer',
    anchor: { kind: 'selector', css: BASE_COMPOSER_HANDLE_CSS },
    title: 'Make a variant',
    body: (
      <>
        A variant is a clone of the base for one environment, like dev or
        prod. It starts identical to the base and can diverge from
        there. <TourCommand>Hover</TourCommand> this handle, then{' '}
        <TourCommand>press</TourCommand> <TourCue>V</TourCue> to open the new
        variant panel. Dragging from it works too.
      </>
    ),
    // Not a `click` advance: this handle has no click handler at all (it is
    // a drag source plus a 'V' shortcut target — see docstring). Watching
    // for the panel's own name field is agnostic to which gesture opened it.
    advance: { on: 'selector', css: '[data-testid="composer-variant-name-input"]' },
  },
  {
    id: 'variant-name',
    anchor: { kind: 'selector', css: '[data-testid="composer-variant-name-input"]' },
    title: 'Name the variant',
    body: (
      <>
        The name identifies this environment. <TourCommand>Type</TourCommand>{' '}
        <TourCue>dev</TourCue> in the field.
      </>
    ),
    // `input`, not `next`: a user who types the name and clicks Create
    // variant directly, without pressing this tooltip's own Next, would
    // otherwise strand the tour here — `variant-submit`'s own click listener
    // for that button is not mounted yet when the click actually lands. See
    // changeAndPromote.tsx's `change-search-function` comment for the full
    // failure mode.
    advance: {
      on: 'input',
      anchor: { kind: 'selector', css: '[data-testid="composer-variant-name-input"]' },
      value: VARIANT_NAME,
    },
  },
  {
    id: 'variant-submit',
    anchor: { kind: 'selector', css: '[data-testid="composer-submit-button"]' },
    title: 'Create the variant',
    body: (
      <>
        Leave <TourCue>Target (optional)</TourCue> empty — this tour has none
        connected, and a target with no live worker behind it leaves a warning
        you cannot clear. <TourCommand>Click</TourCommand>{' '}
        <TourCue>Create variant</TourCue>.
        ConfigHub clones the base's space and units into the new dev variant.
      </>
    ),
    advance: { on: 'click', anchor: { kind: 'selector', css: '[data-testid="composer-submit-button"]' } },
  },
  {
    id: 'variant-wait-success',
    anchor: { kind: 'selector', css: `[data-testid="composer-status-row-${VARIANT_NAME}"]` },
    title: 'Creating dev…',
    body: 'ConfigHub is cloning the base into dev. This finishes in a few seconds.',
    // NOT `composer-status-row-<name>[data-phase="success"]`, even though
    // that attribute genuinely does reach 'success' (PHASE_LABEL in
    // ComposerNode.tsx): confirmed live (this chapter's own Playwright run)
    // that on a fully-successful single-name submit the whole composer node
    // unmounts itself very shortly after — closely enough behind the
    // 'success' write that a MutationObserver-driven `selector` advance can
    // receive the removal in the SAME callback batch as the attribute
    // change, before ever re-querying the DOM and finding the row still
    // there (`useTourAdvance`'s `check()` only inspects the CURRENT DOM when
    // the batched callback fires, not each individual mutation record) — so
    // the advance can miss its own condition and the step hangs. The new
    // `dev` NODE appearing in the flow graph is the durable proof of the
    // same success (it is only added once the clone actually completes) and
    // is never removed afterward, so it cannot race its own detection.
    advance: { on: 'selector', css: `[data-variant="${VARIANT_NAME}"]` },
  },
  {
    // A pure "look at what you just made" beat. `variant-wait-success` above
    // auto-advances the INSTANT the dev node appears (its own advance watches
    // the same node), so a user never actually dwells on it — the tour was
    // already moving on to selecting the BASE node for chapter 5 before dev
    // itself was ever looked at. Self-paced (`next`), not another
    // auto-advancing wait: nothing more needs to resolve here, so the user
    // decides when they are done looking.
    id: 'variant-review-dev',
    anchor: { kind: 'selector', css: `[data-testid="flow-node-select-target"][data-variant="${VARIANT_NAME}"]` },
    // Rings the whole card, not just the click-safe strip: this step never
    // asks the user to click anything (self-paced `next`), so widening only
    // the visual ring carries none of the "ring implies a bigger safe area
    // than exists" risk a click step would — see exploreAndInspect.tsx's
    // `explore-select-base-node` for where that risk actually applies and
    // how the copy accounts for it.
    spotlightAnchor: {
      kind: 'selector',
      css: `[data-testid^="flow-node-"][data-variant="${VARIANT_NAME}"]:not([data-testid="flow-node-select-target"])`,
    },
    title: 'dev now exists',
    body: (
      <>
        Take a look — dev is a full clone of the base, right down to its units. Nothing has
        diverged between them yet; that starts in the next chapter.
      </>
    ),
    advance: { on: 'next' },
  },
];

export const deployAndReleaseTour = defineTour({
  id: DEPLOY_AND_RELEASE_TOUR_ID,
  nextTourId: CHANGE_AND_PROMOTE_TOUR_ID,
  title: 'Deploy to dev',
  steps: deployAndReleaseSteps,
});
