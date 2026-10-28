// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every entity whose Permissions name a User, directly or through one of its
 * Groups: what a ServiceAccount has been granted.
 *
 * A where expression has no OR, so each entity type is read once per subject,
 * with `Permissions.*.UserIDs ? '<id>'` (or `GroupIDs`), the any-action form.
 * A server that does not take that form yet gets the org-wide lists that stay
 * small read whole instead, and their Permissions checked here; the rest are not
 * searched, and the result says which were. The reads see only what the viewer
 * may see.
 */

import { confighubApi, type Permissions } from '@confighub/rtk-query';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { serviceAccountPath } from '@/hooks/usePrincipalNames';

import { changeOrderPath } from '../change-orders/changeOrderAddress';
import { changeSetPath } from '../change-sets/changeSetAddress';
import { channelPath } from '../channels/channelAddress';
import { NO_LINK_FILTER, unitLinksHref } from '../unit-detail/unitDetailHrefs';

interface GrantSource {
  /** The entity type, as people read it. */
  label: string;
  url: string;
  /** The key of the entity in each item of the list response. */
  key: string;
  idField: string;
  spaceScoped: boolean;
  /** Small enough to read whole and check here, on a server without the any-action form. */
  readWhole?: boolean;
  /** The fields that name the entity, where it has no Slug and DisplayName. */
  nameFields?: string[];
  /** Other fields `href` reads. */
  hrefFields?: string[];
  /** How a row names the entity, where its Slug does not. */
  name?: (entity: GrantedEntity) => string;
  href?: (entity: GrantedEntity, spaceSlug: string) => string | undefined;
}

/** The fields a grant row reads of any entity. */
interface GrantedEntity {
  Slug?: string;
  DisplayName?: string;
  SpaceID?: string;
  CreatedAt?: string;
  Permissions?: Permissions;
  [field: string]: unknown;
}

const SOURCES: GrantSource[] = [
  { label: 'Space', url: '/space', key: 'Space', idField: 'SpaceID', spaceScoped: false, readWhole: true, href: (e) => `/spaces/${e.SpaceID}` },
  { label: 'Component', url: '/component', key: 'Component', idField: 'ComponentID', spaceScoped: false, readWhole: true },
  {
    label: 'Service account',
    url: '/service_account',
    key: 'ServiceAccount',
    idField: 'ServiceAccountID',
    spaceScoped: false,
    readWhole: true,
    href: (e) => (e.Slug ? serviceAccountPath(e.Slug) : undefined),
  },
  { label: 'Unit', url: '/unit', key: 'Unit', idField: 'UnitID', spaceScoped: true, href: (e) => `/units/${e.SpaceID}/${e.UnitID as string}` },
  {
    label: 'Link',
    url: '/link',
    key: 'Link',
    idField: 'LinkID',
    spaceScoped: true,
    hrefFields: ['FromUnitID'],
    // A Link has no page of its own; it is listed on the Unit it is from.
    href: (e) =>
      e.SpaceID && e.FromUnitID ? unitLinksHref(e.SpaceID, e.FromUnitID as string, { ...NO_LINK_FILTER, direction: 'from' }) : undefined,
  },
  { label: 'Target', url: '/target', key: 'Target', idField: 'TargetID', spaceScoped: true, readWhole: true },
  {
    label: 'Channel',
    url: '/channel',
    key: 'Channel',
    idField: 'ChannelID',
    spaceScoped: true,
    readWhole: true,
    href: (e, space) => (e.Slug ? channelPath(space, e.Slug) : undefined),
  },
  {
    label: 'ChangeWorkflow',
    url: '/change_workflow',
    key: 'ChangeWorkflow',
    idField: 'ChangeWorkflowID',
    spaceScoped: true,
    href: (e) => `/change-workflows/${e.ChangeWorkflowID as string}`,
  },
  {
    label: 'ChangeSet',
    url: '/change_set',
    key: 'ChangeSet',
    idField: 'ChangeSetID',
    spaceScoped: true,
    href: (e, space) => (e.Slug ? changeSetPath(space, e.Slug) : undefined),
  },
  {
    label: 'ChangeOrder',
    url: '/change_order',
    key: 'ChangeOrder',
    idField: 'ChangeOrderID',
    spaceScoped: true,
    href: (e, space) => (e.Slug ? changeOrderPath(space, e.Slug) : undefined),
  },
  {
    label: 'Release',
    url: '/release',
    key: 'Release',
    idField: 'ReleaseID',
    spaceScoped: true,
    nameFields: ['ReleaseNum'],
    // The org-wide list keeps only the newest Release of each Space, which is wanted here: whoever
    // publishes is granted Manage on every Release, and listing each would drown out the rest.
    name: (e) => `release ${String(e.ReleaseNum ?? '')}`,
  },
  { label: 'View', url: '/view', key: 'View', idField: 'ViewID', spaceScoped: true },
  { label: 'Filter', url: '/filter', key: 'Filter', idField: 'FilterID', spaceScoped: true },
  { label: 'Trigger', url: '/trigger', key: 'Trigger', idField: 'TriggerID', spaceScoped: true },
  { label: 'Invocation', url: '/invocation', key: 'Invocation', idField: 'InvocationID', spaceScoped: true },
  { label: 'Tag', url: '/tag', key: 'Tag', idField: 'TagID', spaceScoped: true },
  { label: 'Attribute', url: '/attribute', key: 'Attribute', idField: 'AttributeID', spaceScoped: true },
];

