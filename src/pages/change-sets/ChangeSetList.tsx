// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every ChangeSet the viewer can see, as the ChangeOrders list shows ChangeOrders:
 * the same title row, triage cards, filter bar and rows, built from the same parts.
 *
 * Open ChangeSets come first, as they are the work in progress, then the rest by
 * when they last changed. A row says what the ChangeSet changes (its image change),
 * how its reviews stand and whose were asked for, who created it, and what to do
 * next: Review when a review was asked of the viewer, Open otherwise.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';

import { useListAllChangeSetsQuery, type ChangeSetRead } from '@confighub/rtk-query';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useInViewport } from '@/hooks/useInViewport';
import { useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';

import {
  ConsoleClearButton,
  ConsoleColumnHead,
  ConsoleDateRange,
  ConsoleEmpty,
  ConsoleFilterBar,
  ConsoleFooter,
  ConsoleIntro,
  ConsoleList,
  ConsoleLoading,
  ConsoleSearch,
  ConsoleSelectFilter,
  ConsoleTitleRow,
  type ConsoleColumn,
} from '../change-orders/components/ConsoleParts';
import { ImageChangesView } from '../change-orders/components/ImageChangeCell';
import { KpiStrip, type KpiCard } from '../change-orders/components/KpiStrip';
import {
  KPI_ACTIVE_CARD_SX,
  KPI_CARD_SX,
  KPI_HINT_SX,
  KPI_LABEL_SX,
  KPI_NUM_SX,
  KPI_PARTIAL_CARD_SX,
  R_MICRO,
  ageFrom,
  consoleTokens as T,
  controlSx,
  freshnessFrom,
  truncateWords,
} from '../change-orders/consoleStyle';
import { imageChangesOfRead } from '../change-orders/imageChange';
import { useListRevocationsQuery } from '../change-orders/reviews/reviewAttestationsApi';
import { createdWithin } from '../x/apps/change-order/changeOrdersConsoleFilters';
import { changeSetPath } from './changeSetAddress';
import { approvalRecords, deriveChangeSetReviews, reviewPersonOf, reviewStatusText } from './changeSetReviewModel';
import { useGetChangeSetRowDiffQuery, useGetChangeSetRowRevisionsQuery } from './changeSetListApi';

/** Start a row's reads a little before it scrolls in. */
const NEAR_SCREEN = '200px 0px';
const STATE_ORDER: Record<string, number> = { Open: 0, New: 1, Closed: 2 };
const STATES = ['Open', 'New', 'Closed'] as const;

/** The rows' grid, shared with the column head so the two cannot drift apart. */
const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns: 'minmax(160px, 1fr) minmax(380px, 2.6fr) minmax(170px, 1fr) minmax(110px, .6fr) 44px 96px',
  // Below 1275 the image change takes the row's second line.
  '@media (max-width: 1275px)': {
    gridTemplateColumns: 'minmax(170px, 1fr) minmax(170px, 1fr) minmax(110px, .7fr) 96px',
  },
} as const;
const HIDE_NARROW = { '@media (max-width: 1275px)': { display: 'none' } } as const;
const IMAGE_CHANGE_CELL = {
  minWidth: 0,
  '@media (max-width: 1275px)': { gridColumn: '1 / -1', gridRow: 2, marginTop: '8px', maxWidth: 640 },
} as const;

const COLUMNS: ConsoleColumn[] = [
  { key: 'name', label: 'ChangeSet' },
  { key: 'image', label: 'Image change', sx: HIDE_NARROW },
  { key: 'reviews', label: 'Reviews' },
  { key: 'creator', label: 'Created by' },
  { key: 'age', label: 'Age', sx: { ...HIDE_NARROW, textAlign: 'right' } },
  { key: 'action', label: 'Next action', sx: { textAlign: 'right' } },
];

type CardKey = 'requested' | 'open' | 'closed';

const firstLine = (text: string | undefined) => (text ?? '').split('\n')[0].trim();
const requestedOf = (changeSet: ChangeSetRead, userId: string | undefined) =>
  userId !== undefined && (changeSet.ReviewRequests ?? []).some((request) => request.UserID === userId);

/** Open first, then New, then Closed; most recently changed first within each. */
function sortChangeSets(changeSets: readonly ChangeSetRead[]): ChangeSetRead[] {
  return [...changeSets].sort(
    (a, b) =>
      (STATE_ORDER[a.State ?? ''] ?? 3) - (STATE_ORDER[b.State ?? ''] ?? 3) ||
      (b.UpdatedAt ?? '').localeCompare(a.UpdatedAt ?? '') ||
      a.Slug.localeCompare(b.Slug),
  );
}

