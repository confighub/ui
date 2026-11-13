// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** Where the Validation page links the entities it names, on the app's own routes. */

import { triggerChangesWhere as changesForTriggerWhere } from '@/components/invoker/utils/triggerChangeSet';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';

export const spaceLink = (spaceId: string): string => `/spaces/${spaceId}`;

export const targetLink = (targetId: string): string => `/targets?edit=${targetId}`;

export const componentLink = (componentSlug: string): string =>
  `/components?app=${encodeURIComponent(componentSlug)}`;

export const triggerLink = (triggerId: string): string => `/triggers?edit=${triggerId}`;

export const unitLink = (spaceId: string, unitId: string): string =>
  `/units/${spaceId}/${unitId}`;

/**
 * The ChangeSets or ChangeOrders made for a Trigger: those annotated with it, as
 * `Trigger=<space slug>/<trigger slug>`, which a rollout of a change the Trigger asks for sets.
 */
export const triggerChangesWhere = (spaceSlug: string, triggerSlug: string): string =>
  changesForTriggerWhere(`${spaceSlug}/${triggerSlug}`);

export const triggerChangeSetsLink = (spaceSlug: string, triggerSlug: string): string =>
  `/change-sets?${new URLSearchParams({ [FILTER_URL_PARAMS.WHERE]: triggerChangesWhere(spaceSlug, triggerSlug) }).toString()}`;

export const triggerChangeOrdersLink = (spaceSlug: string, triggerSlug: string): string =>
  `/change-orders?${new URLSearchParams({ [FILTER_URL_PARAMS.WHERE]: triggerChangesWhere(spaceSlug, triggerSlug) }).toString()}`;
