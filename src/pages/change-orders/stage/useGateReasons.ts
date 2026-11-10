// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a failed release's gate line needs beyond the failure itself: the
 * DisplayName of each Trigger behind a gate, and the Gates tab of each gated
 * Variant, where its gates are listed and fixed. Small reads, made only while a
 * failure names a gate, and only of the gated Spaces.
 */
import { useMemo } from 'react';

import { useListAllTriggersQuery, useListAllUnitsQuery, useListSpacesQuery } from '@confighub/rtk-query';
import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { componentsHref } from '@/pages/x/view-explorer/unit-panel/links';

import { gateNamesOf, triggerNamesByGate } from './stageFailure';
import type { StageFailure } from './stageTypes';

/** A where-clause string literal: single quotes doubled. */
function quoted(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export interface GateReasons {
  /** The DisplayName of the Trigger behind a gate, when it was found. */
  triggerNameOf: (gateName: string) => string | undefined;
  /** The Gates tab of a Variant, when its Component is known. */
  gatesHrefOf: (spaceId: string) => string | undefined;
  /** A read failed: the gates show their Trigger slugs, and a link may be missing. */
  readFailed: boolean;
}

export function useGateReasons(failure: StageFailure | undefined): GateReasons {
  const gatedSpaceIds = useMemo(
    () =>
      [
        ...new Set(
          (failure?.failedSpaces ?? [])
            .filter((space) => space.spaceId !== '' && space.items.some((item) => gateNamesOf(item.message) !== undefined))
            .map((space) => space.spaceId),
        ),
      ].sort(),
    [failure],
  );
  const inSpaces = `SpaceID IN (${gatedSpaceIds.map(quoted).join(', ')})`;
  const skip = gatedSpaceIds.length === 0;

  // The gated Units record which Trigger made each gate, so a Trigger is found by its ID, not its slug.
  const units = useListAllUnitsQuery(
    { where: `${inSpaces} AND LEN(ValidationErrors) > 0`, select: 'UnitID,SpaceID,ValidationTriggerIDs' },
    { skip },
  );
  const triggerIds = useMemo(
    () => [...new Set((units.data ?? []).flatMap((u) => Object.values(u.Unit?.ValidationTriggerIDs ?? {})))].sort(),
    [units.data],
  );
  const triggers = useListAllTriggersQuery(
    { where: `TriggerID IN (${triggerIds.map(quoted).join(', ')})`, select: 'TriggerID,DisplayName' },
    { skip: triggerIds.length === 0 },
  );
  const spaces = useListSpacesQuery({ where: inSpaces, select: 'ComponentID' }, { skip });
  const { slugById, isError: componentsFailed } = useComponentSlugs();

  return useMemo(() => {
    const names = triggerNamesByGate(
      (units.data ?? []).flatMap((u) => (u.Unit === undefined ? [] : [u.Unit])),
      (triggers.data ?? []).flatMap((t) => (t.Trigger === undefined ? [] : [t.Trigger])),
    );
    const hrefBySpace = new Map<string, string>();
    for (const space of spaces.data ?? []) {
      const spaceId = space.Space?.SpaceID;
      const component = spaceComponentSlug(space.Space, slugById);
      if (spaceId !== undefined && component !== undefined)
        hrefBySpace.set(spaceId, `${componentsHref(component, spaceId)}&tab=gates`);
    }
    return {
      triggerNameOf: (gate) => names.get(gate),
      gatesHrefOf: (spaceId) => hrefBySpace.get(spaceId),
      readFailed: !skip && (units.isError || triggers.isError || spaces.isError || componentsFailed),
    };
  }, [units.data, units.isError, triggers.data, triggers.isError, spaces.data, spaces.isError, slugById, componentsFailed, skip]);
}
