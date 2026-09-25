// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { Initiative, InitiativeStatus } from '@/types/initiative';

/**
 * Returns the initiative's status. Defaults to 'draft' for initiatives
 * created before the status field was added.
 */
export function getInitiativeStatus(initiative: Initiative): InitiativeStatus {
  return initiative.status ?? 'draft';
}
