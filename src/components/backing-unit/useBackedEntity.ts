// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { channelPath } from '@/pages/channels/channelAddress';
import { unitLinksHref } from '@/pages/unit-detail/unitDetailHrefs';
import {
  type UnitRead,
  useListAllAttributesQuery,
  useListAllChangeWorkflowsQuery,
  useListAllChannelsQuery,
  useListAllFiltersQuery,
  useListAllInvocationsQuery,
  useListAllTargetsQuery,
  useListAllTriggersQuery,
  useListAllViewsQuery,
  useListComponentsQuery,
  useListSpacesQuery,
  useSearchListLinksQuery,
} from '@confighub/rtk-query';

/** The label every backing Unit carries, naming the type of the entity it holds. */
export const ENTITY_TYPE_LABEL = 'confighub.com/EntityType';

/** The types that are in no Space, so that their backing Unit can be in any Space. */
const ORGANIZATION_LEVEL_TYPES = new Set(['Space', 'Component']);

interface BackedEntity {
  /** How the entity is named: `space/slug` for one that resides in a Space. */
  name: string;
  /** The entity's page, for the types that have one. */
  href?: string;
}

type Lookup = { data?: BackedEntity; isLoading: boolean; isError: boolean; asked: boolean };

/**
 * The entity a backing Unit holds the configuration of, found by its BackingUnitID. An entity
 * that resides in a Space is in the Unit's own Space. It may be hidden, so hidden ones are read.
 */
export function useBackedEntity(unit: UnitRead | undefined): Lookup {
  const entityType = unit?.Labels?.[ENTITY_TYPE_LABEL] ?? '';
  const where =
    unit?.UnitID && entityType
      ? ORGANIZATION_LEVEL_TYPES.has(entityType)
        ? `BackingUnitID = '${unit.UnitID}'`
        : `BackingUnitID = '${unit.UnitID}' AND SpaceID = '${unit.SpaceID}'`
      : '';
  const args = { where, includeHidden: '*', include: 'SpaceID' };
  const orgArgs = { where, includeHidden: '*' };
  const skip = (type: string) => ({ skip: !where || entityType !== type });

  const space = useListSpacesQuery(orgArgs, skip('Space'));
  const component = useListComponentsQuery(orgArgs, skip('Component'));
  const trigger = useListAllTriggersQuery(args, skip('Trigger'));
  const target = useListAllTargetsQuery(args, skip('Target'));
  const channel = useListAllChannelsQuery(args, skip('Channel'));
  const workflow = useListAllChangeWorkflowsQuery(args, skip('ChangeWorkflow'));
  const link = useSearchListLinksQuery(args, skip('Link'));
  const invocation = useListAllInvocationsQuery(args, skip('Invocation'));
  const filter = useListAllFiltersQuery(args, skip('Filter'));
  const view = useListAllViewsQuery(args, skip('View'));
  const attribute = useListAllAttributesQuery(args, skip('Attribute'));

  const inSpace = (spaceSlug: string | undefined, slug: string | undefined) =>
    spaceSlug ? `${spaceSlug}/${slug ?? ''}` : (slug ?? '');

  const pick = ():
    | { query: { isLoading: boolean; isError: boolean }; data?: BackedEntity }
    | undefined => {
    switch (entityType) {
      case 'Space': {
        const s = space.data?.[0]?.Space;
        return {
          query: space,
          data: s?.SpaceID ? { name: s.Slug, href: `/spaces/${s.SpaceID}` } : undefined,
        };
      }
      case 'Component': {
        const c = component.data?.[0]?.Component;
        return {
          query: component,
          data: c?.Slug
            ? { name: c.Slug, href: `/components?app=${encodeURIComponent(c.Slug)}` }
            : undefined,
        };
      }
      case 'Trigger': {
        const e = trigger.data?.[0];
        const t = e?.Trigger;
        return {
          query: trigger,
          data: t?.TriggerID
            ? {
                name: inSpace(e?.Space?.Slug, t.Slug),
                href: `/spaces/${t.SpaceID}?tab=1&edit=${t.TriggerID}`,
              }
            : undefined,
        };
      }
      case 'Target': {
        const e = target.data?.[0];
        const t = e?.Target;
        return {
          query: target,
          data: t?.TargetID
            ? { name: inSpace(e?.Space?.Slug, t.Slug), href: `/targets?edit=${t.TargetID}` }
            : undefined,
        };
      }
      case 'Channel': {
        const e = channel.data?.[0];
        const c = e?.Channel;
        const spaceSlug = e?.Space?.Slug ?? c?.SpaceSlug;
        return {
          query: channel,
          data: c?.ChannelID
            ? {
                name: inSpace(spaceSlug, c.Slug),
                href: spaceSlug ? channelPath(spaceSlug, c.Slug) : undefined,
              }
            : undefined,
        };
      }
      case 'ChangeWorkflow': {
        const e = workflow.data?.[0];
        const w = e?.ChangeWorkflow;
        return {
          query: workflow,
          data: w?.ChangeWorkflowID
            ? {
                name: inSpace(e?.Space?.Slug, w.Slug),
                href: `/change-workflows/${w.ChangeWorkflowID}`,
              }
            : undefined,
        };
      }
      case 'Link': {
        // A Link has no page of its own; its From Unit's Links tab lists it.
        const e = link.data?.[0];
        const l = e?.Link;
        return {
          query: link,
          data: l?.LinkID
            ? {
                name: inSpace(e?.Space?.Slug, l.Slug),
                href:
                  l.SpaceID && l.FromUnitID
                    ? unitLinksHref(l.SpaceID, l.FromUnitID)
                    : undefined,
              }
            : undefined,
        };
      }
      // These have no page of their own, so they are named but not linked.
      case 'Invocation': {
        const e = invocation.data?.[0];
        return {
          query: invocation,
          data: e?.Invocation
            ? { name: inSpace(e.Space?.Slug, e.Invocation.Slug) }
            : undefined,
        };
      }
      case 'Filter': {
        const e = filter.data?.[0];
        return {
          query: filter,
          data: e?.Filter ? { name: inSpace(e.Space?.Slug, e.Filter.Slug) } : undefined,
        };
      }
      case 'View': {
        const e = view.data?.[0];
        return {
          query: view,
          data: e?.View ? { name: inSpace(e.Space?.Slug, e.View.Slug) } : undefined,
        };
      }
      case 'Attribute': {
        const e = attribute.data?.[0];
        return {
          query: attribute,
          data: e?.Attribute ? { name: inSpace(e.Space?.Slug, e.Attribute.Slug) } : undefined,
        };
      }
      default:
        return undefined;
    }
  };

  const picked = pick();
  if (!picked || !where) return { isLoading: false, isError: false, asked: false };
  return {
    data: picked.data,
    isLoading: picked.query.isLoading,
    isError: picked.query.isError,
    asked: true,
  };
}
