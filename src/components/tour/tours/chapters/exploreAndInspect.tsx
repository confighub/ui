// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { TourStep } from '../../types';
import { TourCommand, TourCue } from '../../TourCue';
import { defineTour } from '../../registry';
import { DEPLOY_AND_RELEASE_TOUR_ID } from './deployAndRelease';

export const EXPLORE_AND_INSPECT_TOUR_ID = 'explore-and-inspect';

/**
 * Chapter 2 — explore the component + variant tree, and
 * Chapter 3 — inspect a unit's data.
 *
 * Picks up where chapter 1 (gettingStartedTour) leaves off: the "cubbychat"
 * component exists (one base Space, labelled `Component=cubbychat`, no
 * Target), the create-component wizard has closed, and the URL already
 * carries `?app=cubbychat` — `AppsComponentPage`'s `onCreated` callback
 * (fired by the wizard's own "Done" button) sets exactly that param, the
 * same deep-link shape a click on the overview tile would produce.
 *
 * Deliberately does NOT add its own `navigateTo: '/components?app=cubbychat'`
 * on step 1 as a defensive bridge: chapter content must stay agnostic of the
 * component's actual name so it can be exercised against a differently-named
 * test fixture (this chapter's own Playwright spec creates a timestamped
 * component, never literally "cubbychat", to avoid colliding with a human's
 * manual run or another agent's parallel test run) — a hardcoded `navigateTo`
 * would silently redirect every such run back to a component that doesn't
 * exist for it. If the handoff from chapter 1 turns out not to already be on
 * the right URL, fix that at the handoff (e.g. a step in chapter 1 itself, or
 * the stitching step), not by having chapter 2 assume a specific name.
 *
 * ── The base-node click anchor (read this before touching anchors here) ──
 *
 * A tour step cannot anchor on `{kind:'flowNode', deploymentId}` for "the
 * base node" because the id is a runtime Space UUID, unknown until the
 * component is actually created — there is no static value to write into
 * this file.
 *
 * `<NodeName>` used to be a real `<Link>` whose onClick did
 * `e.stopPropagation(); e.preventDefault(); window.open(unitsUrl, '_blank')`
 * — main has since removed that (DeploymentFlowNode.tsx's own comment on its
 * `flow-node-select-target` strip has the story), so a click anywhere on a
 * quiet, target-less node's card — name included — now bubbles normally and
 * selects it, same as clicking blank card space. This step anchors on the
 * whole card (`[data-testid^="flow-node-"][data-variant="base"]:not(
 * [data-testid="flow-node-select-target"])` — the card's own NodeContainer,
 * matched without hardcoding its runtime UUID), both for the click-advance
 * and the spotlight ring, so the two agree: whatever the ring highlights is
 * exactly what's safe — and correct — to click.
 */

/** Scopes a lookup to the create-component wizard's own Dialog, matching the
 * container helper in gettingStartedTour.tsx (not imported from there — this
 * chapter never opens that dialog, so it never needs it — but the same
 * `[data-testid="component-leaf-row"]` / `[data-testid^="field-edit-trigger-"]`
 * elements chapter 3 anchors on are NOT inside a Dialog, so a bare `selector`
 * anchor is enough here). */

const BASE_CARD_CSS =
  '[data-testid^="flow-node-"][data-variant="base"]:not([data-testid="flow-node-select-target"])';

