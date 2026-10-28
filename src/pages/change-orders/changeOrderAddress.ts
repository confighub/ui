// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The address of one ChangeOrder's page, and how a URL is resolved to one.
 *
 * A ChangeOrder slug is unique only within its Space, so the page is addressed
 * by both: `/change-orders/:space/:slug/:stage?`, where `:space` is the Space's
 * slug. The URL stays readable, and it cannot open the wrong ChangeOrder when
 * two Spaces hold one of the same name.
 *
 * Links made before that carry the slug alone, `/change-orders/:slug/:stage?`
 * (and `/rollouts/...`, which `oldRoute.ts` sends there). Such a link still
 * opens its ChangeOrder when the slug names one, and the page then replaces it
 * with the full address. When the slug names several, the page lists them.
 *
 * Two segments read either way, so the full address is tried first: they are
 * a Space and a ChangeOrder in it when one matches, and otherwise a slug and a
 * stage.
 *
 * PURE, so `change-orders-address.pure.spec.ts` can check it without a page.
 */

/** The fields of a ChangeOrder that address it. */
/**
 * The navigation state a page sets when it sends the reader to a ChangeOrder it has just made: the
 * detail view's title takes the keyboard once it is drawn.
 */
export const FOCUS_TITLE_STATE = 'focusChangeOrderTitle';

export interface ChangeOrderRef {
  spaceId: string;
  spaceSlug: string;
  changeOrderId: string;
  slug: string;
}

export type ChangeOrderAddress =
  /** No ChangeOrder is addressed: the console. */
  | { kind: 'none' }
  /**
   * One ChangeOrder, and the stage segment, if any. `canonical` is false for a
   * slug-only link, which the page replaces with `changeOrderPath`.
   */
  | { kind: 'found'; order: ChangeOrderRef; stage?: string; canonical: boolean }
  /** A slug-only link whose slug several ChangeOrders share, in different Spaces. */
  | { kind: 'ambiguous'; slug: string; stage?: string; candidates: ChangeOrderRef[] }
  /** Nothing matches. `label` is the address as written, to say so with. */
  | { kind: 'notFound'; label: string };

/**
 * The page of the ChangeOrder `slug` in the Space `spaceSlug`, at `stage` when
 * given. Without a Space slug it is the slug-only form, which the page
 * resolves when it can.
 */
export function changeOrderPath(spaceSlug: string | undefined, slug: string, stage?: string): string {
  const base =
    spaceSlug === undefined || spaceSlug === ''
      ? `/change-orders/${encodeURIComponent(slug)}`
      : `/change-orders/${encodeURIComponent(spaceSlug)}/${encodeURIComponent(slug)}`;
  return stage === undefined || stage === '' ? base : `${base}/${encodeURIComponent(stage)}`;
}

/** The address the route's segments name, among `orders`. */
export function resolveChangeOrderAddress(
  segments: { space?: string; slug?: string; stage?: string },
  orders: readonly ChangeOrderRef[],
): ChangeOrderAddress {
  const { space, slug, stage } = segments;
  if (space === undefined || space === '') return { kind: 'none' };

  if (slug !== undefined && slug !== '') {
    const order = orders.find((candidate) => candidate.spaceSlug === space && candidate.slug === slug);
    if (order !== undefined) return { kind: 'found', order, stage, canonical: true };
    // Three segments can only be the full address.
    if (stage !== undefined && stage !== '') return { kind: 'notFound', label: `${space}/${slug}` };
  }

  // A slug-only link: `:space` holds the ChangeOrder slug, and `:slug` the stage.
  const legacySlug = space;
  const legacyStage = slug === '' ? undefined : slug;
  const candidates = orders.filter((candidate) => candidate.slug === legacySlug);
  if (candidates.length === 1) {
    return { kind: 'found', order: candidates[0], stage: legacyStage, canonical: false };
  }
  if (candidates.length > 1) {
    const sorted = [...candidates].sort((a, b) => a.spaceSlug.localeCompare(b.spaceSlug));
    return { kind: 'ambiguous', slug: legacySlug, stage: legacyStage, candidates: sorted };
  }
  return { kind: 'notFound', label: legacyStage === undefined ? legacySlug : `${legacySlug}/${legacyStage}` };
}
