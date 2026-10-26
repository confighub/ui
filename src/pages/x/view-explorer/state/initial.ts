// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { COMPARE_PARAM, compareLinkNotice, decodeCompareParam } from '../model/compare';
import { lensSignature } from '../model/lens-compile';
import { BUILTIN_TAB_ID, initialExplorerState, makeForkPrefix } from '../model/reducer';
import { decodeDraftParam, viewDefFromSaved, viewDefsEqual } from '../model/view-codec';
import type { ExplorerState, TabState, ViewDef } from '../model/types';
import type { SavedView } from '../queries/useViews';
import type { ExplorerStorage } from './storage';
import { filterVersionKey, rememberVersions, type Versions } from './versions';

/**
 * The explorer's first state: the built-in tab, the viewer's pinned views,
 * the views with unsaved changes, the temporary tabs kept in this browser,
 * and whatever the URL names. The URL wins: a shared link to a draft opens
 * that draft even in a browser that has never seen it, and `compare` opens
 * the active tab comparing the Units it names.
 */

/** Pinned when the viewer has never chosen: the most recently updated views. */
export const DEFAULT_PIN_COUNT = 4;

/** URL parameters: `view` names a saved View (or `new`), `d` carries a ViewDef. */
export const VIEW_PARAM = 'view';
export const DRAFT_PARAM = 'd';
/** The id of a temporary tab, so a reload finds the tab this browser kept instead of adding another. */
export const TEMP_PARAM = 't';
export const NEW_VIEW_PARAM_VALUE = 'new';
/** With `d` on a saved view: the View's UpdatedAt the draft started from. */
export const BASE_PARAM = 'b';
/** With `d` on a saved view: the UpdatedAt of the view's Filter the draft started from. */
export const FILTER_BASE_PARAM = 'fb';

export const savedTabId = (viewId: string) => `view:${viewId}`;

let idCounter = 0;
/** A tab or lens id unique in this page. */
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export const lensIdGen = () => newId('lens');

/**
 * A saved view's lenses load with stable ids, and every edit keeps a lens's
 * id, so a draft made on this page already matches. A draft whose ids do not
 * (stored before ids were stable, or a link written by hand or by a tool) would
 * list every lens as removed and added again; give each of its lenses the id of
 * the saved lens it equals, so "N changes" lists only what really changed. Ids
 * that already match are left as they are.
 */
export function alignLensIds(baseline: ViewDef, draft: ViewDef): ViewDef {
  const free = baseline.lenses.map((l) => ({ id: l.id, sig: lensSignature({ ...l, enabled: true }) }));
  const used = new Set<string>();
  const lenses = draft.lenses.map((l) => {
    const sig = lensSignature({ ...l, enabled: true });
    const match = free.find((f) => f.sig === sig && !used.has(f.id));
    if (!match) return l;
    used.add(match.id);
    return { ...l, id: match.id };
  });
  return { ...draft, lenses };
}

/** A tab for a saved View, with `work` set to an unsaved draft when there is one. */
export function savedTab(saved: SavedView, pinned: boolean, draft?: ViewDef): TabState {
  const { def } = viewDefFromSaved(saved.view, saved.filter, lensIdGen);
  return {
    id: savedTabId(saved.viewId),
    kind: 'saved',
    viewId: saved.viewId,
    filterId: saved.filterId,
    spaceId: saved.spaceId,
    name: saved.name,
    baseline: def,
    work: draft ? alignLensIds(def, draft) : def,
    history: [],
    pinned,
  };
}

export interface InitialInput {
  views: readonly SavedView[];
  storage: ExplorerStorage;
  params: URLSearchParams;
}

export interface InitialResult {
  state: ExplorerState;
  /** Something in the URL could not be opened, or was opened differently, in plain words. */
  notice: string | null;
  /** The versions each saved tab's work started from: the view as loaded, a kept draft's, or the link's. */
  versions: Versions;
}

