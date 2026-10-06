// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Rollout History card: who promoted, forced, failed and published, newest
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
import ButtonBase from '@mui/material/ButtonBase';
import NativeSelect from '@mui/material/NativeSelect';
import BoltIcon from '@mui/icons-material/Bolt';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import HistoryIcon from '@mui/icons-material/History';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import ReportOutlinedIcon from '@mui/icons-material/ReportOutlined';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import type { SvgIconComponent } from '@mui/icons-material';

import {
  HISTORY_INITIAL_DAYS,
  HISTORY_MORE_DAYS,
  HISTORY_RETENTION,
  NO_FILTERS,
  dayLabel,
  foldReleaseRuns,
  foldedPeople,
  fullTime,
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
  type HistoryFilters,
  type HistoryKindFilter,
} from '../rolloutHistory';
import {
  rolloutBorder,
  rolloutCardTokens,
  rolloutInk,
  rolloutSelectedRing,
  rolloutShape,
  rolloutStatus,
  rolloutSurface,
  rolloutType,
} from '../rolloutsTokens';
import type { RolloutHistory as RolloutHistoryData } from '../useRolloutHistory';
import { HistoryRowView, LinkButton, PersonAvatar, RolloutOpenedEntry } from './RolloutHistoryEntry';

/** The card's element ID, for the summary card's "History" link. */
export const ROLLOUT_HISTORY_ID = 'rollout-history';

const KIND_BUTTONS: { kind: HistoryKindFilter; label: string; Icon: SvgIconComponent; tone?: 'warn' | 'danger' }[] = [
  { kind: 'all', label: 'All', Icon: FormatListBulletedIcon },
  { kind: 'promotions', label: 'Promotions', Icon: KeyboardDoubleArrowRightIcon },
  { kind: 'exceptions', label: 'Exceptions only', Icon: ReportOutlinedIcon, tone: 'warn' },
  { kind: 'overrides', label: 'Overrides', Icon: BoltIcon, tone: 'warn' },
  { kind: 'failures', label: 'Failed', Icon: ErrorOutlineIcon, tone: 'danger' },
  { kind: 'releases', label: 'Releases published', Icon: Inventory2OutlinedIcon },
];

const focusRing = { '&:focus-visible': { outline: `2px solid ${rolloutStatus.accent}`, outlineOffset: 2 } } as const;

function FilterLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <Box
      component={htmlFor ? 'label' : 'span'}
      htmlFor={htmlFor}
      sx={{ fontSize: rolloutType.size.micro, letterSpacing: '.07em', color: rolloutInk.subtle, marginRight: '2px' }}
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
        fontSize: rolloutType.size.small,
        padding: '3px 9px',
        borderRadius: `${rolloutShape.radius.pill}px`,
        border: `1px solid ${pressed ? rolloutStatus.accentLine : rolloutBorder.strong}`,
        color: pressed ? rolloutStatus.accent : rolloutInk.muted,
        background: pressed ? rolloutStatus.accentSoft : rolloutSurface.card,
        fontWeight: pressed ? rolloutType.weight.semibold : rolloutType.weight.regular,
        ...focusRing,
      }}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <Box component="span" sx={{ fontFamily: 'ui-monospace, monospace', fontSize: rolloutType.size.micro, color: pressed ? rolloutStatus.accent : rolloutInk.subtle }}>
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
    <Box
      role="status"
      data-history-empty
      sx={{
        padding: '34px 20px 38px',
        display: 'grid',
        gridTemplateColumns: '44px minmax(0, 560px)',
        gap: '14px',
        justifyContent: 'center',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          borderRadius: `${rolloutCardTokens.radius}px`,
          display: 'grid',
          placeItems: 'center',
          background: rolloutSurface.sunk,
          border: `1px solid ${rolloutBorder.default}`,
          color: rolloutInk.subtle,
        }}
      >
        <HistoryIcon sx={{ fontSize: 24 }} />
      </Box>
      <Box>
        <Box component="h3" sx={{ margin: '2px 0 4px', fontSize: rolloutType.size.lead, fontWeight: rolloutType.weight.semibold }}>
          No promotions yet
        </Box>
        <Box component="p" sx={{ margin: '0 0 8px', color: rolloutInk.muted, fontSize: rolloutType.size.prose, maxWidth: '62ch' }}>
          When someone promotes Spaces into a Stage of this Rollout, it is recorded here with who did it and when.
        </Box>
        <Box component="ul" sx={{ margin: '6px 0 0', paddingLeft: '18px', color: rolloutInk.muted, fontSize: rolloutType.size.body }}>
          <li>Forced promotions past failing gates appear here as overrides, with their reason.</li>
          <li>Promotions that fail or are blocked appear here with the Space, Unit and Link errors.</li>
          <li>Each Release published for this Rollout appears here with its publisher.</li>
        </Box>
      </Box>
    </Box>
  );
}

