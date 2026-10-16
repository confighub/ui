// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a decision from the viewer would cover, from the `/api/attest` dry run:
 * the Revisions it would attest, and the Units it would skip with the server's
 * own reason.
 */

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import CheckIcon from '@mui/icons-material/Check';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import { changeOrderBorder, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { reviewCopy, skippedCodeText } from './reviewCopy';
import type { ReviewCoverage, ReviewCoverageRow } from './changeOrderReviewTypes';

interface ReviewCoverageListProps {
  coverage?: ReviewCoverage;
  loading: boolean;
  /** Name the Attestation Type above the list, when the viewer records more than one Type (S1). */
  showType?: boolean;
  /**
   * The viewer wrote every Revision the gate reads. The dry run still lists the
   * Revisions a decision would be recorded on, but it would not count toward
   * the requirement (separation of duties), and the head says so.
   */
  author?: boolean;
  /**
   * Every requirement of this Type allows authors (`AllowAuthors`): a Revision
   * the viewer wrote still counts, so no row says "does not count".
   */
  authorsCount?: boolean;
}

const copy = reviewCopy.coverage;

/**
 * A covered Revision where a decision from the viewer counts: one a gate reads (of a Unit
 * the change changed) that the viewer did not write (#5788 `Authored`), or any when authors count.
 */
function coverageRowCounts(row: ReviewCoverageRow, authorsCount: boolean): boolean {
  return row.unchanged !== true && (authorsCount || !row.authored);
}

const frameSx = {
  marginTop: '12px',
  border: `1px solid ${changeOrderBorder.default}`,
  borderRadius: `${changeOrderShape.radius.md}px`,
  overflow: 'hidden',
} as const;

const headSx = {
  display: 'flex',
  alignItems: 'flex-start',
  '& > svg': { marginTop: '2px', flex: '0 0 auto' },
  gap: '6px',
  padding: '7px 11px',
  background: changeOrderSurface.sunk,
  borderBottom: `1px solid ${changeOrderBorder.default}`,
  fontSize: changeOrderType.size.small,
  color: changeOrderInk.muted,
  '& b': { color: changeOrderInk.default, fontWeight: changeOrderType.weight.strong },
} as const;

const rowSx = {
  display: 'grid',
  gridTemplateColumns: '14px minmax(0,1fr) auto',
  gap: '8px',
  padding: '6px 11px',
  borderBottom: `1px solid ${changeOrderBorder.default}`,
  fontSize: changeOrderType.size.small,
  alignItems: 'start',
  '&:last-of-type': { borderBottom: 0 },
} as const;


function Where({ unit, space, skipped }: { unit: string; space: string; skipped: boolean }) {
  return (
    <span>
      <Box
        component="span"
        sx={{
          fontFamily: changeOrderFontMono,
          color: skipped ? changeOrderInk.muted : changeOrderInk.default,
          fontWeight: skipped ? changeOrderType.weight.medium : changeOrderType.weight.semibold,
        }}
      >
        {unit}
      </Box>{' '}
      <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.subtle }}>
        @ {space}
      </Box>
    </span>
  );
}

