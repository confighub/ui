// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeOrder History card: who promoted, forced, failed and published, newest
 * first, grouped by day (design-mockups/change-order-promotion-history,
 * direction A).
 *
 * It filters by Stage ONLY through its own Stage pills. Selecting a Stage on
 * the Promotion path keeps opening that Stage's panel, as it does everywhere
 * else on this page.
 *
 * Overrides and failures are never folded away: an older day folds only its
 * routine entries, and its exceptions stay on screen.
 */

import { Fragment, useMemo, useState, type ReactNode } from 'react';

import Box from '@mui/material/Box';
import Tooltip from '@mui/material/Tooltip';
import ButtonBase from '@mui/material/ButtonBase';
import NativeSelect from '@mui/material/NativeSelect';
import BoltIcon from '@mui/icons-material/Bolt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import ReportOutlinedIcon from '@mui/icons-material/ReportOutlined';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import type { SvgIconComponent } from '@mui/icons-material';

import {
  HISTORY_INITIAL_DAYS,
  HISTORY_MORE_DAYS,
  NO_FILTERS,
  dayLabel,
  foldReleaseRuns,
  foldedPeople,
  groupByDay,
  hasFilters,
  hiddenExceptionsText,
  isException,
  isFoldable,
  kindTallies,
  lastActivity,
  matchesFilters,
  personCounts,
  plural,
  relativeTime,
  stageCounts,
  summariseDay,
  utcTime,
  type HistoryFilters,
  type HistoryKindFilter,
} from '../changeOrderHistory';
import {
  changeOrderAction,
  changeOrderBorder,
  changeOrderCardTokens,
  changeOrderInk,
  changeOrderSelectedRing,
  changeOrderShape,
  changeOrderStatus,
  changeOrderSurface,
  changeOrderType,
} from '../changeOrdersTokens';
import type { ChangeOrderHistory as ChangeOrderHistoryData } from '../useChangeOrderHistory';
import { HistoryRowView, LinkButton, PersonAvatar, ChangeOrderOpenedEntry } from './ChangeOrderHistoryEntry';

/** The card's element ID, for the summary card's "History" link. */
export const CHANGE_ORDER_HISTORY_ID = 'change-order-history';

const KIND_BUTTONS: { kind: HistoryKindFilter; label: string; Icon: SvgIconComponent; tone?: 'warn' | 'danger' }[] = [
  { kind: 'all', label: 'All', Icon: FormatListBulletedIcon },
  { kind: 'reviews', label: 'Reviews', Icon: RateReviewOutlinedIcon },
  { kind: 'promotions', label: 'Promotions', Icon: KeyboardDoubleArrowRightIcon },
  { kind: 'exceptions', label: 'Exceptions only', Icon: ReportOutlinedIcon, tone: 'warn' },
  { kind: 'overrides', label: 'Overrides', Icon: BoltIcon, tone: 'warn' },
  { kind: 'failures', label: 'Failed', Icon: ErrorOutlineIcon, tone: 'danger' },
  { kind: 'releases', label: 'Releases published', Icon: Inventory2OutlinedIcon },
];

const focusRing = { '&:focus-visible': { outline: `2px solid ${changeOrderAction.focus}`, outlineOffset: 2 } } as const;

function FilterLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <Box
      component={htmlFor ? 'label' : 'span'}
      htmlFor={htmlFor}
      sx={{ fontSize: changeOrderType.size.micro, letterSpacing: '.07em', color: changeOrderInk.subtle, marginRight: '2px' }}
    >
      {children}
    </Box>
  );
}

function Pill({
  pressed,
  onClick,
  children,
  count,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <ButtonBase
      disableRipple
      aria-pressed={pressed}
      onClick={onClick}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        fontFamily: 'inherit',
        fontSize: changeOrderType.size.small,
        padding: '3px 9px',
        borderRadius: `${changeOrderShape.radius.pill}px`,
        border: `1px solid ${pressed ? changeOrderAction.line : changeOrderBorder.strong}`,
        color: pressed ? changeOrderAction.ink : changeOrderInk.muted,
        background: pressed ? changeOrderAction.soft : changeOrderSurface.card,
        fontWeight: pressed ? changeOrderType.weight.semibold : changeOrderType.weight.regular,
        ...focusRing,
      }}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace', fontSize: changeOrderType.size.micro, color: pressed ? changeOrderAction.ink : changeOrderInk.subtle }}>
          {count}
        </Box>
      ) : null}
    </ButtonBase>
  );
}

function ClearFilters({ onClear }: { onClear: () => void }) {
  return <LinkButton onClick={onClear}>Clear filters</LinkButton>;
}

