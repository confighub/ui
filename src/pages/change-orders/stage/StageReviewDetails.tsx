// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * "Review details", opened under the review line of the Stage log: the old Stage
 * facts sidebar's review row, set in the log (H7). Each requirement as the
 * existing ReviewRequirementList draws it, with which review it is ("to enter
 * Public" / "to release Public"), its reviewers, and where it was reviewed. Then
 * collapsing bars, closed by default, each with a count: what the viewer's
 * decision would cover (only when they may decide), who was asked to review, and
 * the decisions. A bar with nothing in it is not drawn. Then a link to this review.
 *
 * It scales to 50 Units in 50 Spaces: the reviewers and the Spaces show the first
 * few and then "and N more", and the coverage is folded by Space.
 */
import { useState } from 'react';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';

import { reviewInitials } from '../reviews/changeOrderReviews';
import { ReviewCoverageList } from '../reviews/ReviewCoverageList';
import { ReviewDecisionList } from '../reviews/ReviewDecisionList';
import { ReviewRequestsSection } from '../reviews/ReviewRequestsSection';
import { ReviewRequirementList, type RequirementRowSlots } from '../reviews/ReviewRequirementList';
import type { GateReviewSummary, RequirementProgress, ReviewDecision, ReviewPerson, UseGateReviewsResult } from '../reviews/changeOrderReviewTypes';
import { REVIEW_PANEL_ID } from '../reviews/reviewAnchor';
import { decisionTypes, epochOf, logTime, reviewCopy } from '../reviews/reviewCopy';
import { CollapsibleSection } from '../reviews/reviewParts';
import { PersonAvatar } from './RequestReviewPicker';
import { SpaceList, type StageLinks } from './StageBoxParts';
import { stageCardCopy } from './stageCardCopy';
import { decisionsSummary, detailsReviews, flowShowsForm, reviewAside, reviewerRows, reviewerStatusText } from './stageReviewModel';
import type { ReviewAside, ReviewerRow, ReviewViewerFlow } from './stageTypes';

const rowCopy = stageCardCopy.reviewRow;

function AsideIcon({ icon }: { icon: ReviewAside['icon'] }) {
  if (icon === 'ok') return <CheckCircleIcon aria-hidden sx={{ fontSize: 14, color: 'success.main', flex: 'none' }} />;
  if (icon === 'rejected') return <ErrorOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'error.main', flex: 'none' }} />;
  if (icon === 'notEvaluated') return <HelpOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled', flex: 'none' }} />;
  return <RadioButtonUncheckedIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled', flex: 'none' }} />;
}

/** What a reviewer did, with the time as the clock ("Approved 14:20"), as the log says times. */
function reviewerStatus(row: ReviewerRow, now: number): string {
  const when = logTime(row.decision?.createdAt, now);
  if (when === '' || (row.status !== 'approved' && row.status !== 'rejected')) return reviewerStatusText(row, now);
  return row.status === 'approved' ? reviewCopy.details.approvedAt(when) : reviewCopy.details.rejectedAt(when);
}

/** One reviewer, as the old sidebar row drew it: avatar, name, what they did. */
function Reviewer({ row, now }: { row: ReviewerRow; now: number }) {
  let tone = 'text.secondary';
  if (row.status === 'approved') tone = 'success.main';
  else if (row.status === 'rejected') tone = 'error.main';
  return (
    <Box component="li" data-testid="stage-reviewer" data-status={row.status} sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: '0 8px', alignItems: 'center' }}>
      <PersonAvatar person={row.person} />
      <Box component="span" sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block', fontSize: '12.5px', fontWeight: 500, lineHeight: 1.35, color: 'text.primary', overflowWrap: 'anywhere' }}>
          {row.person.name}
          {row.person.isYou ? (
            <Box component="small" sx={{ fontWeight: 400, color: 'text.secondary', fontSize: '11.5px' }}>
              {' (you)'}
            </Box>
          ) : null}
        </Box>
        <Box component="span" sx={{ display: 'block', fontSize: '11.5px', lineHeight: 1.4, color: tone }}>
          {reviewerStatus(row, now)}
        </Box>
      </Box>
    </Box>
  );
}

