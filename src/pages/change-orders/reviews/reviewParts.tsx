// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Small visual parts the review band, panel and dialog share: the monogram,
 * the progress pips, the uppercase tag and the section label.
 */

import { Fragment, useId, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import Link from '@mui/material/Link';
import BlockIcon from '@mui/icons-material/Block';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';


import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { REVIEW_TONE, reviewLinkButtonSx, type ReviewTone } from './reviewButtons';
import { reviewCopy, reviewSubject, splitAroundStage } from './reviewCopy';
import type { RequirementProgress, RequirementSpaceProgress, ReviewPerson, StageReviewSummary } from './changeOrderReviewTypes';

const stageLinkSx = {
  font: 'inherit',
  // The name reads as part of the sentence, so every state keeps the sentence's colour.
  color: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: 'currentColor',
  verticalAlign: 'baseline',
  cursor: 'pointer',
  '&:hover, &:active, &:visited': { color: 'inherit', textDecorationColor: 'currentColor' },
  '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 2, borderRadius: '2px' },
} as const;

/**
 * A sentence that names a stage, with the name as an underlined link to that stage's
 * card when `onGo` is given. The sentence is the copy function's, so the text reads the
 * same linked or not. Pass no `onGo` where the reader is already on that card, the
 * change has not landed (no form to go to), or the name is not a stage with a card.
 */
export function StageText({ build, stage, onGo, testId }: { build: (stage: string) => string; stage: string; onGo: (() => void) | undefined; testId?: string }) {
  if (onGo === undefined) return <>{build(stage)}</>;
  const parts = splitAroundStage(build);
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i === 0 ? null : (
            <Link component="button" type="button" role="link" aria-label={reviewCopy.entryStatus.goTo(stage)} onClick={onGo} sx={stageLinkSx} data-testid={testId}>
              {stage}
            </Link>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** A person's initials in a round chip, green for an approval, red for a rejection. */
export function Monogram({
  initials,
  tone = 'idle',
  size = 22,
  title,
}: {
  initials: string;
  tone?: ReviewTone;
  size?: 22 | 28;
  title?: string;
}) {
  const t = REVIEW_TONE[tone];
  return (
    <Box
      component="span"
      title={title}
      aria-hidden={title === undefined ? true : undefined}
      sx={{
        width: size,
        height: size,
        flex: '0 0 auto',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        display: 'inline-grid',
        placeItems: 'center',
        fontSize: size === 28 ? changeOrderType.size.small : changeOrderType.size.micro,
        fontWeight: changeOrderType.weight.bold,
        letterSpacing: '.02em',
        lineHeight: 1,
        background: tone === 'idle' ? changeOrderSurface.inset : t.bg,
        color: tone === 'idle' ? changeOrderInk.muted : t.fg,
        boxShadow: `inset 0 0 0 1px ${tone === 'idle' ? changeOrderBorder.strong : t.line}`,
      }}
    >
      {initials}
    </Box>
  );
}

/** Monograms of the people who approved or rejected, then a "?" for each approval still needed. */
export function MonogramRow({
  passers,
  rejecters = [],
  stillNeeded = 0,
}: {
  passers: ReviewPerson[];
  rejecters?: ReviewPerson[];
  stillNeeded?: number;
}) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', gap: '3px' }}>
      {passers.map((p) => (
        <Monogram key={`p-${p.userId}`} initials={p.initials} tone="ok" title={`${p.name} approved`} />
      ))}
      {rejecters.map((p) => (
        <Monogram key={`r-${p.userId}`} initials={p.initials} tone="bad" title={`${p.name} rejected`} />
      ))}
      {Array.from({ length: stillNeeded }, (_, i) => (
        <Monogram key={`n-${i}`} initials="?" title="Still needed" />
      ))}
    </Box>
  );
}

/** One pip per approval required, green when counted, plus a red one for a rejection. */
export function Pips({ passes, required, rejected }: { passes: number; required: number; rejected: boolean }) {
  return (
    <Box aria-hidden="true" sx={{ display: 'flex', gap: '4px' }}>
      {Array.from({ length: required }, (_, i) => (
        <Box
          key={i}
          component="i"
          sx={{
            display: 'block',
            width: 26,
            height: 8,
            borderRadius: `${changeOrderShape.radius.pill}px`,
            background: i < passes ? changeOrderStatus.success : changeOrderSurface.card,
            boxShadow: i < passes ? 'none' : `inset 0 0 0 1px ${changeOrderBorder.strong}`,
          }}
        />
      ))}
      {rejected ? (
        <Box
          component="i"
          sx={{
            display: 'block',
            width: 26,
            height: 8,
            borderRadius: `${changeOrderShape.radius.pill}px`,
            background: changeOrderStatus.danger,
          }}
        />
      ) : null}
    </Box>
  );
}

/** The small uppercase tag: "1 needed", "satisfied", "rejected", "dry run". */
export function ReviewTag({ tone, children }: { tone: ReviewTone; children: ReactNode }) {
  const t = REVIEW_TONE[tone];
  return (
    <Box
      component="span"
      sx={{
        fontSize: changeOrderType.size.micro,
        fontWeight: changeOrderType.weight.bold,
        letterSpacing: '.03em',
        textTransform: 'uppercase',
        padding: '1px 6px',
        borderRadius: `${changeOrderShape.radius.sm}px`,
        lineHeight: changeOrderType.lineHeight.tight,
        color: tone === 'idle' ? changeOrderInk.muted : t.fg,
        background: t.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </Box>
  );
}

/** The pill chip with a dot: "Held on review", "Approved". */
export function ReviewChip({ tone, children, dot = false }: { tone: ReviewTone; children: ReactNode; dot?: boolean }) {
  const t = REVIEW_TONE[tone];
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        height: 20,
        padding: '0 8px',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        fontSize: changeOrderType.size.small,
        fontWeight: changeOrderType.weight.strong,
        whiteSpace: 'nowrap',
        background: t.bg,
        color: tone === 'idle' ? changeOrderInk.muted : t.fg,
        boxShadow: `inset 0 0 0 1px ${t.line}`,
        '& svg': { fontSize: 11 },
      }}
    >
      {dot ? (
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: '999px', background: 'currentColor' }} />
      ) : null}
      {children}
    </Box>
  );
}

