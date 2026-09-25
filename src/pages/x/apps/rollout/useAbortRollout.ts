// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Abort, standalone.
 *
 * NOT a new `useRolloutActions` action: abort shares none of the
 * clone+upgrade machinery that hook exists to sequence, and routing its
 * errors through `lastResult`/the stage footer would surface them on the
 * wrong UI surface — the abort HUD, not the stage pane. It is a single PATCH
 * setting `AbortedReason`; cache invalidation is automatic (`patchChangeOrder`
 * invalidates the `ChangeOrder` tag, and the caller's `onSettled` refetch
 * brings the new value back), so this hook's own job is just the call, its busy
 * flag, and turning a rejection into a message the dialog can show.
 */

import { useCallback } from 'react';

import { usePatchChangeOrderMutation } from '@confighub/rtk-query';

import { describeRequestError } from './rolloutAbort';
import { rolloutCopy } from './rolloutCopy';

export interface UseAbortRolloutArgs {
  spaceId: string | undefined;
  changeOrderId: string | undefined;
  /** Called after the request settles, so the caller can refetch. */
  onSettled?: () => void;
}

export interface AbortRolloutResult {
  ok: boolean;
  message: string;
}

export interface AbortRollout {
  busy: boolean;
  abort: (reason: string) => Promise<AbortRolloutResult>;
}

export function useAbortRollout(args: UseAbortRolloutArgs): AbortRollout {
  const { spaceId, changeOrderId, onSettled } = args;
  const [patchChangeOrder, { isLoading }] = usePatchChangeOrderMutation();

  const abort = useCallback(
    async (reason: string): Promise<AbortRolloutResult> => {
      if (spaceId === undefined || changeOrderId === undefined) {
        return { ok: false, message: rolloutCopy.abort.notReady };
      }
      try {
        await patchChangeOrder({
          spaceId,
          changeOrderId,
          body: { AbortedReason: reason },
        }).unwrap();
        return { ok: true, message: '' };
      } catch (error) {
        return { ok: false, message: rolloutCopy.abort.failed(describeRequestError(error)) };
      } finally {
        onSettled?.();
      }
    },
    [spaceId, changeOrderId, patchChangeOrder, onSettled],
  );

  return { busy: isLoading, abort };
}
