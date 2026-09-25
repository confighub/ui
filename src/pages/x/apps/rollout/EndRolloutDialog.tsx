// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The confirm dialog for ending a rollout, in either of the two ways it can be
 * ended.
 *
 * ONE DIALOG, TWO INTENTS, AND THE DIFFERENCE IS STATED IN WORDS. "Roll back"
 * and "Abort" both set `AbortedReason`; only the first goes on to take the
 * change back out of the Spaces that hold it. A reader cannot be expected to
 * know that from a label, so the lead sentence, the consequence list and the
 * heading over the Space list all change with the intent — and the Space list
 * itself is shown under BOTH, because "these are the Spaces it comes out of"
 * and "these are the Spaces it stays in" is the whole of the choice.
 *
 * WHY A PLAIN CONFIRM AND NOT A TYPED-NAME GATE. The reason field is already a
 * required, validated, deliberate act of typing, and stacking a second one
 * teaches the reader to type past both. The consequences are made prominent
 * instead.
 *
 * The reason field is single-line (no `multiline`) on purpose: newlines are
 * illegal in `AbortedReason` (`ValidateChangeOrderAbortedReason`), so the
 * control simply does not offer the keystroke that would produce one.
 *
 * The Confirm button is never `disabled` for an unmet precondition — an empty
 * or invalid reason produces the inline error on press, not a dead button. It
 * IS disabled while `busy`, which is a different thing entirely.
 *
 * AFTER THE RUN THE DIALOG STAYS OPEN. A rollback is N requests that can land
 * differently, and closing on the last one would take the per-Space account
 * away with it. See `RollbackReport`.
 */

