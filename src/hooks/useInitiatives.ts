// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';

import type { ExtendedViewRead } from '@confighub/rtk-query';
import {
  useListAllTriggersQuery,
  useListAllViewsQuery,
  usePatchViewMutation,
} from '@confighub/rtk-query';
import type { Initiative, InitiativePriority, InitiativeStatus, CheckSummary } from '@/types/initiative';

/** Maps a backend ExtendedViewRead (with inline Filter via include=FilterID) to a Initiative. */
function viewToInitiative(
  ev: ExtendedViewRead,
  warnByTriggerId: Map<string, boolean>,
): Initiative | null {
  const view = ev.View;
  const filter = ev.Filter;
  if (!view?.ViewID) return null;

  const summaryRaw = view.Annotations?.['initiative-check-summary'];
  let checkSummary: CheckSummary | undefined;
  if (summaryRaw) {
    try {
      checkSummary = JSON.parse(summaryRaw) as CheckSummary;
    } catch {
      // ignore malformed JSON
    }
  }

  const triggerId = view.Annotations?.['initiative-trigger-id'] || undefined;
  const warn = triggerId ? warnByTriggerId.get(triggerId) : undefined;

  return {
    id: view.ViewID,
    name: view.DisplayName ?? '',
    description: view.Annotations?.['initiative-description'] ?? '',
    priority: (view.Labels?.['initiative-priority'] as InitiativePriority | undefined) ?? 'MEDIUM',
    status: (view.Labels?.['initiative-status'] as InitiativeStatus | undefined) ?? 'draft',
    deadline: view.Annotations?.['initiative-deadline'] || undefined,
    completedAt: view.Annotations?.['initiative-completed-at'] || undefined,
    triggerId,
    viewId: view.ViewID,
    filterId: view.FilterID ?? filter?.FilterID,
    spaceId: view.SpaceID,
    createdAt: view.CreatedAt ?? new Date().toISOString(),
    whereClause: filter?.Where ?? '',
    whereDataClause: filter?.WhereData || undefined,
    resourceTypeClause: filter?.ResourceType || undefined,
    checkSummary,
    enforced: warn === undefined ? undefined : !warn,
  };
}

interface UseInitiativesResult {
  initiatives: Initiative[];
  addInitiative: (initiative: Initiative) => void;
  removeInitiative: (id: string) => void;
  updateInitiative: (id: string, updates: Partial<Initiative>) => void;
  isLoading: boolean;
}

/**
 * Hook for reading and writing initiatives backed by the View entity.
 * One View = one initiative. The View ID is the initiative ID.
 * Initiative metadata is stored in View Labels and Annotations.
 */
export const useInitiatives = (): UseInitiativesResult => {
  const { data: viewsData, isLoading } = useListAllViewsQuery({
    where: "Labels.initiative = 'true'",
    include: 'FilterID',
  });

  // Narrowly scoped: only triggers labeled initiative='true'. Mirrors the filter
  // used for Views above. One list call, joined client-side by initiative-trigger-id.
  const { data: triggersData } = useListAllTriggersQuery({
    where: "Labels.initiative = 'true'",
    select: 'TriggerID,Warn',
  });

  const warnByTriggerId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const et of triggersData ?? []) {
      const id = et.Trigger?.TriggerID;
      if (id) map.set(id, et.Trigger?.Warn ?? false);
    }
    return map;
  }, [triggersData]);

  const [patchView] = usePatchViewMutation();

  const initiatives = useMemo(
    () =>
      (viewsData ?? []).flatMap((ev) => {
        const c = viewToInitiative(ev, warnByTriggerId);
        return c ? [c] : [];
      }),
    [viewsData, warnByTriggerId],
  );

  // No-ops: RTK cache invalidation handles list refresh after create/delete
  const addInitiative = useCallback((): void => undefined, []);
  const removeInitiative = useCallback((): void => undefined, []);

  const updateInitiative = useCallback(
    (id: string, updates: Partial<Initiative>): void => {
      const ev = viewsData?.find((v) => v.View?.ViewID === id);
      const spaceId = ev?.View?.SpaceID;
      if (!spaceId) return;

      const labels: Record<string, string | null> = {};
      const annotations: Record<string, string | null> = {};

      if ('priority' in updates) labels['initiative-priority'] = updates.priority ?? null;
      if ('status' in updates) labels['initiative-status'] = updates.status ?? null;
      if ('description' in updates) annotations['initiative-description'] = updates.description ?? '';
      if ('deadline' in updates) annotations['initiative-deadline'] = updates.deadline ?? null;
      if ('completedAt' in updates)
        annotations['initiative-completed-at'] = updates.completedAt ?? null;
      if ('triggerId' in updates) annotations['initiative-trigger-id'] = updates.triggerId ?? null;
      if ('checkSummary' in updates)
        annotations['initiative-check-summary'] = updates.checkSummary
          ? JSON.stringify(updates.checkSummary)
          : null;

      const body: {
        DisplayName?: string | null;
        Labels?: Record<string, string | null>;
        Annotations?: Record<string, string | null>;
      } = {};

      if ('name' in updates && updates.name !== undefined) body.DisplayName = updates.name;
      if (Object.keys(labels).length > 0) body.Labels = labels;
      if (Object.keys(annotations).length > 0) body.Annotations = annotations;

      void patchView({ viewId: id, spaceId, body });
    },
    [viewsData, patchView],
  );

  return { initiatives, addInitiative, removeInitiative, updateInitiative, isLoading };
};
