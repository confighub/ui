// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  type DraftAddress,
  type DraftDecisions,
  localDateStamp,
  resolveDraftDecisions,
} from './draftDecisions';
import type { DraftContext } from './useDraftContext';

/**
 * Every decision of the draft, the URL's silences filled from the last ChangeOrder and the
 * policy (`resolveDraftDecisions`). `undefined` until the context has resolved: a default is
 * not worked out from a policy that has not been read. The description's suggestion comes from
 * the change these decisions bound, so it is folded in after (`withDescriptionSuggestion`).
 */
export function useDraftDecisions(
  address: DraftAddress,
  context: DraftContext,
): DraftDecisions | undefined {
  const today = localDateStamp(new Date());
  return useMemo(() => {
    if (context.status !== 'resolved' || context.baseSpace === undefined) return undefined;
    return resolveDraftDecisions({
      address,
      componentSlug: context.component?.slug,
      baseSpaceSlug: context.baseSpace.slug,
      pastChangeOrders: context.pastChangeOrders,
      variants: context.variants,
      workflows: context.workflows,
      policy: context.policy,
      today,
    });
  }, [address, context, today]);
}