/** The uppercase section label: "YOUR REVIEW", "DECISIONS". */
/**
 * A part of the review panel below the decision: a header that names it and sums it up
 * in a few words, and its content, closed until the reader opens it.
 */
export function CollapsibleSection({
  section,
  label,
  summary,
  children,
}: {
  /** Names the section for tests and styling: `data-section`. */
  section: string;
  label: ReactNode;
  /** What the reader would find inside, shown beside the label while it is closed and open. */
  summary?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
        data-testid="review-section-toggle"
        data-section={section}
        sx={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: changeOrderType.size.micro,
          fontWeight: changeOrderType.weight.bold,
          letterSpacing: '.07em',
          textTransform: 'uppercase',
          color: changeOrderInk.subtle,
          '&:hover': { color: changeOrderInk.default },
          '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 2 },
        }}
      >
        <ExpandMoreIcon
          aria-hidden="true"
          sx={{ fontSize: 16, transition: 'transform 120ms', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
        <span>{label}</span>
        {summary !== undefined ? (
          <Box
            component="span"
            data-testid="review-section-summary"
            sx={{
              marginLeft: 'auto',
              letterSpacing: 0,
              textTransform: 'none',
              fontWeight: changeOrderType.weight.medium,
              fontSize: changeOrderType.size.small,
              color: changeOrderInk.muted,
            }}
          >
            {summary}
          </Box>
        ) : null}
      </Box>
      <Collapse in={open} id={contentId} data-section-content={section}>
        <Box sx={{ paddingTop: '10px' }}>{children}</Box>
      </Collapse>
    </>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <Box
      component="p"
      sx={{
        margin: '0 0 8px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: changeOrderType.size.micro,
        fontWeight: changeOrderType.weight.bold,
        letterSpacing: '.07em',
        textTransform: 'uppercase',
        color: changeOrderInk.subtle,
      }}
    >
      {children}
      {right !== undefined ? (
        <Box
          component="span"
          sx={{
            marginLeft: 'auto',
            letterSpacing: 0,
            textTransform: 'none',
            fontWeight: changeOrderType.weight.medium,
            fontSize: changeOrderType.size.small,
          }}
        >
          {right}
        </Box>
      ) : null}
    </Box>
  );
}

/** Text in the mono face, for slugs and requirement names. */
export function Mono({ children, strong = false }: { children: ReactNode; strong?: boolean }) {
  return (
    <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontWeight: strong ? changeOrderType.weight.bold : undefined }}>
      {children}
    </Box>
  );
}

