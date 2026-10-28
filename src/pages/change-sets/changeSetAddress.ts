// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The address of one ChangeSet's page, and how a URL is resolved to one.
 *
 * A ChangeSet slug is unique only within its Space, so the page is addressed by
 * both: `/change-sets/:space/:slug`, where `:space` is the Space's slug. With no
 * segments the route lists the ChangeSets.
 *
 * PURE, so `change-set-review-model.pure.spec.ts` can check it without a page.
 */

import { changeOrderInk, changeOrderStatus } from '../change-orders/changeOrdersTokens';

export const CHANGE_SETS_PATH = '/change-sets';

/** The tone of a ChangeSet's State: Open is in progress, New has had nothing attached, Closed is done. */
export function changeSetStateTone(state: string | undefined): string {
  if (state === 'Open') return changeOrderStatus.progress;
  if (state === 'Closed') return changeOrderInk.muted;
  return changeOrderInk.subtle;
}

/** The page of the ChangeSet `slug` in the Space `spaceSlug`. */
export function changeSetPath(spaceSlug: string, slug: string): string {
  return `${CHANGE_SETS_PATH}/${encodeURIComponent(spaceSlug)}/${encodeURIComponent(slug)}`;
}

/**
 * Whether a URL segment can be a slug, and so be put in a `where` expression as a
 * quoted literal. Anything else names no ChangeSet.
 */
export function isSlugSegment(segment: string | undefined): segment is string {
  return segment !== undefined && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(segment);
}

/** The fields of a ChangeSet that address it. */
export interface ChangeSetRef {
  changeSetId: string;
  slug: string;
  spaceSlug?: string;
}

/** The ChangeSet the route's segments name among those with its slug, or `undefined`. */
export function findChangeSet<T extends ChangeSetRef>(
  segments: { space?: string; slug?: string },
  candidates: readonly T[],
): T | undefined {
  return candidates.find((candidate) => candidate.slug === segments.slug && candidate.spaceSlug === segments.space);
}
