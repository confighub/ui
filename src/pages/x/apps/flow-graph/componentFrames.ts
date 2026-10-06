// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedSpaceRead } from '@confighub/rtk-query';
import type { Node } from 'reactflow';

import type { ComponentDeployment } from '../componentTypes';

/**
 * A graph that spans several Components (a click on an Owner group or any
 * other high-level node of the left nav) draws every Component's tree in
 * one canvas. Each Component's tree is a Base called "base", then "dev",
 * "prod" and so on, so without a frame and a name the trees cannot be told
 * apart. All of this is for graphs of two or more Components: with one, the
 * graph draws as it always did.
 */

/** The Owner the left nav shows for a Component with no owner (`componentOwner.ts`). */
export const UNASSIGNED_OWNER = 'Unassigned';

// ── Geometry (model px) ────────────────────────────────────────────────────

/** Room between a frame's edge and the tree inside it, left and right. */
export const FRAME_PAD_X = 24;
/** The header row of a Component frame, above the tree. */
export const FRAME_HEADER_H = 48;
export const FRAME_PAD_BOTTOM = 24;
/** Between two frames. */
export const FRAME_GAP = 40;
export const FRAME_TOP = 20;
/**
 * Below this zoom (the folded graph's readable floor) a frame header grows
 * back toward its size on screen, up to FRAME_HEADER_MAX_SCALE.
 */
export const FRAME_HEADER_SCALE_BELOW = 0.8;
export const FRAME_HEADER_MAX_SCALE = 2.2;

/** One Component of a multi-Component graph. */
export interface ComponentGroup {
  /** The Component ID. */
  key: string;
  name: string;
  owner: string;
  /**
   * Whether the header shows the Owner: only when the frames of the graph do
   * not all share one, because an Owner that every frame repeats tells
   * nothing.
   */
  showOwner: boolean;
  /** Space IDs of the Component's Deployments, in the order they came in. */
  deploymentIds: string[];
  /** Deployments that have no upstream in the Component: the tree roots. */
  rootIds: string[];
}

/** The id of a frame's node. */
export const componentFrameId = (key: string): string => `component-frame:${key}`;

/**
 * The Components of a graph, in a stable order (A to Z by name, the order of
 * the left nav's Components), or an empty list when the graph has fewer than
 * two. A Deployment with no Component name is left out; if that leaves fewer
 * than two Components the graph is not framed.
 */
