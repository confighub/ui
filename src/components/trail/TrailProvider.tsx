// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useLocation, useMatches, useNavigationType } from 'react-router-dom';

import type { CrumbHandle } from './crumbs';
import { EMPTY_TRAIL, PageCrumb, TrailState, parseTrail, trailReducer } from './trail';

/** The trail is kept for the browser tab, one per organization, so a reload keeps it and a new tab starts its own. */
const storageKey = (orgId: string) => `confighub:trail:${orgId}`;

function readStored(orgId: string): TrailState {
  try {
    return parseTrail(window.sessionStorage.getItem(storageKey(orgId)));
  } catch {
    return EMPTY_TRAIL;
  }
}

interface TrailContextValue {
  state: TrailState;
  /** The page on screen, or null on an address that has no crumb. */
  current: PageCrumb | null;
}

const TrailContext = createContext<TrailContextValue>({ state: EMPTY_TRAIL, current: null });

interface NamingContextValue {
  currentKey: string | null;
  setName: (key: string, name: string) => void;
}

const NamingContext = createContext<NamingContextValue>({ currentKey: null, setName: () => {} });

interface ActionsSlotValue {
  /** The element in the trail bar that takes the page's header actions. */
  slot: HTMLElement | null;
  setSlot: (el: HTMLElement | null) => void;
}

const ActionsSlotContext = createContext<ActionsSlotValue>({ slot: null, setSlot: () => {} });

export const useTrail = () => useContext(TrailContext);
export const useTrailActionsSlot = () => useContext(ActionsSlotContext);

/**
 * Gives the crumb of the page on screen its name. For a page whose address
 * holds an id, or whose subject has a display name. While the name is loading,
 * pass `undefined`: the crumb keeps the name it has, which on a first visit is
 * the name of the type. Pass `null` to go back to the name the route gives.
 */
export function useCrumbName(name: string | undefined | null): void {
  const { currentKey, setName } = useContext(NamingContext);
  useEffect(() => {
    if (currentKey && name !== undefined) setName(currentKey, name ?? '');
  }, [currentKey, name, setName]);
}

/** The crumb that the matched route's `handle` gives for the current address. */
function useCurrentPage(): PageCrumb | null {
  const matches = useMatches();
  const { search } = useLocation();
  return useMemo(() => {
    for (let i = matches.length - 1; i >= 0; i--) {
      const handle = matches[i].handle as Partial<CrumbHandle> | undefined;
      if (handle?.crumb) return handle.crumb(matches[i].params, new URLSearchParams(search));
    }
    return null;
  }, [matches, search]);
}

interface TrailProviderProps {
  /** The organization the trail belongs to. Empty until the user is known; nothing is stored until then. */
  orgId: string;
  children: ReactNode;
}

export const TrailProvider = ({ orgId, children }: TrailProviderProps) => {
  const [state, dispatch] = useReducer(trailReducer, EMPTY_TRAIL);
  /** The organization whose stored trail is loaded. Nothing is written before that, so the stored trail is not overwritten. */
  const [loadedOrg, setLoadedOrg] = useState('');
  const location = useLocation();
  const navigationType = useNavigationType();
  const page = useCurrentPage();
  const href = location.pathname + location.search + location.hash;
  const pageKey = page?.key ?? null;
  const pageKind = page?.kind;
  const pageLabel = page?.label;
  /** The crumb of the address before this one, to drop when this address replaced it. */
  const previousKey = useRef<string | null>(null);

  useEffect(() => {
    const replacedKey =
      navigationType === 'REPLACE' && previousKey.current !== null && previousKey.current !== pageKey ? previousKey.current : undefined;
    previousKey.current = pageKey;
    if (pageKey === null || pageKind === undefined || pageLabel === undefined) return;
    dispatch({ type: 'visit', page: { key: pageKey, kind: pageKind, label: pageLabel }, href, replacedKey });
  }, [pageKey, pageKind, pageLabel, href, navigationType]);

  useEffect(() => {
    if (!orgId || loadedOrg === orgId) return;
    dispatch({ type: 'restore', stored: readStored(orgId) });
    setLoadedOrg(orgId);
  }, [orgId, loadedOrg]);

  useEffect(() => {
    if (!orgId || loadedOrg !== orgId) return;
    try {
      window.sessionStorage.setItem(storageKey(orgId), JSON.stringify(state));
    } catch {
      // Without storage the trail still works; it only does not survive a reload.
    }
  }, [orgId, loadedOrg, state]);

  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const trail = useMemo(() => ({ state, current: page }), [state, page]);
  const naming = useMemo<NamingContextValue>(
    () => ({ currentKey: pageKey, setName: (key, name) => dispatch({ type: 'name', key, name }) }),
    [pageKey],
  );
  const actionsSlot = useMemo(() => ({ slot, setSlot }), [slot]);

  return (
    <TrailContext.Provider value={trail}>
      <NamingContext.Provider value={naming}>
        <ActionsSlotContext.Provider value={actionsSlot}>{children}</ActionsSlotContext.Provider>
      </NamingContext.Provider>
    </TrailContext.Provider>
  );
};
