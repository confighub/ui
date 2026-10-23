// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import { DRAFT_PARAM_MAX } from '../model/view-codec';
import type { TabState } from '../model/types';
import { tabUrlParams, useExplorerContext } from '../state/context';
import { DRAFT_PARAM } from '../state/initial';

/** A link to exactly what a tab shows, including its unsaved changes or temporary view. */
export function tabLink(tab: TabState, versions?: ReadonlyMap<string, string>): string {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(tabUrlParams(tab, versions))) url.searchParams.set(k, v);
  return url.toString();
}

export function useCopyLink() {
  const { toast, versions } = useExplorerContext();
  return useCallback(
    async (tab: TabState) => {
      const params = tabUrlParams(tab, versions.current);
      const link = tabLink(tab, versions.current);
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
      toast({ message: params[DRAFT_PARAM] ? 'Link copied. It opens this exact draft.' : 'Link copied.' });
    },
    [toast, versions],
  );
}
