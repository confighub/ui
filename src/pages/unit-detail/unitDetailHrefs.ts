// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Links into the unit detail page, and the Links tab's filters and the Resources tab's
 * selection as they appear in its URL.
 *
 * The filters live in the URL so that another page can open the tab already narrowed to the
 * Links it is about: a ChangeOrder page opens a Unit's Links of the ChangeOrder's UpdateType
 * that cross into other Spaces, which are the ones the ChangeOrder travels over. The selected
 * resource lives there so that a page listing resources can open the one a row is about.
 */
import type { ResourceView } from '@/components/unit-resources/UnitResourceBrowser';
import type { ExtendedLinkRead } from '@confighub/rtk-query';

/**
 * The unit detail page's tabs, by their value in `?tab=`. A tab added later takes the next
 * value wherever it is shown, so that a link saved before it existed opens the same tab.
 */
export const UNIT_DETAIL_TAB = {
  overview: 0,
  config: 1,
  revisions: 2,
  links: 3,
  mutations: 4,
  resources: 5,
  settings: 6,
  blame: 7,
} as const;

/** The tabs in the order the page shows them. */
export const UNIT_DETAIL_TAB_ORDER: readonly number[] = [
  UNIT_DETAIL_TAB.overview,
  UNIT_DETAIL_TAB.config,
  UNIT_DETAIL_TAB.revisions,
  UNIT_DETAIL_TAB.links,
  UNIT_DETAIL_TAB.mutations,
  UNIT_DETAIL_TAB.blame,
  UNIT_DETAIL_TAB.resources,
  UNIT_DETAIL_TAB.settings,
];

const LINK_UPDATE_TYPE_PARAM = 'linkUpdateType';
const LINK_SPACES_PARAM = 'linkSpaces';
const LINK_DIRECTION_PARAM = 'linkDirection';

export type LinkDirectionFilter = 'all' | 'from' | 'to';

export interface LinkFilter {
  /** Only Links of this UpdateType; empty for every type. */
  updateType: string;
  /** Only Links whose other Unit is in another Space. */
  otherSpacesOnly: boolean;
  /** `from`: Links from this Unit (its upstreams); `to`: Links to it (its downstreams). */
  direction: LinkDirectionFilter;
}

export const NO_LINK_FILTER: LinkFilter = {
  updateType: '',
  otherSpacesOnly: false,
  direction: 'all',
};

export function readLinkFilter(params: URLSearchParams): LinkFilter {
  const direction = params.get(LINK_DIRECTION_PARAM);
  return {
    updateType: params.get(LINK_UPDATE_TYPE_PARAM) ?? '',
    otherSpacesOnly: params.get(LINK_SPACES_PARAM) === 'other',
    direction: direction === 'from' || direction === 'to' ? direction : 'all',
  };
}

/** Sets `filter` on `params`, leaving out what is not filtered so the URL stays short. */
export function writeLinkFilter(params: URLSearchParams, filter: LinkFilter): void {
  params.delete(LINK_UPDATE_TYPE_PARAM);
  params.delete(LINK_SPACES_PARAM);
  params.delete(LINK_DIRECTION_PARAM);
  if (filter.updateType !== '') params.set(LINK_UPDATE_TYPE_PARAM, filter.updateType);
  if (filter.otherSpacesOnly) params.set(LINK_SPACES_PARAM, 'other');
  if (filter.direction !== 'all') params.set(LINK_DIRECTION_PARAM, filter.direction);
}

/** The Space of the other end of `link` from the Unit the tab is for. */
function otherSpaceId(
  link: NonNullable<ExtendedLinkRead['Link']>,
  unitId: string,
): string | undefined {
  return link.FromUnitID === unitId ? link.ToSpaceID : link.SpaceID;
}

