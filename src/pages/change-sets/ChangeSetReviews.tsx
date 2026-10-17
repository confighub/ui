// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The reviews of a ChangeSet: every decision, newest first; the viewer's own
 * decision; and whose review was requested.
 *
 * A decision approves or rejects the change as it stood when it was made. One made
 * before the latest change in the ChangeSet says so, and is not counted as an
 * approval of the change as it is now. Nothing here holds the ChangeSet: the
 * reviews are information for whoever closes it.
 */

import { useRef, useState } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import CheckIcon from '@mui/icons-material/Check';
import BlockIcon from '@mui/icons-material/Block';

import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderType } from '../change-orders/changeOrdersTokens';
import { ReviewDecisionForm } from '../change-orders/reviews/ReviewDecisionForm';
import { ReviewRequestsSection } from '../change-orders/reviews/ReviewRequestsSection';
import { reviewTextButtonSx } from '../change-orders/reviews/reviewButtons';
import { agoText, reviewCopy, reviewTime } from '../change-orders/reviews/reviewCopy';
import { Monogram, ReviewChip, ReviewTag, SectionLabel } from '../change-orders/reviews/reviewParts';
import type { ReviewChoice } from '../change-orders/reviews/changeOrderReviewTypes';
import { reviewStatusText, type ChangeSetDecision } from './changeSetReviewModel';
import type { UseChangeSetReviewsResult } from './useChangeSetReviews';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function DecisionChip({ decision }: { decision: ChangeSetDecision }) {
  if (decision.revokedAt !== undefined) return <ReviewChip tone="idle">{reviewCopy.decision.revoked}</ReviewChip>;
  if (decision.result === 'Pass') {
    return (
      <ReviewChip tone="ok">
        <CheckIcon aria-hidden="true" />
        {reviewCopy.decision.approved}
      </ReviewChip>
    );
  }
  return (
    <ReviewChip tone="bad">
      <BlockIcon aria-hidden="true" />
      {reviewCopy.decision.rejected}
    </ReviewChip>
  );
}

/** Why a decision does not count as a review of the change as it is now, or nothing when it does. */
function standingText(decision: ChangeSetDecision): string | undefined {
  if (decision.revokedAt !== undefined) {
    const by = decision.revokedBy !== undefined && decision.revokedBy.userId !== decision.person.userId ? ` by ${decision.revokedBy.name}` : '';
    return `Withdrawn ${reviewTime(decision.revokedAt)}${by}.`;
  }
  if (decision.supersededBy !== undefined) return `Replaced by a later decision of ${decision.person.name}.`;
  if (!decision.current) return 'Out of date: the ChangeSet changed after it was made.';
  return undefined;
}

function DecisionRow({
  decision,
  now,
  onWithdraw,
  busy,
}: {
  decision: ChangeSetDecision;
  now: number;
  onWithdraw?: () => void;
  busy: boolean;
}) {
  const live = decision.revokedAt === undefined && decision.supersededBy === undefined;
  const standing = standingText(decision);
  return (
    <Box
      component="li"
      data-testid="change-set-decision"
      data-result={decision.result}
      data-current={decision.current && live ? 'true' : 'false'}
      sx={{
        display: 'grid',
        gridTemplateColumns: '22px minmax(0,1fr) auto',
        gap: '8px',
        alignItems: 'start',
        padding: '8px 0',
        borderTop: `1px solid ${changeOrderBorder.default}`,
        '&:first-of-type': { borderTop: 'none' },
        opacity: live ? 1 : 0.6,
      }}
    >
      <Monogram initials={decision.person.initials} tone={live && decision.current ? (decision.result === 'Pass' ? 'ok' : 'bad') : 'idle'} />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '7px', fontSize: changeOrderType.size.body }}>
          {decision.person.name}
          {decision.person.isYou ? reviewCopy.decision.you : ''}
          <DecisionChip decision={decision} />
          {live && !decision.current ? <ReviewTag tone="warn">Out of date</ReviewTag> : null}
          <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
            {agoText(decision.createdAt, now)}
          </Box>
        </Box>
        {decision.note.trim() !== '' ? (
          <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginTop: '2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {decision.note}
          </Box>
        ) : null}
        {standing !== undefined ? (
          <Box data-testid="change-set-decision-standing" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle, marginTop: '2px' }}>
            {standing}
          </Box>
        ) : null}
      </Box>
      {onWithdraw !== undefined ? (
        <Box
          component="button"
          type="button"
          disabled={busy}
          onClick={onWithdraw}
          data-testid="change-set-decision-withdraw"
          sx={{ ...reviewTextButtonSx, fontSize: changeOrderType.size.small }}
        >
          Withdraw
        </Box>
      ) : null}
    </Box>
  );
}

interface PendingDecision {
  result: ReviewChoice;
  note: string;
}