export function buildInitialState({ views, storage, params }: InitialInput): InitialResult {
  // A new prefix on every load (never stored), so two browser tabs never make the same fork id.
  const state = initialExplorerState(undefined, makeForkPrefix());
  const byId = new Map(views.map((v) => [v.viewId, v]));
  const storedPins = storage.readPins();
  const pins = (storedPins ?? views.slice(0, DEFAULT_PIN_COUNT).map((v) => v.viewId)).filter((id) => byId.has(id));
  const drafts = storage.readDrafts();
  const versions: Versions = new Map();
  for (const v of views) rememberVersions(versions, v);
  for (const [viewId, d] of Object.entries(drafts)) {
    if (!byId.has(viewId)) continue;
    if (d.base) versions.set(viewId, d.base);
    if (d.filterBase) versions.set(filterVersionKey(viewId), d.filterBase);
  }

  const tabs: TabState[] = [...state.tabs];
  const opened = new Set<string>();
  const open = (viewId: string, pinned: boolean, draft?: ViewDef) => {
    const saved = byId.get(viewId);
    if (!saved || opened.has(viewId)) return;
    opened.add(viewId);
    tabs.push(savedTab(saved, pinned, draft));
  };
  for (const id of pins) open(id, true, drafts[id]?.work);
  for (const id of Object.keys(drafts)) open(id, false, drafts[id].work);
  for (const t of storage.readTemps()) {
    tabs.push({ id: t.id, kind: 'temp', name: t.name, baseline: null, work: t.work, history: [], pinned: false });
  }

  let activeId = BUILTIN_TAB_ID;
  let notice: string | null = null;
  const viewParam = params.get(VIEW_PARAM);
  const draftParam = params.get(DRAFT_PARAM);
  const draft = draftParam ? decodeDraftParam(draftParam) : null;
  if (draftParam && !draft) notice = 'The link’s unsaved changes could not be read, so the saved view is shown.';

  if (viewParam && viewParam !== NEW_VIEW_PARAM_VALUE) {
    if (byId.has(viewParam)) {
      open(viewParam, false);
      const idx = tabs.findIndex((t) => t.id === savedTabId(viewParam));
      const tab = tabs[idx];
      const linked = draft && tab.baseline ? alignLensIds(tab.baseline, draft) : draft;
      const kept = drafts[viewParam]?.work;
      if (linked && kept && !viewDefsEqual(alignLensIds(tab.baseline ?? kept, kept), linked)) {
        // This browser has its own unsaved changes to the view: never replace them. The link's draft opens beside them.
        const temp: TabState = { id: newId('temp'), kind: 'temp', name: '', baseline: null, work: linked, history: [], pinned: false };
        tabs.push(temp);
        activeId = temp.id;
        notice = `The link’s changes opened in a new tab, so your own unsaved changes to “${tab.name}” are kept.`;
      } else {
        if (linked) {
          tabs[idx] = { ...tab, work: linked };
          const base = params.get(BASE_PARAM);
          if (base) versions.set(viewParam, base);
          const filterBase = params.get(FILTER_BASE_PARAM);
          if (filterBase) versions.set(filterVersionKey(viewParam), filterBase);
        }
        activeId = tab.id;
      }
    } else {
      notice = 'The view in the link no longer exists, or you cannot see it.';
    }
  } else if (viewParam === NEW_VIEW_PARAM_VALUE || draft) {
    const tempId = params.get(TEMP_PARAM);
    const kept = tempId ? tabs.find((t) => t.kind === 'temp' && t.id === tempId) : undefined;
    if (kept && (!draft || viewDefsEqual(kept.work, draft))) {
      // This browser kept the tab, and the link shows the same view (a reload).
      activeId = kept.id;
    } else if (draft) {
      // Another browser's tab id may name a different local tab: the link's view always gets a tab of its own.
      const tab: TabState = { id: newId('temp'), kind: 'temp', name: '', baseline: null, work: draft, history: [], pinned: false };
      tabs.push(tab);
      activeId = tab.id;
    } else if (kept) {
      activeId = kept.id;
    }
  }

  // The comparison belongs to the tab the link opens; Units the viewer cannot see are dropped once the rows load.
  let compare: ExplorerState['compare'];
  const compareParam = params.get(COMPARE_PARAM);
  if (compareParam !== null) {
    const decoded = decodeCompareParam(compareParam);
    const listsUnits = tabs.find((t) => t.id === activeId)?.work.entity === 'Unit';
    if (listsUnits && decoded.ids.length) compare = { [activeId]: decoded.ids };
    const said = compareLinkNotice(decoded, listsUnits);
    if (said) notice = notice ? `${notice} ${said}` : said;
  }

  return { state: { ...state, tabs, activeId, ...(compare ? { compare } : {}) }, notice, versions };
}
