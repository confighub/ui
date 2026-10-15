// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ExtendedReleaseRead, UserRead } from '@confighub/rtk-query';

import { changeOrderPath } from '../change-orders/changeOrderAddress';

/**
 * How the Releases page names what a Release references, the way `cub release
 * list` and `cub release get` do. PURE.
 */

/**
 * A slug, prefixed with its Space's slug when that is not the Release's own
 * Space: a Release's Tag or ChangeOrder may be in another Space.
 */
export function qualifiedSlug(slug: string | undefined, spaceSlug: string | undefined, releaseSpaceSlug: string | undefined): string {
  if (!slug) return '';
  if (!spaceSlug || spaceSlug === releaseSpaceSlug) return slug;
  return `${spaceSlug}/${slug}`;
}

/** The Tag on the Revisions a Release bundled, or its id when the response did not expand it. */
export function releaseTagName(entry: ExtendedReleaseRead): string {
  const release = entry.Release;
  if (entry.Tag) return qualifiedSlug(entry.Tag.Slug, entry.Tag.SpaceSlug, release?.SpaceSlug);
  return release?.TagID ?? '';
}

/** The ChangeOrder a Release was published for, or its id when the response did not expand it. */
export function releaseChangeOrderName(entry: ExtendedReleaseRead): string {
  const release = entry.Release;
  if (entry.ChangeOrder) {
    return qualifiedSlug(entry.ChangeOrder.Slug, entry.ChangeOrder.SpaceSlug, release?.SpaceSlug);
  }
  return release?.ChangeOrderID ?? '';
}

/** The page of the ChangeOrder a Release was published for, when the response expanded it. */
export function releaseChangeOrderHref(entry: ExtendedReleaseRead): string | undefined {
  const changeOrder = entry.ChangeOrder;
  if (!changeOrder?.Slug) return undefined;
  return changeOrderPath(changeOrder.SpaceSlug, changeOrder.Slug);
}

/** The Target a Release was published for, or its id when the response did not expand it. */
export function releaseTargetName(entry: ExtendedReleaseRead): string {
  const release = entry.Release;
  if (entry.Target) return qualifiedSlug(entry.Target.Slug, entry.Target.SpaceSlug, release?.SpaceSlug);
  return release?.TargetID ?? '';
}

/** Who published a Release, or their id when the response did not expand them. */
export function releaseUserName(user: UserRead | undefined, userId: string | undefined): string {
  return user?.Username || user?.DisplayName || userId || '';
}