function ConfirmDecisionDialog({
  pending,
  changeSetSlug,
  unitCount,
  spaceCount,
  open,
  error,
  submitting,
  onCancel,
  onConfirm,
}: {
  pending: PendingDecision;
  changeSetSlug: string;
  unitCount: number;
  spaceCount: number;
  open: boolean;
  error?: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const pass = pending.result === 'Pass';
  return (
    <Dialog open={open} onClose={submitting ? undefined : onCancel} maxWidth="xs" fullWidth data-testid="change-set-decision-confirm">
      <DialogTitle sx={{ fontSize: 16 }}>{pass ? reviewCopy.confirm.titleApprove : reviewCopy.confirm.titleReject}</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: changeOrderType.size.prose, marginBottom: '8px' }}>
          {pass ? 'Approve' : 'Reject'} the change in ChangeSet <b>{changeSetSlug}</b> as it stands now: {plural(unitCount, 'Unit')}
          {spaceCount > 1 ? ` in ${plural(spaceCount, 'Space')}` : ''}.
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
          A later change in the ChangeSet leaves this decision out of date.
        </Box>
        {error !== undefined ? (
          <Box role="alert" sx={{ marginTop: '10px', fontSize: changeOrderType.size.body, color: changeOrderStatus.danger, whiteSpace: 'pre-wrap' }}>
            {error}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="outlined" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          color={pass ? 'primary' : 'error'}
          disabled={submitting}
          onClick={onConfirm}
          data-testid="change-set-decision-confirm-button"
        >
          {submitting ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : pass ? reviewCopy.confirm.pass : reviewCopy.confirm.fail}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ChangeSetReviews({
  reviews,
  changeSetSlug,
  unitCount,
  spaceCount,
  onNotice,
}: {
  reviews: UseChangeSetReviewsResult;
  changeSetSlug: string;
  /** The Units the ChangeSet changed, which a decision covers. */
  unitCount: number;
  spaceCount: number;
  onNotice: (message: string) => void;
}) {
  const { summary } = reviews;
  const now = Date.now();
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // The form remounts after a decision is recorded, so it starts empty again.
  const [formKey, setFormKey] = useState(0);
  const submitRef = useRef<HTMLButtonElement>(null);

  const confirm = async () => {
    if (pending === null) return;
    setSubmitting(true);
    const outcome = await reviews.record(pending.result, pending.note);
    setSubmitting(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onNotice(pending.result === 'Pass' ? 'Your approval was recorded.' : 'Your rejection was recorded.');
    setPending(null);
    setError(undefined);
    setFormKey((k) => k + 1);
  };

  const withdraw = async (decision: ChangeSetDecision) => {
    setBusy(true);
    const outcome = await reviews.withdraw(decision);
    setBusy(false);
    onNotice(outcome.ok ? 'Your decision was withdrawn.' : outcome.message);
  };

  return (
    <Box data-testid="change-set-reviews" sx={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(280px,1fr)', gap: '28px' }}>
      <Box sx={{ minWidth: 0 }}>
        <SectionLabel right={<span data-testid="change-set-review-status">{reviewStatusText(summary)}</span>}>Decisions</SectionLabel>
        {summary.decisions.length === 0 ? (
          <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>{reviewCopy.decision.none}</Box>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {summary.decisions.map((decision) => (
              <DecisionRow
                key={decision.id}
                decision={decision}
                now={now}
                busy={busy}
                onWithdraw={
                  decision.person.isYou && decision.revokedAt === undefined && decision.supersededBy === undefined
                    ? () => void withdraw(decision)
                    : undefined
                }
              />
            ))}
          </Box>
        )}
        <Box sx={{ marginTop: '18px' }}>
          <SectionLabel>{reviewCopy.requests.label}</SectionLabel>
          <ReviewRequestsSection
            requests={summary.requests}
            candidates={reviews.candidates}
            canRequest={reviews.canRequest}
            now={now}
            onRequest={reviews.requestReview}
            onWithdraw={reviews.withdrawRequest}
            onNotice={onNotice}
            hideLabel
          />
        </Box>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <SectionLabel>{reviewCopy.form.groupLabel}</SectionLabel>
        {unitCount === 0 ? (
          <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.subtle }}>
            Nothing to review yet: no Unit has changed in this ChangeSet.
          </Box>
        ) : (
          <>
            {summary.viewerDecision !== undefined ? (
              <Box data-testid="change-set-own-decision" sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '8px' }}>
                You {summary.viewerDecision.result === 'Pass' ? 'approved' : 'rejected'}{' '}
                {summary.viewerDecision.current ? 'the change as it stands' : 'an earlier state of the change'}. A new decision replaces it.
              </Box>
            ) : null}
            {summary.viewerIsAuthor ? (
              <Box data-testid="change-set-self-review" sx={{ fontSize: changeOrderType.size.body, color: changeOrderStatus.warn, marginBottom: '8px' }}>
                You made changes in this ChangeSet, so your review would be of your own work.
              </Box>
            ) : null}
            <ReviewDecisionForm
              key={formKey}
              stageName={`ChangeSet ${changeSetSlug}`}
              subjectNoun="ChangeSet"
              submitRef={submitRef}
              onSubmit={(values) => {
                setError(undefined);
                setPending({ result: values.result, note: values.note });
              }}
            />
          </>
        )}
      </Box>
      {pending !== null ? (
        <ConfirmDecisionDialog
          open
          pending={pending}
          changeSetSlug={changeSetSlug}
          unitCount={unitCount}
          spaceCount={spaceCount}
          error={error}
          submitting={submitting}
          onCancel={() => {
            setPending(null);
            setError(undefined);
            submitRef.current?.focus();
          }}
          onConfirm={() => void confirm()}
        />
      ) : null}
    </Box>
  );
}
