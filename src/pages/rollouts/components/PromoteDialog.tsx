// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The confirmation for promoting one stage.
 *
 * Modelled on `AbortRolloutDialog`: plain Dialog/Title/Content/Actions, Cancel
 * then a coloured confirm. MUI's `Dialog` supplies the focus trap and Escape,
 * so neither is hand-rolled.
 *
 * A HELD STAGE GETS NO CONFIRM AT ALL, NOT A DISABLED ONE. A gate that holds a
 * stage refuses it, and there is nothing to press — so the dialog says what is
 * holding it and stops. A greyed-out button would advertise a route past the
 * gate that does not exist, which is the same refusal-without-an-action
 * `AbortRolloutDialog` bans. The confirm IS disabled while a request is in
 * flight, which is a different thing.
 *
 * IT MUST NOT OVERCLAIM. Where the preview did not reach every variant the
 * sentence says so. That is the property the reference was chosen for — it
 * knows when it has stopped being a summary — and it is the single most
 * important thing on a screen that is about to write.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';

import { componentTheme } from '../../x/apps/componentTheme';
import { rolloutCopy } from '../../x/apps/rollout/rolloutCopy';
import { rolloutInk, rolloutStatus, rolloutType } from '../rolloutsTokens';

export interface PromoteDialogProps {
  open: boolean;
  stageName: string;
  /** Variants the promote will write into. */
  targetCount: number;
  /**
   * Variants the server's dry run actually reported on. Lower than
   * `targetCount` means the dialog must not state a total as though it were
   * complete — including while the dry run is still in flight, when it has
   * reached none of them.
   *
   * `null` where the surface does not preview at all. That is NOT zero: zero
   * says a dry run ran and reached nothing, which carries a reason this dialog
   * then states. A surface that never asked has no reason to give, and
   * borrowing one would explain a limit that is not the limit it has.
   */
  previewedCount: number | null;
  /**
   * False when no variant of the target stage has a release Target at all —
   * none of them can ever publish, so "Promote and release" is not a real
   * second path, it is the same action as "Promote" with an extra step that
   * always no-ops. Hidden rather than shown disabled: a disabled button with
   * no explanation is the same refusal `AbortRolloutDialog`'s own rule
   * already bans elsewhere in this dialog.
   */
  canRelease: boolean;
  /**
   * Set when a gate holds this stage, in the server's own words where the dry
   * run has reported them. The dialog then explains the hold and offers no
   * action: a held promote is refused with 409, so a control here would name a
   * route that does not exist.
   */
  blockedReason: string | null;
  /**
   * Why the action is refused outright — anything other than a gate that
   * stopped the dry run, such as a selection the server will not accept.
   * Surfaced as a stated reason, never as a disabled button with no
   * explanation.
   */
  refusedReason: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (options: { release: boolean }) => void;
}

export function PromoteDialog({
  open,
  stageName,
  targetCount,
  previewedCount,
  canRelease,
  blockedReason,
  refusedReason,
  busy,
  onCancel,
  onConfirm,
}: PromoteDialogProps) {
  const held = blockedReason !== null;
  // Nothing is confirmable when the stage is held or the action is refused
  // outright, so the actions below are not rendered at all in either case.
  const actionable = !held && refusedReason === null;
  // Only a surface that previewed can be short of a complete preview.
  const coverageIncomplete = previewedCount !== null && previewedCount < targetCount;

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      fullWidth
      aria-labelledby="promote-title"
      sx={{ '& .MuiDialog-paper': { maxWidth: '840px' } }}
    >
      <DialogTitle id="promote-title" sx={{ fontSize: rolloutType.size.heading }}>
        Promote to {stageName}
      </DialogTitle>
      {/*
        MUI zeroes `DialogContent`'s own top padding whenever it directly
        follows a `DialogTitle` (`.MuiDialogTitle-root + .MuiDialogContent-root`,
        baked into `DialogContent.js` itself) — it wins over the theme's
        `padding: '20px'` default for that one edge, so the body sits flush
        against the title's border. Restored here rather than in the theme,
        which every other Dialog in the app also depends on.
      */}
      <DialogContent sx={{ paddingTop: '20px' }}>
        {refusedReason !== null ? (
          <Box sx={{ fontSize: rolloutType.size.prose, color: rolloutInk.default }}>{refusedReason}</Box>
        ) : (
          <>
            <Box sx={{ fontSize: rolloutType.size.prose, color: rolloutInk.default }}>
              {/*
                The count is the number of variants written into, stated as
                itself. `coverageIncomplete` below is the honesty clause: where
                the preview reached fewer variants than the promote will write
                to, saying "N variants" alone would present a partial reading as
                a complete one.
              */}
              Promoting writes this change into {targetCount}{' '}
              {targetCount === 1 ? 'variant' : 'variants'} of {stageName}.
            </Box>

            {coverageIncomplete ? (
              /*
                STATED, NOT WARNED ABOUT. A variant that takes from another
                variant of this promotion cannot be previewed until that one is
                promoted, so a short preview is the ordinary result of a chained
                rollout rather than a sign of trouble. Amber here would fire on
                the commonest topology the product has and teach a reader to
                skip the line that matters.

                It is still said, because the count above would otherwise read
                as a complete picture of what is about to be written.
              */
              <Box
                data-fidelity="coverage-incomplete"
                sx={{ fontSize: rolloutType.size.body, color: rolloutInk.muted, marginTop: '8px' }}
              >
                {rolloutCopy.previewReach(previewedCount ?? 0, targetCount)}
              </Box>
            ) : null}

            {blockedReason !== null ? (
              <Box
                data-held
                sx={{ fontSize: rolloutType.size.body, color: rolloutStatus.warn, marginTop: '10px' }}
              >
                A gate holds this stage: {blockedReason} {rolloutCopy.promoteHeld.dialogExplainer}
              </Box>
            ) : null}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} data-cancel>
          Cancel
        </Button>
        {actionable ? (
          <>
            {/*
              Both actions promote — this is a choice between two real paths,
              not a primary/secondary pair — so both take the same purple the
              Components view uses for its one primary action
              (`componentTheme.done`/`doneEmphasis`, the `bottomBarPrimaryButtonSx`
              treatment), replacing the ad hoc blue and MUI's `color="warning"`.

              Only when `canRelease` — a stage none of whose variants have a
              release Target offers one real path, not two.
            */}
            {canRelease ? (
              <Button
                onClick={() => onConfirm({ release: true })}
                disabled={busy}
                sx={{ color: componentTheme.done, fontWeight: 600, textTransform: 'none' }}
                data-promote-rel
              >
                Promote and release
              </Button>
            ) : null}
            <Button
              onClick={() => onConfirm({ release: false })}
              disabled={busy}
              variant="contained"
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                backgroundColor: componentTheme.done,
                color: componentTheme.fgOnEmphasis,
                '&:hover': { backgroundColor: componentTheme.doneEmphasis },
              }}
              data-confirm
            >
              Promote to {stageName}
            </Button>
          </>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
