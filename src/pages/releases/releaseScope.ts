// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The fields of a Space the Releases page selects by */
export interface ScopeSpace {
  SpaceID?: string;
  Slug?: string;
  ComponentID?: string;
}

/** What the Releases page lists: the Releases of these Spaces, under this Space or Component */
export interface ReleaseScope {
  /** The Space named in the URL, when it is one */
  space?: ScopeSpace;
  /** The Component selected in the heatmap: the one named in the URL, or the Space's */
  componentId?: string;
  componentSlug: string;
  /** The Spaces whose Releases the table lists; none lists none */
  spaceIds: string[];
}

/**
 * The Releases page's scope from its URL. A Space (`?space=<slug>`) narrows the table to its
 * Releases and selects its Component, if it has one; otherwise a Component (`?component=<slug>`)
 * lists the Releases of all of its Spaces.
 */
export function releaseScope({
  spaces,
  spaceSlug,
  componentSlug,
  componentIdBySlug,
  componentSlugById,
}: {
  spaces: ReadonlyArray<ScopeSpace | undefined>;
  spaceSlug: string;
  componentSlug: string;
  componentIdBySlug: ReadonlyMap<string, string>;
  componentSlugById: ReadonlyMap<string, string>;
}): ReleaseScope {
  if (spaceSlug) {
    const space = spaces.find((s) => s?.Slug === spaceSlug);
    const componentId = space?.ComponentID || undefined;
    return {
      space,
      componentId,
      componentSlug: (componentId && componentSlugById.get(componentId)) || '',
      spaceIds: space?.SpaceID ? [space.SpaceID] : [],
    };
  }
  const componentId = componentIdBySlug.get(componentSlug);
  return {
    componentId,
    componentSlug,
    spaceIds: componentId
      ? spaces.flatMap((s) => (s?.SpaceID && s.ComponentID === componentId ? [s.SpaceID] : []))
      : [],
  };
}
