// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Links into the unit detail page, and the Links tab's filters as they appear in its URL.
 *
 * The filters live in the URL so that another page can open the tab already narrowed to the
 * Links it is about: a ChangeOrder page opens a Unit's Links of the ChangeOrder's UpdateType
 * that cross into other Spaces, which are the ones the ChangeOrder travels over.
 */

import type { ExtendedLinkRead } from '@confighub/rtk-query';

/** The unit detail page's tabs, by their position in `?tab=`. */
export const UNIT_DETAIL_TAB = {
  overview: 0,
  config: 1,
  revisions: 2,
  links: 3,
  events: 4,
  mutations: 5,
} as const;

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

export const NO_LINK_FILTER: LinkFilter = { updateType: '', otherSpacesOnly: false, direction: 'all' };

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
function otherSpaceId(link: NonNullable<ExtendedLinkRead['Link']>, unitId: string): string | undefined {
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
    if (filter.otherSpacesOnly && otherSpaceId(link, unit.unitId) === unit.spaceId) return false;
    return true;
  });
}

export function unitConfigHref(spaceId: string, unitId: string): string {
  return `/units/${spaceId}/${unitId}?tab=${UNIT_DETAIL_TAB.config}`;
}

export function unitLinksHref(spaceId: string, unitId: string, filter: LinkFilter = NO_LINK_FILTER): string {
  const params = new URLSearchParams({ tab: String(UNIT_DETAIL_TAB.links) });
  writeLinkFilter(params, filter);
  return `/units/${spaceId}/${unitId}?${params.toString()}`;
}
