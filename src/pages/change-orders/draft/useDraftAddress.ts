// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  type DraftAddress,
  type DraftAddressPatch,
  applyDraftAddressPatch,
  parseDraftAddress,
} from './draftDecisions';

export interface DraftAddressState {
  /** What the URL says, nothing defaulted. */
  address: DraftAddress;
  /**
   * Change the draft. `null` for a key returns it to its default ("as last time"). One call
   * is one history entry replaced, never pushed: a draft edited a hundred times still leaves
   * with one Back. Calls made before the router has drawn the last one build on it, so two
   * changes in one handler (a description flushed on blur, then "End at") both land.
   */
  update: (patch: DraftAddressPatch) => void;
}

/**
 * The draft as the URL holds it: `?space=&from=&end=&stage=&name=&desc=&wf=&out=&update=`.
 *
 * The URL is the only state: reload or share it and the same draft opens. No effect: the
 * address is read during render and written in the handler that changes it.
 *
 * Each write starts from the address bar, not from the last render. The address bar takes a
 * write at once; the router draws it a little later (in a transition React may set aside), so a
 * write that started from the drawn URL would undo the one before it.
 */
export function useDraftAddress(): DraftAddressState {
  const { search } = useLocation();
  const navigate = useNavigate();
  const address = useMemo(() => parseDraftAddress(new URLSearchParams(search)), [search]);

  const update = useCallback(
    (patch: DraftAddressPatch) => {
      const { pathname, search: current, hash } = window.location;
      const query = applyDraftAddressPatch(new URLSearchParams(current), patch).toString();
      const next = query === '' ? '' : `?${query}`;
      if (next === current) return;
      // The address bar first, so the next write builds on this one and a page left before
      // the router has drawn it (a reload, the tab closed) keeps it; the router follows.
      window.history.replaceState(window.history.state, '', `${pathname}${next}${hash}`);
      navigate({ search: next }, { replace: true });
    },
    [navigate],
  );
  return { address, update };
}
