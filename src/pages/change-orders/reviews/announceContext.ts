// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { createContext, useContext } from 'react';

/**
 * The ChangeOrder page's one live region, for components deep in the page that
 * confirm something the reader just did ("Link copied"). A second live region
 * would be read out in an order nobody controls, so they announce through this.
 * Outside the page it does nothing.
 */
export const AnnounceContext = createContext<(text: string) => void>(() => undefined);

export function useAnnounce(): (text: string) => void {
  return useContext(AnnounceContext);
}
