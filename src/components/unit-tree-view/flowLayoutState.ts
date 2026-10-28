// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Edge, Node } from 'reactflow';

/**
 * The shape of a laid-out graph: where each node is and what the edges join.
 * Two layouts with the same key differ only in what their nodes show (status,
 * counts), so the view can keep the user's pan, zoom and selection.
 *
 * Edges carry no Unit data, so all of an edge is part of the shape.
 */
export const flowLayoutKey = (nodes: Node[], edges: Edge[]): string =>
  JSON.stringify([
    nodes.map((node) => [
      node.id,
      node.type,
      node.position.x,
      node.position.y,
      node.sourcePosition,
      node.targetPosition,
    ]),
    edges,
  ]);

/** The layout on screen: which view (edge and node type) and its shape. */
export interface ShownLayout {
  view: string;
  key: string;
}

/**
 * Whether `next` must replace the graph on screen (and so reset the viewport),
 * or only update what its nodes show.
 *
 * A build whose Link fetch failed has lost its edges, not the user's graph, so
 * it does not replace a layout already shown in the same view: a transient
 * failure must not reset the viewport, and then reset it again on the next good
 * refetch. With nothing shown yet, or in a new view, it is shown as it is.
 */
export const isNewLayout = (
  shown: ShownLayout | null,
  next: ShownLayout,
  linksComplete: boolean,
): boolean => {
  if (!shown || shown.view !== next.view) return true;
  return linksComplete && shown.key !== next.key;
};

/**
 * Gives each current node the data of the node with its id in `next`, and keeps
 * everything else the view owns: position, selection, measured size.
 */
export const withNodeData = (current: Node[], next: Node[]): Node[] => {
  const nextById = new Map(next.map((node) => [node.id, node]));
  return current.map((node) => {
    const nextNode = nextById.get(node.id);
    return nextNode ? { ...node, data: nextNode.data } : node;
  });
};