export const exploreAndInspectSteps: TourStep[] = [
  // ── Chapter 2: explore the component + variant tree ──────────────────────
  {
    id: 'explore-select-base-node',
    anchor: { kind: 'selector', css: BASE_CARD_CSS },
    title: 'Your new component',
    body: (
      <>
        Continues from "Make your first component" — take that tour first if you have not. This
        graph is your component's <strong>variant tree</strong>: only the <strong>base</strong>{' '}
        so far, the source you clone into dev, staging or prod.{' '}
        <TourCommand>Click</TourCommand> it to open its details.
      </>
    ),
    advance: {
      on: 'click',
      anchor: { kind: 'selector', css: BASE_CARD_CSS },
    },
  },
  {
    id: 'explore-view-configuration',
    // The base has no Target, so `ComponentSidePane` never renders a Config /
    // Releases tab bar for it (`canRelease = !!selectedDeployment?.releaseTargetId`
    // — false for a target-less base) — it shows the Configuration content
    // directly. `component-pane-tab-config` DOES exist in ComponentSidePane.tsx
    // (verified), but only for a release-enabled deployment, which "cubbychat"
    // deliberately never is per chapter 1's own design (a target with no live
    // worker leaves an unclearable warning) — so this step does not anchor on
    // it. It anchors on the tree content itself, which is what's actually on
    // screen for this component.
    // The whole values list, NOT `component-leaf-row`: that testid is stamped
    // once per row, so this step's spotlight resolved to whichever row matched
    // first (`apiVersion: apps/v1`) and ringed a single arbitrary value while
    // the copy described the entire Configuration view. `component-values-list`
    // was added to ComponentSidePane.tsx's PaneContent for exactly this.
    anchor: { kind: 'selector', css: '[data-testid="component-values-list"]' },
    title: 'See its configuration',
    body: (
      <>
        This is the <strong>Configuration</strong> view: every value in the base's units, laid
        out as a tree. Both units you made in the last tour are here as collapsible groups, and
        each row is one value ConfigHub tracks and can change on its own.
      </>
    ),
    advance: { on: 'next' },
  },
  {
    // Units default collapsed (lazy expansion, so a massive unit only mounts
    // visible rows) — the next step's anchor is a leaf row inside one, so it
    // does not exist on screen until something opens it. Rather than a bare
    // "click a row to expand it" step, this teaches search: typing a query
    // that matches a unit's CONTENT (not just its slug) auto-opens that unit
    // — `isUnitExpandedInPane`'s `searchContentMatchedUnitIds` check in
    // ComponentSidePane.tsx — so the search box solves the same problem
    // while being the more useful habit on a component with many units and
    // values, where opening each group by hand does not scale. `image`
    // matches the next step's own path
    // (`spec.template.spec.containers.0.image`), so this step's advance
    // watches for that exact row directly — the moment search reveals it,
    // the tour is already on the next step's own anchor.
    id: 'explore-search-value',
    anchor: { kind: 'selector', css: '[data-testid="component-search"]' },
    title: 'Search for a value',
    body: (
      <>
        With several units and many values, searching beats opening each group by hand.{' '}
        <TourCommand>Type</TourCommand> <TourCue>image</TourCue> — search opens whichever unit
        holds a match, and narrows the list to it.
      </>
    ),
    advance: {
      on: 'selector',
      css: '[data-testid="field-edit-trigger-spec.template.spec.containers.0.image"]',
    },
  },

  // ── Chapter 3: inspect one value ──────────────────────────────────────────
  {
    id: 'inspect-placeholder-value',
    // The task brief for this chapter expected a literal `confighubplaceholder`
    // sentinel value (e.g. an unset namespace) somewhere in the sample
    // manifest — grepped for it directly in `CreateComponentPane.tsx`'s
    // `SAMPLE_MULTI_YAML` and it is NOT there: none of the three sample
    // resources (Deployment/Service/ConfigMap) declare a `namespace` field at
    // all, and nothing client- or server-side injects one for this create
    // path (confirmed empirically: created the exact sample content via the
    // API — mirroring both the wizard's default 'minimal' granularity, which
    // groups Deployment+Service into one unit and the ConfigMap into
    // another, and a per-resource 3-unit layout for good measure — and
    // dumped every rendered leaf row; no `confighubplaceholder` value
    // appeared in either). So this step points at a real, ordinary value
    // instead and teaches the same underlying idea (a base sets one value;
    // a variant can set its own) rather than asserting a placeholder that
    // isn't actually there. Flagged for the parent orchestrator to reconcile
    // against whatever the master tutorial-step list assumed.
    //
    // `field-edit-trigger-${fullPath}` is instrumentation another agent added
    // to ComponentValuesSection.tsx's per-row value span (observed already
    // present, not added by this chapter) specifically so a single row can be
    // targeted by its config path — `component-leaf-row` alone is repeated
    // once per row and cannot address one in particular.
    // `spec.template.spec.containers.0.image` is the checkout-api Deployment's
    // container image — the only field in the whole sample with this path, so
    // it stays unique regardless of which Units the resources land in.
    anchor: {
      kind: 'selector',
      css: '[data-testid="field-edit-trigger-spec.template.spec.containers.0.image"]',
    },
    title: 'Look at one value',
    body: (
      <>
        This row holds the container image for checkout-api. The base sets it once, here. A
        variant made from this base can set its own value at this same spot — for example, a
        different image tag for dev — without changing the base. You do not need to change
        anything now.
      </>
    ),
    advance: { on: 'next' },
  },
];

export const exploreAndInspectTour = defineTour({
  id: EXPLORE_AND_INSPECT_TOUR_ID,
  nextTourId: DEPLOY_AND_RELEASE_TOUR_ID,
  title: 'Explore your component',
  steps: exploreAndInspectSteps,
});
