// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Where the stage card's links go, on the app's own routes.
 *
 * A Space is addressed by id (`/spaces/:id`), as every other ChangeOrder link
 * does. The Targets list reads its filter from `filterWhere`, whose parser
 * handles `IN`, so several Targets are one link. Units go through the unit detail
 * page's own href builders, re-exported here so the card imports one module.
 */

import { FILTER_URL_PARAMS } from '../../../utility/constants/url-params';
import { unitConfigHref, unitLinksHref, unitResourceHref } from '../../unit-detail/unitDetailHrefs';
import type { CopyLinkRef, DiffAnchor } from './stageTypes';

export { unitConfigHref, unitLinksHref, unitResourceHref };

/** A where-clause string literal: single quotes doubled. */
function quoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * The Targets list filtered to these Targets, or `null` for none. Duplicates are
 * dropped and the ids sorted, so the same set always gives the same link.
 */
export function targetsHref(targetIds: Iterable<string>): string | null {
  const ids = [...new Set(targetIds)].filter((id) => id !== '').sort();
  if (ids.length === 0) return null;
  const where = ids.length === 1 ? `TargetID = ${quoted(ids[0])}` : `TargetID IN (${ids.map(quoted).join(', ')})`;
  return `/targets?${FILTER_URL_PARAMS.WHERE}=${encodeURIComponent(where)}`;
}

/** The distinct Targets the stage's Spaces release to. The count is of Targets, not Spaces. */
export function stageTargetIds(spaceIds: readonly string[], releaseTargetOf: (spaceId: string) => string | undefined): string[] {
  const ids = new Set<string>();
  for (const spaceId of spaceIds) {
    const target = releaseTargetOf(spaceId);
    if (target !== undefined && target !== '') ids.add(target);
  }
  return [...ids];
}

export function spaceHref(spaceId: string): string {
  return `/spaces/${spaceId}`;
}

/** The ChangeWorkflow link: the builder page when there is one, else the label alone. */
export function workflowLink(href: string | null, label: string): { href: string | null; label: string } {
  return { href: href === '' ? null : href, label };
}

/** The id of a Unit's block in the Full diff card. */
export function diffAnchorId(anchor: Pick<DiffAnchor, 'groupKind' | 'unitId'>): string {
  return `diff-${anchor.groupKind}-${anchor.unitId}`;
}

/** The in-page href of a field link. A click opens the diff card there instead of jumping. */
export function fieldAnchorHref(anchor: Pick<DiffAnchor, 'groupKind' | 'unitId'>): string {
  return `#${diffAnchorId(anchor)}`;
}

export interface LinkResolvers {
  hrefForStage: (stageId: string) => string;
  /** The diff group a Space's Unit is drawn in, for field links. */
  groupKindOf: (spaceId: string) => DiffAnchor['groupKind'] | undefined;
}

/**
 * The href of a link inside a copy sentence. Field links point into the diff card;
 * the component intercepts their click to open it.
 */
export function hrefOfRef(ref: CopyLinkRef, resolvers: LinkResolvers): string {
  switch (ref.to) {
    case 'stage':
      return resolvers.hrefForStage(ref.stageId);
    case 'space':
      return spaceHref(ref.spaceId);
    case 'unit':
      if (ref.tab === 'links') return unitLinksHref(ref.spaceId, ref.unitId, { updateType: '', otherSpacesOnly: false, direction: 'from' });
      if (ref.tab === 'resources') return unitResourceHref(ref.spaceId, ref.unitId);
      return unitConfigHref(ref.spaceId, ref.unitId);
    case 'field': {
      const groupKind = resolvers.groupKindOf(ref.spaceId) ?? 'differs';
      return fieldAnchorHref({ groupKind, unitId: ref.unitId });
    }
    case 'diff':
      return '#stage-diff';
  }
}