const ChangeSetRow = memo(function ChangeSetRow({
  changeSet,
  userNames,
  viewerUserId,
  loadedAt,
  now,
  onOpen,
}: {
  changeSet: ChangeSetRead;
  userNames: ReadonlyMap<string, string>;
  viewerUserId: string | undefined;
  loadedAt: number;
  now: number;
  onOpen: (changeSet: ChangeSetRead) => void;
}) {
  const [ref, nearScreen] = useInViewport<HTMLDivElement>(NEAR_SCREEN);
  const changeSetId = changeSet.ChangeSetID ?? '';
  const revisions = useGetChangeSetRowRevisionsQuery({ changeSetId, at: loadedAt }, { skip: !nearScreen || changeSetId === '' });
  const unitIds = useMemo(
    () => [...new Set((revisions.currentData ?? []).flatMap((entry) => (entry.Revision?.UnitID ? [entry.Revision.UnitID] : [])))].sort(),
    [revisions.currentData],
  );
  const diff = useGetChangeSetRowDiffQuery({ changeSetId, unitIds, at: loadedAt }, { skip: !nearScreen || unitIds.length === 0 });
  const attestationIds = useMemo(
    () => approvalRecords(revisions.currentData ?? []).flatMap(({ record }) => (record.AttestationID ? [record.AttestationID] : [])),
    [revisions.currentData],
  );
  const revocations = useListRevocationsQuery({ attestationIds }, { skip: attestationIds.length === 0 });

  const imageChanges = useMemo(() => {
    if (revisions.isError) return imageChangesOfRead(undefined, true);
    if (revisions.currentData !== undefined && unitIds.length === 0) return imageChangesOfRead([], false);
    return imageChangesOfRead(diff.currentData, diff.isError);
  }, [revisions.isError, revisions.currentData, unitIds.length, diff.currentData, diff.isError]);

  const reviews = useMemo(
    () =>
      deriveChangeSetReviews({
        revisions: revisions.currentData ?? [],
        revocations: revocations.currentData ?? [],
        requests: changeSet.ReviewRequests ?? [],
        userNames,
        viewerUserId,
      }),
    [revisions.currentData, revocations.currentData, changeSet.ReviewRequests, userNames, viewerUserId],
  );
  const reviewsKnown = revisions.currentData !== undefined && (attestationIds.length === 0 || revocations.currentData !== undefined);
  const awaitingViewer =
    changeSet.State !== 'Closed' && reviews.requests.some((request) => request.user.isYou && !request.reviewed);
  const creator = changeSet.UserID ? reviewPersonOf(changeSet.UserID, userNames, viewerUserId).name : undefined;

  const open = useCallback(() => onOpen(changeSet), [onOpen, changeSet]);
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      open();
    },
    [open],
  );
  const subline = [changeSet.SpaceSlug, firstLine(changeSet.Description)].filter(Boolean).join(' · ');

  return (
    <Box
      ref={ref}
      role="button"
      tabIndex={0}
      data-testid="change-sets-row"
      data-change-set-slug={changeSet.Slug}
      data-state={changeSet.State}
      onClick={open}
      onKeyDown={onKeyDown}
      aria-label={`Open ChangeSet ${changeSet.Slug}`}
      sx={{
        ...GRID,
        paddingTop: '11px',
        paddingBottom: '11px',
        borderBottom: `1px solid ${T.line}`,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'background .1s ease',
        '&:hover': { background: T.surfaceSunk },
        '&:focus-visible': { outline: `2px solid ${T.accent}`, outlineOffset: -2, borderRadius: R_MICRO },
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="span"
          title={changeSet.Slug}
          sx={{
            fontFamily: T.mono,
            fontSize: 13.5,
            lineHeight: T.lh,
            fontWeight: 600,
            letterSpacing: '-.01em',
            color: T.ink,
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {changeSet.Slug}
        </Typography>
        <Typography
          component="span"
          title={subline}
          sx={{ fontSize: 11.5, lineHeight: T.lh, marginTop: '2px', color: T.ink3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {subline}
        </Typography>
      </Box>

      <Box sx={IMAGE_CHANGE_CELL} data-testid="change-set-row-image-change" data-status={imageChanges.status}>
        <ImageChangesView changes={imageChanges} />
      </Box>

      <Stack sx={{ minWidth: 0, gap: '1px' }}>
        <Stack direction="row" alignItems="center" sx={{ gap: '7px', minWidth: 0 }}>
          <Box
            aria-hidden="true"
            sx={{
              flex: 'none',
              width: 6,
              height: 6,
              borderRadius: '999px',
              background: changeSet.State === 'Open' ? T.accent : changeSet.State === 'Closed' ? T.ok : T.ink3,
            }}
          />
          <Typography component="b" data-testid="change-sets-row-state" sx={{ fontSize: 12.5, lineHeight: T.lh, fontWeight: 600, color: T.ink }}>
            {changeSet.State ?? '—'}
          </Typography>
          <Typography
            component="span"
            data-testid="change-sets-row-reviews"
            sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {reviewsKnown ? reviewStatusText(reviews) : ''}
          </Typography>
        </Stack>
        {reviews.requests.length > 0 ? (
          <Typography
            component="span"
            data-testid="change-sets-row-reviewers"
            title={reviews.requests.map((r) => `${r.user.name}${r.reviewed ? ' (reviewed)' : ''}`).join(', ')}
            sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            Requested:{' '}
            {reviews.requests.map((r, i) => (
              <Box component="span" key={r.user.userId} sx={{ color: r.reviewed ? T.ok : T.ink2 }}>
                {i > 0 ? ', ' : ''}
                {r.user.name}
                {r.user.isYou ? ' (you)' : ''}
                {r.reviewed ? <CheckIcon aria-label="reviewed" sx={{ fontSize: 12, verticalAlign: '-2px', marginLeft: '1px' }} /> : null}
              </Box>
            ))}
          </Typography>
        ) : null}
      </Stack>

      <Typography
        data-testid="change-sets-row-creator"
        title={creator}
        sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {creator === undefined ? '—' : truncateWords(creator, 32)}
      </Typography>

      <Typography sx={{ ...HIDE_NARROW, fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, color: T.ink3, textAlign: 'right', whiteSpace: 'nowrap' }}>
        {ageFrom(changeSet.CreatedAt, now)}
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Box
          component="button"
          type="button"
          data-testid="change-sets-row-action"
          onClick={(event: React.MouseEvent) => {
            event.stopPropagation();
            open();
          }}
          sx={controlSx(awaitingViewer ? 'primary' : 'quiet', true)}
        >
          {awaitingViewer ? 'Review' : 'Open'}
        </Box>
      </Box>
    </Box>
  );
});

export function ChangeSetList() {
  const navigate = useNavigate();
  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;
  const { data, isLoading, isFetching, isError, fulfilledTimeStamp, refetch } = useListAllChangeSetsQuery({});
  const changeSets = useMemo(() => (data ?? []).flatMap((entry) => (entry.ChangeSet === undefined ? [] : [entry.ChangeSet])), [data]);
  const loadedAt = fulfilledTimeStamp ?? 0;

  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const cs of changeSets) {
      if (cs.UserID) ids.add(cs.UserID);
      for (const request of cs.ReviewRequests ?? []) ids.add(request.UserID);
    }
    return [...ids].sort();
  }, [changeSets]);
  const users = useListUsersByIdChunkedQuery({ userIds }, { skip: userIds.length === 0 });
  const userNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of users.data ?? []) {
      const name = entry.User?.DisplayName || entry.User?.Username;
      if (entry.User?.UserID && name) names.set(entry.User.UserID, name);
    }
    return names;
  }, [users.data]);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [requestedOnly, setRequestedOnly] = useState(false);
  const [spaceFilter, setSpaceFilter] = useState<string>('all');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const filtersActive =
    search !== '' || stateFilter !== 'all' || requestedOnly || spaceFilter !== 'all' || createdFrom !== '' || createdTo !== '';
  const clearFilters = useCallback(() => {
    setSearch('');
    setStateFilter('all');
    setRequestedOnly(false);
    setSpaceFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
  }, []);

  // The Age column and the freshness line move on their own between reads.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const spaceSlugs = useMemo(() => [...new Set(changeSets.flatMap((cs) => (cs.SpaceSlug ? [cs.SpaceSlug] : [])))].sort(), [changeSets]);

  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortChangeSets(
      changeSets.filter((cs) => {
        if (stateFilter !== 'all' && cs.State !== stateFilter) return false;
        if (requestedOnly && !(requestedOf(cs, viewerUserId) && cs.State !== 'Closed')) return false;
        if (spaceFilter !== 'all' && cs.SpaceSlug !== spaceFilter) return false;
        if (!createdWithin(cs.CreatedAt, createdFrom, createdTo)) return false;
        if (needle === '') return true;
        const creator = cs.UserID ? (userNames.get(cs.UserID) ?? '') : '';
        return [cs.Slug, cs.SpaceSlug ?? '', cs.Description ?? '', creator].some((field) => field.toLowerCase().includes(needle));
      }),
    );
  }, [changeSets, search, stateFilter, requestedOnly, spaceFilter, createdFrom, createdTo, viewerUserId, userNames]);

  const cards: KpiCard[] = [
    {
      key: 'requested',
      label: 'Review requested',
      hint: 'asked of you, not closed',
      count: changeSets.filter((cs) => requestedOf(cs, viewerUserId) && cs.State !== 'Closed').length,
      status: requestedOnly ? 'on' : 'off',
      tone: T.accent,
    },
    {
      key: 'open',
      label: 'Open',
      hint: 'change in progress',
      count: changeSets.filter((cs) => cs.State === 'Open').length,
      status: stateFilter === 'Open' ? 'on' : 'off',
      tone: T.ink2,
    },
    {
      key: 'closed',
      label: 'Closed',
      hint: 'ready to promote',
      count: changeSets.filter((cs) => cs.State === 'Closed').length,
      status: stateFilter === 'Closed' ? 'on' : 'off',
      tone: T.ok,
    },
  ];
  const selectCard = (key: string) => {
    if ((key as CardKey) === 'requested') setRequestedOnly((on) => !on);
    else {
      const state = key === 'open' ? 'Open' : 'Closed';
      setStateFilter((current) => (current === state ? 'all' : state));
    }
  };

  const onOpen = useCallback(
    (changeSet: ChangeSetRead) => navigate(changeSetPath(changeSet.SpaceSlug ?? '', changeSet.Slug)),
    [navigate],
  );

  return (
    <Box component="section" role="region" aria-label="ChangeSets console" data-testid="change-sets-console" sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}>
      <ConsoleTitleRow
        title="ChangeSets"
        headingId="change-sets-console-heading"
        count={matched.length}
        freshness={freshnessFrom(fulfilledTimeStamp ?? null, now)}
        refreshing={isFetching}
        onRefresh={() => void refetch()}
      />
      <ConsoleIntro>
        A ChangeSet groups the changes made to a set of Units, so they can be reviewed together and promoted as one change.
        Close it when the change is complete.
      </ConsoleIntro>
      <Box role="group" aria-label="ChangeSet triage">
        <KpiStrip
          cards={cards}
          onSelect={selectCard}
          testIdPrefix="change-sets-card"
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
          partialCardSx={KPI_PARTIAL_CARD_SX}
        />
      </Box>
      <ConsoleFilterBar>
        <ConsoleSearch value={search} onChange={setSearch} placeholder="Search ChangeSets" />
        <ConsoleSelectFilter label="State" value={stateFilter} onChange={setStateFilter} allLabel="All" options={STATES} />
        <ConsoleSelectFilter label="Space" value={spaceFilter} onChange={setSpaceFilter} allLabel="All Spaces" options={spaceSlugs} />
        <ConsoleDateRange fromLabel="Created from" toLabel="to" from={createdFrom} onFrom={setCreatedFrom} to={createdTo} onTo={setCreatedTo} />
        <ConsoleClearButton onClick={clearFilters} disabled={!filtersActive}>
          Clear filters
        </ConsoleClearButton>
      </ConsoleFilterBar>

      {isError ? (
        <Box
          role="alert"
          sx={{ border: `1px solid ${T.badLine}`, background: T.badSoft, padding: '10px 12px', fontSize: 12.5, lineHeight: T.lh, color: T.bad }}
        >
          {changeSets.length === 0 ? 'The ChangeSets could not be read.' : 'The ChangeSets could not be read again. The list shows the last read.'}
        </Box>
      ) : null}

      <ConsoleList label="ChangeSets">
        <ConsoleColumnHead columns={COLUMNS} grid={GRID} />
        {isLoading ? (
          <ConsoleLoading testId="change-sets-loading" />
        ) : matched.length === 0 ? (
          <ConsoleEmpty
            message={changeSets.length === 0 ? 'No ChangeSets yet.' : 'No ChangeSet matches these filters.'}
            action={
              changeSets.length > 0 && filtersActive ? (
                <ConsoleClearButton onClick={clearFilters} disabled={false}>
                  Clear filters
                </ConsoleClearButton>
              ) : null
            }
          />
        ) : (
          <>
            {matched.map((cs) => (
              <ChangeSetRow
                key={cs.ChangeSetID}
                changeSet={cs}
                userNames={userNames}
                viewerUserId={viewerUserId}
                loadedAt={loadedAt}
                now={now}
                onOpen={onOpen}
              />
            ))}
            <ConsoleFooter
              countTestId="change-sets-count"
              count={`${matched.length} ${matched.length === 1 ? 'ChangeSet' : 'ChangeSets'}`}
              hint="Select a row to open its change and reviews."
            />
          </>
        )}
      </ConsoleList>
    </Box>
  );
}
