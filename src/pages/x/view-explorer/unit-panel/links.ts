// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { UNIT_DETAIL_TAB, unitConfigHref, unitLinksHref } from '@/pages/unit-detail/unitDetailHrefs';

import { withExplorerReturn } from '../results/explorer-link';
import type { RowFacts } from './attention';
import type { ActionId } from './verdict';

/**
 * Where each of the panel's link actions goes. They open in a new browser
 * tab, so each Unit page link carries the explorer tab it came from
 * (`explorer=`), which that page offers as the way back. Release
 * has no flow of its own outside the Components view, so it opens the Space
 * there, which needs the slug of the Space's Component.
 */
export type PanelLinks = Partial<Record<ActionId, string>>;

const unitTab = (facts: RowFacts, tab: number) => `/units/${facts.spaceId}/${facts.unitId}?tab=${tab}`;

export function componentsHref(componentSlug: string, spaceId: string): string {
  return `/components?app=${encodeURIComponent(componentSlug)}&space=${encodeURIComponent(spaceId)}`;
}

export function panelLinks(facts: RowFacts, componentSlug: string | undefined, search: string): PanelLinks {
  if (!facts.spaceId || !facts.unitId) return {};
  const back = (href: string) => withExplorerReturn(href, search);
  const links: PanelLinks = {
    'review-conflicts': back(unitTab(facts, UNIT_DETAIL_TAB.revisions)),
    'see-events': back(unitTab(facts, UNIT_DETAIL_TAB.overview)),
    'edit-config': back(unitConfigHref(facts.spaceId, facts.unitId)),
    'open-links': back(unitLinksHref(facts.spaceId, facts.unitId)),
    'restore-history': back(unitTab(facts, UNIT_DETAIL_TAB.revisions)),
  };
  // The Components view does not read `explorer=`, so its link does not carry it.
  if (componentSlug) links['release-space'] = componentsHref(componentSlug, facts.spaceId);
  return links;
}
