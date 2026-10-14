// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The confirm step before an approval or a rejection is recorded.
 *
 * It states exactly what is written: the Attestation type and result, the
 * requirements it counts toward, the ChangeOrder and target, what it covers,
 * the decision it revokes (when the viewer changes their decision), how long
 * it stays valid, the reason, and the effect on the stage. Attestations cannot
 * be edited, so this is the last point to stop.
 *
 * The confirm button has the initial focus. MUI gives focus back to the
 * element that opened the dialog (the submit button) when it closes.
 */

import { useRef, type ReactNode } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

import { changeOrderBorder, changeOrderFontMono, changeOrderFontSans, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewDangerButtonSx, reviewQuietButtonSx } from './reviewButtons';
import { decisionTypes, reviewCopy } from './reviewCopy';
import type { RequirementProgress, ReviewChoice, ReviewCoverage, ReviewDecision, StageReviewSummary } from './changeOrderReviewTypes';

const copy = reviewCopy.confirm;

export interface ReviewConfirmError {
  stage: 'revoke' | 'record' | 'nothingRecorded';
  message: string;
  revokedSpaceSlugs: string[];
  /** The Types recorded before a later Type failed (S1). */
  recordedTypes: string[];
  spaceErrors: { spaceSlug: string; message: string }[];
}

interface ReviewConfirmDialogProps {
  open: boolean;
  result: ReviewChoice;
  note: string;
  summary: StageReviewSummary;
  /** What a decision of each Type covers, from its dry run. */
  coverageByType: Record<string, ReviewCoverage>;
  orderSlug: string;
  /** The viewer's live decisions that this one replaces, one per Type. */
  replaces: ReviewDecision[];
  /**
   * For an entry gate: the other gates (not reviews) that still hold the stage,
   * `[]` when none, `undefined` when unknown. "Promote becomes available" is
   * said only for `[]` (M5).
   */
  otherGatesHolding?: string[];
  submitting: boolean;
  error?: ReviewConfirmError;
  onCancel: () => void;
  onConfirm: () => void;
}

/** The requirements of `type` that a decision from the viewer counts toward. */
function requirementsOfType(summary: StageReviewSummary, type: string): RequirementProgress[] {
  return summary.requirements.filter(
    (r) =>
      r.rules.type === type &&
      (r.viewer.kind === 'counts' || r.viewer.kind === 'partial' || (r.viewer.kind === 'notEvaluated' && r.viewer.mayDecide)),
  );
}

/** What the gate holds, as the object of "This blocks …". */
function heldThing(summary: StageReviewSummary): string {
  if (summary.gate.kind === 'release') return `the release in ${summary.gate.stageName}`;
  if (summary.gate.kind === 'final') return 'the sign-off';
  return summary.gate.stageName;
}

function effectSentence(
  result: ReviewChoice,
  summary: StageReviewSummary,
  types: string[],
  replaces: ReviewDecision[],
  otherGatesHolding: string[] | undefined,
): string {
  const stage = summary.gate.stageName;
  const primary = summary.primary;
  const mine = types.flatMap((type) => requirementsOfType(summary, type));
  if (result === 'Fail') {
    // A rejection blocks only through a requirement that does not ignore rejections (S4).
    if (mine.length > 0 && mine.every((r) => r.rules.ignoreFail)) return copy.effectRecordedNotBlocking(mine.map((r) => r.name));
    return copy.effectBlocks(heldThing(summary));
  }
  if (replaces.some((d) => d.result === 'Pass')) return copy.effectReplaces;
  if (primary === undefined) return '';
  const rejecter = summary.requirements.filter((r) => !r.rules.ignoreFail).flatMap((r) => r.rejecters).find((p) => !p.isYou);
  if (rejecter !== undefined) return copy.effectStaysBlocked(heldThing(summary), rejecter.name);
  if (primary.satisfied) return copy.effectSatisfied;
  if (primary.need > 1) return copy.effectMoves(primary.name, primary.passes + 1, primary.rules.required);
  const othersOpen = summary.requirements.every((r) => r.name === primary.name || r.satisfied);
  if (!othersOpen) return copy.effectCompletesOnly(primary.name);
  if (summary.gate.kind === 'release') return copy.effectReleaseOpens(primary.name, stage);
  if (summary.gate.kind === 'final') return copy.effectSignOff(primary.name);
  if (otherGatesHolding === undefined) return copy.effectCompletesUnknown(primary.name);
  if (otherGatesHolding.length > 0) return copy.effectReviewsCompleteOthers(primary.name, otherGatesHolding);
  return copy.effectCompletes(primary.name, stage);
}

