// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The sidebar's gate rows: one per gate, and one per review requirement, drawn
 * as the design system's gate item. Each row is a single button that opens its
 * details, so the whole row is one click target and the chevron sits at the
 * right edge.
 *
 * "Not evaluated" is its own state, neither a pass nor a failure: a gate that
 * has not run is drawn with a neutral icon and says so in words. Colour is never
 * the only signal; every row's state is in its text too.
 */

import { useId, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import ScheduleIcon from '@mui/icons-material/Schedule';

import { REVIEW_PANEL_ID } from '../reviews/reviewAnchor';
import { decisionTypes, gateThing, listText, reviewCopy, reviewFeeds } from '../reviews/reviewCopy';
import { ReviewCoverageList } from '../reviews/ReviewCoverageList';
import { ReviewDecisionList } from '../reviews/ReviewDecisionList';
import { ReviewRequestsSection } from '../reviews/ReviewRequestsSection';
import { ReviewRequirementList } from '../reviews/ReviewRequirementList';
import type { GateReviewSummary, RequirementProgress, UseGateReviewsResult } from '../reviews/changeOrderReviewTypes';
import { tagLabel, toneOf } from '../../x/apps/change-order/changeOrderGateTone';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import { PersonAvatar } from './RequestReviewPicker';
import { stageCardCopy, type NamedSpace } from './stageCardCopy';
import { reviewAside, reviewerRows, reviewerStatusText } from './stageReviewModel';
import { CopyText, SpaceList, type StageLinks } from './StageBoxParts';
import type { ReviewAside, ReviewerRow } from './stageTypes';

const copy = stageCardCopy.reviewRow;

const srOnly = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;

const rowSx = (open: boolean) =>
  ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '6px',
    width: '100%',
    minHeight: 30,
    p: '4px 6px',
    borderRadius: '4px',
    textAlign: 'left',
    font: 'inherit',
    bgcolor: open ? 'background.default' : 'transparent',
    '&:hover': { bgcolor: 'background.default' },
    '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '-2px' },
  }) as const;

const nameSx = { fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500, letterSpacing: '-0.01em', flex: '0 1 auto', minWidth: 0, overflowWrap: 'anywhere' } as const;