/** The Links of `unit` that `filter` keeps. */
export function filterLinkRows<T extends Pick<ExtendedLinkRead, 'Link'>>(
  rows: readonly T[],
  filter: LinkFilter,
  unit: { unitId: string; spaceId: string },
): T[] {
  return rows.filter((row) => {
    const link = row.Link;
    if (link === undefined) return false;
    if (filter.updateType !== '' && link.UpdateType !== filter.updateType) return false;
    if (filter.direction === 'from' && link.FromUnitID !== unit.unitId) return false;
    if (filter.direction === 'to' && link.ToUnitID !== unit.unitId) return false;
    if (filter.otherSpacesOnly && otherSpaceId(link, unit.unitId) === unit.spaceId)
      return false;
    return true;
  });
}

export function unitConfigHref(spaceId: string, unitId: string): string {
  return `/units/${spaceId}/${unitId}?tab=${UNIT_DETAIL_TAB.config}`;
}

const RESOURCE_PARAM = 'resource';
const RESOURCE_VIEW_PARAM = 'resourceView';

/** The ResourceID the Resources tab shows; empty for its first resource. */
export function readSelectedResource(params: URLSearchParams): string {
  return params.get(RESOURCE_PARAM) ?? '';
}

export function writeSelectedResource(params: URLSearchParams, resourceId: string): void {
  if (resourceId === '') params.delete(RESOURCE_PARAM);
  else params.set(RESOURCE_PARAM, resourceId);
}

/** The Overview is the default, so only the YAML view appears in the URL. */
export function readResourceView(params: URLSearchParams): ResourceView {
  return params.get(RESOURCE_VIEW_PARAM) === 'yaml' ? 'yaml' : 'overview';
}

export function writeResourceView(params: URLSearchParams, view: ResourceView): void {
  if (view === 'overview') params.delete(RESOURCE_VIEW_PARAM);
  else params.set(RESOURCE_VIEW_PARAM, view);
}

/** The Resources tab of a Unit, showing `resourceId` when one is given. */
export function unitResourceHref(spaceId: string, unitId: string, resourceId = ''): string {
  const params = new URLSearchParams({ tab: String(UNIT_DETAIL_TAB.resources) });
  writeSelectedResource(params, resourceId);
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}

export function unitLinksHref(
  spaceId: string,
  unitId: string,
  filter: LinkFilter = NO_LINK_FILTER,
): string {
  const params = new URLSearchParams({ tab: String(UNIT_DETAIL_TAB.links) });
  writeLinkFilter(params, filter);
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}

const BLAME_PATH_PARAM = 'blamePath';

/** The path the Blame tab is filtered to; empty for every field. */
export function readBlamePath(params: URLSearchParams): string {
  return params.get(BLAME_PATH_PARAM) ?? '';
}

/** The Blame tab of a Unit, filtered to the fields whose path contains `path` when one is given. */
export function unitBlameHref(spaceId: string, unitId: string, path = ''): string {
  const params = new URLSearchParams({ tab: String(UNIT_DETAIL_TAB.blame) });
  if (path !== '') params.set(BLAME_PATH_PARAM, path);
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}

const GATE_PARAM = 'gate';

/** The validation gate the Overview tab opens to; empty for none. */
export function readOverviewGate(params: URLSearchParams): string {
  return params.get(GATE_PARAM) ?? '';
}

/** The Overview tab of a Unit, with one validation gate's card open when one is given. */
export function unitOverviewHref(spaceId: string, unitId: string, gate = ''): string {
  const params = new URLSearchParams({ tab: String(UNIT_DETAIL_TAB.overview) });
  if (gate !== '') params.set(GATE_PARAM, gate);
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}

/** The Revisions tab of a Unit. */
export function unitRevisionsHref(spaceId: string, unitId: string): string {
  return `/units/${spaceId}/${unitId}?tab=${UNIT_DETAIL_TAB.revisions}`;
}

/** The Revisions tab of a Unit, with one Revision open in its viewer. */
export function unitRevisionHref(
  spaceId: string,
  unitId: string,
  revisionNum: number,
): string {
  const params = new URLSearchParams({
    tab: String(UNIT_DETAIL_TAB.revisions),
    revisionViewer: 'true',
    revision: String(revisionNum),
    viewMode: 'single',
  });
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}
