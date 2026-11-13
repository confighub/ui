// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ExtendedSpaceRead } from '@confighub/rtk-query';

import { spaceFilteredPath } from '@/hooks/useSpaceParam';
import { FILTER_URL_PARAMS } from '@/utility/constants/url-params';
import { UNRELEASED_CHANGES_WHERE } from '@/utility/unit-release-functions';
import { sumMap } from '@/utility/object-functions';

/**
 * One of the per-Space counts `GET /space?summary=true` returns. The Space list shows each as a
 * column and the Space page as a card, so both list the same counts in the same order.
 */
export interface SpaceSummaryCount {
  /** The ExtendedSpace field, also used as the column field */
  field: string;
  label: string;
  /** Unit counts break down a Space's Units; the rest count the entities in it */
  group: 'Units' | 'Entities';
  getValue: (space: ExtendedSpaceRead | undefined) => number;
  /** For a Unit count, the where expression over Units in the Space that it counts */
  unitWhere?: string;
  /** The list page of the entities the count counts, which takes the Space to filter to */
  listPath?: string;
}

/** The Space detail page's Triggers tab */
export const SPACE_TRIGGERS_TAB = 1;

/**
 * The Space detail page's parameter for which Triggers its Triggers tab lists: by default those
 * that reside in the Space, or, set to `applied`, those that apply to its Units
 */
export const SPACE_TRIGGER_VIEW_PARAM = 'triggers';

/** The Space page's Triggers tab, listing the Triggers in the Space or those applied to it */
export const spaceTriggersHref = (spaceId: string, view: 'space' | 'applied' = 'space') =>
  `/spaces/${spaceId}?tab=${SPACE_TRIGGERS_TAB}${view === 'applied' ? `&${SPACE_TRIGGER_VIEW_PARAM}=applied` : ''}`;

type SpaceRef = { SpaceID: string; Slug: string };

const whereParam = (where: string) => new URLSearchParams({ [FILTER_URL_PARAMS.WHERE]: where }).toString();
const spaceWhere = (space: SpaceRef) => `SpaceID = '${space.SpaceID}'`;

/**
 * How to link a count to the page listing what it counts in a Space, or undefined if no page does:
 * a list page filtered to the Space, or, for its Triggers, the Space page's Triggers tab.
 */
export const spaceCountLink = (c: SpaceSummaryCount): ((space: SpaceRef) => string) | undefined => {
  const { unitWhere, listPath } = c;
  if (unitWhere !== undefined) {
    return (space) => `/units?${whereParam(unitWhere ? `${spaceWhere(space)} AND ${unitWhere}` : spaceWhere(space))}`;
  }
  if (c.field === 'TotalTargetCount') return (space) => `/targets?${whereParam(spaceWhere(space))}`;
  if (c.field === 'TotalLinkCount') return (space) => `/links?${whereParam(spaceWhere(space))}`;
  if (c.field === 'TriggerCountByEventType') return (space) => spaceTriggersHref(space.SpaceID);
  if (listPath) return (space) => spaceFilteredPath(listPath, space.Slug);
  return undefined;
};

const count =
  (field: keyof ExtendedSpaceRead) =>
  (space: ExtendedSpaceRead | undefined): number =>
    (space?.[field] as number | undefined) ?? 0;

export const SPACE_SUMMARY_COUNTS: SpaceSummaryCount[] = [
  { field: 'TotalUnitCount', label: 'Units', group: 'Units', getValue: count('TotalUnitCount'), unitWhere: '' },
  {
    field: 'UnreleasedUnitCount',
    label: 'Unreleased Units',
    group: 'Units',
    getValue: count('UnreleasedUnitCount'),
    unitWhere: UNRELEASED_CHANGES_WHERE,
  },
  {
    field: 'GatedUnitCount',
    label: 'Gated Units',
    group: 'Units',
    getValue: count('GatedUnitCount'),
    unitWhere: 'LEN(ValidationErrors) > 0',
  },
  {
    field: 'WarnedUnitCount',
    label: 'Warned Units',
    group: 'Units',
    getValue: count('WarnedUnitCount'),
    unitWhere: 'LEN(ValidationWarnings) > 0',
  },
  {
    field: 'UpgradableUnitCount',
    label: 'Upgradable Units',
    group: 'Units',
    getValue: count('UpgradableUnitCount'),
    unitWhere: 'UpstreamRevisionNum < UpstreamUnit.HeadRevisionNum',
  },
  { field: 'UnlinkedUnitCount', label: 'Unlinked Units', group: 'Units', getValue: count('UnlinkedUnitCount') },
  { field: 'TotalLinkCount', label: 'Links', group: 'Entities', getValue: count('TotalLinkCount') },
  { field: 'TotalTargetCount', label: 'Targets', group: 'Entities', getValue: count('TotalTargetCount') },
  {
    field: 'TriggerCountByEventType',
    label: 'Triggers',
    group: 'Entities',
    getValue: (space) => sumMap(space?.TriggerCountByEventType),
  },
  { field: 'TotalReleaseCount', label: 'Releases', group: 'Entities', getValue: count('TotalReleaseCount'), listPath: '/releases' },
  { field: 'TotalChangeSetCount', label: 'ChangeSets', group: 'Entities', getValue: count('TotalChangeSetCount'), listPath: '/change-sets' },
  { field: 'TotalChangeOrderCount', label: 'ChangeOrders', group: 'Entities', getValue: count('TotalChangeOrderCount'), listPath: '/change-orders' },
  {
    field: 'TotalChangeWorkflowCount',
    label: 'ChangeWorkflows',
    group: 'Entities',
    getValue: count('TotalChangeWorkflowCount'),
    listPath: '/change-workflows',
  },
  { field: 'TotalTagCount', label: 'Tags', group: 'Entities', getValue: count('TotalTagCount') },
  { field: 'TotalFilterCount', label: 'Filters', group: 'Entities', getValue: count('TotalFilterCount') },
  { field: 'TotalViewCount', label: 'Views', group: 'Entities', getValue: count('TotalViewCount') },
  { field: 'TotalInvocationCount', label: 'Invocations', group: 'Entities', getValue: count('TotalInvocationCount') },
  { field: 'TotalAttributeCount', label: 'Attributes', group: 'Entities', getValue: count('TotalAttributeCount') },
  { field: 'TotalChannelCount', label: 'Channels', group: 'Entities', getValue: count('TotalChannelCount'), listPath: '/channels' },
];
