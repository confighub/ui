// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Audit log's filter bar: Time, Action, Outcome, Subject, Actor, the request a row's link
 * chose, and Clear filters. Every control changes the filters, which the page keeps in its address.
 */
import { type ReactNode, useId, useMemo, useState } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import {
  ConsoleClearButton,
  ConsoleDateRange,
  ConsoleFilterBar,
  FieldLabel,
} from '../change-orders/components/ConsoleParts';
import {
  R_CONTROL,
  R_MICRO,
  SELECT_SX,
  consoleTokens as T,
} from '../change-orders/consoleStyle';
import {
  ACTION_GROUPS,
  type AuditLogFilters,
  OUTCOMES,
  TIME_RANGES,
  type TimeRange,
  clearFilters,
  hasFilters,
} from './auditLogFilters';

export interface PickOption {
  value: string;
  label: string;
  mono?: boolean;
}

export interface PickGroup {
  label?: string;
  options: readonly PickOption[];
}

const PICKER_SX = {
  ...SELECT_SX,
  all: 'unset',
  boxSizing: 'border-box',
  height: 30,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '6px',
  cursor: 'pointer',
  fontFamily: T.sans,
  fontSize: 13,
  background: T.surface,
  border: `1px solid ${T.lineStrong}`,
  borderRadius: R_CONTROL,
  padding: '0 8px 0 10px',
  minWidth: 150,
  '&:hover': { background: T.surfaceSunk },
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
  '&[aria-disabled="true"]': {
    background: T.surfaceSunk,
    color: T.ink3,
    cursor: 'not-allowed',
  },
} as const;

const POP_ROW_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 6px',
  borderRadius: '5px',
  fontSize: 13,
  lineHeight: T.lh,
  color: T.ink,
  cursor: 'pointer',
  '&:hover': { background: T.surfaceHover },
  '& input': { accentColor: T.action, margin: 0 },
} as const;

const GROUP_LABEL_SX = {
  fontSize: 11,
  lineHeight: T.lh,
  fontWeight: 700,
  color: T.ink3,
  padding: '6px 6px 2px',
} as const;

