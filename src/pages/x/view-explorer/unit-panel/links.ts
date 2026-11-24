// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { UNIT_DETAIL_TAB, unitConfigHref, unitLinksHref } from '@/pages/unit-detail/unitDetailHrefs';

import type { RowFacts } from './attention';
import type { ActionId } from './verdict';

/**
 * Where each of the panel's link actions goes. Release
 * has no flow of its own outside the Components view, so it opens the Space
 * there, which needs the slug of the Space's Component.
 */
export type PanelLinks = Partial<Record<ActionId, string>>;

const unitTab = (facts: RowFacts, tab: number) => `/units/${facts.spaceId}/${facts.unitId}?tab=${tab}`;

export function componentsHref(componentSlug: string, spaceId: string): string {
  return `/components?app=${encodeURIComponent(componentSlug)}&space=${encodeURIComponent(spaceId)}`;
}

export function panelLinks(facts: RowFacts, componentSlug: string | undefined): PanelLinks {
  if (!facts.spaceId || !facts.unitId) return {};
  const links: PanelLinks = {
    'review-conflicts': unitTab(facts, UNIT_DETAIL_TAB.revisions),
    'edit-config': unitConfigHref(facts.spaceId, facts.unitId),
    'open-links': unitLinksHref(facts.spaceId, facts.unitId),
    'restore-history': unitTab(facts, UNIT_DETAIL_TAB.revisions),
  };
  if (componentSlug) links['release-space'] = componentsHref(componentSlug, facts.spaceId);
  return links;
}