function EmptyState() {
  return (
    <Box data-history-empty sx={{ padding: '26px 20px', color: changeOrderInk.muted, fontSize: changeOrderType.size.prose }}>
      No promotions yet
    </Box>
  );
}

export function ChangeOrderHistory({ history }: { history: ChangeOrderHistoryData }) {
  const { entries, workflowStages, spaceSlugById, now, createdAt } = history;
  const [filters, setFilters] = useState<HistoryFilters>(NO_FILTERS);
  const [openDays, setOpenDays] = useState<ReadonlySet<string>>(() => new Set());
  const [daysShown, setDaysShown] = useState(HISTORY_INITIAL_DAYS);

  const tallies = useMemo(() => kindTallies(entries, filters), [entries, filters]);
  const stages = useMemo(() => stageCounts(entries, filters, workflowStages), [entries, filters, workflowStages]);
  const people = useMemo(() => personCounts(entries, filters), [entries, filters]);
  const filtered = useMemo(() => entries.filter((entry) => matchesFilters(entry, filters)), [entries, filters]);
  const days = useMemo(() => groupByDay(filtered), [filtered]);

  const filtering = hasFilters(filters);
  const setKind = (kind: HistoryKindFilter) =>
    setFilters((f) => ({ ...f, kind: f.kind === kind && kind !== 'all' ? 'all' : kind }));
  const clear = () => setFilters(NO_FILTERS);
  const toggleDay = (key: string) =>
    setOpenDays((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shownDays = days.slice(0, daysShown);
  const hiddenDays = days.slice(daysShown);
  const reachedEnd = hiddenDays.length === 0;

  let body: ReactNode;
  if (history.isLoading) {
    body = (
      <Box sx={{ padding: '26px 20px', color: changeOrderInk.muted, fontSize: changeOrderType.size.prose }}>
        Loading…
      </Box>
    );
  } else if (entries.length === 0) {
    body = <EmptyState />;
  } else if (filtered.length === 0) {
    body = (
      <Box
        sx={{ padding: '26px 20px', color: changeOrderInk.muted, fontSize: changeOrderType.size.prose, display: 'flex', gap: '10px', alignItems: 'center' }}
      >
        <FilterAltOffOutlinedIcon aria-hidden sx={{ fontSize: 18, color: changeOrderInk.subtle }} />
        <span>No matches</span>
        <ClearFilters onClear={clear} />
      </Box>
    );
  } else {
    body = (
      <>
        <Box component="ol" aria-label="History entries, newest first" sx={{ listStyle: 'none', margin: 0, padding: '4px 0 0' }}>
          {shownDays.map((day, index) => {
            const summary = summariseDay(day);
            const foldable = isFoldable(day, index, entries.length);
            const open = !foldable || openDays.has(day.key);
            const routine = [
              summary.promotions ? plural(summary.promotions, 'promotion') : '',
              summary.releases ? `${plural(summary.releases, 'Release')} published` : '',
              summary.reviews ? plural(summary.reviews, 'review event') : '',
            ]
              .filter(Boolean)
              .join(', ');
            const exceptionsInDay = day.entries.filter(isException);
            const routineCount = day.entries.length - exceptionsInDay.length;
            const names = foldedPeople(day);
            return (
              <Fragment key={day.key}>
                <Box
                  component="li"
                  data-history-day={day.key}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    flexWrap: 'wrap',
                    padding: '8px 20px',
                    background: changeOrderSurface.card,
                    borderTop: index === 0 ? 'none' : `1px solid ${changeOrderBorder.default}`,
                    fontSize: changeOrderType.size.small,
                    fontWeight: changeOrderType.weight.semibold,
                    color: changeOrderInk.muted,
                  }}
                >
                  <Box component="h3" sx={{ font: 'inherit', margin: 0 }}>
                    {dayLabel(day.at, now)}
                  </Box>
                  <Box component="span" sx={{ fontWeight: changeOrderType.weight.regular, color: changeOrderInk.subtle }}>
                    {routine}
                    {summary.overrides > 0 ? (
                      <>
                        {routine ? ', ' : ''}
                        <Box component="span" sx={{ color: changeOrderStatus.warn, fontWeight: changeOrderType.weight.semibold }}>
                          {plural(summary.overrides, 'override')}
                        </Box>
                      </>
                    ) : null}
                    {summary.failures > 0 ? (
                      <>
                        {routine || summary.overrides ? ', ' : ''}
                        <Box component="span" sx={{ color: changeOrderStatus.danger, fontWeight: changeOrderType.weight.semibold }}>
                          {summary.failures} with failures
                        </Box>
                      </>
                    ) : null}
                  </Box>
                  {foldable && open ? (
                    <Box sx={{ marginLeft: 'auto' }}>
                      <LinkButton onClick={() => toggleDay(day.key)} expanded>
                        Collapse
                      </LinkButton>
                    </Box>
                  ) : null}
                </Box>
                {open
                  ? foldReleaseRuns(day.entries).map((row) => (
                      <HistoryRowView key={row.id} row={row} spaceSlugById={spaceSlugById} defaultOpen={index < 2 && row.kind === 'action' && isException(row)} />
                    ))
                  : (
                    <>
                      {exceptionsInDay.map((entry) => (
                        <HistoryRowView key={entry.id} row={entry} spaceSlugById={spaceSlugById} defaultOpen={false} />
                      ))}
                      <Box
                        component="li"
                        data-history-folded={day.key}
                        sx={{
                          padding: '8px 20px 10px 60px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          flexWrap: 'wrap',
                          color: changeOrderInk.muted,
                          fontSize: changeOrderType.size.small,
                          borderTop: `1px solid ${changeOrderSurface.inset}`,
                        }}
                      >
                        <UnfoldMoreIcon aria-hidden sx={{ fontSize: 16, color: changeOrderInk.subtle }} />
                        <span>
                          {plural(routineCount, 'routine entry', 'routine entries')}
                          {names.length > 0
                            ? ` (by ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''})`
                            : ''}
                        </span>
                        <LinkButton onClick={() => toggleDay(day.key)} expanded={false}>
                          Show
                        </LinkButton>
                      </Box>
                    </>
                  )}
              </Fragment>
            );
          })}
          {reachedEnd && !filtering && createdAt !== undefined ? <ChangeOrderOpenedEntry at={createdAt} /> : null}
        </Box>
        {!reachedEnd ? (
          <Box
            sx={{
              padding: '12px 20px',
              borderTop: `1px solid ${changeOrderBorder.default}`,
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <ButtonBase
              disableRipple
              onClick={() => setDaysShown((n) => n + HISTORY_MORE_DAYS)}
              sx={{
                border: `1px solid ${changeOrderBorder.strong}`,
                borderRadius: `${changeOrderShape.radius.md}px`,
                padding: '5px 12px',
                fontFamily: 'inherit',
                fontSize: changeOrderType.size.small,
                fontWeight: changeOrderType.weight.semibold,
                color: changeOrderInk.default,
                background: changeOrderSurface.card,
                ...focusRing,
              }}
            >
              Show {plural(Math.min(HISTORY_MORE_DAYS, hiddenDays.length), 'earlier day')}
            </ButtonBase>
            <Box component="span" sx={{ color: changeOrderInk.subtle, fontSize: changeOrderType.size.small }}>
              <Box component="span" data-history-hidden-exceptions sx={{ color: changeOrderInk.muted, fontWeight: changeOrderType.weight.semibold }}>
                {hiddenExceptionsText(hiddenDays)}
              </Box>
            </Box>
          </Box>
        ) : null}
      </>
    );
  }

  return (
    <Box
      component="section"
      role="region"
      aria-label="ChangeOrder history"
      id={CHANGE_ORDER_HISTORY_ID}
      sx={{
        marginTop: '20px',
        background: changeOrderSurface.card,
        border: `1px solid ${changeOrderBorder.default}`,
        borderRadius: `${changeOrderCardTokens.radius}px`,
        boxShadow: changeOrderCardTokens.shadow,
        overflow: 'hidden',
        scrollMarginTop: '16px',
      }}
    >
      <Box sx={{ padding: '16px 20px 12px', background: changeOrderSurface.sunk, borderBottom: `1px solid ${changeOrderBorder.default}` }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <Box
            component="h2"
            sx={{ fontSize: changeOrderType.size.prose, lineHeight: changeOrderType.lineHeight.heading, fontWeight: changeOrderType.weight.semibold, margin: 0 }}
          >
            History
          </Box>
          {entries.length > 0 && !history.isLoading ? (
            <Box component="span" data-history-count sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.subtle }}>
              {plural(entries.length, 'entry', 'entries')}
            </Box>
          ) : null}
        </Box>
        {history.error !== undefined ? (
          <Box role="alert" sx={{ fontSize: changeOrderType.size.small, color: changeOrderStatus.danger, marginTop: '6px' }}>
            Some history could not be read. Names or Releases may be missing.
          </Box>
        ) : null}

        {entries.length > 0 && !history.isLoading ? (
          <>
            <Box role="group" aria-label="Filter by kind of entry" sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
              {KIND_BUTTONS.map(({ kind, label, Icon, tone }) => {
                const pressed = filters.kind === kind;
                const n = tallies[kind];
                const iconColor =
                  tone === undefined || n === 0
                    ? changeOrderInk.subtle
                    : tone === 'warn'
                      ? changeOrderStatus.warn
                      : changeOrderStatus.danger;
                return (
                  <ButtonBase
                    key={kind}
                    disableRipple
                    aria-pressed={pressed}
                    data-history-kind={kind}
                    onClick={() => setKind(kind)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontFamily: 'inherit',
                      border: `1px solid ${pressed ? changeOrderAction.ink : changeOrderBorder.default}`,
                      boxShadow: pressed ? changeOrderSelectedRing : 'none',
                      background: changeOrderSurface.card,
                      borderRadius: `${changeOrderShape.radius.md}px`,
                      padding: '5px 10px',
                      fontSize: changeOrderType.size.small,
                      color: pressed ? changeOrderAction.ink : changeOrderInk.muted,
                      ...focusRing,
                    }}
                  >
                    <Icon aria-hidden sx={{ fontSize: 15, color: pressed ? changeOrderAction.ink : iconColor }} />
                    <Box component="b" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: changeOrderType.weight.semibold, color: changeOrderInk.default, fontSize: changeOrderType.size.body }}>
                      {n}
                    </Box>
                    {label}
                  </ButtonBase>
                );
              })}
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px', marginTop: '10px' }}>
              {stages.length > 0 ? (
                <Box role="group" aria-label="Filter by Stage" sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <FilterLabel>Stage</FilterLabel>
                  <Pill pressed={filters.stage === null} onClick={() => setFilters((f) => ({ ...f, stage: null }))}>
                    All Stages
                  </Pill>
                  {stages.map(({ stage, count }) => (
                    <Pill
                      key={stage}
                      pressed={filters.stage === stage}
                      count={count}
                      onClick={() => setFilters((f) => ({ ...f, stage: f.stage === stage ? null : stage }))}
                    >
                      {stage || 'no Stage'}
                    </Pill>
                  ))}
                </Box>
              ) : null}
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <FilterLabel htmlFor="change-order-history-person">Person</FilterLabel>
                <NativeSelect
                  id="change-order-history-person"
                  value={filters.person ?? ''}
                  onChange={(event) => setFilters((f) => ({ ...f, person: event.target.value || null }))}
                  disableUnderline
                  sx={{
                    fontSize: changeOrderType.size.small,
                    color: changeOrderInk.default,
                    background: changeOrderSurface.card,
                    border: `1px solid ${changeOrderBorder.strong}`,
                    borderRadius: `${changeOrderShape.radius.md}px`,
                    paddingLeft: '9px',
                    '& select': { paddingTop: '3px', paddingBottom: '3px' },
                  }}
                >
                  <option value="">Everyone</option>
                  {people.map(({ person, count }) => (
                    <option key={person.key} value={person.key}>
                      {person.name}
                      {person.isYou ? ' (you)' : ''} · {count}
                    </option>
                  ))}
                </NativeSelect>
              </Box>
              {filtering ? (
                <>
                  <Box component="span" sx={{ fontSize: changeOrderType.size.small, color: changeOrderInk.muted }}>
                    {plural(filtered.length, 'entry', 'entries')} match
                  </Box>
                  <ClearFilters onClear={clear} />
                </>
              ) : null}
            </Box>
          </>
        ) : null}
      </Box>

      {body}
    </Box>
  );
}

