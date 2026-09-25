// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { type ComponentRead, type SpaceRead, useListComponentsQuery } from '@confighub/rtk-query';

export interface ComponentSlugs {
  /** Component keyed by Component.ComponentID. */
  componentById: ReadonlyMap<string, ComponentRead>;
  /** Component.Slug keyed by Component.ComponentID. */
  slugById: ReadonlyMap<string, string>;
  /** Component.ComponentID keyed by Component.Slug. */
  idBySlug: ReadonlyMap<string, string>;
  /** True once the Components have loaded. */
  isLoaded: boolean;
}

/**
 * The name of the Component a Space belongs to: the Slug of the Component its
 * `ComponentID` names. Undefined for a Space with no Component, or one whose
 * Component has not loaded.
 */
export function spaceComponentSlug(
  space: Pick<SpaceRead, 'ComponentID'> | undefined,
  slugById: ReadonlyMap<string, string>,
): string | undefined {
  const componentId = space?.ComponentID;
  return componentId ? slugById.get(componentId) : undefined;
}

/**
 * Lists the Components once and indexes them by ComponentID, and their Slugs
 * both ways, so a Space's `ComponentID` can be shown by name and a component
 * name can be queried by ID.
 */
export function useComponentSlugs(): ComponentSlugs {
  const { data } = useListComponentsQuery({});
  return useMemo(() => {
    const componentById = new Map<string, ComponentRead>();
    const slugById = new Map<string, string>();
    const idBySlug = new Map<string, string>();
    for (const extended of data ?? []) {
      const component = extended.Component;
      const componentId = component?.ComponentID;
      if (component && componentId && component.Slug) {
        componentById.set(componentId, component);
        slugById.set(componentId, component.Slug);
        idBySlug.set(component.Slug, componentId);
      }
    }
    return { componentById, slugById, idBySlug, isLoaded: data !== undefined };
  }, [data]);
}