/** One entity and what it grants the account. */
export interface Grant {
  entityType: string;
  id: string;
  /** `space/slug` for an entity in a Space, the slug otherwise. */
  name: string;
  /** The slug of the entity's Space, for an entity in one. */
  spaceSlug?: string;
  displayName?: string;
  href?: string;
  /** Each action, with the subjects it is granted through: the account itself, or Group IDs. */
  actions: { action: string; direct: boolean; groupIds: string[] }[];
  /** For a Channel, which the page shows with its connection. */
  entity: GrantedEntity;
}

export interface Grants {
  grants: Grant[];
  /** Entity types that could not be read, by label. */
  unreadable: string[];
  /**
   * Set when the server does not take `Permissions.*` yet: the entity types that
   * were read whole and checked here, the only ones the list covers.
   */
  searchedOnly?: string[];
}

const quote = (id: string) => `'${id}'`;

/** Runs `tasks` with at most `limit` in flight, keeping their order. */
async function pooled<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/** A 400 that names the action key is a server older than the any-action form. */
function isUnsupported(error: FetchBaseQueryError): boolean {
  if (error.status !== 400) return false;
  const text = JSON.stringify(error.data ?? '');
  return text.includes('Permissions action key') || text.includes('Permissions requires');
}

const grantsApi = confighubApi.injectEndpoints({
  endpoints: (build) => ({
    listGrantsTo: build.query<Grants, { userId: string; groupIds: string[]; excludeId?: string }>({
      queryFn: async ({ userId, groupIds, excludeId }, _api, _extra, baseQuery) => {
        const subjects = [
          { field: 'UserIDs', id: userId },
          ...groupIds.map((id) => ({ field: 'GroupIDs', id })),
        ];
        const spacesRead = await baseQuery({ url: '/space', params: { select: 'SpaceID,Slug' } });
        const spaceSlugs = new Map<string, string>();
        for (const item of (spacesRead.data ?? []) as { Space?: { SpaceID?: string; Slug?: string } }[]) {
          if (item.Space?.SpaceID && item.Space.Slug) spaceSlugs.set(item.Space.SpaceID, item.Space.Slug);
        }

        const selectOf = (source: GrantSource) =>
          [
            source.idField,
            ...(source.nameFields ?? ['Slug', 'DisplayName']),
            ...(source.hrefFields ?? []),
            'CreatedAt',
            'Permissions',
            ...(source.spaceScoped ? ['SpaceID'] : []),
          ].join(',');
        const whereOf = (subject: { field: string; id: string }) => `Permissions.*.${subject.field} ? ${quote(subject.id)}`;

        // One read says whether the server takes the any-action form, before sending the rest.
        const probe = await baseQuery({ url: '/space', params: { where: whereOf(subjects[0]), select: 'SpaceID' } });
        const fallback = probe.error !== undefined && isUnsupported(probe.error as FetchBaseQueryError);

        const reads = fallback
          ? SOURCES.filter((source) => source.readWhole).map((source) => async () => ({
              source,
              result: await baseQuery({ url: source.url, params: { select: selectOf(source) } }),
            }))
          : SOURCES.flatMap((source) =>
              subjects.map((subject) => async () => ({
                source,
                result: await baseQuery({ url: source.url, params: { where: whereOf(subject), select: selectOf(source) } }),
              })),
            );
        const results = await pooled(reads, 6);

        const unreadable = new Set<string>();
        const byKey = new Map<string, Grant>();
        for (const { source, result } of results) {
          if (result.error !== undefined) {
            unreadable.add(source.label);
            continue;
          }
          for (const item of (result.data ?? []) as Record<string, GrantedEntity | undefined>[]) {
            const entity = item[source.key];
            const id = entity?.[source.idField];
            if (entity === undefined || typeof id !== 'string' || id === excludeId) continue;
            const key = `${source.label}:${id}`;
            if (byKey.has(key)) continue;
            const spaceSlug = entity.SpaceID ? (spaceSlugs.get(entity.SpaceID) ?? '') : '';
            const slug = source.name?.(entity) ?? entity.Slug ?? id;
            const actions = Object.entries(entity.Permissions ?? {}).flatMap(([action, granted]) => {
              const direct = granted.UserIDs?.[userId] === true;
              const viaGroups = groupIds.filter((groupId) => granted.GroupIDs?.[groupId] === true);
              return direct || viaGroups.length > 0 ? [{ action, direct, groupIds: viaGroups }] : [];
            });
            if (actions.length === 0) continue;
            byKey.set(key, {
              entityType: source.label,
              id,
              name: source.spaceScoped && spaceSlug ? `${spaceSlug}/${slug}` : slug,
              spaceSlug: source.spaceScoped && spaceSlug ? spaceSlug : undefined,
              displayName: entity.DisplayName && entity.DisplayName !== slug ? entity.DisplayName : undefined,
              href: source.href?.(entity, spaceSlug),
              actions: actions.sort((a, b) => a.action.localeCompare(b.action)),
              entity,
            });
          }
        }

        const order = new Map(SOURCES.map((source, index) => [source.label, index]));
        const grants = [...byKey.values()].sort(
          (a, b) => (order.get(a.entityType) ?? 0) - (order.get(b.entityType) ?? 0) || a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
        const searchedOnly = fallback ? SOURCES.filter((source) => source.readWhole).map((source) => source.label) : undefined;
        return { data: { grants, unreadable: [...unreadable], searchedOnly } };
      },
      // Grants change on any entity; every write a page makes invalidates one of these.
      providesTags: ['ServiceAccount', 'Space', 'Unit', 'Link', 'Target', 'Channel', 'Component'],
    }),
  }),
  overrideExisting: false,
});

export const { useListGrantsToQuery } = grantsApi;
