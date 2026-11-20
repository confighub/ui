// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Opens the folders above the field the URL focuses (PLAN.md decision 7). One small store per
// values section (not a module global); each tree row subscribes with a selector that returns
// one boolean, "the focused field is under me", so only the rows on the path re-render.
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';

export interface FieldFocusStore {
  get: () => string | null;
  set: (path: string | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFieldFocusStore(): FieldFocusStore {
  let path: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => path,
    set: (next) => {
      if (next === path) return;
      path = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** A folder at `folderPath` holds the field at `fieldPath`. The empty path holds every field. */
export function folderHoldsField(folderPath: string, fieldPath: string | null): boolean {
  if (fieldPath === null) return false;
  return folderPath === '' || fieldPath.startsWith(`${folderPath}.`);
}

const NO_STORE = createFieldFocusStore();

export const FieldFocusStoreContext = createContext<FieldFocusStore>(NO_STORE);

/** The values section's store, stable for its life. */
export function useNewFieldFocusStore(): FieldFocusStore {
  return useMemo(createFieldFocusStore, []);
}

/** True while the focused field is under the folder at `folderPath`. */
export function useFolderHoldsFocus(folderPath: string): boolean {
  const store = useContext(FieldFocusStoreContext);
  return useSyncExternalStore(store.subscribe, () => folderHoldsField(folderPath, store.get()));
}