const asideSx = { fontSize: '12px', color: 'text.secondary', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

const detailsSx = { fontSize: '12px', color: 'text.secondary', p: '4px 8px 8px 26px', display: 'grid', gap: '6px', lineHeight: 1.5, minWidth: 0, overflowWrap: 'anywhere' } as const;

function Chevron({ open }: { open: boolean }) {
  return (
    <ExpandMoreIcon
      aria-hidden
      sx={{
        fontSize: 16,
        color: 'text.secondary',
        ml: 'auto',
        flex: 'none',
        transform: open ? 'rotate(180deg)' : 'none',
        transition: 'transform .15s',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// A gate
// ---------------------------------------------------------------------------

export interface GateRowProps {
  stageId: string;
  gate: ChangeOrderGate;
  /** The gate's kind as a chip in the details: "Entry gate". */
  kindLabel?: string;
  /** "Evaluated over the 3 Spaces of Test at 15:10." */
  evaluatedOver?: string;
  /** The Spaces "Evaluated over" names, drawn as links in its sentence. */
  evaluatedOverSpaces?: readonly NamedSpace[];
  links?: StageLinks;
  /** The gate has not passed YET (the stage before, or health still reporting): a clock, not a red mark. */
  waiting?: boolean;
  /** The status box already says this gate's reason, so the row stays closed. */
  reasonInBox?: boolean;
  /** No gate answer is in yet: the row is neutral and closed, so nothing reads as failed before it is known. */
  pending?: boolean;
}

/** "Evaluated over [a] and [b].": the copy's sentence with its Spaces as links. */
function EvaluatedOver({ text, spaces, links }: { text?: string; spaces?: readonly NamedSpace[]; links?: StageLinks }) {
  if (spaces === undefined || spaces.length === 0) return text === undefined ? null : <span>{text}</span>;
  const marker = '\u0000';
  const [before, after = ''] = stageCardCopy.sidebar.evaluatedOver(marker).split(marker);
  return (
    <span>
      {before}
      <SpaceList spaces={spaces} links={links} />
      {after}
    </span>
  );
}

/**
 * One gate. A failing gate starts open so its reason is read without a click,
 * unless the status box already says it; the default follows the gate as its
 * verdict settles, and once the reader toggles the row their choice wins.
 */
export function GateRow({ stageId, gate, kindLabel = stageCardCopy.sidebar.entryGate, evaluatedOver, evaluatedOverSpaces, links, waiting = false, reasonInBox = false, pending = false }: GateRowProps) {
  const tone = pending ? 'idle' : toneOf(gate);
  const failing = tone === 'no' && !waiting;
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const open = override ?? (failing && !reasonInBox);
  const detailsId = useId();
  return (
    <Box component="li" data-testid={`change-order-gate-${stageId}-${gate.id}`} data-gate-state={pending ? 'pending' : waiting ? 'waiting' : tone}>
      <ButtonBase aria-expanded={open} aria-controls={open ? detailsId : undefined} onClick={() => setOverride(!open)} sx={rowSx(open)}>
        {tone === 'ok' ? <CheckCircleIcon aria-hidden sx={{ fontSize: 14, color: 'success.main' }} /> : null}
        {failing ? <ErrorOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'error.main' }} /> : null}
        {waiting && tone === 'no' ? <ScheduleIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled' }} /> : null}
        {tone === 'idle' ? <HelpOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled' }} /> : null}
        <Box component="span" sx={{ ...nameSx, color: failing ? 'error.main' : 'text.primary' }}>
          {gate.name}
        </Box>
        {/* The state in words: shown for a gate that has not run, read out for the others. */}
        <Box component="span" data-testid={`change-order-gate-tag-${stageId}-${gate.id}`} sx={tone === 'idle' && !pending ? asideSx : srOnly}>
          {tagLabel(pending ? { ...gate, evaluated: false } : gate)}
        </Box>
        <Chevron open={open} />
      </ButtonBase>
      {open ? (
        <Box id={detailsId} sx={detailsSx}>
          {gate.reason !== '' ? <span>{gate.reason}</span> : null}
          {gate.description !== undefined && gate.description !== '' ? <span>{gate.description}</span> : null}
          <Box sx={{ display: 'flex', gap: '4px 8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip size="small" label={kindLabel} />
            <EvaluatedOver text={evaluatedOver} spaces={evaluatedOverSpaces} links={links} />
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// A review requirement
// ---------------------------------------------------------------------------

function AsideIcon({ icon }: { icon: ReviewAside['icon'] }) {
  if (icon === 'ok') return <CheckCircleIcon aria-hidden sx={{ fontSize: 14, color: 'success.main', flex: 'none' }} />;
  if (icon === 'rejected') return <ErrorOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'error.main', flex: 'none' }} />;
  if (icon === 'notEvaluated') return <HelpOutlineIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled', flex: 'none' }} />;
  return <RadioButtonUncheckedIcon aria-hidden sx={{ fontSize: 14, color: 'text.disabled', flex: 'none' }} />;
}

function Reviewer({ row, now, quoted, askedAgain }: { row: ReviewerRow; now: number; quoted: boolean; askedAgain: boolean }) {
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const status = reviewerStatusText(row, now);
  const note = row.decision?.note ?? '';
  const decided = row.status === 'approved' || row.status === 'rejected';
  const tone = row.status === 'approved' ? 'success.main' : row.status === 'rejected' ? 'error.main' : 'text.secondary';
  const statusSx = { display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11.5px', lineHeight: 1.4, color: tone } as const;
  return (
    <Box component="li" data-testid="stage-reviewer" data-status={row.status} sx={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr)', gap: '0 8px', alignItems: 'center' }}>
      <PersonAvatar person={row.person} />
      <Box component="span" sx={{ minWidth: 0 }}>
        <Box component="span" sx={{ display: 'block', fontSize: '12.5px', fontWeight: 500, lineHeight: 1.35, color: 'text.primary' }}>
          {row.person.name}
          {row.person.isYou ? (
            <Box component="small" sx={{ fontWeight: 400, color: 'text.secondary', fontSize: '11.5px' }}>
              {' (you)'}
            </Box>
          ) : null}
        </Box>
        {decided && note !== '' && !quoted ? (
          <ButtonBase
            aria-expanded={open}
            aria-controls={open ? reasonId : undefined}
            onClick={() => setOpen((v) => !v)}
            data-testid="review-reason-toggle"
            sx={{ ...statusSx, font: 'inherit', fontSize: '11.5px', borderRadius: '3px', '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}
          >
            {status}
            <ExpandMoreIcon aria-hidden sx={{ fontSize: 14, transform: open ? 'rotate(180deg)' : 'none' }} />
          </ButtonBase>
        ) : (
          <Box component="span" sx={statusSx}>
            {status}
          </Box>
        )}
        {askedAgain ? (
          <Box component="span" sx={{ ...statusSx, color: 'text.secondary' }}>
            {copy.askedAgainJustNow}
          </Box>
        ) : null}
      </Box>
      {open && note !== '' ? (
        <Box
          id={reasonId}
          sx={{ gridColumn: '2 / 3', mt: '6px', fontSize: '12px', color: 'text.secondary', bgcolor: 'var(--bg)', border: '1px solid var(--bd1)', borderRadius: 'var(--r-sm)', p: '8px 10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
        >
          {note}
        </Box>
      ) : null}
    </Box>
  );
}

function DetailItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <Box component="dt" sx={{ color: 'text.secondary', fontWeight: 500, fontSize: '11.5px' }}>
        {term}
      </Box>
      <Box component="dd" sx={{ m: 0, color: 'text.primary', overflowWrap: 'anywhere' }}>
        {children}
      </Box>
    </div>
  );
}

export interface ReviewGateRowProps {
  summary: GateReviewSummary;
  requirement: RequirementProgress;
  /** The first row of a review carries its reviewers and its details. */
  lead: boolean;
  /** For the details' coverage and requests; absent on a read-only row. */
  reviews?: UseGateReviewsResult;
  now: number;
  /** The change it reads has not landed: "Opens once {X} is promoted". */
  subjectNotLanded?: string;
  /** The status box quotes this rejecter's reason, so the row does not repeat it. */
  quotedRejecterId?: string;
  askedAgainUserId?: string;
  /**
   * On the subject stage: the review counts toward the gate into this stage.
   * `formThere`: that stage's card hosts the form now, so the row links to it.
   */
  countsToward?: { stageId: string; name: string; formThere: boolean };
  links?: StageLinks;
  onNotice?: (message: string) => void;
  /** The row is where "Review now" and a copied review link land, when the status box does not host the review. */
  anchorId?: string;
}

/**
 * One review requirement. While it is open its reviewers are listed under it; once
 * satisfied the row collapses to "approved by …" and the list moves into its details.
 */
export function ReviewGateRow({ summary, requirement, lead, reviews, now, subjectNotLanded, quotedRejecterId, askedAgainUserId, countsToward, links, onNotice, anchorId }: ReviewGateRowProps) {
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);
  const detailsId = useId();
  const aside = reviewAside(requirement, subjectNotLanded);
  const settled = requirement.satisfied;
  // Each requirement lists the people whose decisions count toward it, so an approval of another Type never reads as this one's.
  const rows = reviewerRows(summary, all ? Number.POSITIVE_INFINITY : undefined, requirement);
  const types = decisionTypes(summary);
  const authorsCount = (type: string) => summary.requirements.filter((r) => r.rules.type === type).every((r) => r.rules.allowAuthors);

  const copyLink = () => {
    const url = `${window.location.href.split('#')[0]}#${REVIEW_PANEL_ID}`;
    navigator.clipboard
      .writeText(url)
      .then(() => onNotice?.(reviewCopy.author.copied))
      .catch(() => onNotice?.(reviewCopy.author.copyFailed));
  };

  const list =
    rows.rows.length > 0 ? (
      <>
        <Box component="ul" aria-label="Reviewers" sx={{ listStyle: 'none', m: '2px 0 6px 26px', p: 0, display: 'grid', gap: '6px' }}>
          {rows.rows.map((row) => (
            <Reviewer
              key={row.person.userId}
              row={row}
              now={now}
              quoted={row.status === 'rejected' && row.person.userId === quotedRejecterId}
              askedAgain={row.person.userId === askedAgainUserId}
            />
          ))}
        </Box>
        {rows.more > 0 ? (
          <ButtonBase onClick={() => setAll(true)} sx={{ ml: '26px', mb: '4px', height: 26, px: '6px', borderRadius: 'var(--r-sm)', fontSize: '11.5px', fontWeight: 600, color: 'text.secondary', '&:hover': { bgcolor: 'var(--bg-hover)' }, '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}>
            {copy.andMore(rows.more)}
          </ButtonBase>
        ) : null}
      </>
    ) : null;

  const details = lead ? (
    <Box id={detailsId} sx={detailsSx}>
      <Box component="dl" sx={{ display: 'grid', gap: '6px', m: 0 }}>
        <DetailItem term={copy.reviewedIn}>
          <SpaceList spaces={summary.gateSpaces.map((s) => ({ spaceId: s.spaceId, name: s.spaceSlug }))} links={links} />
        </DetailItem>
        {reviews !== undefined && types.length > 0 ? (
          <DetailItem term={reviewCopy.panel.coverageSection}>
            {types.map((type) => (
              <ReviewCoverageList
                key={type}
                coverage={reviews.coverageByType[type]}
                loading={reviews.coverageLoading}
                author={summary.viewer.eligibility.kind === 'author'}
                authorsCount={authorsCount(type)}
                showType={types.length > 1}
              />
            ))}
          </DetailItem>
        ) : null}
        {reviews !== undefined && (summary.requests.length > 0 || reviews.canRequestReview) ? (
          <DetailItem term={reviewCopy.requests.label}>
            <ReviewRequestsSection
              requests={summary.requests}
              candidates={summary.whoCanStillApprove.map((w) => w.person)}
              canRequest={reviews.canRequestReview}
              now={now}
              onRequest={reviews.requestReview}
              onWithdraw={reviews.withdrawReviewRequest}
              onNotice={onNotice ?? (() => undefined)}
              hideLabel
            />
          </DetailItem>
        ) : null}
        <DetailItem term={reviewCopy.panel.requirementsFor(listText(reviewFeeds(summary).map(gateThing)))}>
          <ReviewRequirementList requirements={summary.requirements} showGate={reviewFeeds(summary).length > 1} />
        </DetailItem>
        <DetailItem term={reviewCopy.panel.decisions}>
          <ReviewDecisionList decisions={summary.decisions} requirements={summary.requirements} now={now} />
        </DetailItem>
      </Box>
      <Tooltip title={copy.copyLink}>
        <IconButton size="small" aria-label={copy.copyLink} onClick={copyLink} data-testid="review-copy-link" sx={{ justifySelf: 'start', '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}>
          <InsertLinkIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
    </Box>
  ) : null;

  return (
    <Box component="li" id={anchorId} data-testid="stage-review-row" data-requirement={requirement.name} data-review-state={aside.icon} sx={{ scrollMarginTop: '16px' }}>
      <ButtonBase aria-expanded={lead ? open : undefined} aria-controls={lead && open ? detailsId : undefined} onClick={() => setOpen((v) => !v)} disabled={!lead} sx={rowSx(open)}>
        <AsideIcon icon={aside.icon} />
        {/* The icon and the reviewer's status say it was rejected; the name stays ink, as a review is not a failing check. */}
        <Box component="span" sx={{ ...nameSx, color: 'text.primary' }}>
          {requirement.name}
        </Box>
        <Box component="span" sx={asideSx}>
          {aside.text}
        </Box>
        {lead ? <Chevron open={open} /> : null}
      </ButtonBase>
      {countsToward !== undefined ? (
        <Box sx={{ ...detailsSx, pt: 0 }}>
          <span>
            <CopyText parts={copy.countsTowardGateInto(countsToward)} links={links} />
          </span>
          {countsToward.formThere ? (
            <Box component="span" data-testid="review-entry-go" sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <CopyText parts={[{ kind: 'link', text: copy.reviewOn(countsToward.name), ref: { to: 'stage', stageId: countsToward.stageId } }]} links={links} />
              <ArrowForwardIcon aria-hidden sx={{ fontSize: 14, color: 'text.primary' }} />
            </Box>
          ) : null}
        </Box>
      ) : null}
      {settled ? (open ? <>{list}{details}</> : null) : <>{list}{open ? details : null}</>}
    </Box>
  );
}
