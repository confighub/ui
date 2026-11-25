// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The trail: the pages visited in this browser tab, oldest first. The bar at the
 * top of each page shows it after the organization. It is the order of visits,
 * with no hierarchy: the last crumb is the page on screen, and a page visited
 * again moves to the end.
 */

/** What a crumb's page is about. It selects the crumb's icon. */
export type CrumbKind =
  | 'component'
  | 'space'
  | 'unit'
  | 'target'
  | 'gitops'
  | 'trigger'
  | 'link'
  | 'function'
  | 'release'
  | 'validation'
  | 'changeOrder'
  | 'changeSet'
  | 'changeWorkflow'
  | 'diff'
  | 'view'
  | 'resource'
  | 'channel'
  | 'serviceAccount'
  | 'auditLog';

/** A page, as its route describes it from the address alone. */
export interface PageCrumb {
  /** Identifies the page. Two addresses with one key are the same crumb. */
  key: string;
  kind: CrumbKind;
  /** The name shown until the page gives a better one with `useCrumbName`. */
  label: string;
}

export interface Crumb extends PageCrumb {
  /** The page's last address, with its query, so the crumb returns to the same tab, filter and selection. */
  href: string;
}

export interface TrailState {
  crumbs: Crumb[];
  /** Names that pages gave, by crumb key. Kept apart from `crumbs` because a page can name itself before its visit is recorded. */
  names: Record<string, string>;
}

export const EMPTY_TRAIL: TrailState = { crumbs: [], names: {} };

/** The trail keeps this many pages; the oldest goes first. */
export const TRAIL_MAX = 30;

export type TrailAction =
  | {
      type: 'visit';
      page: PageCrumb;
      href: string;
      /** The crumb of a page that this navigation replaced in the browser's history, such as a redirect or a page left after a delete. */
      replacedKey?: string;
    }
  | { type: 'name'; key: string; name: string }
  /** The trail stored for this tab, read once the organization is known. Pages visited since then come after it. */
  | { type: 'restore'; stored: TrailState };

export function trailReducer(state: TrailState, action: TrailAction): TrailState {
  if (action.type === 'name') {
    if (state.names[action.key] === action.name) return state;
    return { ...state, names: { ...state.names, [action.key]: action.name } };
  }
  if (action.type === 'restore') {
    const seen = new Set(state.crumbs.map((c) => c.key));
    const crumbs = [...action.stored.crumbs.filter((c) => !seen.has(c.key)), ...state.crumbs].slice(-TRAIL_MAX);
    return { crumbs, names: { ...action.stored.names, ...state.names } };
  }
  const { page, href, replacedKey } = action;
  const last = state.crumbs[state.crumbs.length - 1];
  if (last?.key === page.key && last.href === href && last.label === page.label && last.kind === page.kind && replacedKey === undefined) {
    return state;
  }
  const kept = state.crumbs.filter((c) => c.key !== page.key && c.key !== replacedKey);
  const crumbs = [...kept, { ...page, href }].slice(-TRAIL_MAX);
  const names: Record<string, string> = {};
  for (const c of crumbs) {
    const name = state.names[c.key];
    if (name !== undefined) names[c.key] = name;
  }
  return { crumbs, names };
}

/** The name to show for a crumb. */
export function crumbName(state: TrailState, crumb: PageCrumb): string {
  return state.names[crumb.key] || crumb.label;
}

/** Reads a stored trail. Anything that is not a trail gives the empty one. */
export function parseTrail(raw: string | null): TrailState {
  if (!raw) return EMPTY_TRAIL;
  try {
    const value = JSON.parse(raw) as Partial<TrailState> | null;
    if (!value || !Array.isArray(value.crumbs)) return EMPTY_TRAIL;
    const crumbs = value.crumbs.filter(
      (c): c is Crumb =>
        !!c && typeof c.key === 'string' && typeof c.kind === 'string' && typeof c.label === 'string' && typeof c.href === 'string' && c.href.startsWith('/'),
    );
    const names: Record<string, string> = {};
    if (value.names && typeof value.names === 'object') {
      for (const [key, name] of Object.entries(value.names)) {
        if (typeof name === 'string') names[key] = name;
      }
    }
    return { crumbs, names };
  } catch {
    return EMPTY_TRAIL;
  }
}

/**
 * How many crumbs fit in a bar, counted from the newest. `widths` is in the
 * order of the trail and each holds the crumb with its separator. Crumbs keep
 * their full width, so when the trail is longer than the bar the oldest leave
 * it first, into a menu that takes `menuWidth`. The newest crumb, the page on
 * screen, is always shown.
 */
export function crumbsThatFit(widths: readonly number[], available: number, menuWidth: number): number {
  const total = widths.reduce((sum, w) => sum + w, 0);
  if (total <= available) return widths.length;
  let used = menuWidth;
  let count = 0;
  for (let i = widths.length - 1; i >= 0; i--) {
    if (used + widths[i] > available) break;
    used += widths[i];
    count++;
  }
  return Math.max(1, Math.min(count, widths.length));
}
