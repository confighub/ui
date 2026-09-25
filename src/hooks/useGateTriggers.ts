// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  ExtendedTriggerRead,
  UnitRead,
  useListAllTriggersQuery,
} from '@confighub/rtk-query';
import { parseGateName } from '@/utility/name-format-functions';

/**
 * Fetches the Triggers behind a Unit's gates by the IDs recorded in ValidationTriggerIDs. A gate's
 * name holds the Trigger's slugs as they were when the gate was written, so a Trigger renamed or
 * moved since, or one in another Space, is found by its ID rather than by the name.
 */
export const useGateTriggers = (unit?: UnitRead): ExtendedTriggerRead[] => {
  const triggerIDs = useMemo(
    () => [...new Set(Object.values(unit?.ValidationTriggerIDs ?? {}))].sort(),
    [unit?.ValidationTriggerIDs],
  );
  const where =
    triggerIDs.length > 0
      ? `TriggerID IN (${triggerIDs.map((id) => `'${id}'`).join(', ')})`
      : '';
  const { data = [] } = useListAllTriggersQuery(
    { where, include: 'InvocationID' },
    { skip: !where },
  );
  return data;
};

/**
 * Finds the Trigger behind a gate: by the ID the Unit records for it when there is one, among
 * gateTriggers and candidates, and otherwise, for a gate written before IDs were recorded, by the
 * Trigger slug in its name among candidates. A gate whose recorded Trigger is gone has none.
 */
export const findTriggerForGate = (
  gateName: string,
  unit: UnitRead | undefined,
  gateTriggers: ExtendedTriggerRead[],
  candidates: ExtendedTriggerRead[],
): ExtendedTriggerRead | undefined => {
  const triggerID = unit?.ValidationTriggerIDs?.[gateName];
  if (triggerID) {
    return (
      gateTriggers.find((trigger) => trigger.Trigger?.TriggerID === triggerID) ??
      candidates.find((trigger) => trigger.Trigger?.TriggerID === triggerID)
    );
  }
  const { triggerSlug } = parseGateName(gateName);
  return candidates.find(
    (trigger) =>
      trigger.Trigger?.Slug === triggerSlug ||
      trigger.Trigger?.DisplayName?.toLowerCase().includes(triggerSlug.toLowerCase()),
  );
};
