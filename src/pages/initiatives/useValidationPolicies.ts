// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  type ComponentRead,
  useListAllTargetsQuery,
  useListAllTriggersQuery,
  useListAllUnitsQuery,
  useListComponentsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';

import {
  type ScopeSpace,
  type ScopeTarget,
  type ScopeUnit,
  type ValidationPolicy,
  buildPolicies,
} from './validationModel';

// Only what the page computes from: a Unit's verdicts come from ValidationTriggerIDs, which maps
// every gate, passed ones included, to the Trigger that wrote it.
const UNIT_SELECT =
  'UnitID,Slug,SpaceID,TargetID,ToolchainType,ValidationErrors,ValidationWarnings,ValidationTriggerIDs,HeadRevisionNum,LastChangeDescription';

export interface ValidationData {
  policies: ValidationPolicy[];
  spaceById: Map<string, ScopeSpace>;
  targetById: Map<string, ScopeTarget>;
  componentById: Map<string, ComponentRead>;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/** Every validating Trigger in the organization, as the Validation page tracks it. */
export const useValidationPolicies = (): ValidationData => {
  const triggersQuery = useListAllTriggersQuery(
    { where: 'Validating = true' },
    { refetchOnFocus: true },
  );
  const spacesQuery = useListSpacesQuery(
    { select: 'SpaceID,Slug,DisplayName,Labels,ComponentID,TriggerIDs' },
    { refetchOnFocus: true },
  );
  const targetsQuery = useListAllTargetsQuery(
    { select: 'TargetID,SpaceID,Slug,DisplayName,TriggerIDs' },
    { refetchOnFocus: true },
  );
  const unitsQuery = useListAllUnitsQuery({ select: UNIT_SELECT }, { refetchOnFocus: true });
  const { data: componentsData = [] } = useListComponentsQuery({
    select: 'ComponentID,Slug,DisplayName',
  });

  const spaces = useMemo<ScopeSpace[]>(
    () =>
      (spacesQuery.data ?? []).flatMap((es) => {
        const s = es.Space;
        if (!s?.SpaceID) return [];
        return [
          {
            id: s.SpaceID,
            slug: s.Slug ?? '',
            name: s.DisplayName || s.Slug || '',
            componentId: s.ComponentID || undefined,
            labels: s.Labels,
            triggerIds: s.TriggerIDs ?? [],
          },
        ];
      }),
    [spacesQuery.data],
  );
  const targets = useMemo<ScopeTarget[]>(
    () =>
      (targetsQuery.data ?? []).flatMap((et) => {
        const t = et.Target;
        if (!t?.TargetID) return [];
        return [
          {
            id: t.TargetID,
            spaceId: t.SpaceID ?? '',
            slug: t.Slug ?? '',
            name: t.DisplayName || t.Slug || '',
            triggerIds: t.TriggerIDs ?? [],
          },
        ];
      }),
    [targetsQuery.data],
  );
  const units = useMemo<ScopeUnit[]>(
    () =>
      (unitsQuery.data ?? []).flatMap((eu) => {
        const u = eu.Unit;
        if (!u?.UnitID) return [];
        return [
          {
            id: u.UnitID,
            slug: u.Slug ?? '',
            spaceId: u.SpaceID ?? '',
            targetId: u.TargetID || undefined,
            toolchainType: u.ToolchainType,
            validationErrors: u.ValidationErrors,
            validationWarnings: u.ValidationWarnings,
            validationTriggerIds: u.ValidationTriggerIDs,
            headRevisionNum: u.HeadRevisionNum,
            lastChangeDescription: u.LastChangeDescription,
          },
        ];
      }),
    [unitsQuery.data],
  );
  const triggers = useMemo(
    () => (triggersQuery.data ?? []).flatMap((et) => (et.Trigger ? [et.Trigger] : [])),
    [triggersQuery.data],
  );

  const policies = useMemo(
    () => buildPolicies(triggers, spaces, targets, units),
    [triggers, spaces, targets, units],
  );
  const spaceById = useMemo(() => new Map(spaces.map((s) => [s.id, s])), [spaces]);
  const targetById = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);
  const componentById = useMemo(
    () =>
      new Map(
        componentsData.flatMap((ec) =>
          ec.Component?.ComponentID ? [[ec.Component.ComponentID, ec.Component] as const] : [],
        ),
      ),
    [componentsData],
  );

  const { refetch: refetchTriggers } = triggersQuery;
  const { refetch: refetchSpaces } = spacesQuery;
  const { refetch: refetchTargets } = targetsQuery;
  const { refetch: refetchUnits } = unitsQuery;
  const refetch = useMemo(
    () => () => {
      void refetchTriggers();
      void refetchSpaces();
      void refetchTargets();
      void refetchUnits();
    },
    [refetchTriggers, refetchSpaces, refetchTargets, refetchUnits],
  );

  return {
    policies,
    spaceById,
    targetById,
    componentById,
    isLoading:
      triggersQuery.isLoading ||
      spacesQuery.isLoading ||
      targetsQuery.isLoading ||
      unitsQuery.isLoading,
    error: triggersQuery.error ?? spacesQuery.error ?? targetsQuery.error ?? unitsQuery.error,
    refetch,
  };
};
