// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Node } from 'reactflow';

import { NODE_GAP, NODE_HEIGHT, NODE_WIDTH, STAGE_GAP } from './flowLayout';
import type { DeploymentFlowNodeData } from './DeploymentFlowNode';

// ============================================================================
// COMPOSER LAYOUT
//
// Positions the composer card and its landing slot AFTER buildGraph()
// (ComponentFlowGraph.tsx) has already produced `nodesToRender` from
// computeLayout — every function here reads those ALREADY-COMPUTED positions
// and never feeds anything back into the layout function's inputs. That separation is load-bearing:
// treeCenterLayout.ts's computeSubtreeCenteredY recenters a parent on ALL of
// its children and runs every root through one shared `nextY` cursor in
// array order (see its own docstring — multi-root components are common,
// not an edge case). A ghost fed into that shared computation would
// re-layout siblings AND shift every subsequent root while the user is
// mid-composition. "Existing nodes never move while composing" only holds
// because the composer/landing-slot positions are computed entirely
// downstream of, and never influence, the real layout pass.
// ============================================================================

interface Point {
  x: number;
  y: number;
}

/**
 * Visual width of the composer card. The design mockup (design-mockups/
 * variant-creation/option-a-inline-canvas) uses 480 against a 240px node —
 * double the visual card. The app's real visual card is 240px inside a
 * NODE_WIDTH=260 layout slot; this constant is a WORLD-coordinate size (the
 * same coordinate space flowLayout.ts positions everything in), used purely
 * for the occlusion math below. ComposerNode.tsx counter-scales its own
 * rendering so this stays the composer's on-screen size at any zoom.
 */
export const COMPOSER_WIDTH = 480;

/**
 * Estimated composer height, used for occlusion math before the composer
 * has actually rendered (Phase 1 does not measure and feed back a real
 * height — see the Phase 1 report for that gap). Deliberately generous: an
 * over-estimate can only push the composer one slot lower than strictly
 * necessary, while an under-estimate would let it silently overlap a real
 * card, which is the failure mode this whole module exists to prevent.
 */
export const COMPOSER_DEFAULT_HEIGHT = 280;

function deploymentNodes(nodes: Node[]): Node<DeploymentFlowNodeData>[] {
  return nodes.filter((n): n is Node<DeploymentFlowNodeData> => n.type === 'deploymentNode');
}

/**
 * Where the new variant will land: one lane to the right of `parentId`,
 * below the lowest of its existing children (or level with the parent when
 * it has none yet). Mirrors the mockup's `ghostSlots` — existing siblings
 * never move; only this one new slot is claimed, and only for the duration
 * of composing (a successful submit's refetch re-runs the real layout and
 * the new real node settles into place there, same as any other added
 * node).
 *
 * Returns null when `parentId` isn't found among the already-rendered nodes
 * (e.g. it was removed from the graph while the composer was open).
 */
export function computeLandingSlotPosition(nodes: Node[], parentId: string): Point | null {
  const flowNodes = deploymentNodes(nodes);
  const parent = flowNodes.find((n) => n.id === parentId);
  if (!parent) return null;

  const siblings = flowNodes.filter((n) => n.data.deployment.parentDeploymentId === parentId);
  const y = siblings.length
    ? Math.max(...siblings.map((s) => s.position.y)) + NODE_HEIGHT + NODE_GAP
    : parent.position.y;

  return { x: parent.position.x + NODE_WIDTH + STAGE_GAP, y };
}

/**
 * Where the composer card itself renders. It starts at the landing slot,
 * but at COMPOSER_WIDTH (480, double a real card) it commonly reaches into
 * the next lane — on a populated graph that would occlude real sibling
 * cards sitting there. The composer yields: it drops to the first Y band
 * clear of every existing node's bounding box, so it never covers a card
 * that's already on screen. The landing slot from
 * computeLandingSlotPosition stays put either way — where the result lands
 * is never in doubt, only the editor moves.
 */
export function computeComposerPosition(
  nodes: Node[],
  landingSlot: Point,
  composerHeight: number = COMPOSER_DEFAULT_HEIGHT,
): Point & { yielded: boolean } {
  const boxes = deploymentNodes(nodes).map((n) => ({
    l: n.position.x,
    r: n.position.x + NODE_WIDTH,
    t: n.position.y,
    b: n.position.y + NODE_HEIGHT,
  }));

  const x = landingSlot.x;
  let y = landingSlot.y;
  // Bounded loop (matches the mockup's own `guard`): each iteration moves y
  // strictly past the bottom of whatever it hit, so this terminates in at
  // most one pass per node.
  for (let guard = 0; guard < 40; guard++) {
    const hit = boxes.find((b) => !(b.r <= x || b.l >= x + COMPOSER_WIDTH || b.b <= y || b.t >= y + composerHeight));
    if (!hit) break;
    y = hit.b + NODE_GAP;
  }

  return { x, y, yielded: y !== landingSlot.y };
}

// ============================================================================
// NUDGE-INTO-VIEW
//
// The composer must never open somewhere the user can't see — on a panned or
// dense graph that reads as a dead keystroke ('V' or the click affordance
// producing nothing visible), not a feature. But the rule was never "the
// canvas must not move under any circumstance": it's that the canvas never
// pans as a SIDE EFFECT of composing when the composer is already visible.
// So: if it's fully in view, do nothing at all — the returned pan must be
// numerically identical, not merely close. If it isn't, pan the MINIMUM
// distance needed, not a framing/centering move (setCenter/fitView do the
// latter, which is why neither is used here).
// ============================================================================

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Size {
  width: number;
  height: number;
}

/**
 * Minimal pan (for one axis) needed to bring a world-space span
 * [worldPos, worldPos+size] fully inside [margin, containerSize-margin] of
 * screen space, at the given zoom. Returns `pan` UNCHANGED (reference-safe
 * for a `=== ` comparison by the caller) when the span is already inside —
 * that's what lets computeNudgeIntoView report "nothing to do" rather than
 * "moved by ~0".
 */
function clampPanAxis(
  pan: number,
  worldPos: number,
  size: number,
  containerSize: number,
  zoom: number,
  margin: number,
): number {
  const screenPos = worldPos * zoom + pan;
  const minScreen = margin;
  // If the composer (plus margins) is wider/taller than the container, favor
  // showing its top-left (name field, primary controls) over centering —
  // maxScreen floors at minScreen rather than going negative.
  const maxScreen = Math.max(minScreen, containerSize - margin - size);
  const clampedScreen = Math.min(Math.max(screenPos, minScreen), maxScreen);
  if (clampedScreen === screenPos) return pan;
  return pan + (clampedScreen - screenPos);
}

/**
 * Computes the minimal viewport pan that brings the composer (a world-space
 * box at `composerPos` sized `composerSize`) fully into view within a
 * `containerSize`-px canvas, given the CURRENT `viewport`. Returns `null`
 * when the composer is already fully visible (minus `margin` screen px of
 * breathing room) — callers must treat that as "leave the viewport
 * transform untouched," not "nudge by zero."
 */
export function computeNudgeIntoView(
  composerPos: Point,
  composerSize: Size,
  viewport: Viewport,
  containerSize: Size,
  margin = 24,
): Viewport | null {
  const x = clampPanAxis(viewport.x, composerPos.x, composerSize.width, containerSize.width, viewport.zoom, margin);
  const y = clampPanAxis(viewport.y, composerPos.y, composerSize.height, containerSize.height, viewport.zoom, margin);
  if (x === viewport.x && y === viewport.y) return null;
  return { x, y, zoom: viewport.zoom };
}
