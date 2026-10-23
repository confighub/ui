// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { defaultViewDef } from './fields';
import { normalizeMatrixAxes } from './matrix-axes';
import type {
  ColumnState,
  EditorMode,
  EntityKind,
  ExplorerState,
  Layout,
  Lens,
  MatrixAxes,
  SoloState,
  SortState,
  TabState,
  ViewDef,
} from './types';
import { viewDefsEqual } from './view-codec';

/**
 * The explorer's state: open tabs, each with the view as saved (`baseline`)
 * and as it is now (`work`), and an undo history per tab. A change to the
 * built-in "All units" tab never changes it: it opens a temporary tab with the
 * change instead. Every action that changes `work` pushes the old `work` onto
 * the tab's history, so ⌘Z walks back each step.
 */

export const BUILTIN_TAB_ID = 'builtin:all-units';
export const HISTORY_LIMIT = 100;

export type ExplorerAction =
  | { type: 'openTab'; tab: TabState }
  | { type: 'closeTab'; tabId: string }
  | { type: 'activate'; tabId: string }
  | { type: 'newTemp'; tabId: string; def?: ViewDef; entity?: EntityKind }
  | { type: 'addLenses'; lenses: Lens[] }
  | { type: 'updateLens'; lens: Lens }
  | { type: 'removeLens'; lensId: string }
  | { type: 'toggleLens'; lensId: string }
  | { type: 'soloLens'; lensId: string }
  | { type: 'replaceFilter'; lenses: Lens[]; resourceType: string; whereData: string }
  | { type: 'setGroupBy'; groupBy: string[] }
  | { type: 'moveGroupLevel'; from: number; to: number }
  | { type: 'setSort'; sort: SortState | null }
  | { type: 'setColumns'; columns: ColumnState[] }
  | { type: 'moveColumn'; from: number; to: number }
  | { type: 'resizeColumn'; name: string; width: number }
  | { type: 'hideColumn'; name: string }
  | { type: 'setLayout'; layout: Layout }
  | { type: 'setMatrixAxes'; matrix: MatrixAxes }
  | { type: 'setEntity'; entity: EntityKind }
  /** Undo the last step of a tab: the active tab, or `tabId` (a toast's Undo acts on the tab it came from). */
  | { type: 'undo'; tabId?: string }
  | { type: 'discard' }
  | {
      type: 'saved';
      tabId: string;
      name: string;
      viewId: string;
      filterId: string;
      spaceId: string;
      /**
       * The view as it was sent. Edits made while the save was in flight are
       * not in it, so they stay unsaved changes. Without it, the work at
       * dispatch time becomes the baseline.
       */
      def?: ViewDef;
    }
  | { type: 'renamed'; tabId: string; name: string }
  | { type: 'pin'; tabId: string }
  | { type: 'unpin'; tabId: string }
  | { type: 'setMode'; mode: EditorMode }
  /**
   * Several edits of the active tab's view as ONE undo step (the Matrix
   * drill-in: new filter lenses and the table layout). Meant for edits of
   * `work`; tab actions inside it run, but are not part of the step.
   */
  | { type: 'batch'; actions: ExplorerAction[] };

/** The state with only the built-in tab, showing `def` (all Units by default). */
/**
 * A short id part that differs per page load (time plus a random part), for
 * `initialExplorerState`'s `forkPrefix`. Not for security.
 */
export function makeForkPrefix(
  now: number = Date.now(),
  random: () => number = Math.random,
): string {
  return `${now.toString(36)}${random().toString(36).slice(2, 6)}`;
}

export function initialExplorerState(
  def: ViewDef = defaultViewDef('Unit'),
  forkPrefix?: string,
): ExplorerState {
  return {
    ...(forkPrefix ? { forkPrefix } : {}),
    tabs: [
      {
        id: BUILTIN_TAB_ID,
        kind: 'builtin',
        name: 'All units',
        baseline: def,
        work: def,
        history: [],
        pinned: true,
      },
    ],
    activeId: BUILTIN_TAB_ID,
    mode: 'lenses',
    seq: 0,
  };
}

export function activeTab(state: ExplorerState): TabState | undefined {
  return state.tabs.find((t) => t.id === state.activeId);
}

/** A saved tab whose view differs from what was saved. Built-in and temporary tabs are never dirty. */
export function isDirty(tab: TabState): boolean {
  return (
    tab.kind === 'saved' && tab.baseline !== null && !viewDefsEqual(tab.baseline, tab.work)
  );
}

/** A temporary tab nobody has used or named yet, which goes away when it is left. */
export function isBlankTemp(tab: TabState): boolean {
  // A name the person gave it is a reason to keep it, even with nothing else changed.
  if (tab.kind !== 'temp' || tab.name.trim()) return false;
  const blank = defaultViewDef(tab.work.entity);
  return (
    tab.work.lenses.length === 0 &&
    tab.work.groupBy.length === 0 &&
    viewDefsEqual(tab.work, blank)
  );
}

function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to)
    return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function replaceTab(state: ExplorerState, tab: TabState): ExplorerState {
  return { ...state, tabs: state.tabs.map((t) => (t.id === tab.id ? tab : t)) };
}

