// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a decision from the viewer would cover, from the `/api/attest` dry run:
 * the Revisions it would attest, and the Units it would skip with the server's
 * own reason.
 */

import { useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  /**
   * Group the rows by Space, each Space folded to one line that opens to its rows, the first
   * `spaceLimit` Spaces then "Show all {n} Spaces": a decision can cover 50 Units in 50 Spaces.
   * The head line is left out: the bar that holds the list says it.
   */
  bySpace?: boolean;
  spaceLimit?: number;
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


/** The Revisions a gate reads first; those of Units the change did not change after them. */
function orderedRows(coverage: ReviewCoverage): { covered: ReviewCoverageRow[]; skipped: ReviewCoverage['skipped'] } {
  return {
    covered: [...coverage.covered].sort((a, b) => Number(a.unchanged === true) - Number(b.unchanged === true)),
    skipped: coverage.skipped,
  };
}

const spaceLineSx = {
  display: 'grid',
  gridTemplateColumns: '14px 14px minmax(0,1fr) auto',
  gap: '6px',
  alignItems: 'center',
  width: '100%',
  padding: '6px 11px',
  textAlign: 'left',
  fontSize: changeOrderType.size.small,
  borderRadius: 0,
  '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '-2px' },
} as const;

/** One Space of the coverage, folded to "N Units"; open, its rows. */
function SpaceGroup({ slug, units, allCount, children }: { slug: string; units: number; allCount: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Box data-testid="review-coverage-space" data-space={slug} sx={{ borderBottom: `1px solid ${changeOrderBorder.default}`, '&:last-of-type': { borderBottom: 0 } }}>
      <ButtonBase aria-expanded={open} onClick={() => setOpen((v) => !v)} sx={spaceLineSx}>
        <ChevronRightIcon aria-hidden="true" sx={{ fontSize: 14, color: changeOrderInk.subtle, transform: open ? 'rotate(90deg)' : 'none' }} />
        {allCount ? (
          <CheckIcon aria-hidden="true" sx={{ fontSize: 12, color: changeOrderStatus.success }} />
        ) : (
          <RemoveIcon aria-hidden="true" sx={{ fontSize: 12, color: changeOrderInk.subtle }} />
        )}
        <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.default, fontWeight: changeOrderType.weight.semibold, minWidth: 0, overflowWrap: 'anywhere' }}>
          {slug}
        </Box>
        <Box component="span" sx={{ color: changeOrderInk.muted }}>
          {copy.unitCount(units)}
        </Box>
      </ButtonBase>
      {open ? <Box sx={{ paddingLeft: '20px' }}>{children}</Box> : null}
    </Box>
  );
}

function CoverageBySpace({
  rows,
  limit,
  counts,
  renderCovered,
  renderSkipped,
}: {
  rows: { covered: ReviewCoverageRow[]; skipped: ReviewCoverage['skipped'] };
  limit: number;
  /** Whether a decision from the viewer counts on this row: a Space is ticked only when it does on all of them. */
  counts: (row: ReviewCoverageRow) => boolean;
  renderCovered: (row: ReviewCoverageRow) => ReactNode;
  renderSkipped: (row: ReviewCoverage['skipped'][number]) => ReactNode;
}) {
  const [all, setAll] = useState(false);
  const groups = new Map<string, { covered: ReviewCoverageRow[]; skipped: ReviewCoverage['skipped'][number][] }>();
  const groupOf = (slug: string) => {
    const known = groups.get(slug);
    if (known !== undefined) return known;
    const made = { covered: [] as ReviewCoverageRow[], skipped: [] as ReviewCoverage['skipped'][number][] };
    groups.set(slug, made);
    return made;
  };
  for (const row of rows.covered) groupOf(row.spaceSlug).covered.push(row);
  for (const row of rows.skipped) groupOf(row.spaceSlug).skipped.push(row);
  const entries = [...groups.entries()];
  const shown = all ? entries : entries.slice(0, limit);
  return (
    <>
      {shown.map(([slug, group]) => (
        <SpaceGroup key={slug} slug={slug} units={group.covered.length + group.skipped.length} allCount={group.skipped.length === 0 && group.covered.every(counts)}>
          {group.covered.map(renderCovered)}
          {group.skipped.map(renderSkipped)}
        </SpaceGroup>
      ))}
      {!all && entries.length > limit ? (
        <ButtonBase
          onClick={() => setAll(true)}
          data-testid="review-coverage-all"
          sx={{ justifyContent: 'flex-start', width: '100%', padding: '6px 11px', fontSize: '11.5px', fontWeight: 600, color: changeOrderInk.muted, '&:hover': { bgcolor: 'var(--bg-hover)' }, '&.Mui-focusVisible': { outline: '2px solid var(--rust)', outlineOffset: '-2px' } }}
        >
          {copy.showAllSpaces(entries.length)}
        </ButtonBase>
      ) : null}
    </>
  );
}

/** "unit @ space"; `inSpace`: the row sits under its Space's own line, so the Space is not said again. */
function Where({ unit, space, skipped, inSpace = false }: { unit: string; space: string; skipped: boolean; inSpace?: boolean }) {
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
      </Box>
      {inSpace ? null : (
        <>
          {' '}
          <Box component="span" sx={{ fontFamily: changeOrderFontMono, color: changeOrderInk.subtle }}>
            @ {space}
          </Box>
        </>
      )}
    </span>
  );
}

export function ReviewCoverageList({
  coverage,
  loading,
  author: authorProp = false,
  showType = false,
  authorsCount = false,
  bySpace = false,
  spaceLimit = 5,
}: ReviewCoverageListProps) {
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
  const coveredRow = (row: ReviewCoverageRow) => {
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
        <Where unit={row.unitSlug} space={row.spaceSlug} skipped={!counted} inSpace={bySpace} />
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
  };
  const skippedRow = (row: ReviewCoverage['skipped'][number]) => (
    <Box key={`skip-${row.unitSlug}-${row.spaceSlug}`} sx={rowSx} data-coverage="skipped">
      <RemoveIcon aria-hidden="true" sx={{ fontSize: 12, marginTop: '2px', color: changeOrderInk.subtle }} />
      <Where unit={row.unitSlug} space={row.spaceSlug} skipped inSpace={bySpace} />
      <span />
      <Box component="span" sx={{ gridColumn: '2 / -1', color: changeOrderInk.subtle, lineHeight: 1.4 }}>
        {/* The server's Message first; else words for its code; else the code as it came. */}
        <Box component="span" title={row.reason}>
          {copy.skipped} {row.message || skippedCodeText(row.reason) || row.reason}
        </Box>
      </Box>
    </Box>
  );
  return (
    <Box sx={bySpace ? { ...frameSx, marginTop: 0 } : frameSx} aria-label={copy.label} data-testid="review-coverage" data-coverage-type={coverage.type} data-recordable={coverage.recordable ? 'true' : 'false'}>
      {showType ? (
        <Box sx={{ ...headSx, fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default }}>{copy.typeHead(coverage.type)}</Box>
      ) : null}
      {bySpace ? null : <Box sx={headSx}>{head}</Box>}
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
      {bySpace ? (
        <CoverageBySpace
          rows={orderedRows(coverage)}
          limit={spaceLimit}
          counts={(row) => rowCounts(row) && !author}
          renderCovered={coveredRow}
          renderSkipped={skippedRow}
        />
      ) : (
        <>
          {/* The Revisions a gate reads first; those of Units the change did not change after them. */}
          {orderedRows(coverage).covered.map(coveredRow)}
          {coverage.skipped.map(skippedRow)}
        </>
      )}
    </Box>
  );
}
