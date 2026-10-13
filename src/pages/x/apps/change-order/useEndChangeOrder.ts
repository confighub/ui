// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The end-ChangeOrder dialog's whole state, in one place, for every surface that
 * offers the two controls.
 *
 * TWO SURFACES OFFER THEM — the ChangeOrders console's row menu and the ChangeOrder
 * detail page. Neither owns its own dialog state or its own availability test,
 * because that is how the same ChangeOrder ends up with two different answers
 * on two screens a reader moves between. The RULE lives in `changeOrderIntents`;
 * the WIRING lives here; a surface supplies a target and renders the props.
 *
 * ONE TARGET, ONE SET OF HOOKS. A console page has N rows, and a dialog plus
 * two mutation hooks per row would be N idle hooks for the one that is ever
 * used.
 */

import { useCallback, useMemo, useState } from 'react';

import type { EndChangeOrderDialogProps, EndChangeOrderSpace } from './EndChangeOrderDialog';
import { changeOrderCopy } from './changeOrderCopy';
import { rollbackScope, type ChangeOrderEndIntent } from './changeOrderRollback';
import type { ChangeOrderProgress } from './changeOrderTypes';
import { useAbortChangeOrder } from './useAbortChangeOrder';
import { useRollBackChangeOrder } from './useRollBackChangeOrder';

/** What a surface must know about the ChangeOrder being ended. */
export interface EndChangeOrderTarget {
  changeOrderId: string;
  slug: string;
  /** The Space the ChangeOrder resides in. */
  baseSpaceId: string | undefined;
  startTagId: string | undefined;
  /** '' when not aborted; non-empty IS the aborted state. */
  abortedReason: string;
  progress: ChangeOrderProgress;
}

export interface EndChangeOrderController {
  /** Open the dialog for one ChangeOrder in one of the two intents. */
  request: (intent: ChangeOrderEndIntent, target: EndChangeOrderTarget) => void;
  /** Spread onto `<EndChangeOrderDialog />`. */
  dialogProps: EndChangeOrderDialogProps;
  /**
   * The last thing that happened, for the surface to announce. Cleared by the
   * next `request`.
   */
  announcement: string;
}

export interface UseEndChangeOrderArgs {
  /** Space id → the slug a reader recognises. Falls back to the id. */
  spaceLabel: (spaceId: string) => string;
  /** Called after any write settles, so the surface can refetch. */
  onSettled?: () => void;
}

export function useEndChangeOrder({ spaceLabel, onSettled }: UseEndChangeOrderArgs): EndChangeOrderController {
  const [target, setTarget] = useState<EndChangeOrderTarget | null>(null);
  const [intent, setIntent] = useState<ChangeOrderEndIntent>('abort');
  const [announcement, setAnnouncement] = useState('');

  const abortChangeOrder = useAbortChangeOrder({
    spaceId: target?.baseSpaceId,
    changeOrderId: target?.changeOrderId,
    onSettled,
  });

  const rollBack = useRollBackChangeOrder({
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

  const spaces: EndChangeOrderSpace[] = useMemo(
    () =>
      scope.kind === 'spaces'
        ? scope.spaceIds.map((spaceId) => ({ spaceId, label: spaceLabel(spaceId) }))
        : [],
    [scope, spaceLabel],
  );

  const { reset } = rollBack;
  const request = useCallback(
    (nextIntent: ChangeOrderEndIntent, nextTarget: EndChangeOrderTarget) => {
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
        const result = await abortChangeOrder.abort(reason);
        if (!result.ok) return result.message;
        setAnnouncement(changeOrderCopy.endChangeOrder.abortAnnouncement);
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
    [intent, abortChangeOrder, rollBack, spaces, close],
  );

  const dialogProps: EndChangeOrderDialogProps = {
    open: target !== null,
    intent,
    changeOrderName: target?.slug ?? '',
    scope,
    spaces,
    busy: abortChangeOrder.busy || rollBack.busy,
    outcomes: rollBack.outcomes,
    report: rollBack.report,
    onCancel: close,
    onConfirm: confirm,
    onRetry: () => void rollBack.retry(),
  };

  return { request, dialogProps, announcement };
}
