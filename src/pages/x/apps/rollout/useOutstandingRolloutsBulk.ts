// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Does a component have a ChangeOrder outstanding? Asked fleet-wide, for the
 * Components Overview dashboard's KPI tile and per-row column.
 *
 * ONE bulk, non-polling query for the WHOLE org — not one query per row. The
 * dashboard already renders one row per component
 * (`ComponentOverviewMatrix.tsx`/`componentOverview.ts`), and a query per row
 * is exactly the N-queries shape this hook exists to avoid: `select:
 * 'SpaceID'` on the single, unfiltered `/change_order` list gives every
 * ChangeOrder's base SpaceID in one request, however many components there
 * are.
 *
 * EXISTENCE, NOT COMPLETION: `ResolvedSpaceIDs`/
 * `ReleasedSpaceIDs` are derived server-side by walking the propagation
 * graph on every read, so asking for them — even once, even here — would be
 * the same expensive read a background poll exists to amortize, not a cost
 * a dashboard KPI can carry either. This cannot distinguish a ChangeOrder
 * that is actively rolling out from one that is fully released but simply
 * still exists; a ChangeOrder intentionally never released will keep its
 * component flagged "outstanding" indefinitely. Confirmed empirically (not
 * assumed) that `TotalChangeOrderCount` on `ExtendedSpaceRead` — already
 * fetched for this same dashboard's other KPIs via `summary=true`, and so
 * genuinely free — is NOT usable here: it is a lifetime total that does not
 * change when every Space of a ChangeOrder is released, so the dashboard's
 * signal has to come from this hook's own read.
 *
 * Returns the SpaceIDs (bases) that have at least one ChangeOrder — matching
 * against a component's OWN space ids (any hop, not just the base) is the
 * caller's job, scoped client-side instead of per-component server-side.
 */

import { useMemo } from 'react';

import { useListAllChangeOrdersQuery } from '@confighub/rtk-query';

export function useOutstandingRolloutBaseSpaceIds(): ReadonlySet<string> {
  const { data } = useListAllChangeOrdersQuery({ select: 'SpaceID' });

  return useMemo(() => {
    const ids = new Set<string>();
    for (const co of data ?? []) {
      const spaceId = co.ChangeOrder?.SpaceID;
      if (spaceId !== undefined) ids.add(spaceId);
    }
    return ids;
  }, [data]);
}
