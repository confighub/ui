// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft's context, read out of the API's shapes: the policy, the workflows it allows, the
 * variants in the order the scope lists them, and the base's past ChangeOrders.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type {
  ChangeOrderRead,
  ChangeWorkflowRead,
  ComponentRead,
  ExtendedChangeWorkflowRead,
  ExtendedSpaceRead,
} from '@confighub/rtk-query';

import type { HistoryPerson } from '../changeOrderHistory';
import type {
  DraftPastChangeOrder,
  DraftPolicy,
  DraftVariant,
  DraftWorkflow,
} from './draftTypes';

export const NO_POLICY: DraftPolicy = { allowedWorkflowIds: [], required: false };

export function workflowOf(workflow: ChangeWorkflowRead): DraftWorkflow | undefined {
  if (workflow.ChangeWorkflowID === undefined) return undefined;
  const stages = workflow.Stages ?? [];
  return {
    workflowId: workflow.ChangeWorkflowID,
    slug: workflow.Slug,
    name: workflow.DisplayName || workflow.Slug,
    stageNames: stages.map((stage) => stage.Name),
    stages,
    spec: {
      Stages: stages,
      Final: workflow.Final,
      CustomPrerequisites: workflow.CustomPrerequisites,
      AttestationPrerequisites: workflow.AttestationPrerequisites,
    },
  };
}

export function variantOf(entry: ExtendedSpaceRead): DraftVariant | undefined {
  const space = entry.Space;
  if (space?.SpaceID === undefined) return undefined;
  const labels = (space.Labels ?? {}) as Record<string, string>;
  return {
    spaceId: space.SpaceID,
    slug: space.Slug,
    name: space.DisplayName || space.Slug,
    stage: labels.Stage || undefined,
    region: labels.Region || undefined,
  };
}

/** Regions alphabetically, a variant with none after every one that has one. */
function regionOrder(a: string | undefined, b: string | undefined): number {
  if (a === undefined || b === undefined)
    return Number(a === undefined) - Number(b === undefined);
  return a.localeCompare(b);
}

/**
 * Order variants as the scope popover lists them: by stage in workflow order (stages no
 * workflow names after, alphabetically), then region, then slug.
 */
export function sortVariants(
  variants: readonly DraftVariant[],
  stageOrder: readonly string[],
): DraftVariant[] {
  const rank = (stage: string | undefined) => {
    const at = stage === undefined ? -1 : stageOrder.indexOf(stage);
    return at === -1 ? stageOrder.length : at;
  };
  return [...variants].sort(
    (a, b) =>
      rank(a.stage) - rank(b.stage) ||
      (a.stage ?? '').localeCompare(b.stage ?? '') ||
      regionOrder(a.region, b.region) ||
      a.slug.localeCompare(b.slug),
  );
}

export function policyOf(component: ComponentRead): DraftPolicy {
  return {
    allowedWorkflowIds: component.AllowedChangeWorkflowIDs ?? [],
    required: component.ChangeWorkflowRequired === true,
  };
}

/** The workflows the policy allows, by slug: every workflow when it names none. */
export function allowedWorkflows(
  entries: readonly ExtendedChangeWorkflowRead[],
  policy: DraftPolicy,
): DraftWorkflow[] {
  const allowed = new Set(policy.allowedWorkflowIds);
  return entries
    .flatMap((entry) =>
      entry.ChangeWorkflow === undefined ? [] : [workflowOf(entry.ChangeWorkflow)],
    )
    .filter((workflow): workflow is DraftWorkflow => workflow !== undefined)
    .filter((workflow) => allowed.size === 0 || allowed.has(workflow.workflowId))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** The Component's Spaces other than the base, ordered by the stages the allowed workflows name. */
export function variantsOf(
  entries: readonly ExtendedSpaceRead[],
  baseSpaceId: string | undefined,
  workflows: readonly DraftWorkflow[],
): DraftVariant[] {
  const stageOrder: string[] = [];
  for (const workflow of workflows)
    for (const name of workflow.stageNames)
      if (!stageOrder.includes(name)) stageOrder.push(name);
  const others = entries
    .map(variantOf)
    .filter(
      (variant): variant is DraftVariant =>
        variant !== undefined && variant.spaceId !== baseSpaceId,
    );
  return sortVariants(others, stageOrder);
}

export function pastChangeOrderOf(
  order: ChangeOrderRead,
  personOf: (userId: string | undefined) => HistoryPerson,
): DraftPastChangeOrder | undefined {
  if (order.ChangeOrderID === undefined) return undefined;
  return {
    changeOrderId: order.ChangeOrderID,
    slug: order.Slug,
    description: order.Description ?? '',
    updateType: order.UpdateType || 'UpgradeUnit',
    workflowId: order.ChangeWorkflowID || undefined,
    inScopeSpaceIds: order.InScopeSpaceIDs ?? [],
    adoptedEndTagId: order.AdoptedEndTagID || undefined,
    state: order.State,
    createdAt: order.CreatedAt,
    author: personOf(order.UserID),
    changeOrder: order,
  };
}
