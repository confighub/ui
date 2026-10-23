// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';

import { explorerReducer, isDirty } from '../model/reducer';
import type { ExplorerState } from '../model/types';
import type { SavedView } from '../queries/useViews';
import { ExplorerContext, type ExplorerContextValue, type Shortcut, tabUrlParams, type ToastInput } from './context';
import { pushEscLayer } from '../keys/usePageShortcuts';
import { BASE_PARAM, DRAFT_PARAM, FILTER_BASE_PARAM, TEMP_PARAM, VIEW_PARAM } from './initial';
import { type ExplorerSlots, NOOP_SLOTS } from './slots';
import type { ExplorerStorage, StoredDraft, StoredTemp } from './storage';
import { filterVersionKey, type Versions } from './versions';

interface ToastState extends ToastInput {
  key: number;
}

function persistedParts(state: ExplorerState, versions: Versions) {
  const pins: string[] = [];
  const temps: StoredTemp[] = [];
  const drafts: Record<string, StoredDraft> = {};
  for (const t of state.tabs) {
    if (t.kind === 'saved' && t.viewId) {
      if (t.pinned) pins.push(t.viewId);
      if (isDirty(t)) drafts[t.viewId] = { work: t.work, base: versions.get(t.viewId), filterBase: versions.get(filterVersionKey(t.viewId)) };
    }
    if (t.kind === 'temp') temps.push({ id: t.id, name: t.name, work: t.work });
  }
  return { pins, temps, drafts };
}

interface ExplorerProviderProps {
  initialState: ExplorerState;
  /** The versions each saved tab's work started from (buildInitialState). */
  initialVersions: Versions;
  views: readonly SavedView[];
  storage: ExplorerStorage;
  /** Shown once on mount, for a link that could not be opened as written. */
  initialNotice?: string | null;
  children: ReactNode;
}

export function ExplorerProvider({ initialState, initialVersions, views, storage, initialNotice, children }: ExplorerProviderProps) {
  const [state, dispatch] = useReducer(explorerReducer, initialState);
  const slots = useRef<ExplorerSlots>(NOOP_SLOTS);
  const shortcuts = useRef(new Map<string, Shortcut>());
  const pageShortcuts = useRef<readonly Shortcut[]>([]);
  const holdOpen = useRef(new Map<string, number>());
  const [toastState, setToastState] = useState<ToastState | null>(() =>
    initialNotice ? { key: 0, message: initialNotice, severity: 'warning' } : null,
  );
  const [namingTabId, setNamingTabId] = useState<string | null>(null);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [conflictTabId, setConflictTabId] = useState<string | null>(null);
  // A ref, so two controls firing in the same event (⌘S and a click) see each other's write at once.
  const inFlight = useRef(new Set<string>());
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const beginSave = useCallback((tabId: string) => {
    if (inFlight.current.has(tabId)) return false;
    inFlight.current.add(tabId);
    setSaving(new Set(inFlight.current));
    return true;
  }, []);
  const endSave = useCallback((tabId: string) => {
    inFlight.current.delete(tabId);
    setSaving(new Set(inFlight.current));
  }, []);
  const [versions] = useState<MutableRefObject<Versions>>(() => ({ current: new Map(initialVersions) }));
  const [, setSearchParams] = useSearchParams();

  const toast = useCallback((input: ToastInput) => setToastState({ ...input, key: Date.now() }), []);
  const registerShortcut = useCallback((shortcut: Shortcut) => {
    const registry = shortcuts.current;
    registry.set(shortcut.id, shortcut);
    return () => {
      if (registry.get(shortcut.id) === shortcut) registry.delete(shortcut.id);
    };
  }, []);
  const viewsById = useMemo(() => new Map(views.map((v) => [v.viewId, v])), [views]);

  // localStorage is outside React: write the parts of the state it keeps
  // whenever they change, so a reload restores pins, temporary tabs and drafts.
  // versions changes only alongside a dispatch, so a new state always follows it.
  const persisted = useMemo(() => persistedParts(state, versions.current), [state, versions]);
  // What this page stored last: each write merges only this page's changes, so
  // another browser tab's pins, temporary tabs and drafts survive it.
  // It starts as what storage held at load, so what the first state adds (a link's draft) is written too.
  const [lastStored] = useState(() => ({ current: { pins: storage.readPins() ?? [], temps: storage.readTemps(), drafts: storage.readDrafts() } }));
  useEffect(() => {
    const prev = lastStored.current;
    storage.mergePins(prev.pins, persisted.pins);
    storage.mergeTemps(prev.temps, persisted.temps);
    storage.mergeDrafts(prev.drafts, persisted.drafts);
    lastStored.current = persisted;
  }, [storage, persisted, lastStored]);

  // The address bar is outside React too: it follows the active tab, so a
  // reload or a copied link opens the same view (and the same draft).
  const active = state.tabs.find((t) => t.id === state.activeId);
  const urlKey = JSON.stringify(tabUrlParams(active, versions.current));
  useEffect(() => {
    const params = JSON.parse(urlKey) as Record<string, string>;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(VIEW_PARAM);
        next.delete(DRAFT_PARAM);
        next.delete(TEMP_PARAM);
        next.delete(BASE_PARAM);
        next.delete(FILTER_BASE_PARAM);
        for (const [k, v] of Object.entries(params)) next.set(k, v);
        return next;
      },
      { replace: true },
    );
  }, [urlKey, setSearchParams]);

  const value = useMemo<ExplorerContextValue>(
    () => ({
      state,
      dispatch,
      views,
      viewsById,
      storage,
      slots,
      shortcuts,
      pageShortcuts,
      toast,
      namingTabId,
      setNamingTabId,
      renamingTabId,
      setRenamingTabId,
      registerShortcut,
      pushEscLayer,
      saving,
      beginSave,
      endSave,
      conflictTabId,
      setConflictTabId,
      versions,
      holdOpen,
    }),
    [state, views, viewsById, storage, toast, namingTabId, renamingTabId, registerShortcut, saving, beginSave, endSave, conflictTabId, versions],
  );

  const closeToast = () => setToastState(null);
  return (
    <ExplorerContext.Provider value={value}>
      {children}
      <Snackbar
        key={toastState?.key}
        open={!!toastState}
        autoHideDuration={toastState?.actionLabel ? 6000 : 3500}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') closeToast();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={toastState?.severity ?? 'success'}
          variant='outlined'
          sx={{ bgcolor: 'background.paper', alignItems: 'center', boxShadow: 3 }}
          action={
            toastState?.actionLabel ? (
              <Button
                size='small'
                onClick={() => {
                  toastState.onAction?.();
                  closeToast();
                }}
              >
                {toastState.actionLabel}
              </Button>
            ) : undefined
          }
          onClose={closeToast}
        >
          {toastState?.message}
        </Alert>
      </Snackbar>
    </ExplorerContext.Provider>
  );
}