import { useEffect, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';

import { componentTheme } from '../componentTheme';
import { rolloutCopy } from './rolloutCopy';
import { ABORTED_REASON_MAX_LENGTH, validateAbortReason } from './rolloutAbort';
import type {
  RollbackReport,
  RollbackScope,
  RolloutEndIntent,
  SpaceOutcome,
} from './rolloutRollback';

export interface EndRolloutSpace {
  spaceId: string;
  /** The Space's slug, or its id when no slug could be resolved. */
  label: string;
}

export interface EndRolloutDialogProps {
  open: boolean;
  intent: RolloutEndIntent;
  changeOrderName: string;
  /** Which Spaces still hold the change, and whether that could be determined. */
  scope: RollbackScope;
  /** Those Spaces with display labels, in the order the rollback will walk them. */
  spaces: EndRolloutSpace[];
  busy: boolean;
  /** Per-Space progress. `null` until a rollback has started; always `null` for abort-only. */
  outcomes: SpaceOutcome[] | null;
  /** The completed run's verdict, or `null`. */
  report: RollbackReport | null;
  onCancel: () => void;
  /** Resolves to an error message to show, or `null` when the caller is satisfied. */
  onConfirm: (reason: string) => Promise<string | null>;
  onRetry: () => void;
}

function errorMessage(error: ReturnType<typeof validateAbortReason>) {
  if (error === null) return null;
  switch (error.kind) {
    case 'required':
      return rolloutCopy.abort.errorRequired;
    case 'tooLong':
      return rolloutCopy.abort.errorTooLong;
    case 'edgeSpace':
      return rolloutCopy.abort.errorEdgeSpace;
    case 'illegalChar':
      return (
        <>
          {rolloutCopy.abort.errorIllegalCharBefore}
          <span
            style={{
              fontFamily: componentTheme.fontMono,
              background: componentTheme.dangerMuted,
              borderRadius: 3,
              padding: '0 4px',
            }}
          >
            {error.char}
          </span>
          {rolloutCopy.abort.errorIllegalCharAfter}
        </>
      );
    default:
      return null;
  }
}

function phaseLabel(outcome: SpaceOutcome): string {
  switch (outcome.phase) {
    case 'running':
      return rolloutCopy.endRollout.phaseRunning;
    case 'done':
      return rolloutCopy.endRollout.phaseDone(outcome.restoredUnits);
    case 'skipped':
      return rolloutCopy.endRollout.phaseSkipped;
    case 'failed':
      return outcome.message;
    default:
      return rolloutCopy.endRollout.phasePending;
  }
}

const PHASE_COLOR: Record<SpaceOutcome['phase'], string> = {
  pending: componentTheme.fgSubtle,
  running: componentTheme.fgMuted,
  done: componentTheme.successEmphasis,
  skipped: componentTheme.fgSubtle,
  failed: componentTheme.dangerEmphasis,
};

export function EndRolloutDialog({
  open,
  intent,
  changeOrderName,
  scope,
  spaces,
  busy,
  outcomes,
  report,
  onCancel,
  onConfirm,
  onRetry,
}: EndRolloutDialogProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The dialog stays mounted across opens (its parent's own state, not
  // Dialog's), so its own field state has to be reset explicitly each time it
  // reopens rather than relying on remount.
  useEffect(() => {
    if (open) {
      setReason('');
      setSubmitted(false);
      setSubmitError(null);
    }
  }, [open, intent]);

  const rollingBack = intent === 'roll-back';
  const copy = rolloutCopy.endRollout;
  const error = validateAbortReason(reason, submitted);
  const consequences = rollingBack ? copy.rollBackConsequences : copy.abortConsequences;

  const handleConfirm = async () => {
    setSubmitted(true);
    if (validateAbortReason(reason, true) !== null) return;
    setSubmitError(null);
    setSubmitError(await onConfirm(reason));
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      data-testid="rollout-end-dialog"
      data-intent={intent}
    >
      <DialogTitle>{rollingBack ? copy.rollBackTitle : copy.abortTitle}</DialogTitle>
      <DialogContent>
        <DialogContentText component="div" data-testid="rollout-end-lead">
          <span style={{ fontFamily: componentTheme.fontMono }}>{changeOrderName}</span>
          {' — '}
          {rollingBack ? copy.rollBackLead : copy.abortLead}
        </DialogContentText>

        {/*
          The consequences are the point of this dialog. Rendered as a bordered,
          tinted block rather than a paragraph of body text so they are read
          rather than skimmed past on the way to the button.
        */}
        <Box
          data-testid="rollout-end-consequences"
          sx={{
            mt: 2,
            p: 1.5,
            borderRadius: `${componentTheme.radiusSm}px`,
            border: `1px solid ${rollingBack ? componentTheme.dangerEdge : componentTheme.borderDefault}`,
            background: rollingBack ? componentTheme.dangerMuted : componentTheme.bgSubtle,
          }}
        >
          <Box sx={{ fontSize: 12, fontWeight: 700, mb: 0.75 }}>{copy.consequencesTitle}</Box>
          <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: 12.5, lineHeight: 1.55 }}>
            {consequences.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </Box>
        </Box>

        {/*
          THE SCOPE, BEFORE THE COMMITMENT. No per-Space picker: a demote covers
          the Spaces carrying the start tag and nothing else, so there is no
          choice to offer — but there is a fact to state, and stating it after
          the write would be stating it too late.
        */}
        <Box sx={{ mt: 2 }} data-testid="rollout-end-spaces">
          {scope.kind === 'unavailable' ? (
            <Box sx={{ fontSize: 12.5, color: componentTheme.dangerEmphasis }}>
              {copy.scopeUnavailable}
            </Box>
          ) : scope.kind === 'none' ? (
            <Box sx={{ fontSize: 12.5, color: componentTheme.fgMuted }}>{copy.scopeNone}</Box>
          ) : (
            <>
              <Box sx={{ fontSize: 12, fontWeight: 700, mb: 0.75 }}>
                {rollingBack
                  ? copy.spacesTitleRollBack(spaces.length)
                  : copy.spacesTitleAbort(spaces.length)}
              </Box>
              <Box component="ul" sx={{ m: 0, pl: 0, listStyle: 'none' }}>
                {spaces.map((space) => {
                  const outcome = outcomes?.find((o) => o.spaceId === space.spaceId);
                  return (
                    <Box
                      component="li"
                      key={space.spaceId}
                      data-testid="rollout-end-space-row"
                      data-space={space.label}
                      data-phase={outcome?.phase ?? 'listed'}
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 2,
                        py: 0.35,
                        fontSize: 12.5,
                        borderBottom: `1px solid ${componentTheme.borderSubtle}`,
                      }}
                    >
                      <Box sx={{ fontFamily: componentTheme.fontMono }}>{space.label}</Box>
                      {outcome !== undefined && (
                        <Box sx={{ color: PHASE_COLOR[outcome.phase], textAlign: 'right' }}>
                          {phaseLabel(outcome)}
                        </Box>
                      )}
                    </Box>
                  );
                })}
              </Box>
              <Box sx={{ mt: 0.75, fontSize: 11, color: componentTheme.fgSubtle }}>
                {copy.spacesNote}
              </Box>
            </>
          )}
        </Box>

        {outcomes === null && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ mb: 0.5, fontSize: 13 }}>
              {rolloutCopy.abort.reasonLabel}
              {' '}
              <span style={{ color: componentTheme.dangerEmphasis, fontWeight: 700 }}>*</span>
            </Box>
            <TextField
              size="small"
              fullWidth
              autoFocus
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setSubmitError(null);
              }}
              placeholder={rolloutCopy.abort.reasonPlaceholder}
              error={error !== null}
              inputProps={{
                'data-testid': 'rollout-end-reason-input',
                maxLength: ABORTED_REASON_MAX_LENGTH,
              }}
            />
            <Box
              sx={{
                mt: 0.5,
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
              }}
            >
              <Box
                data-testid={error !== null ? 'rollout-end-reason-error' : undefined}
                sx={{
                  fontSize: 11,
                  color: error !== null ? componentTheme.dangerEmphasis : componentTheme.fgSubtle,
                  fontWeight: error !== null ? 600 : 400,
                }}
              >
                {error !== null ? errorMessage(error) : rolloutCopy.abort.reasonHelp}
              </Box>
              <Box
                data-testid="rollout-end-reason-count"
                sx={{
                  fontFamily: componentTheme.fontMono,
                  fontSize: 11,
                  color: componentTheme.fgSubtle,
                  whiteSpace: 'nowrap',
                }}
              >
                {rolloutCopy.abort.reasonCount(reason.length)}
              </Box>
            </Box>
          </Box>
        )}

        {/*
          THE HONEST ACCOUNT OF A PARTLY-LANDED ROLLBACK. `report.ok` is false
          whenever any Space's bulk PATCH carried a per-entry error — a 207 —
          and `report.stranded` says whether anything was nonetheless restored,
          which is what decides whether the rollout can still be put back on its
          way. Two different sentences, because they are two different states.
        */}
        {report !== null && !report.ok && (
          <Box
            data-testid="rollout-end-stranded"
            sx={{ mt: 2, fontSize: 12.5, color: componentTheme.dangerEmphasis, lineHeight: 1.55 }}
          >
            {report.stranded ? copy.strandedAdvice : copy.abortedNotRolledBackAdvice}
          </Box>
        )}
        {report !== null && report.ok && (
          <Box
            data-testid="rollout-end-succeeded"
            sx={{ mt: 2, fontSize: 12.5, color: componentTheme.successEmphasis }}
          >
            {copy.succeeded(outcomes?.filter((o) => o.phase === 'done').length ?? 0)}
          </Box>
        )}

        {submitError !== null && (
          <Box
            data-testid="rollout-end-submit-error"
            sx={{ mt: 1.5, fontSize: 12.5, color: componentTheme.dangerEmphasis }}
          >
            {submitError}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} size="small">
          {report === null ? rolloutCopy.abort.cancel : rolloutCopy.abort.close}
        </Button>
        {report !== null && !report.ok && (
          <Button
            onClick={onRetry}
            color="error"
            variant="outlined"
            size="small"
            disabled={busy}
            data-testid="rollout-end-retry"
          >
            {copy.retry}
          </Button>
        )}
        {outcomes === null && (
          <Button
            onClick={handleConfirm}
            color="error"
            variant={rollingBack ? 'contained' : 'outlined'}
            size="small"
            disabled={busy}
            data-testid="rollout-end-confirm"
          >
            {rollingBack ? copy.rollBackConfirm : copy.abortConfirm}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
