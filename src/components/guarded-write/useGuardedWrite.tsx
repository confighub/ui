// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useRef, useState } from 'react';

import type { Clearance } from '@confighub/rtk-query';

import { GuardedChangesDialog } from './GuardedChangesDialog';
import type { GuardedChange } from './guardedWrite';

/** One write the flow runs: as a dry run first where guards may withhold some of it. */
export interface GuardedWrite {
  /**
   * Whether any Unit written to has guards. A write to Units with none is never withheld by a
   * guard, so it is written straight away, with no dry run.
   */
  guarded: boolean;
  /** Runs the write, and returns the changes guards withheld from it, or would. */
  run: (options: { dryRun: boolean; clearance?: Clearance }) => Promise<GuardedChange[]>;
}

/** How a guarded write ended. */
export type GuardedWriteResult =
  | { status: 'cancelled' }
  /** Written. `withheld` is what guards withheld from it, empty when it all landed. */
  | { status: 'written'; withheld: GuardedChange[] };

type Choice =
  | { kind: 'cancel' }
  | { kind: 'without' }
  | { kind: 'with'; clearance: Clearance };

/**
 * Writes to guarded Units. A write a guard would partly withhold is run as a dry run first, and
 * the person decides before anything is written: write it cleared for the guards they
 * acknowledge, write it without the guarded changes, or not at all. The returned `dialog` has to
 * be rendered for the question to be asked.
 *
 * Errors from the write are thrown to the caller, as from the write itself.
 */
export function useGuardedWrite(action: string) {
  const [pending, setPending] = useState<GuardedChange[] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const resolveChoice = useRef<((choice: Choice) => void) | undefined>(undefined);

  const choose = (choice: Choice) => {
    resolveChoice.current?.(choice);
    resolveChoice.current = undefined;
    setPending(undefined);
  };

  const start = useCallback(async (write: GuardedWrite): Promise<GuardedWriteResult> => {
    setBusy(true);
    try {
      if (write.guarded) {
        const wouldWithhold = await write.run({ dryRun: true });
        if (wouldWithhold.length > 0) {
          setBusy(false);
          const choice = await new Promise<Choice>((resolve) => {
            resolveChoice.current = resolve;
            setPending(wouldWithhold);
          });
          setBusy(true);
          if (choice.kind === 'cancel') return { status: 'cancelled' };
          const clearance = choice.kind === 'with' ? choice.clearance : undefined;
          return {
            status: 'written',
            withheld: await write.run({ dryRun: false, clearance }),
          };
        }
      }
      return { status: 'written', withheld: await write.run({ dryRun: false }) };
    } finally {
      setBusy(false);
    }
  }, []);

  const dialog = (
    <GuardedChangesDialog
      open={pending !== undefined}
      busy={busy}
      action={action}
      changes={pending ?? []}
      onCancel={() => choose({ kind: 'cancel' })}
      onWithout={() => choose({ kind: 'without' })}
      onWithClearance={(clearance) => choose({ kind: 'with', clearance })}
    />
  );

  return { start, dialog, busy };
}
