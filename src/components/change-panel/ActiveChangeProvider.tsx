// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One reader of the active change for the whole app: the rail button, the panel, the
 * Save caption and the ChangeSet page share its reads and its gate dry runs.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useActiveChangeSource, type ActiveChange } from './useActiveChange';

const ActiveChangeContext = createContext<ActiveChange | null>(null);

export function ActiveChangeProvider({ children }: { children: ReactNode }) {
  const value = useActiveChangeSource();
  return <ActiveChangeContext.Provider value={value}>{children}</ActiveChangeContext.Provider>;
}

/** The active change; `null` outside the app layout. */
// eslint-disable-next-line react-refresh/only-export-components
export function useActiveChange(): ActiveChange | null {
  return useContext(ActiveChangeContext);
}

/** The open change's name, or undefined when there is none (a finished change is not open). */
// eslint-disable-next-line react-refresh/only-export-components
export function useOpenChangeName(): string | undefined {
  const ac = useActiveChange();
  if (ac?.pending) return ac.pending;
  if (!ac?.ref) return undefined;
  // A finished change keeps its name on the button while the panel still shows it.
  return ac.detail.changeSet?.Slug ?? ac.ref.slug;
}