export function componentGroups(
  deployments: readonly ComponentDeployment[],
): ComponentGroup[] {
  const byKey = new Map<string, ComponentGroup>();
  const ids = new Set(deployments.map((d) => d.deploymentId));
  for (const d of deployments) {
    if (!d.componentId || !d.componentName) continue;
    let group = byKey.get(d.componentId);
    if (!group) {
      group = {
        key: d.componentId,
        name: d.componentName,
        owner: d.owner || UNASSIGNED_OWNER,
        showOwner: true,
        deploymentIds: [],
        rootIds: [],
      };
      byKey.set(d.componentId, group);
    }
    group.deploymentIds.push(d.deploymentId);
    const parentInGraph =
      d.parentDeploymentId !== null && ids.has(d.parentDeploymentId);
    if (!parentInGraph) group.rootIds.push(d.deploymentId);
  }
  if (byKey.size < 2) return [];
  const groups = [...byKey.values()];
  const showOwner = new Set(groups.map((g) => g.owner)).size > 1;
  for (const g of groups) g.showOwner = showOwner;
  return groups.sort((a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}

/**
 * The text of a frame's header: "cert-manager · platform-team", or just
 * "cert-manager" when the Owner is not shown.
 */
export function frameHeaderText(group: ComponentGroup): string {
  return group.showOwner ? [group.name, group.owner].join(' · ') : group.name;
}

/** What assistive technology reads for a frame header. */
export function frameAriaLabel(group: ComponentGroup): string {
  return group.showOwner
    ? `Component ${group.name}, Owner ${group.owner}`
    : `Component ${group.name}`;
}

/**
 * The size of a frame header's text at a zoom. It is 1 down to
 * FRAME_HEADER_SCALE_BELOW, then grows with 1 / zoom so the text keeps its
 * screen size, but no more than FRAME_HEADER_MAX_SCALE (the most the header
 * row holds): at low zoom the frame name is what the user looks for, and it
 * must stay readable.
 */
export function frameHeaderScale(zoom: number): number {
  if (!(zoom > 0) || zoom >= FRAME_HEADER_SCALE_BELOW) return 1;
  return Math.min(FRAME_HEADER_MAX_SCALE, FRAME_HEADER_SCALE_BELOW / zoom);
}

/** A rectangle in model px. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FramePlacement {
  /** Where each frame sits, in the order of the sizes. */
  frames: FrameRect[];
  /** Where the top-left of each tree goes: inside its frame, below the header. */
  offsets: { x: number; y: number }[];
  /** The whole stack of frames. */
  width: number;
  height: number;
}

/**
 * Stack frames one under another. A frame's height is its tree's height plus
 * the header and padding, so a tree that grows (a stack opens) makes its
 * frame taller and moves only the frames below it, down. All frames have the
 * width of the widest tree, so none of them moves sideways.
 *
 * @param trees the size of each tree: `width` its right edge from its own
 *   left edge, `height` from its own top to its bottom.
 */
export function placeFrames(
  trees: readonly { width: number; height: number }[],
): FramePlacement {
  const inner = trees.reduce((max, t) => Math.max(max, t.width), 0);
  const width = inner + 2 * FRAME_PAD_X;
  const frames: FrameRect[] = [];
  const offsets: { x: number; y: number }[] = [];
  let y = FRAME_TOP;
  for (const tree of trees) {
    const height = FRAME_HEADER_H + tree.height + FRAME_PAD_BOTTOM;
    frames.push({ x: 0, y, width, height });
    offsets.push({ x: FRAME_PAD_X, y: y + FRAME_HEADER_H });
    y += height + FRAME_GAP;
  }
  return { frames, offsets, width, height: Math.max(0, y - FRAME_GAP) };
}

/**
 * The Deployments of a graph, with the Component each Space belongs to.
 * `ownerByComponentId` holds each Component's owner (`componentOwner.ts`),
 * read from all of its Spaces, not only the ones this graph draws.
 */
export function withComponents(
  deployments: readonly ComponentDeployment[],
  spaces: readonly ExtendedSpaceRead[],
  slugById: ReadonlyMap<string, string>,
  ownerByComponentId: ReadonlyMap<string, string>,
): ComponentDeployment[] {
  const bySpace = new Map<string, { id: string; name: string; owner: string }>();
  for (const s of spaces) {
    const spaceId = s.Space?.SpaceID;
    const id = s.Space?.ComponentID;
    const name = id ? slugById.get(id) : undefined;
    if (!spaceId || !id || !name) continue;
    bySpace.set(spaceId, {
      id,
      name,
      owner: ownerByComponentId.get(id) || UNASSIGNED_OWNER,
    });
  }
  return deployments.map((d) => {
    const c = bySpace.get(d.deploymentId);
    return c ? { ...d, componentId: c.id, componentName: c.name, owner: c.owner } : d;
  });
}

/** Whether a graph draws Component names and frames. */
export const isMultiComponent = (deployments: readonly ComponentDeployment[]): boolean =>
  componentGroups(deployments).length > 0;

/** A place in the graph, named with its Component when the graph has several. */
export function withComponentName(where: string, d: ComponentDeployment, multi: boolean): string {
  return multi && d.componentName ? `${d.componentName} › ${where}` : where;
}

/** What a frame's actions do. */
export interface ComponentFrameActions {
  /** Select the Component's root Base, so the side pane opens on it. */
  onSelectRoot?: (rootId: string) => void;
  /** Open the Component's own graph: what a click on the frame's name does. */
  onOpenComponent?: (name: string, owner: string) => void;
}

/** Data of a `componentFrameNode`: the labelled region behind one Component's tree. */
export interface ComponentFrameNodeData extends ComponentFrameActions {
  componentName: string;
  owner: string;
  showOwner: boolean;
  headerText: string;
  ariaLabel: string;
  /** The Component's first root, or null when it has none. */
  rootId: string | null;
  width: number;
  height: number;
}

/** The reactflow node of a frame, drawn under the folds, stacks and cards in it. */
export function buildComponentFrameNode(
  group: ComponentGroup,
  rect: FrameRect,
  actions: ComponentFrameActions,
): Node {
  return {
    id: componentFrameId(group.key),
    type: 'componentFrameNode',
    position: { x: rect.x, y: rect.y },
    zIndex: -2,
    draggable: false,
    selectable: false,
    focusable: false,
    data: {
      componentName: group.name,
      owner: group.owner,
      showOwner: group.showOwner,
      headerText: frameHeaderText(group),
      ariaLabel: frameAriaLabel(group),
      rootId: group.rootIds[0] ?? null,
      width: rect.width,
      height: rect.height,
      ...actions,
    } satisfies ComponentFrameNodeData,
  };
}
