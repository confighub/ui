// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Anchor } from './types';

/**
 * `querySelector` throws on a malformed selector. A typo in one chapter must
 * never take the whole app down, so every lookup degrades to "not found".
 */
export const safeQuery = (
  css: string,
  root: ParentNode = document,
): HTMLElement | null => {
  try {
    return root.querySelector<HTMLElement>(css);
  } catch {
    return null;
  }
};

/** Resolve an anchor to a live DOM element, or null when it is not on screen yet. */
export const resolveAnchor = (anchor: Anchor): HTMLElement | null => {
  switch (anchor.kind) {
    case 'selector':
      return safeQuery(anchor.css);
    case 'flowNode':
      // reactflow stamps the node id onto the wrapper element as `data-id`.
      return safeQuery(`.react-flow__node[data-id="${CSS.escape(anchor.deploymentId)}"]`);
    case 'inModal': {
      const container = anchor.container();
      return container ? safeQuery(anchor.css, container) : null;
    }
  }
};

/**
 * An element with no layout box (display:none, or detached) resolves but cannot
 * be spotlit, so treat it as unresolved.
 */
export const isMeasurable = (element: HTMLElement | null): element is HTMLElement => {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
};