/**
 * "security-review for 72h", one per requirement of the Type (S3). The server
 * stamps the real ValidUntil when it records the decision; the dialog only
 * names each requirement's MaxAge, and computes no time.
 */
function validUntilText(requirements: RequirementProgress[]): string {
  const parts = requirements.map((r) => (r.rules.maxAge === undefined ? `${r.name} ${copy.noLimit}` : `${r.name} ${copy.validFor(r.rules.maxAge)}`));
  return parts.length === 0 ? copy.noLimit : parts.join(', ');
}

/** "ChangeOrder → stage", or the release or sign-off it is for. */
function targetText(summary: StageReviewSummary, orderSlug: string): string {
  if (summary.gate.kind === 'release') return `${orderSlug}, release in ${summary.gate.stageName}`;
  if (summary.gate.kind === 'final') return `${orderSlug}, sign-off`;
  return `${orderSlug} → ${summary.gate.stageName}`;
}

/** `text` with each requirement name in it set in the mono face. */
function WithMonoName({ text, names }: { text: string; names: string[] }) {
  const pattern = names.filter((n) => n !== '').map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (pattern.length === 0) return <>{text}</>;
  const parts = text.split(new RegExp(`(${pattern.join('|')})`));
  return (
    <>
      {parts.map((part, i) =>
        names.includes(part) ? (
          <Box key={i} component="span" sx={{ fontFamily: changeOrderFontMono }}>
            {part}
          </Box>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px', fontSize: changeOrderType.size.body }}>
      <Box component="dt" sx={{ color: changeOrderInk.subtle }}>
        {term}
      </Box>
      <Box component="dd" sx={{ margin: 0, fontFamily: changeOrderFontMono, textAlign: 'right', overflowWrap: 'anywhere' }}>
        {children}
      </Box>
    </Box>
  );
}

export function ReviewConfirmDialog({
  open,
  result,
  note,
  summary,
  coverageByType,
  orderSlug,
  replaces,
  otherGatesHolding,
  submitting,
  error,
  onCancel,
  onConfirm,
}: ReviewConfirmDialogProps) {
  const pass = result === 'Pass';
  const confirmRef = useRef<HTMLButtonElement>(null);
  const types = decisionTypes(summary);
  let title: string = pass ? copy.titleApprove : copy.titleReject;
  if (replaces.length > 0) title = copy.titleReplace;
  const tone = pass ? changeOrderStatus.success : changeOrderStatus.danger;

  let errorText: string | undefined;
  if (error?.stage === 'revoke') errorText = `${copy.revokeFailed(error.revokedSpaceSlugs)} ${error.message}`;
  else if (error?.stage === 'nothingRecorded') errorText = copy.nothingRecorded;
  else if (error !== undefined && error.recordedTypes.length > 0) errorText = `${copy.partlyRecorded(error.recordedTypes)} ${error.message}`;
  else if (error !== undefined && error.revokedSpaceSlugs.length > 0) errorText = `${copy.recordFailedAfterRevoke} ${error.message}`;
  else if (error !== undefined) errorText = error.message;
  let confirmLabel: string = pass ? copy.approve : copy.reject;
  if (error !== undefined) confirmLabel = copy.retry;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onCancel}
      aria-labelledby="review-confirm-title"
      data-testid="review-confirm"
      data-review-result={result}
      slotProps={{
        // The confirm button takes focus once the dialog is in: the focus trap moves focus to the
        // dialog itself on open, which wins over `autoFocus`.
        transition: { onEntered: () => confirmRef.current?.focus() },
        paper: {
          sx: {
            width: 'min(460px, calc(100vw - 32px))',
            margin: '16px',
            fontFamily: changeOrderFontSans,
            color: changeOrderInk.default,
            // The tone edge on top, 3px; the theme's 1px border on the other sides.
            border: `1px solid ${pass ? changeOrderBorder.default : changeOrderStatus.dangerLine}`,
            borderTop: `3px solid ${tone}`,
          },
        },
      }}
    >
      <DialogTitle
        id="review-confirm-title"
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '16px 18px 0',
          // No divider: the design separates the title by space alone.
          borderBottom: 0,
          fontFamily: 'inherit',
          fontSize: changeOrderType.size.lead,
          fontWeight: changeOrderType.weight.strong,
        }}
      >
        {title}
        <IconButton size="small" aria-label="Close" onClick={onCancel} disabled={submitting}>
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ padding: '0 18px', fontFamily: 'inherit' }}>
        {/* One block per Attestation Type: each is its own /attest call and its own record (S1). */}
        {types.map((type) => {
          const reqs = requirementsOfType(summary, type);
          const cover = coverageByType[type];
          const counting = cover?.covered.filter((row) => !row.authored).length;
          return (
            <Box
              key={type}
              component="dl"
              data-testid="review-confirm-type"
              data-type={type}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: '7px',
                margin: '14px 0 0',
                ...(types.length > 1
                  ? { padding: '8px 10px', border: `1px solid ${changeOrderBorder.default}`, borderRadius: `${changeOrderShape.radius.md}px` }
                  : {}),
              }}
            >
              <Row term={copy.attestation}>
                {copy.attestationValue(type)}
                <Box component="span" sx={{ color: tone, fontWeight: changeOrderType.weight.bold }}>
                  {pass ? copy.pass : copy.fail}
                </Box>
              </Row>
              <Row term={copy.requirement(reqs.length)}>{reqs.map((r) => r.name).join(', ')}</Row>
              <Row term={copy.covers}>{copy.coversValue(counting, cover?.spaceCount ?? summary.gateSpaces.length)}</Row>
              <Row term={copy.validUntil}>{validUntilText(reqs)}</Row>
            </Box>
          );
        })}
        <Box component="dl" sx={{ display: 'flex', flexDirection: 'column', gap: '7px', margin: '10px 0 0' }}>
          <Row term={copy.target}>{targetText(summary, orderSlug)}</Row>
          {replaces.map((d) => (
            <Row key={d.id} term={copy.revokes}>
              {copy.revokesValue(d)}
            </Row>
          ))}
        </Box>
        <Box
          sx={{
            margin: '12px 0 0',
            padding: '9px 11px',
            background: changeOrderSurface.sunk,
            border: `1px solid ${changeOrderBorder.default}`,
            borderRadius: `${changeOrderShape.radius.md}px`,
            fontSize: changeOrderType.size.body,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
            whiteSpace: 'pre-wrap',
          }}
        >
          <Box component="span" sx={{ display: 'block', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, marginBottom: '3px' }}>
            {copy.reason}
          </Box>
          {note}
        </Box>
        <Box component="p" data-testid="review-confirm-effect" sx={{ margin: '12px 0 0', fontSize: changeOrderType.size.body, color: changeOrderInk.muted, lineHeight: 1.5 }}>
          <WithMonoName
            text={effectSentence(result, summary, types, replaces, otherGatesHolding)}
            names={summary.requirements.map((r) => r.name)}
          />
          {copy.cannotEdit}
        </Box>
        {errorText !== undefined ? (
          <Alert severity="error" sx={{ marginTop: '12px' }} data-testid="review-confirm-error">
            {errorText}
            {(error?.spaceErrors ?? []).map((e) => (
              <Box key={e.spaceSlug} sx={{ marginTop: '4px' }}>
                {e.spaceSlug}: {e.message}
              </Box>
            ))}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding: '16px 18px 18px', gap: '8px', borderTop: 0 }}>
        <Button variant="outlined" onClick={onCancel} disabled={submitting} sx={reviewQuietButtonSx}>
          {copy.cancel}
        </Button>
        <Button
          variant="outlined"
          disableElevation
          autoFocus
          ref={confirmRef}
          onClick={onConfirm}
          disabled={submitting}
          data-testid="review-confirm-submit"
          startIcon={submitting ? <CircularProgress size={12} color="inherit" /> : undefined}
          sx={pass ? reviewQuietButtonSx : reviewDangerButtonSx}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
