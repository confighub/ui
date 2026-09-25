// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ExtendedChangeSetRead, UnitRead } from '@confighub/rtk-query';

/**
 * ChangesetStatus - Enum for changeset states
 */
export type ChangesetStatus = 'open' | 'applied' | 'closed';

/**
 * ChangesetFormData - Form data for creating a changeset
 */
export interface ChangesetFormData {
  name: string;
  description: string;
  selectedUnitIds: string[];
  labels: Array<{ key: string; value: string; id: string }>;
}

/**
 * ChangesetWithUnits - Extended changeset with associated units
 */
export interface ChangesetWithUnits extends ExtendedChangeSetRead {
  units?: UnitRead[];
  changeCount?: number;
  unitCount?: number;
  additions?: number;
  deletions?: number;
}

/**
 * ChangesetComment - Comment on a changeset
 */
export interface ChangesetComment {
  id: string;
  author: {
    id: string;
    name: string;
    avatar?: string;
  };
  text: string;
  createdAt: string;
}

/**
 * Helper to map ChangeSet state to status
 */
export const getChangesetStatus = (state?: string): ChangesetStatus => {
  if (!state) return 'open';

  const stateLower = state.toLowerCase();
  if (stateLower.includes('applied') || stateLower.includes('completed')) return 'applied';
  if (stateLower.includes('closed')) return 'closed';

  return 'open';
};

/**
 * Helper to get status color
 */
export const getChangesetStatusColor = (
  status: ChangesetStatus,
): 'default' | 'primary' | 'success' | 'error' | 'warning' => {
  switch (status) {
    case 'open':
      return 'success';
    case 'applied':
      return 'success';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
};
