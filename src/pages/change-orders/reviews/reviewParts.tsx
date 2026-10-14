// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Small visual parts the review band, panel and dialog share: the monogram,
 * the progress pips, the uppercase tag and the section label.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import BlockIcon from '@mui/icons-material/Block';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';


import {
  changeOrderBorder,
  changeOrderFontMono,
  changeOrderInk,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import { REVIEW_TONE, reviewLinkButtonSx, type ReviewTone } from './reviewButtons';
import { reviewCopy } from './reviewCopy';
import type { RequirementProgress, RequirementSpaceProgress, ReviewPerson, StageReviewSummary } from './changeOrderReviewTypes';

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

/** The right edge of a review gate row: the reviewers' monograms and a "Review" link to the panel. */
export function ReviewGateActions({ requirement, onReview }: { requirement: RequirementProgress; onReview: () => void }) {
  return (
    <>
      <MonogramRow passers={requirement.passers} rejecters={requirement.rejecters} />
      {requirement.satisfied ? null : (
        <Box component="button" type="button" onClick={onReview} sx={reviewLinkButtonSx} data-testid={`review-gate-link-${requirement.name}`}>
          {reviewCopy.stage.reviewLink}
          <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 14 }} />
        </Box>
      )}
    </>
  );
}

/** "Promote is refused (409) until check/<name> is satisfied. 1 more approval needed." */
export function ReviewGateBlockedLine({ summary }: { summary: StageReviewSummary }) {
  const primary = summary.primary;
  if (primary === undefined || summary.open) return null;
  // Final holds no button of its own: the sign-off panel says what it waits on.
  if (summary.gate.kind === 'final') return null;
  // No server rows for the viewer: no count to explain the hold with (#5788).
  if (!primary.evaluated) return null;
  const release = summary.gate.kind === 'release';
  const rejected = primary.rejected;
  const lead: string = release ? reviewCopy.stage.releaseRefused : reviewCopy.stage.refused;
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
        borderLeftWidth: `${changeOrderShape.accentEdge}px`,
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
          {release ? primary.name : `check/${primary.name}`}
        </Box>{' '}
        {reviewCopy.stage.isSatisfied} {tail}
      </Box>
    </Box>
  );
}