export function ReviewCoverageList({ coverage, loading, author: authorProp = false, showType = false, authorsCount = false }: ReviewCoverageListProps) {
  const author = authorProp && !authorsCount;
  const rowCounts = (row: ReviewCoverageRow) => coverageRowCounts(row, authorsCount);
  if (loading && coverage === undefined) {
    return (
      <Box sx={frameSx} aria-label={copy.label} aria-busy="true" data-testid="review-coverage">
        <Box sx={headSx}>
          <span>{copy.loading}</span>
        </Box>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={rowSx}>
            <Skeleton variant="circular" width={12} height={12} />
            <Skeleton variant="text" width="70%" />
            <Skeleton variant="text" width={24} />
          </Box>
        ))}
      </Box>
    );
  }
  if (coverage === undefined) {
    return (
      <Box sx={{ ...frameSx, ...headSx, borderBottom: `1px solid ${changeOrderBorder.default}` }} data-testid="review-coverage">
        <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 13, color: changeOrderInk.subtle }} />
        <span>{copy.unavailable}</span>
      </Box>
    );
  }
  const counting = coverage.covered.filter((row) => rowCounts(row));
  const needed = coverage.covered.filter((row) => row.unchanged !== true);
  const counts = copy.covers(counting.length, coverage.spaceCount, coverage.skipped.length);
  const authoredOnly = needed.length > 0 && counting.length === 0;
  let head: ReactNode = (
    <>
      <CheckIcon aria-hidden="true" sx={{ fontSize: 13, color: changeOrderStatus.success }} />
      <span>
        Covers <b>{counts.revisions}</b> in <b>{counts.spaces}</b>
        {coverage.skipped.length > 0 ? counts.skips : ''}
      </span>
    </>
  );
  if (author || authoredOnly) {
    head = (
      <>
        <InfoOutlinedIcon aria-hidden="true" sx={{ fontSize: 13, color: changeOrderInk.subtle }} />
        <span>
          {copy.authorHead} <b>{copy.covers(needed.length, coverage.spaceCount, 0).revisions}</b>
          {copy.authorTail}
        </span>
      </>
    );
  } else if (!coverage.recordable) {
    head = (
      <>
        <WarningAmberOutlinedIcon aria-hidden="true" sx={{ fontSize: 13, color: changeOrderStatus.warn }} />
        <span>{copy.nothingRecordable}</span>
      </>
    );
  }
  return (
    <Box sx={frameSx} aria-label={copy.label} data-testid="review-coverage" data-coverage-type={coverage.type} data-recordable={coverage.recordable ? 'true' : 'false'}>
      {showType ? (
        <Box sx={{ ...headSx, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>{copy.typeHead(coverage.type)}</Box>
      ) : null}
      <Box sx={headSx}>
        {head}
      </Box>
      {coverage.spaceErrors.map((error) => (
        <Box key={`err-${error.spaceSlug}`} sx={rowSx} data-coverage="space-error">
          <WarningAmberOutlinedIcon aria-hidden="true" sx={{ fontSize: 12, marginTop: '2px', color: changeOrderStatus.warn }} />
          <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.muted }}>
            {error.spaceSlug}
          </Box>
          <span />
          <Box component="span" sx={{ gridColumn: '2 / -1', color: changeOrderInk.subtle, lineHeight: 1.4 }}>
            {copy.spaceError} {error.message}
          </Box>
        </Box>
      ))}
      {/* The Revisions a gate reads first; those of Units the change did not change after them. */}
      {[...coverage.covered].sort((a, b) => Number(a.unchanged === true) - Number(b.unchanged === true)).map((row) => {
        const counted = rowCounts(row) && !author;
        let note: string | null = null;
        if (row.unchanged === true) note = copy.notChanged;
        else if (!counted) note = copy.authorHere;
        let kind = counted ? 'covered' : 'recorded-only';
        if (row.unchanged === true) kind = 'not-needed';
        return (
          <Box key={`in-${row.revisionId}`} sx={rowSx} data-coverage={kind}>
            {/* Recorded but not counted: a neutral mark, not a green tick. */}
            {counted ? (
              <CheckIcon aria-hidden="true" sx={{ fontSize: 12, marginTop: '2px', color: changeOrderStatus.success }} />
            ) : (
              <RemoveIcon aria-hidden="true" sx={{ fontSize: 12, marginTop: '2px', color: changeOrderInk.subtle }} />
            )}
            <Where unit={row.unitSlug} space={row.spaceSlug} skipped={!counted} />
            <Box component="span" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.micro, color: changeOrderInk.muted, paddingTop: '1px' }}>
              r{row.revisionNum}
            </Box>
            {note !== null ? (
              <Box component="span" sx={{ gridColumn: '2 / -1', color: changeOrderInk.subtle, lineHeight: 1.4 }}>
                {note}
              </Box>
            ) : null}
          </Box>
        );
      })}
      {coverage.skipped.map((row) => (
        <Box key={`skip-${row.unitSlug}-${row.spaceSlug}`} sx={rowSx} data-coverage="skipped">
          <RemoveIcon aria-hidden="true" sx={{ fontSize: 12, marginTop: '2px', color: changeOrderInk.subtle }} />
          <Where unit={row.unitSlug} space={row.spaceSlug} skipped />
          <span />
          <Box component="span" sx={{ gridColumn: '2 / -1', color: changeOrderInk.subtle, lineHeight: 1.4 }}>
            {/* The server's Message first; else words for its code; else the code as it came. */}
            <Box component="span" title={row.reason}>
              {copy.skipped} {row.message || skippedCodeText(row.reason) || row.reason}
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
}