/**
 * Progress per gate Space, under the reason of a review gate row: the
 * server's count ("1 of 2"), how many Revisions are satisfied, and the
 * unsatisfied Revisions folded under the Space (#5788). A Space the server
 * did not evaluate for the viewer shows why, and no count.
 */
export function ReviewGateSpaces({ requirement }: { requirement: RequirementProgress }) {
  return (
    <Box sx={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }} data-testid={`review-gate-spaces-${requirement.name}`}>
      {requirement.perSpace.map((space) => (
        <Box key={space.spaceId} data-testid="review-gate-space" data-evaluated={space.evaluated ? 'true' : 'false'}>
          <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: changeOrderType.size.small }}>
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
              {space.spaceSlug}
            </Box>
            {spaceTag(space)}
            {space.evaluated && space.revisions > 0 ? (
              <Box component="span" sx={{ color: changeOrderInk.subtle }}>
                {reviewCopy.space.revisions(space.satisfiedRevisions, space.revisions)}
              </Box>
            ) : null}
          </Box>
          {space.evaluated && space.unsatisfied.length > 0 ? (
            <Box
              component="ul"
              sx={{ margin: '2px 0 0 14px', padding: 0, listStyle: 'none', fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}
            >
              {space.unsatisfied.map((rev) => (
                <li key={`${rev.unitSlug}@${rev.revisionNum}`} data-testid="review-unsatisfied-revision">
                  <Box component="span" sx={{ fontFamily: changeOrderFontMono }}>
                    {reviewCopy.space.unsatisfied(rev.unitSlug, rev.revisionNum, rev.counted)}
                  </Box>
                  {rev.authors.length > 0 ? reviewCopy.space.authors(rev.authors.map((a) => a.name).join(', ')) : ''}
                </li>
              ))}
              {space.truncated ? <li>{reviewCopy.space.andMore}</li> : null}
            </Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

/** One Space's tag: the server's verdict and count, or "not evaluated" with no count. */
function spaceTag(space: RequirementSpaceProgress): ReactNode {
  if (!space.evaluated) return <ReviewTag tone="idle">{reviewCopy.stage.spaceNotEvaluated}</ReviewTag>;
  const count = reviewCopy.space.counted(space.counted, space.required);
  if (space.satisfied) return <ReviewTag tone="ok">{count}</ReviewTag>;
  if (space.reason === 'AttestationRejected') return <ReviewTag tone="bad">{reviewCopy.stage.spaceFail}</ReviewTag>;
  return (
    <Box component="span" title={space.reason !== 'AttestationsMissing' ? space.message : undefined}>
      <ReviewTag tone="warn">{count}</ReviewTag>
    </Box>
  );
}

/**
 * The right edge of a review gate row: the reviewers' monograms and a link to the review,
 * labelled with where it is when that is another stage ("Review in staging").
 */
export function ReviewGateActions({
  requirement,
  onReview,
  label,
  labelStage,
}: {
  requirement: RequirementProgress;
  /** Undefined while no card has the review's form: no link then. */
  onReview: (() => void) | undefined;
  label?: string;
  /** The stage `label` names: underlined in it, so the row reads as a way to that stage. */
  labelStage?: string;
}) {
  return (
    <>
      <MonogramRow passers={requirement.passers} rejecters={requirement.rejecters} />
      {requirement.satisfied || onReview === undefined ? null : (
        <Box component="button" type="button" onClick={onReview} sx={reviewLinkButtonSx} data-testid={`review-gate-link-${requirement.name}`}>
          {label !== undefined && labelStage !== undefined
            ? splitAroundStage(reviewCopy.stage.reviewIn).flatMap((part, i) =>
                i === 0 ? [part] : [<u key={i} data-testid="review-gate-link-stage">{labelStage}</u>, part],
              )
            : (label ?? reviewCopy.stage.reviewLink)}
          <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 14 }} />
        </Box>
      )}
    </>
  );
}

/** "Promote to prod is blocked until <name> is met for the change in staging. 1 more approval needed." */
export function ReviewGateBlockedLine({ summary, onGoToSubject }: { summary: StageReviewSummary; onGoToSubject?: () => void }) {
  const primary = summary.primary;
  if (primary === undefined || summary.open) return null;
  // Final holds no button of its own: the sign-off panel says what it waits on.
  if (summary.gate.kind === 'final') return null;
  // No server rows for the viewer: no count to explain the hold with (#5788).
  if (!primary.evaluated) return null;
  const release = summary.gate.kind === 'release';
  const rejected = primary.rejected;
  const stage = summary.gate.stageName;
  const lead: string = release ? reviewCopy.stage.releaseRefused(stage) : reviewCopy.stage.refused(stage);
  const tail: string = rejected ? reviewCopy.stage.rejectionStands : reviewCopy.stage.moreNeeded(primary.need);
  const t = REVIEW_TONE[rejected ? 'bad' : 'warn'];
  const Icon = rejected ? BlockIcon : LockOutlinedIcon;
  return (
    <Box
      data-testid="review-blocked-line"
      data-gate-kind={summary.gate.kind}
      sx={{
        marginTop: '14px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        padding: '8px 12px',
        border: `1px solid ${t.line}`,
        borderLeftWidth: `${changeOrderShape.leadingEdge}px`,
        borderRadius: `${changeOrderShape.radius.md}px`,
        background: t.bg,
        color: t.fg,
        fontSize: changeOrderType.size.body,
      }}
    >
      <Icon aria-hidden="true" sx={{ fontSize: 14, marginTop: '2px' }} />
      <Box sx={{ color: changeOrderInk.default }}>
        {lead}{' '}
        <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small }}>
          {primary.name}
        </Box>{' '}
        {/* The subject is named when it is not the stage the gate holds: an entry gate reads the stage before. */}
        {reviewSubject(summary).name === stage ? (
          reviewCopy.stage.isSatisfied
        ) : (
          <StageText build={reviewCopy.stage.isSatisfiedFor} stage={reviewSubject(summary).name} onGo={onGoToSubject} testId="review-blocked-stage-link" />
        )}{' '}
        {tail}
      </Box>
    </Box>
  );
}

/**
 * A stage's entry gate that reviews the stage before it: its state, and the way to the
 * review, which sits on that stage's card beside the change it approves. `onGo`
 * undefined: the change has not landed in that stage, so there is no review to go to yet.
 */
export function ReviewEntryStatus({ summary, onGo }: { summary: StageReviewSummary; onGo: (() => void) | undefined }) {
  const subject = reviewSubject(summary).name;
  const copy = reviewCopy.entryStatus;
  let tone: ReviewTone = 'warn';
  let build: (stage: string) => string = copy.waiting;
  if (summary.state === 'rejected') {
    tone = 'bad';
    build = copy.rejected;
  } else if (summary.open) {
    tone = 'ok';
    build = copy.open;
  } else if (!summary.evaluated) {
    tone = 'idle';
    build = copy.notEvaluated;
  }
  const t = REVIEW_TONE[tone];
  let Icon = LockOutlinedIcon;
  if (tone === 'bad') Icon = BlockIcon;
  else if (tone === 'ok') Icon = CheckIcon;
  return (
    <Box
      data-testid="review-entry-status"
      data-review-state={summary.state}
      data-landed={onGo !== undefined}
      sx={{
        marginTop: '14px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        padding: '8px 12px',
        border: `1px solid ${t.line}`,
        borderLeftWidth: `${changeOrderShape.leadingEdge}px`,
        borderRadius: `${changeOrderShape.radius.md}px`,
        background: t.bg,
        color: t.fg,
        fontSize: changeOrderType.size.body,
      }}
    >
      <Icon aria-hidden="true" sx={{ fontSize: 14, marginTop: '2px' }} />
      <Box sx={{ color: changeOrderInk.default, flex: '1 1 240px' }}>
        <StageText build={build} stage={subject} onGo={onGo} testId="review-entry-stage-link" />
        <Box component="span" sx={{ display: 'block', fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
          {onGo === undefined ? copy.notLanded(subject) : copy.where(subject)}
        </Box>
      </Box>
      {onGo === undefined ? null : (
        <Box component="button" type="button" onClick={onGo} sx={reviewLinkButtonSx} data-testid="review-entry-go">
          {copy.goTo(subject)}
          <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 14 }} />
        </Box>
      )}
    </Box>
  );
}
