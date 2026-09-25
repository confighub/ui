// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The end-rollout dialog's whole state, in one place, for every surface that
 * offers the two controls.
 *
 * TWO SURFACES OFFER THEM — the rollouts console's row menu and the rollout
 * detail page. Neither owns its own dialog state or its own availability test,
 * because that is how the same ChangeOrder ends up with two different answers
 * on two screens a reader moves between. The RULE lives in `rolloutIntents`;
 * the WIRING lives here; a surface supplies a target and renders the props.
 *
 * ONE TARGET, ONE SET OF HOOKS. A console page has N rows, and a dialog plus
 * two mutation hooks per row would be N idle hooks for the one that is ever
 * used.
 */

import { useCallback, useMemo, useState } from 'react';

import type { EndRolloutDialogProps, EndRolloutSpace } from './EndRolloutDialog';
import { rolloutCopy } from './rolloutCopy';
import { rollbackScope, type RolloutEndIntent } from './rolloutRollback';
import type { RolloutProgress } from './rolloutTypes';
import { useAbortRollout } from './useAbortRollout';
import { useRollBackRollout } from './useRollBackRollout';

/** What a surface must know about the rollout being ended. */
export interface EndRolloutTarget {
  changeOrderId: string;
  slug: string;
  /** The Space the ChangeOrder resides in. */
  baseSpaceId: string | undefined;
  startTagId: string | undefined;
  /** '' when not aborted; non-empty IS the aborted state. */
  abortedReason: string;
  progress: RolloutProgress;
}

export interface EndRolloutController {
  /** Open the dialog for one rollout in one of the two intents. */
  request: (intent: RolloutEndIntent, target: EndRolloutTarget) => void;
  /** Spread onto `<EndRolloutDialog />`. */
  dialogProps: EndRolloutDialogProps;
  /**
   * The last thing that happened, for the surface to announce. Cleared by the
   * next `request`.
   */
  announcement: string;
}

export interface UseEndRolloutArgs {
  /** Space id → the slug a reader recognises. Falls back to the id. */
  spaceLabel: (spaceId: string) => string;
  /** Called after any write settles, so the surface can refetch. */
  onSettled?: () => void;
}

export function useEndRollout({ spaceLabel, onSettled }: UseEndRolloutArgs): EndRolloutController {
  const [target, setTarget] = useState<EndRolloutTarget | null>(null);
  const [intent, setIntent] = useState<RolloutEndIntent>('abort');
  const [announcement, setAnnouncement] = useState('');

  const abortRollout = useAbortRollout({
    spaceId: target?.baseSpaceId,
    changeOrderId: target?.changeOrderId,
    onSettled,
  });

  const rollBack = useRollBackRollout({
    baseSpaceId: target?.baseSpaceId,
    changeOrderId: target?.changeOrderId,
    startTagId: target?.startTagId,
    changeOrderSlug: target?.slug ?? '',
    alreadyAborted: (target?.abortedReason ?? '') !== '',
    onSettled,
  });

  const scope = useMemo(
    () => (target === null ? ({ kind: 'unavailable' } as const) : rollbackScope(target.progress)),
    [target],
  );

  const spaces: EndRolloutSpace[] = useMemo(
    () =>
      scope.kind === 'spaces'
        ? scope.spaceIds.map((spaceId) => ({ spaceId, label: spaceLabel(spaceId) }))
        : [],
    [scope, spaceLabel],
  );

  const { reset } = rollBack;
  const request = useCallback(
    (nextIntent: RolloutEndIntent, nextTarget: EndRolloutTarget) => {
      reset();
      setAnnouncement('');
      setIntent(nextIntent);
      setTarget(nextTarget);
    },
    [reset],
  );

  const close = useCallback(() => setTarget(null), []);

  const confirm = useCallback(
    async (reason: string): Promise<string | null> => {
      if (intent === 'abort') {
        const result = await abortRollout.abort(reason);
        if (!result.ok) return result.message;
        setAnnouncement(rolloutCopy.endRollout.abortAnnouncement);
        close();
        return null;
      }
      /*
       * A rollback's account is per Space and stays in the dialog — a second,
       * coarser verdict beside it would say less. The abort leg is the
       * exception: it fails BEFORE any Space is touched, so there is no
       * per-Space account for it to sit beside, and `run` hands it back.
       */
      return await rollBack.run(reason, spaces);
    },
    [intent, abortRollout, rollBack, spaces, close],
  );

  const dialogProps: EndRolloutDialogProps = {
    open: target !== null,
    intent,
    changeOrderName: target?.slug ?? '',
    scope,
    spaces,
    busy: abortRollout.busy || rollBack.busy,
    outcomes: rollBack.outcomes,
    report: rollBack.report,
    onCancel: close,
    onConfirm: confirm,
    onRetry: () => void rollBack.retry(),
  };

  return { request, dialogProps, announcement };
}
