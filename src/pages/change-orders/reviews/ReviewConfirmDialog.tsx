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
import { decisionTypes, gateThing, listText, reviewCopy, reviewFeeds, reviewSubject } from './reviewCopy';
import type { RequirementProgress, ReviewChoice, ReviewCoverage, ReviewDecision, ReviewGateRef, StageReviewSummary } from './changeOrderReviewTypes';

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
   * For the entry gate the review counts toward: the other gates (not reviews)
   * that still hold its stage, `[]` when none, `undefined` when unknown. "This
   * opens the gate" is said only for `[]` (M5).
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

/** The Units a decision of `type` covers that a gate needs, and those where it counts. */
function countingOf(summary: StageReviewSummary, type: string, cover: ReviewCoverage | undefined): { counting: number; needed: number } | undefined {
  if (cover === undefined) return undefined;
  const reqs = requirementsOfType(summary, type);
  const authorsCount = reqs.length > 0 && reqs.every((r) => r.rules.allowAuthors);
  const needed = cover.covered.filter((row) => row.unchanged !== true);
  return { counting: needed.filter((row) => authorsCount || !row.authored).length, needed: needed.length };
}

/** What the review's gates hold, as the object of "This blocks …": "the gate to prod and the release in staging". */
function heldThings(summary: StageReviewSummary): string {
  return listText(reviewFeeds(summary).map(gateThing));
}

/** Whether a requirement is done once the viewer's approval is added: it was, or this approval is the last one needed. */
function doneAfter(requirement: RequirementProgress, mine: readonly RequirementProgress[]): boolean {
  if (requirement.satisfied) return true;
  if (requirement.rejected) return false;
  return mine.includes(requirement) && requirement.evaluated && requirement.need <= 1;
}

/** One line per gate the review counts toward: whether this approval opens it. */
function gateLines(summary: StageReviewSummary, mine: readonly RequirementProgress[], otherGatesHolding: string[] | undefined): string[] {
  return reviewFeeds(summary).map((gate: ReviewGateRef) => {
    const thing = gateThing(gate);
    const own = summary.requirements.filter((r) => r.gate.key === gate.key);
    if (!own.every((r) => doneAfter(r, mine))) {
      return own.some((r) => mine.includes(r) && !r.satisfied) ? copy.gateNotYet(thing) : copy.gateStaysClosed(thing);
    }
    if (gate.kind === 'final') return copy.gateSignOff;
    if (gate.kind === 'release') return copy.gateOpens(thing);
    if (otherGatesHolding === undefined) return copy.gateUnknown(thing);
    if (otherGatesHolding.length > 0) return copy.gateOthersHold(thing, otherGatesHolding);
    return copy.gateOpens(thing);
  });
}

/** What the decision does: a line about the requirements, then one about each gate. */
function effectLines(
  result: ReviewChoice,
  summary: StageReviewSummary,
  types: string[],
  replaces: ReviewDecision[],
  otherGatesHolding: string[] | undefined,
  coverageByType: Record<string, ReviewCoverage>,
): { lead: string; gates: string[] } {
  const primary = summary.primary;
  const mine = types.flatMap((type) => requirementsOfType(summary, type));
  if (result === 'Fail') {
    // A rejection blocks only through a requirement that does not ignore rejections (S4).
    if (mine.length > 0 && mine.every((r) => r.rules.ignoreFail)) return { lead: copy.effectRecordedNotBlocking(mine.map((r) => r.name)), gates: [] };
    return { lead: copy.effectBlocks(heldThings(summary)), gates: [] };
  }
  if (replaces.some((d) => d.result === 'Pass')) return { lead: copy.effectReplaces, gates: [] };
  if (primary === undefined) return { lead: '', gates: [] };
  const rejecter = summary.requirements.filter((r) => !r.rules.ignoreFail).flatMap((r) => r.rejecters).find((p) => !p.isYou);
  if (rejecter !== undefined) return { lead: copy.effectStaysBlocked(heldThings(summary), rejecter.name), gates: [] };
  if (!primary.satisfied) {
    // Where the viewer wrote some of the Units, the approval cannot complete them: never say it does.
    const short = types
      .map((type) => countingOf(summary, type, coverageByType[type]))
      .find((c) => c !== undefined && c.needed > 0 && c.counting < c.needed);
    if (short !== undefined) return { lead: copy.effectPartlyCounts(short.counting, short.needed), gates: [] };
  }
  let lead: string = copy.effectSatisfied;
  if (!primary.satisfied) lead = primary.need > 1 ? copy.effectMoves(primary.name, primary.passes + 1, primary.rules.required) : copy.effectCompletes(primary.name);
  return { lead, gates: gateLines(summary, mine, otherGatesHolding) };
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

/** "staging: staging-eu, staging-us": the stage reviewed and its Spaces, or the own Space alone. */
function reviewsText(summary: StageReviewSummary): string {
  const subject = reviewSubject(summary);
  return copy.reviewsValue(subject.name, summary.gateSpaces.map((space) => space.spaceSlug).join(', '), subject.base);
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
  const effect = effectLines(result, summary, types, replaces, otherGatesHolding, coverageByType);
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
          // Only the Revisions a gate reads, and where the decision counts: as the submit button counts them.
          const counting = countingOf(summary, type, cover)?.counting;
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
          <Row term={copy.target}>{orderSlug}</Row>
          <Row term={copy.reviews}>{reviewsText(summary)}</Row>
          <Row term={copy.opens}>{heldThings(summary)}</Row>
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
          <WithMonoName text={effect.lead} names={summary.requirements.map((r) => r.name)} />
        </Box>
        {effect.gates.map((line) => (
          <Box
            key={line}
            component="p"
            data-testid="review-confirm-gate-effect"
            sx={{ margin: '6px 0 0', fontSize: changeOrderType.size.body, color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold, lineHeight: 1.5 }}
          >
            {line}
          </Box>
        ))}
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
