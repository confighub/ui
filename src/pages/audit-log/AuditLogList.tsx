// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The AuditEvents of the Organization, newest first, a page at a time.
 *
 * Every filter is the server's: the filters make one `where` expression, so each page holds only
 * matching events and "Load more" continues the same list. The filters live in the address, so a
 * link opens the same view. A row opens to its details: the error, the authority it acted under,
 * and what changed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import {
  ConsoleTable,
  type ConsoleTableColumn,
  ConsoleTableRow,
} from '@/components/console-table/ConsoleTable';
import { inClause, uniqueIds } from '@/hooks/inClauseChunks';
import { type PrincipalNames, usePrincipalNames } from '@/hooks/usePrincipalNames';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type AuditEventRead,
  useListServiceAccountsQuery,
  useListSpacesQuery,
  useListUsersQuery,
} from '@confighub/rtk-query';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
  ConsoleClearButton,
  ConsoleEmpty,
  ConsoleFooter,
  ConsoleIntro,
  ConsoleTitleRow,
} from '../change-orders/components/ConsoleParts';
import {
  ABOVE_ROW_LINK_SX,
  ROW_LINK_SX,
  R_MICRO,
  consoleTokens as T,
  controlSx,
  freshnessFrom,
} from '../change-orders/consoleStyle';
import { AuditEventDetail } from './AuditEventDetail';
import {
  AuditLogFilterBar,
  type FiltersUpdate,
  type PickGroup,
  type PickOption,
} from './AuditLogFilterBar';
import {
  type OwnerLookup,
  clockText,
  credentialOwnerId,
  dayText,
  isFailure,
  principalLabel,
  subjectHref,
  subjectName,
  subjectSpaceSlug,
  subjectText,
} from './auditEventText';
import { useListAuditEventPagesInfiniteQuery } from './auditLogApi';
import {
  SUBJECT_TYPES,
  buildAuditWhere,
  clearFilters,
  filtersFromParams,
  filtersToParams,
  hasFilters,
} from './auditLogFilters';
import { useAuditViewer } from './useAuditViewer';

const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns:
    '22px minmax(118px, .8fr) minmax(130px, .8fr) minmax(200px, 1.5fr) minmax(170px, 1.2fr) minmax(170px, 1.2fr) minmax(86px, .5fr)',
  '@media (max-width: 1100px)': {
    gridTemplateColumns:
      '22px minmax(100px, .8fr) minmax(110px, .8fr) minmax(160px, 1.5fr) minmax(140px, 1.2fr) minmax(130px, 1fr)',
  },
} as const;
const HIDE_NARROW = { '@media (max-width: 1100px)': { display: 'none' } } as const;

// Headers only: the rows are drawn by `renderRow`, and the server sorts, newest first.
const COLUMNS: ConsoleTableColumn<AuditRow>[] = [
  { id: 'open', header: '' },
  { id: 'time', header: 'Time' },
  { id: 'action', header: 'Action' },
  { id: 'subject', header: 'Subject' },
  { id: 'actor', header: 'Actor' },
  { id: 'outcome', header: 'Outcome' },
  { id: 'origin', header: 'Origin', sx: HIDE_NARROW },
];

const ONE_LINE = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;
const SUB_SX = { ...ONE_LINE, fontSize: 11.5, lineHeight: T.lh, color: T.ink3 } as const;

