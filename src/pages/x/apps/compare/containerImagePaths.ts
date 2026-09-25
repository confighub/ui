// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { splitIdentityPath } from './identityPaths';
import type { CompareLeafRow } from './deploymentCompareModel';

/** The pod-spec arrays whose elements carry an `image`. */
const CONTAINER_LISTS = new Set(['containers', 'initContainers', 'ephemeralContainers']);

/**
 * Is this leaf a container image, and if so which container's?
 *
 * Read off the IDENTITY path, so the container is recognised by its name rather
 * than by the index it happens to occupy — which is the whole reason the
 * comparison is keyed the way it is. `imageRef.ts`'s own `parseImagePath` reads
 * the positional path and says in its own comment that the index it returns is
 * not an identity; this is the identity-keyed counterpart.
 */
export function containerImageOf(row: CompareLeafRow): { list: string; container: string } | null {
  const segments = splitIdentityPath(row.identityPath);
  if (segments[segments.length - 1] !== 'image') return null;
  const token = segments[segments.length - 2];
  const list = segments[segments.length - 3];
  if (!token?.startsWith('[') || !list || !CONTAINER_LISTS.has(list)) return null;
  return { list, container: token.slice(1, -1) };
}
