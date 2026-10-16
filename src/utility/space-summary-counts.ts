// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ExtendedSpaceRead } from '@confighub/rtk-query';

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
}

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
  { field: 'TotalBridgeWorkerCount', label: 'Workers', group: 'Entities', getValue: count('TotalBridgeWorkerCount') },
  { field: 'TotalReleaseCount', label: 'Releases', group: 'Entities', getValue: count('TotalReleaseCount') },
  { field: 'TotalChangeSetCount', label: 'ChangeSets', group: 'Entities', getValue: count('TotalChangeSetCount') },
  { field: 'TotalChangeOrderCount', label: 'ChangeOrders', group: 'Entities', getValue: count('TotalChangeOrderCount') },
  {
    field: 'TotalChangeWorkflowCount',
    label: 'ChangeWorkflows',
    group: 'Entities',
    getValue: count('TotalChangeWorkflowCount'),
  },
  { field: 'TotalTagCount', label: 'Tags', group: 'Entities', getValue: count('TotalTagCount') },
  { field: 'TotalFilterCount', label: 'Filters', group: 'Entities', getValue: count('TotalFilterCount') },
  { field: 'TotalViewCount', label: 'Views', group: 'Entities', getValue: count('TotalViewCount') },
  { field: 'TotalInvocationCount', label: 'Invocations', group: 'Entities', getValue: count('TotalInvocationCount') },
  { field: 'TotalAttributeCount', label: 'Attributes', group: 'Entities', getValue: count('TotalAttributeCount') },
  { field: 'TotalChannelCount', label: 'Channels', group: 'Entities', getValue: count('TotalChannelCount') },
];
