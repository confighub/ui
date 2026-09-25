// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How many change orders one ChangeWorkflow governs.
 *
 * WHY THIS IS NOT THE CONSOLE'S MECHANISM, and why that is not an oversight.
 *
 * The same number wants two different queries depending on how many you need at once,
 * and the obvious future simplification -- "there is already a count, use that one" --
 * makes whichever page it is applied to worse:
 *
 *   - ONE workflow (here): filter the ChangeOrder list to this id and count what comes
 *     back. One narrow request for an exact number. Making the builder reuse the
 *     console's mechanism would have it read every change order in the organisation to
 *     learn about the single workflow on screen.
 *   - MANY workflows (`useWorkflowList`): one unparameterised list, counted client-side.
 *     Making the console reuse THIS mechanism would fire one request per row.
 *
 * Neither is wrong, and neither generalises. The count is small; the cost of getting it
 * is what differs.
 *
 * There is no aggregate on this endpoint -- no count, no summary, no paging -- so even
 * the narrow query returns rows rather than a number. `select` trims each row to the one
 * field the count needs; it does not reduce how many arrive.
 */

import { useMemo } from 'react';

import { useListAllChangeOrdersQuery } from '@confighub/rtk-query';

/** Only what counting needs. Entity and parent ids come back regardless of `select`. */
const CHANGE_ORDER_SELECT = 'ChangeWorkflowID';

export interface GovernedCount {
  /**
   * Undefined until known, and undefined when it could not be read.
   *
   * NOT zero. "None yet" and "not counted" are different facts, and rendering a failed
   * count as a confident zero asserts something nobody measured. The type refuses to
   * carry them as the same value, so a caller has to decide what to say about each.
   */
  count: number | undefined;
  isLoading: boolean;
  failed: boolean;
}

export function useGovernedCount(changeWorkflowId: string | undefined): GovernedCount {
  /*
   * `ChangeWorkflowID` is a queryable UUID attribute on ChangeOrder
   * (`internal/models/changeorder.go:897`, in `ChangeOrderQueryableAttributeProps`), and
   * UUIDs support equality. The id comes from the server, so it is a UUID rather than
   * anything a person typed -- but it is still interpolated into an expression, so it is
   * worth knowing that is the reason it is safe here and not a general licence.
   */
  const where = changeWorkflowId ? `ChangeWorkflowID = '${changeWorkflowId}'` : undefined;

  const { data, isLoading, error } = useListAllChangeOrdersQuery(
    { where, select: CHANGE_ORDER_SELECT },
    { skip: !changeWorkflowId },
  );

  const count = useMemo(() => {
    if (data === undefined) return undefined;
    return data.length;
  }, [data]);

  return {
    count: error === undefined ? count : undefined,
    isLoading,
    failed: error !== undefined,
  };
}
