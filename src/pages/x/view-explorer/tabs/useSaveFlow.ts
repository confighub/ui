// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo } from 'react';

import { activeTab, isDirty } from '../model/reducer';
import type { TabState } from '../model/types';
import { SaveFailedError, saveErrorMessage, saveTargetOf, type SaveTarget, useSaveView, ViewChangedError } from '../queries/useSaveView';
import { useExplorerContext } from '../state/context';
import { newId } from '../state/initial';
import { tabLabel } from '../state/useExplorer';
import { filterVersionKey, setVersions } from '../state/versions';

/**
 * Saving, in the words the person sees: Save, Save as new, the name asked for
 * on a first save, Rename and Delete.
 *
 * - A temporary view is never written to the shared space without a name the
 *   person typed or accepted: ⌘S on it opens the name card instead.
 * - One write per tab at a time: ⌘S and a click in the same moment start one.
 * - What is marked saved is the view as it was sent: a change made while the
 *   write was in flight stays an unsaved change.
 * - A View someone else changed since it was opened is not overwritten
 *   without asking.
 */
/** A saved View lists one kind of row for good (its Filter's From cannot change): what it lists now, if that is not it. */
export function entityChangedFrom(tab: TabState): string | null {
  if (tab.kind !== 'saved' || !tab.baseline || tab.baseline.entity === tab.work.entity) return null;
  return tab.baseline.entity;
}

export const ENTITY_CHANGED_HINT = 'A saved view always lists the same kind of row. Use Save as new to keep this one.';

