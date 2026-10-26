// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import { compareIdsFor } from '../model/compare';
import { DRAFT_PARAM_MAX } from '../model/view-codec';
import type { TabState } from '../model/types';
import { tabLinkParams, useExplorerContext } from '../state/context';
import { DRAFT_PARAM } from '../state/initial';

/** A link to exactly what a tab shows, including its unsaved changes or temporary view, and the Units it compares. */
export function tabLink(tab: TabState, versions?: ReadonlyMap<string, string>, compareIds: readonly string[] = []): string {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(tabLinkParams(tab, versions, compareIds))) url.searchParams.set(k, v);
  return url.toString();
}

export function useCopyLink() {
  const { toast, versions, state } = useExplorerContext();
  return useCallback(
    async (tab: TabState) => {
      const compareIds = compareIdsFor(state, tab.id);
      const params = tabLinkParams(tab, versions.current, compareIds);
      const link = tabLink(tab, versions.current, compareIds);
      try {
        if (!navigator.clipboard) throw new Error('no clipboard');
        await navigator.clipboard.writeText(link);
      } catch {
        toast({ message: 'The link could not be copied. Copy it from the address bar instead.', severity: 'error' });
        return;
      }
      if ((params[DRAFT_PARAM]?.length ?? 0) > DRAFT_PARAM_MAX) {
        toast({ message: 'Link copied. It is long; some tools may cut it short.', severity: 'warning' });
        return;
      }
      const opens = params[DRAFT_PARAM] ? 'this exact draft' : '';
      const compares = compareIds.length ? `${compareIds.length === 1 ? 'this Unit' : `these ${compareIds.length} Units`} side by side` : '';
      const what = [opens, compares].filter(Boolean).join(', with ');
      toast({ message: what ? `Link copied. It opens ${what}.` : 'Link copied.' });
    },
    [toast, versions, state],
  );
}
