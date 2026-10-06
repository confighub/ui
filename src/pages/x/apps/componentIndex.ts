// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ComponentRead, ExtendedSpaceRead } from '@confighub/rtk-query';

import { componentOwner } from './componentOwner';

/**
 * One Component as the Components nav tree shows it: a leaf of the tree.
 * The tree groups these by properties of the Component (its labels, its
 * owner, the roll-up of its Spaces' status), never by a property of one of
 * its Spaces, so a Component is in exactly one place in the tree.
 */
export interface ComponentNavItem {
  /** Component.ComponentID. */
  id: string;
  /** Component.Slug — the `?app=` value and the leaf's label. */
  slug: string;
  /** The Component's own labels. */
  labels: Record<string, string>;
  /** The owner read with `componentOwner` ("" when it has none). */
  owner: string;
  /** The Component's Spaces (its variants) on the page. Empty for a
   * Component that has no variants yet. */
  spaces: ExtendedSpaceRead[];
}

/**
 * One item per Component in `componentById`, sorted by Slug, with its Spaces
 * from `appSpaces`. A Component with no Spaces is included, with an empty
 * `spaces` list, so the tree can show it.
 */
export function buildComponentNavItems(
  componentById: ReadonlyMap<string, ComponentRead>,
  appSpaces: readonly ExtendedSpaceRead[],
): ComponentNavItem[] {
  const spacesById = new Map<string, ExtendedSpaceRead[]>();
  for (const space of appSpaces) {
    const id = space.Space?.ComponentID;
    if (!id) continue;
    const list = spacesById.get(id);
    if (list) list.push(space);
    else spacesById.set(id, [space]);
  }
  const items: ComponentNavItem[] = [];
  for (const [id, component] of componentById) {
    const spaces = spacesById.get(id) ?? [];
    items.push({
      id,
      slug: component.Slug,
      labels: component.Labels ?? {},
      owner: componentOwner(component, spaces.map((s) => s.Space)),
      spaces,
    });
  }
  return items.sort((a, b) => a.slug.localeCompare(b.slug));
}