/**
 * The summary card's "Last activity" fact: who ran the newest promote action,
 * when, and whether it was forced.
 */
export function ChangeOrderLastActivity({ history }: { history: ChangeOrderHistoryData }) {
  const last = useMemo(() => lastActivity(history.entries), [history.entries]);
  if (history.isLoading) return <>…</>;
  if (last === undefined) {
    return (
      <Box component="span" sx={{ color: changeOrderInk.muted }}>
        No promotions yet
      </Box>
    );
  }
  return (
    <Box component="span" data-last-activity sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
      <PersonAvatar person={last.person} size={18} />
      <span>
        {last.person.name}
        {last.person.isYou ? ' (you)' : ''},{' '}
        <Tooltip title={utcTime(last.at)} describeChild placement="bottom-start">
          <Box component="time" dateTime={new Date(last.at).toISOString()}>
            {relativeTime(last.at, history.now)}
          </Box>
        </Tooltip>
      </span>
      {last.override ? (
        <Box
          component="span"
          sx={{
            fontSize: changeOrderType.size.micro,
            fontWeight: changeOrderType.weight.strong,
            letterSpacing: '.05em',
            borderRadius: `${changeOrderShape.radius.sm}px`,
            padding: '1px 6px',
            border: `1px solid ${changeOrderStatus.warn}`,
            color: changeOrderStatus.warn,
            background: changeOrderStatus.warnSoft,
          }}
        >
          Forced
        </Box>
      ) : null}
      <LinkButton
        onClick={() =>
          document
            .getElementById(CHANGE_ORDER_HISTORY_ID)
            ?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        }
      >
        History
      </LinkButton>
    </Box>
  );
}