/** A labelled button that opens a list to choose from: one value (`radio`) or several (`checkbox`). */
function Picker({
  label,
  summary,
  empty,
  disabled = false,
  searchLabel,
  groups,
  type,
  selected,
  onToggle,
  footer,
  testId,
}: {
  label: string;
  /** What the button says when something is chosen. */
  summary: string;
  /** Whether nothing is chosen, which shows `summary` in the quiet colour. */
  empty: boolean;
  disabled?: boolean;
  searchLabel: string;
  groups: readonly PickGroup[];
  type: 'radio' | 'checkbox';
  selected: ReadonlySet<string>;
  onToggle: (value: string, checked: boolean) => void;
  footer?: ReactNode;
  testId: string;
}) {
  const labelId = useId();
  const buttonId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      options: group.options.filter(
        (option) => needle === '' || option.label.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.options.length > 0);

  return (
    <Stack direction='row' alignItems='center' sx={{ gap: '6px' }}>
      <Typography
        component='span'
        id={labelId}
        sx={{
          fontSize: 11.5,
          lineHeight: T.lh,
          fontWeight: 600,
          color: T.ink3,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <Box
        component='button'
        type='button'
        id={buttonId}
        data-testid={testId}
        aria-labelledby={`${labelId} ${buttonId}`}
        aria-haspopup='dialog'
        aria-expanded={anchor !== null}
        aria-disabled={disabled ? 'true' : undefined}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          if (!disabled) setAnchor(event.currentTarget);
        }}
        sx={PICKER_SX}
      >
        <Box
          component='span'
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: empty ? T.ink3 : T.ink,
          }}
        >
          {summary}
        </Box>
        <ExpandMoreIcon
          aria-hidden='true'
          sx={{ fontSize: 16, color: T.ink3, flex: 'none' }}
        />
      </Box>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => {
          setAnchor(null);
          setQuery('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            role: 'dialog',
            'aria-label': label,
            sx: {
              mt: '6px',
              width: 290,
              maxWidth: 'calc(100vw - 32px)',
              padding: '8px',
              border: `1px solid ${T.line}`,
              borderRadius: R_CONTROL,
              boxShadow: '0 6px 20px rgba(25,29,35,.10), 0 1px 3px rgba(25,29,35,.08)',
            },
          },
        }}
      >
        <Stack sx={{ gap: '6px', fontFamily: T.sans }}>
          <Box
            component='input'
            type='search'
            autoFocus
            value={query}
            placeholder={searchLabel}
            aria-label={searchLabel}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            sx={{
              ...SELECT_SX,
              width: '100%',
              boxSizing: 'border-box',
              '&::placeholder': { color: T.ink3 },
            }}
          />
          <Box
            role='group'
            aria-label={label}
            sx={{ maxHeight: 270, overflowY: 'auto', display: 'grid' }}
          >
            {shown.length === 0 ? (
              <Typography sx={{ fontSize: 12.5, color: T.ink3, padding: '6px 4px' }}>
                Nothing matches.
              </Typography>
            ) : null}
            {shown.map((group, index) => (
              <Box key={group.label ?? `group-${index}`} sx={{ display: 'grid' }}>
                {group.label ? (
                  <Typography sx={GROUP_LABEL_SX}>{group.label}</Typography>
                ) : null}
                {group.options.map((option) => (
                  <Box component='label' key={option.value} sx={POP_ROW_SX}>
                    <input
                      type={type}
                      name={type === 'radio' ? buttonId : undefined}
                      value={option.value}
                      checked={selected.has(option.value)}
                      onChange={(event) => onToggle(option.value, event.target.checked)}
                    />
                    <Box
                      component='span'
                      sx={{
                        fontFamily: option.mono ? T.mono : T.sans,
                        fontSize: option.mono ? 12.5 : 13,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {option.label}
                    </Box>
                  </Box>
                ))}
              </Box>
            ))}
          </Box>
          {footer}
        </Stack>
      </Popover>
    </Stack>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  testId,
  minWidth = 150,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly PickOption[];
  testId: string;
  minWidth?: number;
}) {
  const id = useId();
  return (
    <Stack direction='row' alignItems='center' sx={{ gap: '6px' }}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Box
        component='select'
        id={id}
        data-testid={testId}
        value={value}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
        sx={{ ...SELECT_SX, minWidth, flexShrink: 0 }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Box>
    </Stack>
  );
}

const countSummary = (values: readonly string[], none: string, many: (n: number) => string) =>
  values.length === 0 ? none : values.length === 1 ? values[0] : many(values.length);

const toggled = (values: readonly string[], value: string, checked: boolean) =>
  checked ? [...new Set([...values, value])] : values.filter((entry) => entry !== value);

export type FiltersUpdate = (current: AuditLogFilters) => AuditLogFilters;

export interface AuditLogFilterBarProps {
  filters: AuditLogFilters;
  /** Takes the change as a function of the filters it applies to, so quick changes add up. */
  onChange: (update: FiltersUpdate) => void;
  /** Subject types to offer: the usual ones and those of the loaded events. */
  subjectTypes: readonly string[];
  /** The subjects of the chosen type, by SubjectEntityID, from the loaded events. */
  subjects: readonly PickOption[];
  /** People and service accounts, by UserID. */
  actors: readonly PickGroup[];
  /** The chosen actor's name. */
  actorName: string;
  /** `false` when the viewer sees only their own events: the Actor is then the viewer. */
  readsAll: boolean;
}

export function AuditLogFilterBar({
  filters,
  onChange,
  subjectTypes,
  subjects,
  actors,
  actorName,
  readsAll,
}: AuditLogFilterBarProps) {
  const set = (
    patch: Partial<AuditLogFilters> | ((current: AuditLogFilters) => Partial<AuditLogFilters>),
  ) =>
    onChange((current) => ({
      ...current,
      ...(typeof patch === 'function' ? patch(current) : patch),
    }));
  const actionGroups = useMemo<PickGroup[]>(
    () =>
      ACTION_GROUPS.map((group) => ({
        label: group.label,
        options: group.actions.map((action) => ({ value: action, label: action })),
      })),
    [],
  );
  const outcomeGroups = useMemo<PickGroup[]>(
    () => [{ options: OUTCOMES.map((outcome) => ({ value: outcome, label: outcome })) }],
    [],
  );
  const actorGroups = useMemo<PickGroup[]>(
    () => [{ options: [{ value: '', label: 'Anyone' }] }, ...actors],
    [actors],
  );
  const subjectChosen = subjects.find((subject) => subject.value === filters.subjectId);

  return (
    <ConsoleFilterBar>
      <SelectField
        label='Time'
        testId='audit-log-filter-time'
        value={filters.time}
        onChange={(time) => set({ time: time as TimeRange })}
        options={TIME_RANGES.map((range) => ({ value: range.value, label: range.label }))}
        minWidth={140}
      />
      {filters.time === 'custom' ? (
        <ConsoleDateRange
          fromLabel='From'
          toLabel='to'
          from={filters.from}
          onFrom={(from) => set({ from })}
          to={filters.to}
          onTo={(to) => set({ to })}
        />
      ) : null}

      <Picker
        label='Action'
        testId='audit-log-filter-action'
        summary={countSummary(filters.actions, 'All actions', (n) => `${n} actions`)}
        empty={filters.actions.length === 0}
        searchLabel='Search actions'
        groups={actionGroups}
        type='checkbox'
        selected={new Set(filters.actions)}
        onToggle={(value, checked) =>
          set((current) => ({ actions: toggled(current.actions, value, checked) }))
        }
      />

      <Picker
        label='Outcome'
        testId='audit-log-filter-outcome'
        summary={countSummary(filters.outcomes, 'All', (n) => `${n} outcomes`)}
        empty={filters.outcomes.length === 0}
        searchLabel='Search outcomes'
        groups={outcomeGroups}
        type='checkbox'
        selected={new Set(filters.outcomes)}
        onToggle={(value, checked) =>
          set((current) => ({ outcomes: toggled(current.outcomes, value, checked) }))
        }
      />

      <SelectField
        label='Subject'
        testId='audit-log-filter-subject-type'
        value={filters.subjectType}
        onChange={(subjectType) => set({ subjectType, subjectId: '' })}
        options={[
          { value: '', label: 'All types' },
          ...subjectTypes.map((type) => ({ value: type, label: type })),
        ]}
        minWidth={130}
      />
      <Box
        component='select'
        data-testid='audit-log-filter-subject'
        aria-label='Subject entity'
        disabled={filters.subjectType === ''}
        value={filters.subjectId}
        onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
          set({ subjectId: event.target.value })
        }
        sx={{
          ...SELECT_SX,
          minWidth: 190,
          flexShrink: 0,
          '&:disabled': { background: T.surfaceSunk, color: T.ink3, cursor: 'not-allowed' },
        }}
      >
        <option value=''>
          {filters.subjectType === '' ? 'Choose a type first' : `Any ${filters.subjectType}`}
        </option>
        {subjects.map((subject) => (
          <option key={subject.value} value={subject.value}>
            {subject.label}
          </option>
        ))}
        {filters.subjectId !== '' && subjectChosen === undefined ? (
          <option value={filters.subjectId}>The chosen {filters.subjectType}</option>
        ) : null}
      </Box>

      <Picker
        label='Actor'
        testId='audit-log-filter-actor'
        summary={readsAll ? (filters.actorId === '' ? 'Anyone' : actorName) : 'You'}
        empty={readsAll && filters.actorId === ''}
        disabled={!readsAll}
        searchLabel='Search people and service accounts'
        groups={actorGroups}
        type='radio'
        selected={new Set([filters.actorId])}
        onToggle={(actorId) =>
          set((current) => ({
            actorId,
            onBehalfOf: actorId === '' ? false : current.onBehalfOf,
          }))
        }
        footer={
          <Box
            component='label'
            sx={{
              borderTop: `1px solid ${T.line}`,
              paddingTop: '8px',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              fontSize: 12,
              lineHeight: T.lh,
              color: filters.actorId === '' ? T.ink3 : T.ink2,
              '& input': { accentColor: T.action, margin: 0 },
            }}
          >
            <input
              type='checkbox'
              data-testid='audit-log-filter-on-behalf-of'
              disabled={filters.actorId === ''}
              checked={filters.onBehalfOf}
              onChange={(event) => set({ onBehalfOf: event.target.checked })}
            />
            Show what was done on behalf of this person, not by them
          </Box>
        }
      />

      {filters.requestId !== '' ? (
        <Stack
          direction='row'
          alignItems='center'
          data-testid='audit-log-filter-request'
          sx={{
            gap: '4px',
            height: 30,
            padding: '0 4px 0 10px',
            border: `1px solid ${T.lineStrong}`,
            borderRadius: R_CONTROL,
            background: T.surfaceSunk,
            fontSize: 12.5,
            color: T.ink,
          }}
        >
          Events of one request
          <Box
            component='button'
            type='button'
            aria-label='Remove the request filter'
            onClick={() => set({ requestId: '' })}
            sx={{
              all: 'unset',
              display: 'inline-flex',
              cursor: 'pointer',
              color: T.ink3,
              borderRadius: R_MICRO,
              padding: '2px',
              '&:hover': { color: T.ink },
              '&:focus-visible': { outline: `2px solid ${T.focus}` },
            }}
          >
            <CloseIcon aria-hidden='true' sx={{ fontSize: 15 }} />
          </Box>
        </Stack>
      ) : null}

      <ConsoleClearButton
        onClick={() => onChange(clearFilters)}
        disabled={!hasFilters(filters)}
      >
        Clear filters
      </ConsoleClearButton>
    </ConsoleFilterBar>
  );
}