export function useSaveFlow() {
  const {
    state,
    dispatch,
    viewsById,
    toast,
    setNamingTabId,
    setRenamingTabId,
    saving,
    beginSave,
    endSave,
    setConflictTabId,
    versions,
  } = useExplorerContext();
  const { createNew, saveExisting, rename, remove } = useSaveView();

  /** The write target of a saved tab: the listed View, or the ids it was just saved with. */
  const targetOf = useCallback(
    (tab: TabState): SaveTarget | null => {
      if (tab.kind !== 'saved' || !tab.viewId || !tab.spaceId) return null;
      const listed = viewsById.get(tab.viewId);
      const base: SaveTarget = listed
        ? { ...saveTargetOf(listed), name: tab.name }
        : { viewId: tab.viewId, spaceId: tab.spaceId, filterId: tab.filterId, filterSpaceId: tab.spaceId, name: tab.name, slug: '', columns: [], updatedAt: '' };
      return {
        ...base,
        filterId: tab.filterId ?? base.filterId,
        updatedAt: versions.current.get(tab.viewId) ?? base.updatedAt,
        filterUpdatedAt: versions.current.get(filterVersionKey(tab.viewId)),
      };
    },
    [viewsById, versions],
  );

  /** Run a write for a tab under its lock; a failure is a toast. */
  const run = useCallback(
    async (tabId: string, work: () => Promise<void>, failure: string) => {
      if (!beginSave(tabId)) return;
      try {
        await work();
      } catch (err) {
        if (err instanceof ViewChangedError) setConflictTabId(tabId);
        else toast({ message: saveErrorMessage(err, failure), severity: 'error' });
      } finally {
        endSave(tabId);
      }
    },
    [beginSave, endSave, setConflictTabId, toast],
  );

  /** Write the active saved view; `overwrite` answers the "changed by someone else" question. */
  const writeActive = useCallback(
    (overwrite: boolean) => {
      const tab = activeTab(state);
      if (!tab || !isDirty(tab)) return;
      const target = targetOf(tab);
      if (!target) return;
      const sent = tab.work;
      setConflictTabId(null);
      void run(
        tab.id,
        async () => {
          const result = await saveExisting(target, sent, { overwrite }).catch((err: unknown) => {
            // The Filter was put back, which moved its version; the View is as it was.
            if (err instanceof SaveFailedError && err.filterUpdatedAt) versions.current.set(filterVersionKey(target.viewId), err.filterUpdatedAt);
            throw err;
          });
          setVersions(versions.current, result.viewId, result.updatedAt, result.filterUpdatedAt);
          dispatch({ type: 'saved', tabId: tab.id, name: tab.name, viewId: result.viewId, filterId: result.filterId, spaceId: result.spaceId, def: sent });
          toast({ message: `Saved “${tab.name}” for everyone.` });
        },
        'The view could not be saved.',
      );
    },
    [state, targetOf, run, saveExisting, versions, dispatch, toast, setConflictTabId],
  );

  /** ⌘S: save a changed view; ask for a name for a temporary one. */
  const save = useCallback(() => {
    const tab = activeTab(state);
    if (!tab) return;
    if (tab.kind === 'temp') {
      setNamingTabId(tab.id);
      return;
    }
    if (entityChangedFrom(tab)) {
      toast({ message: ENTITY_CHANGED_HINT, severity: 'info' });
      return;
    }
    writeActive(false);
  }, [state, setNamingTabId, writeActive, toast]);

  const overwrite = useCallback(() => {
    const tab = activeTab(state);
    if (tab && entityChangedFrom(tab)) return;
    writeActive(true);
  }, [state, writeActive]);

  /** The name card's Save: the first write of a temporary view, pinned to the viewer's tabs. */
  const commitName = useCallback(
    (tabId: string, rawName: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      const name = rawName.trim();
      if (!tab || tab.kind !== 'temp' || !name) return;
      const sent = tab.work;
      void run(
        tabId,
        async () => {
          const result = await createNew(sent, name);
          setVersions(versions.current, result.viewId, result.updatedAt, result.filterUpdatedAt);
          dispatch({ type: 'saved', tabId, name, viewId: result.viewId, filterId: result.filterId, spaceId: result.spaceId, def: sent });
          dispatch({ type: 'pin', tabId });
          setNamingTabId(null);
          toast({ message: `Saved “${name}” in confighub-system.` });
        },
        'The view could not be saved.',
      );
    },
    [state, run, createNew, versions, dispatch, setNamingTabId, toast],
  );

  const cancelNaming = useCallback(() => {
    setNamingTabId(null);
    toast({ message: 'Still a temporary view. Nothing was shared.', severity: 'info' });
  }, [setNamingTabId, toast]);

  /** ⌘⇧S: the changes go to a new temporary view, which is named next; the source goes back to as saved. */
  const saveAsNew = useCallback(() => {
    const tab = activeTab(state);
    if (!tab || tab.kind === 'builtin') return;
    setConflictTabId(null);
    if (tab.kind === 'temp') {
      setNamingTabId(tab.id);
      return;
    }
    const work = tab.work;
    if (isDirty(tab)) dispatch({ type: 'discard' });
    const tabId = newId('temp');
    dispatch({ type: 'newTemp', tabId, def: work });
    setNamingTabId(tabId);
    toast({ message: `“${tab.name}” is unchanged. Name the new view to save it.`, severity: 'info' });
  }, [state, dispatch, setNamingTabId, setConflictTabId, toast]);

  const commitRename = useCallback(
    (tabId: string, rawName: string) => {
      setRenamingTabId(null);
      const tab = state.tabs.find((t) => t.id === tabId);
      const name = rawName.trim();
      if (!tab || !name || name === tabLabel(tab)) return;
      if (tab.kind === 'temp') {
        dispatch({ type: 'renamed', tabId, name });
        return;
      }
      const target = targetOf(tab);
      if (!target) return;
      void run(
        tabId,
        async () => {
          // Kept as they were when someone else changed the view first, so the next Save still asks.
          const after = await rename(target, name);
          if (after) setVersions(versions.current, target.viewId, after.updatedAt, after.filterUpdatedAt);
          dispatch({ type: 'renamed', tabId, name });
          toast({ message: `Renamed to “${name}”.` });
        },
        'The view could not be renamed.',
      );
    },
    [state, setRenamingTabId, targetOf, run, rename, versions, dispatch, toast],
  );

  /** Delete a saved view for everyone (asked for with a confirmation first). */
  const deleteView = useCallback(
    (tabId: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      const target = tab && targetOf(tab);
      if (!tab || !target) return;
      void run(
        tabId,
        async () => {
          const { filterLeft } = await remove(target);
          dispatch({ type: 'closeTab', tabId });
          if (filterLeft) {
            toast({ message: `Deleted “${tab.name}”. Its filter could not be removed and is left unused.`, severity: 'warning' });
          } else {
            toast({ message: `Deleted “${tab.name}”.`, severity: 'info' });
          }
        },
        'The view could not be deleted.',
      );
    },
    [state, targetOf, run, remove, dispatch, toast],
  );

  const active = activeTab(state);
  const busy = !!active && saving.has(active.id);

  return useMemo(
    () => ({ busy, save, overwrite, saveAsNew, commitName, cancelNaming, commitRename, deleteView }),
    [busy, save, overwrite, saveAsNew, commitName, cancelNaming, commitRename, deleteView],
  );
}
