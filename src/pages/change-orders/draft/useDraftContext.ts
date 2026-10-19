// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import { SLUG_PATTERN } from '@confighub/api';
import {
  useGetComponentQuery,
  useListAllChangeWorkflowsQuery,
  useListChangeOrdersQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';

import {
  NO_POLICY,
  allowedWorkflows,
  pastChangeOrderOf,
  policyOf,
  variantsOf,
} from './draftContextModel';
import type {
  DraftPastChangeOrder,
  DraftPolicy,
  DraftReadStatus,
  DraftVariant,
  DraftWorkflow,
} from './draftTypes';
import { useDraftPeople } from './useDraftPeople';

/** The base Space a draft is made in, and everything about it the draft's defaults read. */
export interface DraftContext {
  /** `failed` when any read failed; `notFound` when the slug names no Space. */
  status: DraftReadStatus | 'notFound';
  baseSpace: { spaceId: string; slug: string; name: string } | undefined;
  /** The Component the base Space is a variant of. `undefined` for a Space with none. */
  component: { componentId: string; slug: string; name: string } | undefined;
  policy: DraftPolicy;
  /** The Component's other Spaces, by Stage label (in the order the workflows name stages), then Region, then slug. */
  variants: DraftVariant[];
  /** The base Space's ChangeOrders, newest first. */
  pastChangeOrders: DraftPastChangeOrder[];
  /** The workflows the policy allows, by slug. Every workflow when the policy names none. */
  workflows: DraftWorkflow[];
  /** Every ChangeOrder slug in the base Space: a new one may take none of them. */
  takenSlugs: ReadonlySet<string>;
}

/**
 * The base Space a draft is made in, its Component and policy, the Component's other Spaces
 * (the variants), the Space's ChangeOrders with their authors, and the workflows the policy
 * allows.
 *
 * Every read is the generated, tagged one: these are the console's own reads (the same cache
 * entries where the arguments agree), and a ChangeOrder or Space written elsewhere should
 * reach the draft.
 *
 * @param spaceSlug The base Space's slug, as the URL names it. A string that is not a slug
 * names no Space and is answered `notFound` without a request.
 */
export function useDraftContext(spaceSlug: string | undefined): DraftContext {
  const validSlug = spaceSlug !== undefined && SLUG_PATTERN.test(spaceSlug);

  const spaceRead = useListSpacesQuery(
    { where: `Slug = '${spaceSlug ?? ''}'` },
    { skip: !validSlug },
  );
  const baseEntry = spaceRead.currentData?.[0]?.Space;
  const baseSpaceId = baseEntry?.SpaceID;
  const componentId = baseEntry?.ComponentID || undefined;

  const componentRead = useGetComponentQuery(
    { componentId: componentId ?? '' },
    { skip: componentId === undefined },
  );
  const variantsRead = useListSpacesQuery(
    { where: `ComponentID = '${componentId ?? ''}'` },
    { skip: componentId === undefined },
  );
  const ordersRead = useListChangeOrdersQuery(
    { spaceId: baseSpaceId ?? '', orderBy: 'DESC:CreatedAt' },
    { skip: baseSpaceId === undefined },
  );
  const workflowsRead = useListAllChangeWorkflowsQuery({});

  const component = componentRead.currentData?.Component;
  const policy = useMemo<DraftPolicy>(
    () => (component === undefined ? NO_POLICY : policyOf(component)),
    [component],
  );
  const workflows = useMemo(
    () => allowedWorkflows(workflowsRead.currentData ?? [], policy),
    [workflowsRead.currentData, policy],
  );
  const variants = useMemo(
    () => variantsOf(variantsRead.currentData ?? [], baseSpaceId, workflows),
    [variantsRead.currentData, baseSpaceId, workflows],
  );

  const orders = ordersRead.currentData;
  const { personOf } = useDraftPeople(
    useMemo(() => (orders ?? []).map((entry) => entry.ChangeOrder?.UserID), [orders]),
  );
  const pastChangeOrders = useMemo(
    () =>
      (orders ?? []).flatMap((entry): DraftPastChangeOrder[] => {
        const past =
          entry.ChangeOrder === undefined
            ? undefined
            : pastChangeOrderOf(entry.ChangeOrder, personOf);
        return past === undefined ? [] : [past];
      }),
    [orders, personOf],
  );
  const takenSlugs = useMemo(
    () => new Set(pastChangeOrders.map((order) => order.slug)),
    [pastChangeOrders],
  );

  const reads = [
    spaceRead,
    ...(componentId === undefined ? [] : [componentRead, variantsRead]),
    ordersRead,
    workflowsRead,
  ];
  const failed = reads.some((read) => read.isError);
  const loading =
    validSlug &&
    (spaceRead.currentData === undefined ||
      (baseEntry !== undefined &&
        (ordersRead.currentData === undefined ||
          workflowsRead.currentData === undefined ||
          (componentId !== undefined &&
            (componentRead.currentData === undefined ||
              variantsRead.currentData === undefined)))));
  const notFound =
    !validSlug || (spaceRead.currentData !== undefined && baseEntry === undefined);

  const status: DraftContext['status'] = failed
    ? 'failed'
    : notFound
      ? 'notFound'
      : loading
        ? 'loading'
        : 'resolved';

  const baseSpaceSlug = baseEntry?.Slug;
  const baseSpaceName = baseEntry?.DisplayName;
  const baseSpace = useMemo(
    () =>
      baseSpaceId === undefined || baseSpaceSlug === undefined
        ? undefined
        : { spaceId: baseSpaceId, slug: baseSpaceSlug, name: baseSpaceName || baseSpaceSlug },
    [baseSpaceId, baseSpaceSlug, baseSpaceName],
  );
  const componentRef = useMemo(
    () =>
      component?.ComponentID === undefined
        ? undefined
        : {
            componentId: component.ComponentID,
            slug: component.Slug,
            name: component.DisplayName || component.Slug,
          },
    [component],
  );

  // One identity per answer, so what is worked out from the context is worked out once.
  return useMemo(
    () => ({
      status,
      baseSpace,
      component: componentRef,
      policy,
      variants,
      pastChangeOrders,
      workflows,
      takenSlugs,
    }),
    [
      status,
      baseSpace,
      componentRef,
      policy,
      variants,
      pastChangeOrders,
      workflows,
      takenSlugs,
    ],
  );
}