interface AuditRow {
  event: AuditEventRead;
  id: string;
  /** Its place among the loaded events of its request, when the request has more than one. */
  request?: { index: number; count: number };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function KindTag({ children }: { children: string }) {
  return (
    <Box
      component='span'
      sx={{
        fontFamily: T.sans,
        fontSize: 10.5,
        fontWeight: 700,
        color: T.ink3,
        border: `1px solid ${T.line}`,
        borderRadius: R_MICRO,
        padding: '0 4px',
        marginLeft: '6px',
        verticalAlign: '1px',
      }}
    >
      {children}
    </Box>
  );
}

function ActorCell({
  event,
  principals,
}: {
  event: AuditEventRead;
  principals: PrincipalNames;
}) {
  const onBehalfOf = event.OnBehalfOfUserID
    ? principalLabel(
        principals.user(event.OnBehalfOfUserID),
        principals.loaded,
        'a user who cannot be read',
      )
    : undefined;
  let main;
  if (!event.UserID) {
    main = (
      <Typography
        component='span'
        sx={{ ...ONE_LINE, fontSize: 13, lineHeight: T.lh, fontWeight: 600, color: T.ink }}
      >
        ConfigHub
        <KindTag>{event.Origin ?? 'System'}</KindTag>
      </Typography>
    );
  } else {
    const principal = principals.user(event.UserID);
    const name = principalLabel(principal, principals.loaded, 'A user who cannot be read');
    main =
      principal.kind === 'serviceAccount' && principal.href ? (
        // The tag keeps its width, and a long name is cut instead.
        <Stack direction='row' alignItems='baseline' sx={{ minWidth: 0 }}>
          <Box
            component={RouterLink}
            to={principal.href}
            title={name}
            sx={{
              ...ONE_LINE,
              ...ABOVE_ROW_LINK_SX,
              fontFamily: T.mono,
              fontSize: 12.5,
              lineHeight: T.lh,
              fontWeight: 600,
              color: T.ink,
              textDecoration: 'none',
              '&:hover': { color: T.action, textDecoration: 'underline' },
            }}
          >
            {name}
          </Box>
          <Box component='span' sx={{ flex: 'none' }}>
            <KindTag>ServiceAccount</KindTag>
          </Box>
        </Stack>
      ) : (
        <Typography
          component='span'
          title={name}
          sx={{ ...ONE_LINE, fontSize: 13, lineHeight: T.lh, fontWeight: 600, color: T.ink }}
        >
          {name}
          {principal.isYou ? (
            <Box component='span' sx={{ fontWeight: 500, color: T.ink3 }}>
              {' '}
              (you)
            </Box>
          ) : null}
        </Typography>
      );
  }
  return (
    <>
      {main}
      {onBehalfOf ? (
        <Typography component='span' sx={{ ...SUB_SX, color: T.ink2 }}>
          on behalf of {onBehalfOf}
        </Typography>
      ) : null}
    </>
  );
}

function SubjectCell({
  event,
  spaceSlugById,
  owner,
}: {
  event: AuditEventRead;
  spaceSlugById: ReadonlyMap<string, string>;
  owner: OwnerLookup;
}) {
  const href = subjectHref(event, spaceSlugById, owner);
  const space = subjectSpaceSlug(event, spaceSlugById);
  const slug = subjectName(event, owner);
  const text = (
    <>
      {space ? (
        <Box component='span' sx={{ color: T.ink2, fontWeight: 500 }}>
          {space}/
        </Box>
      ) : null}
      {slug}
    </>
  );
  const nameSx = {
    ...ONE_LINE,
    fontFamily: T.mono,
    fontSize: 13,
    lineHeight: T.lh,
    fontWeight: 600,
    color: T.ink,
  } as const;
  return (
    <>
      <Typography component='span' sx={SUB_SX}>
        {event.SubjectEntityType}
      </Typography>
      {href ? (
        <Box
          component={RouterLink}
          to={href}
          title={subjectText(event, spaceSlugById, owner)}
          sx={{
            ...nameSx,
            ...ABOVE_ROW_LINK_SX,
            textDecoration: 'none',
            '&:hover': {
              color: T.action,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            },
          }}
        >
          {text}
        </Box>
      ) : (
        <Box component='span' title={subjectText(event, spaceSlugById, owner)} sx={nameSx}>
          {text}
        </Box>
      )}
    </>
  );
}

function OutcomeCell({ event }: { event: AuditEventRead }) {
  const bad = isFailure(event);
  return (
    <>
      <Stack direction='row' alignItems='center' sx={{ gap: '7px' }}>
        <Box
          aria-hidden='true'
          sx={{
            width: 7,
            height: 7,
            borderRadius: '999px',
            flex: 'none',
            background: bad ? T.bad : T.ok,
          }}
        />
        <Typography
          component='span'
          sx={{
            fontSize: 12.5,
            lineHeight: T.lh,
            fontWeight: 600,
            color: bad ? T.bad : T.ink,
          }}
        >
          {event.Outcome}
        </Typography>
      </Stack>
      {bad && event.Error ? (
        <Typography
          component='span'
          title={event.Error}
          sx={{ ...SUB_SX, ...ABOVE_ROW_LINK_SX, color: T.bad, paddingLeft: '14px' }}
        >
          {event.Error}
        </Typography>
      ) : null}
    </>
  );
}

function BannerOwnEvents() {
  return (
    <Stack
      direction='row'
      role='status'
      data-testid='audit-log-own-events-banner'
      sx={{
        gap: '10px',
        alignItems: 'flex-start',
        border: `1px solid ${T.progressLine}`,
        background: T.progressSoft,
        color: T.progressInk,
        borderRadius: '8px',
        padding: '9px 12px',
        fontSize: 12.5,
        lineHeight: T.lh,
        marginBottom: '12px',
      }}
    >
      <InfoOutlinedIcon
        aria-hidden='true'
        sx={{ fontSize: 16, marginTop: '1px', flex: 'none' }}
      />
      <span>
        <Box component='b' sx={{ fontWeight: 650 }}>
          You see only your own events.
        </Box>{' '}
        An Organization admin sees all events.
      </span>
    </Stack>
  );
}

export function AuditLogList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);

  const viewer = useAuditViewer();
  const readsAll = viewer.readsAll !== false;

  // "Last 7 days" counts back from this, not from each render, so the list keeps one query.
  // A change of range and Refresh move it to the present.
  const [anchor, setAnchor] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // The address a change wrote and the router has not given back yet. Two changes in quick
  // succession, such as two Actions checked, each build on the one before.
  const pending = useRef<URLSearchParams | null>(null);
  useEffect(() => {
    pending.current = null;
  }, [searchParams]);
  const changeFilters = useCallback(
    (update: FiltersUpdate) => {
      const base = pending.current ?? searchParams;
      const current = filtersFromParams(base);
      const next = update(current);
      if (next.time !== current.time) setAnchor(Date.now());
      const params = filtersToParams(next, base);
      pending.current = params;
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // The server shows anyone but an admin only their own events, so for them the Actor is not a filter.
  const effectiveFilters = useMemo(
    () => (readsAll ? filters : { ...filters, actorId: '', onBehalfOf: false }),
    [filters, readsAll],
  );
  const { where, rejected } = useMemo(
    () => buildAuditWhere(effectiveFilters, anchor),
    [effectiveFilters, anchor],
  );

  // The list does not wait for the role reads: the server sends only what the viewer may read.
  const pages = useListAuditEventPagesInfiniteQuery({ where });
  // `currentData`, not `data`: `data` keeps the pages of the filters before while the new ones
  // load, and after they fail. Load more keeps the same filters, so its rows stay shown.
  const events = useMemo(
    () =>
      (pages.currentData?.pages ?? []).flatMap((page) =>
        page.events.flatMap((entry) => (entry.AuditEvent ? [entry.AuditEvent] : [])),
      ),
    [pages.currentData],
  );

  const rows = useMemo<AuditRow[]>(() => {
    const byRequest = new Map<string, AuditEventRead[]>();
    for (const event of events) {
      if (!event.RequestID) continue;
      byRequest.set(event.RequestID, [...(byRequest.get(event.RequestID) ?? []), event]);
    }
    return events.map((event, index) => {
      const same = event.RequestID ? (byRequest.get(event.RequestID) ?? []) : [];
      // Numbered in the order they happened: the list is newest first.
      const order = [...same].reverse();
      return {
        event,
        id: event.AuditEventID ?? `row-${index}`,
        request:
          same.length > 1
            ? { index: order.indexOf(event) + 1, count: same.length }
            : undefined,
      };
    });
  }, [events]);

  const userIds = useMemo(
    () =>
      uniqueIds(
        events.flatMap((event) => [
          event.UserID,
          event.OnBehalfOfUserID,
          credentialOwnerId(event),
        ]),
      ),
    [events],
  );
  const groupIds = useMemo(
    () =>
      uniqueIds(events.flatMap((event) => (event.Grants ?? []).map((grant) => grant.GroupID))),
    [events],
  );
  const principals = usePrincipalNames(userIds, groupIds);
  const owner = useCallback<OwnerLookup>(
    (userId) => {
      const principal = principals.user(userId);
      const name = principalLabel(principal, principals.loaded, '');
      return name === '' || name === '…' ? undefined : { name, href: principal.href };
    },
    [principals],
  );

  const spaceIds = useMemo(
    () =>
      uniqueIds(
        events.flatMap((event) => [
          event.SpaceID,
          ...(event.Grants ?? [])
            .filter((grant) => grant.Source === 'SpaceGrant' || grant.EntityType === 'Space')
            .map((grant) => grant.EntityID),
        ]),
      ),
    [events],
  );
  const spaces = useListSpacesQuery(
    { where: inClause('SpaceID', spaceIds), select: 'SpaceID,Slug' },
    { skip: spaceIds.length === 0 },
  );
  const spaceSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of spaces.data ?? [])
      if (entry.Space?.SpaceID) map.set(entry.Space.SpaceID, entry.Space.Slug);
    return map;
  }, [spaces.data]);

  // The Actor list: everyone in the Organization, people and service accounts apart.
  const users = useListUsersQuery({}, { skip: !readsAll });
  const serviceAccounts = useListServiceAccountsQuery({
    select: 'ServiceAccountID,Slug,UserID',
  });
  const actorGroups = useMemo<PickGroup[]>(() => {
    const accountUsers = new Set<string>();
    const accounts: PickOption[] = [];
    for (const entry of serviceAccounts.data ?? []) {
      const sa = entry.ServiceAccount;
      if (!sa?.UserID) continue;
      accountUsers.add(sa.UserID);
      accounts.push({ value: sa.UserID, label: sa.Slug, mono: true });
    }
    const people: PickOption[] = [];
    for (const entry of users.data ?? []) {
      const user = entry.User;
      if (!user?.UserID || accountUsers.has(user.UserID)) continue;
      people.push({
        value: user.UserID,
        label: user.DisplayName || user.Username || 'A user with no name',
      });
    }
    const byLabel = (a: PickOption, b: PickOption) => a.label.localeCompare(b.label);
    return [
      { label: 'People', options: people.sort(byLabel) },
      { label: 'Service accounts', options: accounts.sort(byLabel) },
    ].filter((group) => group.options.length > 0);
  }, [users.data, serviceAccounts.data]);
  const actorName = useMemo(() => {
    if (filters.actorId === '') return 'Anyone';
    for (const group of actorGroups) {
      const found = group.options.find((option) => option.value === filters.actorId);
      if (found) return found.label;
    }
    return principalLabel(
      principals.user(filters.actorId),
      principals.loaded,
      'The chosen actor',
    );
  }, [filters.actorId, actorGroups, principals]);

  const subjectTypes = useMemo(
    () => [
      ...new Set<string>([
        ...SUBJECT_TYPES,
        ...events.flatMap((event) =>
          event.SubjectEntityType ? [event.SubjectEntityType] : [],
        ),
        ...(filters.subjectType ? [filters.subjectType] : []),
      ]),
    ],
    [events, filters.subjectType],
  );
  const subjects = useMemo<PickOption[]>(() => {
    const seen = new Map<string, string>();
    for (const event of events) {
      if (
        event.SubjectEntityType !== filters.subjectType ||
        !event.SubjectEntityID ||
        seen.has(event.SubjectEntityID)
      )
        continue;
      seen.set(event.SubjectEntityID, subjectText(event, spaceSlugById, owner));
    }
    return [...seen]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events, filters.subjectType, spaceSlugById, owner]);

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback((id: string) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const showRequest = useCallback(
    (requestId: string) => {
      setOpen(new Set());
      changeFilters((current) => ({ ...current, requestId }));
    },
    [changeFilters],
  );

  const renderRow = useCallback(
    ({ event, id, request }: AuditRow) => {
      const expanded = open.has(id);
      const detailId = `audit-event-detail-${id}`;
      return (
        <>
          <ConsoleTableRow
            grid={GRID}
            attributes={{
              'data-testid': 'audit-log-row',
              'data-outcome': event.Outcome,
              'data-action': event.Action,
            }}
          >
            <Box sx={{ minWidth: 0, display: 'flex' }}>
              <Box
                component='button'
                type='button'
                aria-expanded={expanded}
                aria-controls={expanded ? detailId : undefined}
                aria-label={`${expanded ? 'Hide' : 'Show'} the details of ${event.Action} ${subjectText(event, spaceSlugById, owner)}`}
                onClick={() => toggle(id)}
                sx={{ all: 'unset', ...ROW_LINK_SX, display: 'inline-flex', color: T.ink3 }}
              >
                <ChevronRightIcon
                  aria-hidden='true'
                  sx={{
                    fontSize: 16,
                    transition: 'transform .15s ease',
                    transform: expanded ? 'rotate(90deg)' : 'none',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component='span'
                title={event.OccurredAt}
                sx={{
                  ...ONE_LINE,
                  ...ABOVE_ROW_LINK_SX,
                  fontFamily: T.mono,
                  fontSize: 12.5,
                  lineHeight: T.lh,
                  color: T.ink,
                }}
              >
                {clockText(event.OccurredAt)}
              </Typography>
              <Typography component='span' sx={SUB_SX}>
                {dayText(event.OccurredAt, now)}
              </Typography>
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                component='span'
                sx={{
                  ...ONE_LINE,
                  fontSize: 13,
                  lineHeight: T.lh,
                  fontWeight: 600,
                  color: T.ink,
                }}
              >
                {event.Action}
              </Typography>
              {request && filters.requestId === '' && event.RequestID ? (
                <Typography component='span' sx={SUB_SX}>
                  {request.index} of {request.count} in{' '}
                  <Box
                    component='button'
                    type='button'
                    onClick={() => showRequest(event.RequestID ?? '')}
                    sx={{
                      all: 'unset',
                      ...ABOVE_ROW_LINK_SX,
                      display: 'inline',
                      cursor: 'pointer',
                      color: T.ink3,
                      textDecoration: 'underline',
                      textDecorationColor: T.lineStrong,
                      textUnderlineOffset: '2px',
                      '&:hover': { color: T.action },
                      '&:focus-visible': {
                        outline: `2px solid ${T.focus}`,
                        borderRadius: R_MICRO,
                      },
                    }}
                  >
                    one request
                  </Box>
                </Typography>
              ) : null}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <SubjectCell event={event} spaceSlugById={spaceSlugById} owner={owner} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <ActorCell event={event} principals={principals} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <OutcomeCell event={event} />
            </Box>
            <Box sx={{ minWidth: 0, ...HIDE_NARROW }}>
              <Typography
                component='span'
                sx={{ ...ONE_LINE, fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}
              >
                {event.Origin}
              </Typography>
            </Box>
          </ConsoleTableRow>
          {expanded ? (
            <AuditEventDetail
              id={detailId}
              event={event}
              spaceSlugById={spaceSlugById}
              owner={owner}
              spacesLoaded={!spaces.isLoading}
              principals={principals}
              requestFiltered={
                filters.requestId !== '' && filters.requestId === event.RequestID
              }
              requestCount={
                rows.filter((row) => row.event.RequestID === event.RequestID).length
              }
              onShowRequest={showRequest}
            />
          ) : null}
        </>
      );
    },
    [
      open,
      toggle,
      spaceSlugById,
      spaces.isLoading,
      principals,
      owner,
      filters.requestId,
      showRequest,
      now,
      rows,
    ],
  );

  const filtersActive = hasFilters(filters);
  const loaded = pages.currentData !== undefined;
  const loading = pages.isFetching && !loaded;
  const more = loaded && pages.hasNextPage && !pages.isError;

  return (
    <Box
      component='section'
      role='region'
      aria-label='Audit log console'
      data-testid='audit-log-console'
      sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}
    >
      <ConsoleTitleRow
        title='Audit log'
        headingId='audit-log-console-heading'
        count={loaded && !loading ? events.length : undefined}
        note={
          more ? (
            <Typography
              component='span'
              sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3 }}
            >
              more to load
            </Typography>
          ) : undefined
        }
        freshness={freshnessFrom(pages.fulfilledTimeStamp ?? null, now)}
        refreshing={pages.isFetching}
        onRefresh={() => {
          if (filters.time === 'custom') void pages.refetch();
          else setAnchor(Date.now());
        }}
      />
      <ConsoleIntro>
        Each row is one action in this Organization: who did it, on what, and the result. The
        newest events are at the top.
      </ConsoleIntro>

      {viewer.readsAll === false ? <BannerOwnEvents /> : null}

      <AuditLogFilterBar
        filters={filters}
        onChange={changeFilters}
        subjectTypes={subjectTypes}
        subjects={subjects}
        actors={actorGroups}
        actorName={actorName}
        readsAll={readsAll}
      />

      {rejected.length > 0 ? (
        <Box
          role='alert'
          sx={{
            border: `1px solid ${T.badLine}`,
            background: T.badSoft,
            padding: '10px 12px',
            fontSize: 12.5,
            lineHeight: T.lh,
            color: T.bad,
          }}
        >
          The address has a value that is not valid for {rejected.join(', ')}. The list does
          not use it.
        </Box>
      ) : null}

      {pages.isError ? (
        <Box
          role='alert'
          data-testid='audit-log-error'
          sx={{
            border: `1px solid ${T.badLine}`,
            background: T.badSoft,
            padding: '10px 12px',
            fontSize: 12.5,
            lineHeight: T.lh,
            color: T.bad,
          }}
        >
          {/* RTK's own `isFetchNextPageError` test; the hook's type leaves that flag out. */}
          {loaded && pages.direction === 'forward'
            ? 'More audit events could not be read: '
            : 'The audit events could not be read: '}
          {getApiErrorMessage(pages.error, 'the server did not say why.')}
        </Box>
      ) : null}

      <ConsoleTable
        label='Audit events'
        data={rows}
        columns={COLUMNS}
        grid={GRID}
        getRowId={(row) => row.id}
        isLoading={loading}
        loadingTestId='audit-log-loading'
        renderRow={renderRow}
        empty={
          pages.isError ? (
            <ConsoleEmpty message='The events could not be read.' />
          ) : (
            <ConsoleEmpty
              message={
                filtersActive
                  ? 'No event matches these filters.'
                  : 'No events in this time range.'
              }
              action={
                filtersActive ? (
                  <ConsoleClearButton
                    onClick={() => changeFilters(clearFilters)}
                    disabled={false}
                  >
                    Clear filters
                  </ConsoleClearButton>
                ) : null
              }
            />
          )
        }
        footer={
          // No count or "all shown" before the events for these filters are read.
          loaded ? (
            <ConsoleFooter
              countTestId='audit-log-count'
              count={`${plural(events.length, 'event')} · newest first`}
              hint={
                more ? (
                  <Box
                    component='button'
                    type='button'
                    data-testid='audit-log-load-more'
                    onClick={() => void pages.fetchNextPage()}
                    disabled={pages.isFetchingNextPage}
                    sx={controlSx('quiet', !pages.isFetchingNextPage)}
                  >
                    {pages.isFetchingNextPage ? 'Loading…' : 'Load more'}
                  </Box>
                ) : (
                  'All matching events are shown.'
                )
              }
            />
          ) : undefined
        }
      />
    </Box>
  );
}