export function RolloutHistory({ history }: { history: RolloutHistoryData }) {
  const { entries, recordCount, workflowStages, spaceSlugById, now, createdAt } = history;
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
      <Box role="status" sx={{ padding: '26px 20px', color: rolloutInk.muted, fontSize: rolloutType.size.prose }}>
        Reading the history of this Rollout…
      </Box>
    );
  } else if (entries.length === 0) {
    body = <EmptyState />;
  } else if (filtered.length === 0) {
    body = (
      <Box
        role="status"
        sx={{ padding: '26px 20px', color: rolloutInk.muted, fontSize: rolloutType.size.prose, display: 'flex', gap: '10px', alignItems: 'center' }}
      >
        <FilterAltOffOutlinedIcon aria-hidden sx={{ fontSize: 18, color: rolloutInk.subtle }} />
        <span>No entries match these filters.</span>
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
                    background: rolloutSurface.card,
                    borderTop: index === 0 ? 'none' : `1px solid ${rolloutBorder.default}`,
                    fontSize: rolloutType.size.small,
                    fontWeight: rolloutType.weight.semibold,
                    color: rolloutInk.muted,
                  }}
                >
                  <Box component="h3" sx={{ font: 'inherit', margin: 0 }}>
                    {dayLabel(day.at, now)}
                  </Box>
                  <Box component="span" sx={{ fontWeight: rolloutType.weight.regular, color: rolloutInk.subtle }}>
                    {routine}
                    {summary.overrides > 0 ? (
                      <>
                        {routine ? ', ' : ''}
                        <Box component="span" sx={{ color: rolloutStatus.warn, fontWeight: rolloutType.weight.semibold }}>
                          {plural(summary.overrides, 'override')}
                        </Box>
                      </>
                    ) : null}
                    {summary.failures > 0 ? (
                      <>
                        {routine || summary.overrides ? ', ' : ''}
                        <Box component="span" sx={{ color: rolloutStatus.danger, fontWeight: rolloutType.weight.semibold }}>
                          {summary.failures} with failures
                        </Box>
                      </>
                    ) : null}
                  </Box>
                  {foldable && open ? (
                    <Box sx={{ marginLeft: 'auto' }}>
                      <LinkButton onClick={() => toggleDay(day.key)} expanded>
                        Summarise day
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
                          color: rolloutInk.muted,
                          fontSize: rolloutType.size.small,
                          borderTop: `1px solid ${rolloutSurface.inset}`,
                        }}
                      >
                        <UnfoldMoreIcon aria-hidden sx={{ fontSize: 16, color: rolloutInk.subtle }} />
                        <span>
                          {plural(routineCount, 'routine entry', 'routine entries')} folded
                          {names.length > 0
                            ? ` (by ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''})`
                            : ''}
                          .
                        </span>
                        <LinkButton onClick={() => toggleDay(day.key)} expanded={false}>
                          Show them
                        </LinkButton>
                      </Box>
                    </>
                  )}
              </Fragment>
            );
          })}
          {reachedEnd && !filtering && createdAt !== undefined ? <RolloutOpenedEntry at={createdAt} /> : null}
        </Box>
        {!reachedEnd ? (
          <Box
            sx={{
              padding: '12px 20px',
              borderTop: `1px solid ${rolloutBorder.default}`,
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
                border: `1px solid ${rolloutBorder.strong}`,
                borderRadius: `${rolloutShape.radius.md}px`,
                padding: '5px 12px',
                fontFamily: 'inherit',
                fontSize: rolloutType.size.small,
                fontWeight: rolloutType.weight.semibold,
                color: rolloutInk.default,
                background: rolloutSurface.card,
                ...focusRing,
              }}
            >
              Show {plural(Math.min(HISTORY_MORE_DAYS, hiddenDays.length), 'earlier day')}
            </ButtonBase>
            <Box component="span" sx={{ color: rolloutInk.subtle, fontSize: rolloutType.size.small }}>
              {plural(
                hiddenDays.reduce((n, d) => n + d.entries.length, 0),
                'older entry',
                'older entries',
              )}{' '}
              over {plural(hiddenDays.length, 'day')}.{' '}
              <Box component="span" data-history-hidden-exceptions sx={{ color: rolloutInk.muted, fontWeight: rolloutType.weight.semibold }}>
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
      aria-label="Rollout history"
      id={ROLLOUT_HISTORY_ID}
      sx={{
        marginTop: '20px',
        background: rolloutSurface.card,
        border: `1px solid ${rolloutBorder.default}`,
        borderRadius: `${rolloutCardTokens.radius}px`,
        boxShadow: rolloutCardTokens.shadow,
        overflow: 'hidden',
        scrollMarginTop: '16px',
      }}
    >
      <Box sx={{ padding: '16px 20px 12px', background: rolloutSurface.sunk, borderBottom: `1px solid ${rolloutBorder.default}` }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
          <Box
            component="h2"
            sx={{ fontSize: rolloutType.size.prose, lineHeight: rolloutType.lineHeight.heading, fontWeight: rolloutType.weight.semibold, margin: 0 }}
          >
            History
          </Box>
          {entries.length > 0 && !history.isLoading ? (
            <Box component="span" data-history-count sx={{ fontSize: rolloutType.size.small, color: rolloutInk.subtle }}>
              {plural(entries.length, 'entry', 'entries')} from {plural(recordCount, 'record')}, newest first
            </Box>
          ) : null}
        </Box>
        {recordCount > entries.length && !history.isLoading ? (
          <Box sx={{ fontSize: rolloutType.size.small, color: rolloutInk.subtle, marginTop: '4px' }}>
            Records of one promote action are matched by person, Stage and time, as they carry no shared ID.
          </Box>
        ) : null}
        {history.error !== undefined ? (
          <Box role="alert" sx={{ fontSize: rolloutType.size.small, color: rolloutStatus.danger, marginTop: '6px' }}>
            Some of this history could not be read. Names or Releases can be missing.
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
                    ? rolloutInk.subtle
                    : tone === 'warn'
                      ? rolloutStatus.warn
                      : rolloutStatus.danger;
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
                      border: `1px solid ${pressed ? rolloutStatus.accent : rolloutBorder.default}`,
                      boxShadow: pressed ? rolloutSelectedRing : 'none',
                      background: rolloutSurface.card,
                      borderRadius: `${rolloutShape.radius.md}px`,
                      padding: '5px 10px',
                      fontSize: rolloutType.size.small,
                      color: pressed ? rolloutStatus.accent : rolloutInk.muted,
                      ...focusRing,
                    }}
                  >
                    <Icon aria-hidden sx={{ fontSize: 15, color: pressed ? rolloutStatus.accent : iconColor }} />
                    <Box component="b" sx={{ fontFamily: 'ui-monospace, monospace', fontWeight: rolloutType.weight.semibold, color: rolloutInk.default, fontSize: rolloutType.size.body }}>
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
                <FilterLabel htmlFor="rollout-history-person">Person</FilterLabel>
                <NativeSelect
                  id="rollout-history-person"
                  value={filters.person ?? ''}
                  onChange={(event) => setFilters((f) => ({ ...f, person: event.target.value || null }))}
                  disableUnderline
                  sx={{
                    fontSize: rolloutType.size.small,
                    color: rolloutInk.default,
                    background: rolloutSurface.card,
                    border: `1px solid ${rolloutBorder.strong}`,
                    borderRadius: `${rolloutShape.radius.md}px`,
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
                  <Box component="span" role="status" sx={{ fontSize: rolloutType.size.small, color: rolloutInk.muted }}>
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

      {!history.isLoading ? (
        <Box
          role="note"
          sx={{
            padding: '10px 20px 14px',
            fontSize: rolloutType.size.small,
            color: rolloutInk.subtle,
            display: 'flex',
            gap: '6px',
            alignItems: 'flex-start',
            borderTop: `1px solid ${rolloutSurface.inset}`,
          }}
        >
          <InfoOutlinedIcon aria-hidden sx={{ fontSize: 15, marginTop: '1px' }} />
          <span>
            ConfigHub keeps the last {HISTORY_RETENTION.promotions} promotions, {HISTORY_RETENTION.overrides} overrides and{' '}
            {HISTORY_RETENTION.failures} failed promotions for each Rollout. Dry runs and promotions refused at a gate are
            not recorded. Times are UTC.
          </span>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * The summary card's "Last activity" fact: who ran the newest promote action,
 * when, and whether it was forced.
 */
export function RolloutLastActivity({ history }: { history: RolloutHistoryData }) {
  const last = useMemo(() => lastActivity(history.entries), [history.entries]);
  if (history.isLoading) return <>…</>;
  if (last === undefined) {
    return (
      <Box component="span" sx={{ color: rolloutInk.muted }}>
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
        <Box component="time" dateTime={new Date(last.at).toISOString()} title={fullTime(last.at)}>
          {relativeTime(last.at, history.now)}
        </Box>
      </span>
      {last.override ? (
        <Box
          component="span"
          sx={{
            fontSize: rolloutType.size.micro,
            fontWeight: rolloutType.weight.strong,
            letterSpacing: '.05em',
            borderRadius: `${rolloutShape.radius.sm}px`,
            padding: '1px 6px',
            border: `1px solid ${rolloutStatus.warn}`,
            color: rolloutStatus.warn,
            background: rolloutStatus.warnSoft,
          }}
        >
          Forced
        </Box>
      ) : null}
      <LinkButton
        onClick={() =>
          document
            .getElementById(ROLLOUT_HISTORY_ID)
            ?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        }
      >
        History
      </LinkButton>
    </Box>
  );
}
