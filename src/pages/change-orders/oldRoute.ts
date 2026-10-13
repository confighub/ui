// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Where a link to the page's earlier `/rollouts/:slug?/:stage?` address now
 * goes.
 *
 * Bookmarks, shared links and browser history still carry that address, and
 * its `:stage` segment can hold one of the page's two synthetic stage ids as
 * they were then spelled. Each old id is mapped to the current one, so an old
 * link opens the same step instead of falling through to the default stage.
 * A real stage name passes through unchanged.
 *
 * PURE, so `change-orders-old-route.pure.spec.ts` can check it without a page.
 */

import { COMPLETE_STAGE_ID } from './changeOrderCompleteStep';
import { SOURCE_STAGE_ID } from '../x/apps/change-order/changeOrderStages';

const OLD_STAGE_IDS: ReadonlyMap<string, string> = new Map([
  ['__rollout_complete__', COMPLETE_STAGE_ID],
  ['__rollout_source__', SOURCE_STAGE_ID],
]);

/** The `/change-orders/...` path for the `:slug` and `:stage` of an old `/rollouts/...` link. */
export function changeOrdersPathFromOldRoute(slug?: string, stage?: string): string {
  if (slug === undefined || slug === '') return '/change-orders';
  const path = `/change-orders/${encodeURIComponent(slug)}`;
  if (stage === undefined || stage === '') return path;
  const current = OLD_STAGE_IDS.get(stage) ?? stage;
  return `${path}/${encodeURIComponent(current)}`;
}