/**
 * The number for the next fork's id, `temp-<n>`, above `seq` and above every
 * `temp-<n>` tab already open: tabs restored from this browser keep their ids
 * while `seq` starts again at 0 on each load, so `seq` alone would collide.
 */
/** The id of the next fork: `temp-<prefix>-<n>`, or `temp-<n>` with no prefix. */
function nextForkId(state: ExplorerState): string {
  const n = nextForkSeq(state);
  return state.forkPrefix ? `temp-${state.forkPrefix}-${n}` : `temp-${n}`;
}

function nextForkSeq(state: ExplorerState): number {
  let max = state.seq;
  for (const t of state.tabs) {
    const m = /^temp-(?:.+-)?(\d+)$/.exec(t.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

/**
 * The id of the tab the next edit of `work` lands in: the active tab, or on
 * "All units" the temporary tab the edit will fork. Read it from the state
 * before dispatching, to aim a later `undo` (a toast's Undo) at that tab.
 */
export function editTargetTabId(state: ExplorerState): string {
  const tab = activeTab(state);
  return tab?.kind === 'builtin' ? nextForkId(state) : state.activeId;
}

interface WorkEdit {
  work: ViewDef;
  solo?: SoloState;
}

/**
 * Apply an edit to the active tab's view. A no-op edit changes nothing (and
 * adds no undo step). On the built-in tab the edit lands in a new temporary
 * tab, whose history starts with the built-in view so ⌘Z goes back to it.
 */
function editWork(
  state: ExplorerState,
  edit: (work: ViewDef, tab: TabState) => WorkEdit | null,
): ExplorerState {
  const tab = activeTab(state);
  if (!tab) return state;
  const result = edit(tab.work, tab);
  if (!result || viewDefsEqual(result.work, tab.work)) return state;
  if (tab.kind === 'builtin') {
    const seq = nextForkSeq(state);
    const fork: TabState = {
      // The same id editTargetTabId names, so a toast can undo in the fork.
      id: nextForkId(state),
      kind: 'temp',
      name: '',
      baseline: null,
      work: result.work,
      history: [tab.work],
      pinned: false,
      solo: result.solo,
    };
    return { ...state, tabs: [...state.tabs, fork], activeId: fork.id, seq };
  }
  const history = [...tab.history, tab.work].slice(-HISTORY_LIMIT);
  return replaceTab(state, { ...tab, work: result.work, history, solo: result.solo });
}

const setLenses = (work: ViewDef, lenses: Lens[]): WorkEdit => ({ work: { ...work, lenses } });

export function explorerReducer(state: ExplorerState, action: ExplorerAction): ExplorerState {
  switch (action.type) {
    case 'openTab': {
      if (state.tabs.some((t) => t.id === action.tab.id))
        return { ...state, activeId: action.tab.id };
      return { ...state, tabs: [...state.tabs, action.tab], activeId: action.tab.id };
    }
    case 'closeTab': {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId);
      if (idx === -1 || state.tabs[idx].kind === 'builtin') return state;
      const tabs = state.tabs.filter((t) => t.id !== action.tabId);
      const activeId =
        state.activeId === action.tabId ? tabs[Math.max(0, idx - 1)].id : state.activeId;
      return { ...state, tabs, activeId };
    }
    case 'activate': {
      if (!state.tabs.some((t) => t.id === action.tabId) || state.activeId === action.tabId)
        return state;
      // A blank temporary tab is not worth keeping once the viewer leaves it.
      const leaving = activeTab(state);
      const tabs =
        leaving && isBlankTemp(leaving)
          ? state.tabs.filter((t) => t.id !== leaving.id)
          : state.tabs;
      return { ...state, tabs, activeId: action.tabId };
    }
    case 'newTemp': {
      const work = action.def ?? defaultViewDef(action.entity ?? 'Unit');
      const tab: TabState = {
        id: action.tabId,
        kind: 'temp',
        name: '',
        baseline: null,
        work,
        history: [],
        pinned: false,
      };
      return explorerReducer(
        { ...state, tabs: [...state.tabs, tab] },
        { type: 'activate', tabId: tab.id },
      );
    }
    case 'addLenses':
      return editWork(state, (w) =>
        action.lenses.length ? setLenses(w, [...w.lenses, ...action.lenses]) : null,
      );
    case 'updateLens':
      return editWork(state, (w) =>
        setLenses(
          w,
          w.lenses.map((l) => (l.id === action.lens.id ? action.lens : l)),
        ),
      );
    case 'removeLens':
      return editWork(state, (w) =>
        setLenses(
          w,
          w.lenses.filter((l) => l.id !== action.lensId),
        ),
      );
    case 'toggleLens':
      return editWork(state, (w) =>
        setLenses(
          w,
          w.lenses.map((l) => (l.id === action.lensId ? { ...l, enabled: !l.enabled } : l)),
        ),
      );
    case 'soloLens':
      return editWork(state, (w, tab) => {
        if (!w.lenses.some((l) => l.id === action.lensId)) return null;
        if (tab.solo?.lensId === action.lensId) {
          const prev = tab.solo.previous;
          return {
            work: {
              ...w,
              lenses: w.lenses.map((l) => (l.id in prev ? { ...l, enabled: prev[l.id] } : l)),
            },
          };
        }
        const previous = Object.fromEntries(w.lenses.map((l) => [l.id, l.enabled]));
        return {
          work: {
            ...w,
            lenses: w.lenses.map((l) => ({ ...l, enabled: l.id === action.lensId })),
          },
          solo: { lensId: action.lensId, previous },
        };
      });
    case 'replaceFilter':
      return editWork(state, (w) => ({
        work: {
          ...w,
          lenses: action.lenses,
          resourceType: action.resourceType,
          whereData: action.whereData,
        },
      }));
    case 'setGroupBy':
      return editWork(state, (w) => ({
        work: { ...w, groupBy: [...new Set(action.groupBy)] },
      }));
    case 'moveGroupLevel':
      return editWork(state, (w) => ({
        work: { ...w, groupBy: move(w.groupBy, action.from, action.to) },
      }));
    case 'setSort':
      return editWork(state, (w) => ({ work: { ...w, sort: action.sort } }));
    case 'setColumns':
      return editWork(state, (w) => ({ work: { ...w, columns: action.columns } }));
    case 'moveColumn':
      return editWork(state, (w) => ({
        work: { ...w, columns: move(w.columns, action.from, action.to) },
      }));
    case 'resizeColumn':
      return editWork(state, (w) => ({
        work: {
          ...w,
          columns: w.columns.map((c) =>
            c.name === action.name ? { ...c, width: Math.round(action.width) } : c,
          ),
        },
      }));
    case 'hideColumn':
      return editWork(state, (w) =>
        w.columns.length <= 1
          ? null
          : { work: { ...w, columns: w.columns.filter((c) => c.name !== action.name) } },
      );
    case 'setLayout':
      return editWork(state, (w) => ({ work: { ...w, layout: action.layout } }));
    case 'setMatrixAxes':
      // Name ascending is stored as no sort, so it compares equal to the saved view.
      return editWork(state, (w) => ({
        work: { ...w, matrix: normalizeMatrixAxes(action.matrix) },
      }));
    case 'setEntity':
      return editWork(state, (w) =>
        w.entity === action.entity
          ? null
          : { work: { ...defaultViewDef(action.entity), layout: w.layout } },
      );
    case 'undo': {
      const tab = action.tabId
        ? state.tabs.find((t) => t.id === action.tabId)
        : activeTab(state);
      if (!tab || tab.history.length === 0) return state;
      const work = tab.history[tab.history.length - 1];
      return replaceTab(state, {
        ...tab,
        work,
        history: tab.history.slice(0, -1),
        solo: undefined,
      });
    }
    case 'discard': {
      const tab = activeTab(state);
      if (!tab || tab.kind === 'builtin') return state;
      if (tab.kind === 'temp')
        return explorerReducer(state, { type: 'closeTab', tabId: tab.id });
      if (!tab.baseline || viewDefsEqual(tab.baseline, tab.work)) return state;
      const history = [...tab.history, tab.work].slice(-HISTORY_LIMIT);
      return replaceTab(state, { ...tab, work: tab.baseline, history, solo: undefined });
    }
    case 'saved': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab || tab.kind === 'builtin') return state;
      return replaceTab(state, {
        ...tab,
        kind: 'saved',
        name: action.name,
        viewId: action.viewId,
        filterId: action.filterId,
        spaceId: action.spaceId,
        baseline: action.def ?? tab.work,
      });
    }
    case 'renamed': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      if (!tab || tab.kind === 'builtin' || tab.name === action.name) return state;
      return replaceTab(state, { ...tab, name: action.name });
    }
    case 'pin':
    case 'unpin': {
      const tab = state.tabs.find((t) => t.id === action.tabId);
      const pinned = action.type === 'pin';
      if (!tab || tab.kind === 'builtin' || tab.pinned === pinned) return state;
      return replaceTab(state, { ...tab, pinned });
    }
    case 'setMode':
      return state.mode === action.mode ? state : { ...state, mode: action.mode };
    case 'batch': {
      const before = activeTab(state);
      const next = action.actions.reduce(explorerReducer, state);
      const after = activeTab(next);
      if (next === state || !before || !after) return next;
      // Edits that cancel out are no step at all: undo must never walk a step
      // that changes nothing, and "All units" must not fork for nothing.
      if (viewDefsEqual(after.work, before.work)) return state;
      if (after.id === before.id) {
        const history = [...before.history, before.work].slice(-HISTORY_LIMIT);
        return replaceTab(next, { ...after, history });
      }
      // The first edit forked "All units" into a temporary tab: its history
      // starts at the built-in view, as a single edit's fork does.
      if (
        before.kind === 'builtin' &&
        after.kind === 'temp' &&
        !state.tabs.some((t) => t.id === after.id)
      ) {
        return replaceTab(next, { ...after, history: [before.work] });
      }
      return next;
    }
  }
}