/** The reviewers of one requirement: the first 3, then "and N more". */
function Reviewers({ summary, requirement, now, viewer }: { summary: GateReviewSummary; requirement: RequirementProgress; now: number; viewer?: ReviewPerson }) {
  const [all, setAll] = useState(false);
  const rows = reviewerRows(summary, all ? Number.POSITIVE_INFINITY : undefined, requirement, viewer);
  if (rows.rows.length === 0) return null;
  return (
    <>
      <Box component="ul" aria-label="Reviewers" sx={{ listStyle: 'none', m: '8px 0 4px', p: 0, display: 'grid', gap: '6px' }}>
        {rows.rows.map((row) => (
          <Reviewer key={row.person.userId} row={row} now={now} />
        ))}
      </Box>
      {rows.more > 0 ? (
        <ButtonBase
          onClick={() => setAll(true)}
          sx={{ height: 26, px: '6px', ml: '-6px', borderRadius: 'var(--r-sm)', fontSize: '11.5px', fontWeight: 600, color: 'text.secondary', '&:hover': { bgcolor: 'var(--bg-hover)' }, '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
        >
          {rowCopy.andMore(rows.more)}
        </ButtonBase>
      ) : null}
    </>
  );
}

export interface StageReviewDetailsProps {
  /** The review the card hosts, whose form and coverage these are. */
  summary: GateReviewSummary;
  /** The stage's entry and release reviews, when it has them: both are listed, entry first. */
  entrySummary?: GateReviewSummary;
  releaseSummary?: GateReviewSummary;
  /** The promote is not done, so the release review is not reached yet. */
  releaseNotReached?: boolean;
  reviews: UseGateReviewsResult;
  flow: ReviewViewerFlow | undefined;
  stageName: string;
  now: number;
  links?: StageLinks;
  /** The page's toast. */
  onNotice: (message: string) => void;
}

export function StageReviewDetails({ summary, entrySummary, releaseSummary, releaseNotReached = false, reviews, flow, stageName, now, links, onNotice }: StageReviewDetailsProps) {
  // The entry and the release review, each once, entry first: the card hosts one of them.
  const { summaries, requirements, notReachedGateKeys } = detailsReviews(summary, entrySummary, releaseSummary, releaseNotReached);
  const summaryOf = (req: RequirementProgress): GateReviewSummary => summaries.find((s) => s.gate.key === req.gate.key) ?? summary;
  // The viewer is the one asked on the review whose form they have, though no rule names them.
  const { userInfo } = useUserInfo();
  const viewerName = userInfo?.DisplayName ?? '';
  const viewer: ReviewPerson | undefined =
    userInfo?.UserID === undefined || viewerName === '' ? undefined : { userId: userInfo.UserID, name: viewerName, initials: reviewInitials(viewerName), isYou: true };
  const gateLabelOfKind = (kind: string) => (kind === 'release' ? reviewCopy.requirements.toRelease(stageName) : reviewCopy.requirements.toEnter(stageName));

  // Newest first across both reviews; each says which review it is for when there are two.
  const kindByDecisionId = new Map<string, string>();
  for (const s of summaries) for (const d of s.decisions) if (!kindByDecisionId.has(d.id)) kindByDecisionId.set(d.id, s.gate.kind);
  const decisions = summaries
    .flatMap((s) => s.decisions)
    .filter((d, i, all) => all.findIndex((o) => o.id === d.id) === i)
    .sort((a, b) => (epochOf(b.createdAt) ?? 0) - (epochOf(a.createdAt) ?? 0));
  const gateLabelOf = (decision: ReviewDecision) => gateLabelOfKind(kindByDecisionId.get(decision.id) ?? summary.gate.kind);

  const types = decisionTypes(summary);
  const authorsCount = (type: string) => summary.requirements.filter((r) => r.rules.type === type).every((r) => r.rules.allowAuthors);
  const mayDecide = flow !== undefined && flowShowsForm(flow) && types.length > 0;
  const slots: RequirementRowSlots = {
    leading: (req) => <AsideIcon icon={notReachedGateKeys.includes(req.gate.key) ? 'open' : reviewAside(req).icon} />,
    gateLabel: (req) => {
      const which = gateLabelOfKind(req.gate.kind);
      // A settled or rejected one says who, instead of listing its reviewers.
      if (req.rejected && req.rejecters.length > 0) {
        const by = req.rejecters[0];
        return `${which} · by ${by.isYou ? 'you' : by.name}`;
      }
      return req.satisfied ? `${which} · ${reviewAside(req).text}` : which;
    },
    reviewers: (req) => {
      if (req.satisfied || req.rejected) return null;
      const own = summaryOf(req);
      const mayDecideHere = own.gate.key === summary.gate.key && mayDecide;
      return <Reviewers summary={own} requirement={req} now={now} {...(mayDecideHere && viewer !== undefined ? { viewer } : {})} />;
    },
    reviewedIn: (req) => {
      const spaces = summaryOf(req).gateSpaces.map((s) => ({ spaceId: s.spaceId, name: s.spaceSlug }));
      if (spaces.length === 0) return null;
      const i = requirements.indexOf(req);
      return (
        <Box data-testid={`review-requirement-${i + 1}-reviewed-in`} sx={{ mt: '6px', fontSize: '11.5px', color: 'text.secondary', overflowWrap: 'anywhere' }}>
          {rowCopy.reviewedIn}{' '}
          <SpaceList spaces={spaces} links={links} limit={3} />
        </Box>
      );
    },
  };

  const firstCoverage = types.map((type) => reviews.coverageByType[type]).find((c) => c !== undefined);
  const coverageSummary =
    firstCoverage === undefined ? (
      reviewCopy.coverage.loading
    ) : (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <CheckIcon aria-hidden sx={{ fontSize: 12, color: 'success.main' }} />
        {reviewCopy.details.coversLead}{' '}
        <b>{reviewCopy.coverage.covers(firstCoverage.covered.filter((r) => r.unchanged !== true).length, firstCoverage.spaceCount, 0).revisions}</b>{' '}
        {reviewCopy.details.coversIn}{' '}
        <b>{reviewCopy.coverage.covers(0, firstCoverage.spaceCount, 0).spaces}</b>
      </Box>
    );

  const waiting = summary.requests.filter((r) => !r.reviewed).length;
  const decisionsSummaryText = decisionsSummary(decisions);

  const copyLink = () => {
    const url = `${window.location.href.split('#')[0]}#${REVIEW_PANEL_ID}`;
    navigator.clipboard
      .writeText(url)
      .then(() => onNotice(reviewCopy.author.copied))
      .catch(() => onNotice(reviewCopy.author.copyFailed));
  };

  const barSx = { borderTop: '1px solid var(--bd1)', py: '8px', display: 'grid', gap: '8px' } as const;

  return (
    <Box data-testid="review-details" sx={{ display: 'grid', gap: '14px', m: '10px 0 4px', maxWidth: '640px', fontSize: '12.5px', lineHeight: 1.5, color: 'text.primary' }}>
      <Box data-testid="review-requirements">
        <ReviewRequirementList
          requirements={requirements}
          showGate
          itemTestId={(i) => `review-requirement-${i + 1}`}
          notReachedGateKeys={notReachedGateKeys}
          slots={slots}
          keepOrder
        />
      </Box>
      <Box sx={{ display: 'grid', '& > *:last-of-type': { borderBottom: '1px solid var(--bd1)' } }}>
        {mayDecide ? (
          <Box data-testid="review-coverage" sx={barSx}>
            <CollapsibleSection section="coverage" label={reviewCopy.panel.coverageSection} summary={coverageSummary} toggleTestId="review-coverage-toggle">
              {types.map((type) => (
                <ReviewCoverageList
                  key={type}
                  coverage={reviews.coverageByType[type]}
                  loading={reviews.coverageLoading}
                  author={summary.viewer.eligibility.kind === 'author'}
                  authorsCount={authorsCount(type)}
                  showType={types.length > 1}
                  bySpace
                />
              ))}
            </CollapsibleSection>
          </Box>
        ) : null}
        {summary.requests.length > 0 ? (
          <Box data-testid="review-requests" sx={barSx}>
            <CollapsibleSection section="requests" label={reviewCopy.requests.label} summary={reviewCopy.details.waiting(waiting)} toggleTestId="review-requests-toggle">
              <ReviewRequestsSection
                requests={summary.requests}
                candidates={summary.whoCanStillApprove.map((w) => w.person)}
                canRequest={reviews.canRequestReview}
                now={now}
                onRequest={reviews.requestReview}
                onWithdraw={reviews.withdrawReviewRequest}
                onNotice={onNotice}
                hideLabel
                inLog
              />
            </CollapsibleSection>
          </Box>
        ) : null}
        {decisions.length > 0 ? (
          <Box data-testid="review-decisions" sx={barSx}>
            <CollapsibleSection section="decisions" label={reviewCopy.panel.decisions} summary={decisionsSummaryText} toggleTestId="review-decisions-toggle">
              <ReviewDecisionList
                decisions={decisions}
                requirements={requirements}
                now={now}
                itemTestId={(i) => `review-decision-${i + 1}`}
                clockTimes
                {...(summaries.length > 1 ? { gateLabelOf } : {})}
              />
            </CollapsibleSection>
          </Box>
        ) : null}
      </Box>
      <Tooltip title={rowCopy.copyLink}>
        <IconButton
          aria-label={rowCopy.copyLink}
          onClick={copyLink}
          data-testid="review-copy-link"
          sx={{ justifySelf: 'start', '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
        >
          <InsertLinkIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  );
}
