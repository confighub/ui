// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The stage's facts beside the main column, as one panel with divided sections:
 * Gates (review rows first, then the workflow it comes from), the reviews of this
 * stage's change that are decided on another card, the Spaces with their marks,
 * and the Targets.
 *
 * Every Space and Target is a link to its page. Marks are words in a chip, not a
 * colour alone; a Space that differs is listed even when the list is collapsed.
 */

import { useRef, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ScheduleIcon from '@mui/icons-material/Schedule';

import { REVIEW_PANEL_ID } from '../reviews/reviewAnchor';
import type { GateReviewSummary, UseGateReviewsResult } from '../reviews/changeOrderReviewTypes';
import type { ChangeOrderGate } from '../../x/apps/change-order/changeOrderTypes';
import { GateRow, ReviewGateRow } from './GateRows';
import { stageCardCopy } from './stageCardCopy';
import { spaceHref } from './stageLinks';
import { ProseLink, type StageLinks } from './StageBoxParts';
import type { SpaceMark } from './stageTypes';

const copy = stageCardCopy.sidebar;

/** A Space's mark: how the change reaches it, or how the last action went there. */
export type SidebarSpaceMark = SpaceMark | { kind: 'failed' } | { kind: 'promoted' };

/** A review the card hosts, as rows of the Gates section. */
export interface SidebarReview {
  summary: GateReviewSummary;
  reviews?: UseGateReviewsResult;
  /** The change it reads has not landed yet: the stage name for "Opens once {X} is promoted". */
  subjectNotLanded?: string;
  /** The status box quotes this person's rejection. */
  quotedRejecterId?: string;
  askedAgainUserId?: string;
}

/** A review of this stage's change whose form is on another card (or on none yet). */
export interface SidebarSubjectReview {
  summary: GateReviewSummary;
  /** The stage whose card hosts the form now. */
  actionStage?: { stageId: string; name: string };
}

export interface StageSidebarProps {
  stageId: string;
  /** The gates that are not review requirements; those are drawn as review rows. */
  gates: readonly ChangeOrderGate[];
  gateDetails?: (gateId: string) => { kindLabel?: string; evaluatedOver?: string; evaluatedOverSpaces?: readonly { spaceId: string; name: string }[] };
  /** Gates that have not passed YET (the stage before, or health still reporting): drawn with a clock, not red. */
  waitingGateIds?: ReadonlySet<string>;
  /**
   * Gates whose reason the status box already says: their rows stay closed.
   * Absent: every failing gate's reason is taken to be in the box.
   */
  gateIdsInBox?: ReadonlySet<string>;
  /** The status box does not host the review: the first review row is what "Review now" and a copied link land on. */
  reviewAnchor?: boolean;
  /** No gate answer is in yet (`sidebarGateFlags().pending`): rows are neutral and closed. */
  gatesPending?: boolean;
  reviews: readonly SidebarReview[];
  subjectReviews?: readonly SidebarSubjectReview[];
  workflow: { href: string | null; label: string };
  spaces: readonly { spaceId: string; name: string }[];
  marks: ReadonlyMap<string, SidebarSpaceMark>;
  /** `null`: no Space of the stage has a Target. */
  targets: { count: number; href: string | null; phase: 'pending' | 'promoted' | 'released' } | null;
  links: StageLinks;
  now: number;
  onNotice?: (message: string) => void;
}


/** Unmarked Spaces shown before "Show all". */
const UNMARKED_SHOWN = 3;

const listLinkSx = {
  fontFamily: 'var(--font-mono)',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '-0.01em',
  color: 'text.secondary',
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  // A Space slug can be wider than the panel. Without containment its full width is
  // the row's intrinsic width, which pushes the mark chip out of the panel and can
  // widen the whole card on a phone; contained, it takes the room left beside the chip.
  flex: '1 1 auto',
  contain: 'inline-size',
  '&:hover': { textDecoration: 'underline', textUnderlineOffset: '3px', color: 'text.primary' },
  '&:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
} as const;

const toggleSx = {
  height: 26,
  px: '10px',
  mt: '4px',
  fontSize: '11.5px',
  '& .MuiButton-endIcon': { ml: '2px' },
  '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '2px' },
} as const;

function Section({ title, count, inline = false, children }: { title: string; count?: number; inline?: boolean; children?: ReactNode }) {
  return (
    <Box component="section" sx={{ borderBottom: '1px solid var(--bd0)', '&:last-of-type': { borderBottom: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: inline ? 44 : 40, px: '16px' }}>
        {/* Named "Spaces, 3": the count is its own word to a screen reader, not "Spaces3". */}
        <Typography component="h3" variant="caption" aria-label={count === undefined ? undefined : `${title}, ${count}`} sx={{ color: 'text.secondary', lineHeight: 1.4 }}>
          {title}
          {count !== undefined ? (
            <Box component="span" aria-hidden sx={{ ml: '6px', fontFamily: 'var(--font-mono)', fontSize: '10.5px', fontWeight: 500, letterSpacing: 0, textTransform: 'none' }}>
              {count}
            </Box>
          ) : null}
        </Typography>
        {inline ? children : null}
      </Box>
      {inline ? null : children}
    </Box>
  );
}

function markChip(mark: SidebarSpaceMark): { label: string; color: 'warning' | 'error' | 'success' | 'default'; title?: string } {
  const m = stageCardCopy.mark;
  switch (mark.kind) {
    case 'differs':
      return { label: m.differs, color: 'warning' };
    case 'keeps':
      return { label: m.keeps(mark.value), color: 'warning', ...(mark.title === undefined ? {} : { title: mark.title }) };
    case 'refuses':
      return { label: m.refuses, color: 'warning' };
    case 'adds':
      return { label: m.adds, color: 'warning' };
    case 'unknown':
      return { label: m.unknown, color: 'warning' };
    case 'hasIt':
      return { label: m.hasIt, color: 'default' };
    case 'failed':
      return { label: m.failed, color: 'error' };
    case 'promoted':
      return { label: m.promoted, color: 'success' };
  }
}

function GatesSection({
  stageId,
  gates,
  gateDetails,
  waitingGateIds,
  gateIdsInBox,
  reviewAnchor,
  gatesPending = false,
  reviews,
  workflow,
  links,
  now,
  onNotice,
}: Pick<StageSidebarProps, 'stageId' | 'gates' | 'gateDetails' | 'waitingGateIds' | 'gateIdsInBox' | 'reviewAnchor' | 'gatesPending' | 'reviews' | 'workflow' | 'links' | 'now' | 'onNotice'>) {
  if (gates.length === 0 && reviews.length === 0) {
    return (
      <Section title={copy.gates} inline>
        <Typography component="span" variant="body2" data-testid="stage-gates" sx={{ color: 'text.secondary' }}>
          {copy.gatesNone}
        </Typography>
      </Section>
    );
  }
  return (
    <Section title={copy.gates}>
      <Box sx={{ p: '0 10px 6px' }}>
        <Box component="ul" data-testid="stage-gates" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2px' }}>
          {reviews.flatMap((review, ri) =>
            review.summary.requirements.map((requirement, i) => (
              <ReviewGateRow
                key={`${review.summary.gate.key}:${requirement.name}`}
                anchorId={reviewAnchor === true && ri === 0 && i === 0 ? REVIEW_PANEL_ID : undefined}
                summary={review.summary}
                requirement={requirement}
                lead={i === 0}
                reviews={review.reviews}
                now={now}
                subjectNotLanded={review.subjectNotLanded}
                quotedRejecterId={review.quotedRejecterId}
                askedAgainUserId={review.askedAgainUserId}
                links={links}
                onNotice={onNotice}
              />
            )),
          )}
          {gates.map((gate) => (
            <GateRow
              key={gate.id}
              stageId={stageId}
              gate={gate}
              {...gateDetails?.(gate.id)}
              links={links}
              waiting={waitingGateIds?.has(gate.id) ?? false}
              reasonInBox={gateIdsInBox === undefined || gateIdsInBox.has(gate.id)}
              pending={gatesPending}
            />
          ))}
        </Box>
        {gatesPending ? (
          <Typography variant="body2" data-testid="stage-gates-checking" sx={{ p: '4px 6px', color: 'text.secondary' }}>
            {copy.checkingGates}
          </Typography>
        ) : null}
      </Box>
      <Typography component="p" variant="body2" data-testid="stage-workflow" sx={{ p: '10px 16px 12px', borderTop: '1px solid var(--bd1)', color: 'text.secondary' }}>
        {copy.definedIn}{' '}
        {workflow.href === null ? (
          <Box component="code" sx={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'text.primary' }}>
            {workflow.label || copy.noWorkflow}
          </Box>
        ) : (
          <Tooltip title={copy.frozenCopy}>
            <span>
              <ProseLink href={workflow.href} code weight={400}>
                {workflow.label}
              </ProseLink>
            </span>
          </Tooltip>
        )}
      </Typography>
    </Section>
  );
}

function SpacesSection({ spaces, marks }: Pick<StageSidebarProps, 'spaces' | 'marks'>) {
  const [all, setAll] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const collapsible = spaces.length > UNMARKED_SHOWN + 1;
  let unmarked = 0;
  const shown = spaces.filter((space) => all || !collapsible || marks.has(space.spaceId) || unmarked++ < UNMARKED_SHOWN);
  return (
    <Section title={copy.spaces} count={spaces.length}>
      <Box sx={{ p: '0 10px 12px' }}>
        <Box component="ul" ref={listRef} data-testid="stage-spaces" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2px' }}>
          {shown.map((space) => {
            const mark = marks.get(space.spaceId);
            const chip = mark === undefined ? undefined : markChip(mark);
            const strong = chip !== undefined && (chip.color === 'warning' || chip.color === 'error');
            return (
              <Box
                component="li"
                key={space.spaceId}
                data-testid="stage-space"
                data-space-id={space.spaceId}
                data-mark={mark?.kind}
                sx={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', p: '3px 6px', minHeight: 26, minWidth: 0, boxSizing: 'border-box' }}
              >
                <Link
                  component={RouterLink}
                  to={spaceHref(space.spaceId)}
                  title={space.name}
                  // Slugs of one ChangeOrder share their head; when one does not fit, the ellipsis goes at the start so the end that tells them apart stays.
                  sx={{ ...listLinkSx, direction: 'rtl', textAlign: 'left', ...(strong ? { color: 'text.primary' } : {}) }}
                >
                  <Box component="span" sx={{ direction: 'ltr', unicodeBidi: 'embed' }}>
                    {space.name}
                  </Box>
                </Link>
                {chip !== undefined ? (
                  // A long kept value (a full image reference) ellipsizes rather than squeezing the Space's name away.
                  // The chip shows the image tag; the full kept value is its tooltip.
                  <Tooltip title={chip.title ?? chip.label} describeChild>
                    <Chip size="small" color={chip.color} label={chip.label} sx={{ flex: '0 1 auto', minWidth: 0, maxWidth: '55%' }} />
                  </Tooltip>
                ) : null}
              </Box>
            );
          })}
        </Box>
        {collapsible && !all ? (
          <Button variant="text" size="small" aria-expanded={false} onClick={() => {
              // The toggle goes away once every Space is listed: focus moves to the first Space it revealed.
              const firstHidden = spaces.find((space) => !shown.includes(space));
              setAll(true);
              requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-space-id="${firstHidden?.spaceId ?? ''}"] a`)?.focus());
            }}
            endIcon={<ExpandMoreIcon sx={{ fontSize: '16px !important' }} />} sx={toggleSx}>
            {copy.showAll(spaces.length)}
          </Button>
        ) : null}
      </Box>
    </Section>
  );
}

function TargetsSection({ targets }: Pick<StageSidebarProps, 'targets'>) {
  const lineSx = { display: 'flex', gap: '8px', alignItems: 'flex-start', p: '2px 6px', typography: 'body2', color: 'text.primary' } as const;
  if (targets === null) {
    return (
      <Section title={copy.targets}>
        <Box sx={{ p: '0 10px 12px' }}>
          <Typography variant="body2" sx={{ p: '2px 6px', color: 'text.secondary' }} data-testid="stage-targets">
            {copy.targetsNone}
          </Typography>
        </Box>
      </Section>
    );
  }
  const count = copy.targetCount(targets.count);
  const counted = targets.href === null ? count : <ProseLink href={targets.href}>{count}</ProseLink>;
  // The sentences start with the count, which is the link: split it off the copy so the words stay the copy's.
  const sentence =
    targets.phase === 'promoted' ? copy.targetsEarlier(targets.count) : targets.phase === 'released' ? copy.targetsRun(targets.count) : count;
  const rest = sentence.slice(count.length);
  return (
    <Section title={copy.targets}>
      <Box sx={{ p: '0 10px 12px' }}>
        <Box sx={lineSx} data-testid="stage-targets" data-phase={targets.phase}>
          {targets.phase === 'promoted' ? <ScheduleIcon aria-hidden sx={{ fontSize: 14, mt: '3px', color: 'text.disabled' }} /> : null}
          {targets.phase === 'released' ? <CheckCircleIcon aria-hidden sx={{ fontSize: 14, mt: '3px', color: 'success.main' }} /> : null}
          <span>
            {counted}
            {rest}
          </span>
        </Box>
      </Box>
    </Section>
  );
}

export function StageSidebar(props: StageSidebarProps) {
  const { subjectReviews = [], links, now } = props;
  return (
    <Paper elevation={2} data-testid="stage-sidebar" sx={{ minWidth: 0, overflow: 'hidden', '& button:focus-visible': { outline: '2px solid var(--rust)', outlineOffset: '2px' } }}>
      <GatesSection {...props} />
      {subjectReviews.length > 0 ? (
        <Section title={copy.reviewsOfChange}>
          <Box sx={{ p: '0 10px 12px' }}>
            <Box component="ul" data-testid="stage-subject-reviews" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '2px' }}>
              {subjectReviews.flatMap(({ summary, actionStage }) =>
                summary.requirements.map((requirement, i) => (
                  <ReviewGateRow
                    key={`${summary.gate.key}:${requirement.name}`}
                    summary={summary}
                    requirement={requirement}
                    lead={i === 0}
                    now={now}
                    links={links}
                    countsToward={
                      i === 0
                        ? { stageId: summary.gate.stageId, name: summary.gate.stageName, formThere: actionStage !== undefined && actionStage.stageId === summary.gate.stageId }
                        : undefined
                    }
                    onNotice={props.onNotice}
                  />
                )),
              )}
            </Box>
          </Box>
        </Section>
      ) : null}
      <SpacesSection spaces={props.spaces} marks={props.marks} />
      <TargetsSection targets={props.targets} />
    </Paper>
  );
}
