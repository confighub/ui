// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Audit log's filters: how they are kept in the page's address, and the one `where`
 * expression the server filters by.
 *
 * Every filter is the server's, so a page of results is a page of matching events. The
 * expression grammar has `AND` and no `OR`, and its string literals cannot hold a quote or a
 * backslash, so there is no escape to apply: a value that holds one cannot be sent, and is
 * reported in `rejected` instead of being dropped without a word.
 */

/** The time ranges the Time filter offers. `custom` reads `from` and `to`. */
export const TIME_RANGES = [
  { value: '1h', label: 'Last hour', ms: 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: 'Last 30 days', ms: 30 * 24 * 60 * 60 * 1000 },
  { value: 'custom', label: 'Custom', ms: 0 },
] as const;

export type TimeRange = (typeof TIME_RANGES)[number]['value'];

export const DEFAULT_TIME_RANGE: TimeRange = '7d';

export const OUTCOMES = ['Succeeded', 'Denied', 'Failed'] as const;

/** The AuditEvent Actions, grouped as the Action filter lists them. */
export const ACTION_GROUPS: readonly { label: string; actions: readonly string[] }[] = [
  {
    label: 'Entities',
    actions: [
      'Create',
      'Update',
      'Patch',
      'Delete',
      'Move',
      'Detach',
      'Hide',
      'Tag',
      'Upload',
    ],
  },
  {
    label: 'Access',
    actions: [
      'Permission',
      'Grant',
      'Revoke',
      'AddMember',
      'RemoveMember',
      'AddBotUser',
      'RemoveBotUser',
    ],
  },
  { label: 'Sign-in', actions: ['Login', 'TokenExchange', 'RefreshToken', 'BrowserSession'] },
  {
    label: 'ChangeOrders',
    actions: ['Promote', 'RequestReview', 'DismissReview', 'AdvanceStage', 'RefreshStage'],
  },
  {
    label: 'Administration',
    actions: [
      'EnableUser',
      'DisableUser',
      'DeleteUser',
      'EnableOrganization',
      'DisableOrganization',
      'DeleteOrganization',
      'SetQuota',
    ],
  },
];

/** The subject types the Subject filter always offers; types seen in the loaded events are added. */
export const SUBJECT_TYPES = [
  'Unit',
  'Space',
  'ServiceAccount',
  'UserKey',
  'UserToken',
  'OAuthClient',
  'ChangeOrder',
  'User',
] as const;

export interface AuditLogFilters {
  time: TimeRange;
  /** `YYYY-MM-DD`, local time, for `custom`. Empty is an open end. */
  from: string;
  /** `YYYY-MM-DD`, local time, for `custom`, and included. Empty is an open end. */
  to: string;
  actions: string[];
  outcomes: string[];
  /** A SubjectEntityType, or empty for any. */
  subjectType: string;
  /** A SubjectEntityID, or empty for any. */
  subjectId: string;
  /** A UserID, or empty for anyone. */
  actorId: string;
  /** Match the actor as OnBehalfOfUserID instead of UserID. */
  onBehalfOf: boolean;
  /** A RequestID, or empty for any. */
  requestId: string;
}

export const EMPTY_FILTERS: AuditLogFilters = {
  time: DEFAULT_TIME_RANGE,
  from: '',
  to: '',
  actions: [],
  outcomes: [],
  subjectType: '',
  subjectId: '',
  actorId: '',
  onBehalfOf: false,
  requestId: '',
};

const PARAM = {
  time: 'time',
  from: 'from',
  to: 'to',
  action: 'action',
  outcome: 'outcome',
  subjectType: 'subjectType',
  subject: 'subject',
  actor: 'actor',
  onBehalfOf: 'onBehalfOf',
  request: 'request',
} as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// What a string literal of the where grammar can hold: no quote, double quote or backslash, and
// no control character, which the server refuses.
// eslint-disable-next-line no-control-regex
const SAFE_TEXT_RE = /^[^'"\\\u0000-\u001f\u007f]+$/;

const list = (value: string | null) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '');

/** The filters a page address says. A value the address does not give is the default. */
export function filtersFromParams(params: URLSearchParams): AuditLogFilters {
  const time = params.get(PARAM.time);
  return {
    time: TIME_RANGES.some((range) => range.value === time)
      ? (time as TimeRange)
      : DEFAULT_TIME_RANGE,
    from: DATE_RE.test(params.get(PARAM.from) ?? '') ? (params.get(PARAM.from) as string) : '',
    to: DATE_RE.test(params.get(PARAM.to) ?? '') ? (params.get(PARAM.to) as string) : '',
    actions: list(params.get(PARAM.action)),
    outcomes: list(params.get(PARAM.outcome)),
    subjectType: params.get(PARAM.subjectType) ?? '',
    subjectId: params.get(PARAM.subject) ?? '',
    actorId: params.get(PARAM.actor) ?? '',
    onBehalfOf: params.get(PARAM.onBehalfOf) === '1',
    requestId: params.get(PARAM.request) ?? '',
  };
}

/**
 * `params` with the filters written into it, and any other parameter it has kept. A filter at
 * its default is left out, so the bare address is the default view.
 */
export function filtersToParams(
  filters: AuditLogFilters,
  params: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string) => {
    if (value === '') next.delete(key);
    else next.set(key, value);
  };
  set(PARAM.time, filters.time === DEFAULT_TIME_RANGE ? '' : filters.time);
  set(PARAM.from, filters.time === 'custom' ? filters.from : '');
  set(PARAM.to, filters.time === 'custom' ? filters.to : '');
  set(PARAM.action, filters.actions.join(','));
  set(PARAM.outcome, filters.outcomes.join(','));
  set(PARAM.subjectType, filters.subjectType);
  set(PARAM.subject, filters.subjectType === '' ? '' : filters.subjectId);
  set(PARAM.actor, filters.actorId);
  set(PARAM.onBehalfOf, filters.actorId !== '' && filters.onBehalfOf ? '1' : '');
  set(PARAM.request, filters.requestId);
  return next;
}

/** Whether any filter other than Time is set: what Clear filters clears. */
export function hasFilters(filters: AuditLogFilters): boolean {
  return (
    filters.actions.length > 0 ||
    filters.outcomes.length > 0 ||
    filters.subjectType !== '' ||
    filters.subjectId !== '' ||
    filters.actorId !== '' ||
    filters.requestId !== ''
  );
}

/** Clear filters: everything back to its default, with the time range kept. */
export function clearFilters(filters: AuditLogFilters): AuditLogFilters {
  return { ...EMPTY_FILTERS, time: filters.time, from: filters.from, to: filters.to };
}

/** The first instant of a local `YYYY-MM-DD`, `days` days later. */
function localDayStart(date: string, days = 0): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day + days);
}

/** The time range as `[since, until)`, each `undefined` for an open end. */
export function timeBounds(
  filters: Pick<AuditLogFilters, 'time' | 'from' | 'to'>,
  now: number,
): { since?: Date; until?: Date } {
  if (filters.time !== 'custom') {
    const range = TIME_RANGES.find((entry) => entry.value === filters.time) ?? TIME_RANGES[2];
    return { since: new Date(now - range.ms) };
  }
  return {
    since: filters.from === '' ? undefined : localDayStart(filters.from),
    // The To day is included, so the range ends where the next day starts.
    until: filters.to === '' ? undefined : localDayStart(filters.to, 1),
  };
}

export interface AuditWhere {
  /** The expression, or `''` for every event. */
  where: string;
  /** The filters left out because their value cannot be written in an expression. */
  rejected: string[];
}

/** One term per filter, joined with AND, in the form `cub audit list` writes its time range. */
export function buildAuditWhere(filters: AuditLogFilters, now: number): AuditWhere {
  const terms: string[] = [];
  const rejected: string[] = [];
  const text = (name: string, value: string, check: RegExp = SAFE_TEXT_RE) => {
    if (check.test(value)) return `'${value}'`;
    rejected.push(name);
    return undefined;
  };
  const oneOrMany = (attribute: string, name: string, values: readonly string[]) => {
    const literals = [...new Set(values)].map((value) => text(name, value));
    if (literals.some((literal) => literal === undefined)) return;
    if (literals.length === 1) terms.push(`${attribute} = ${literals[0]}`);
    else if (literals.length > 1) terms.push(`${attribute} IN (${literals.join(', ')})`);
  };

  const { since, until } = timeBounds(filters, now);
  if (since !== undefined && !Number.isNaN(since.getTime()))
    terms.push(`OccurredAt >= '${since.toISOString()}'`);
  if (until !== undefined && !Number.isNaN(until.getTime()))
    terms.push(`OccurredAt < '${until.toISOString()}'`);

  oneOrMany('Action', 'Action', filters.actions);
  oneOrMany('Outcome', 'Outcome', filters.outcomes);

  if (filters.subjectType !== '') {
    const literal = text('Subject', filters.subjectType);
    if (literal !== undefined) terms.push(`SubjectEntityType = ${literal}`);
    if (filters.subjectId !== '') {
      const id = text('Subject', filters.subjectId, UUID_RE);
      if (id !== undefined) terms.push(`SubjectEntityID = ${id}`);
    }
  }

  if (filters.actorId !== '') {
    const id = text('Actor', filters.actorId, UUID_RE);
    if (id !== undefined)
      terms.push(`${filters.onBehalfOf ? 'OnBehalfOfUserID' : 'UserID'} = ${id}`);
  }

  if (filters.requestId !== '') {
    const literal = text('Request', filters.requestId);
    if (literal !== undefined) terms.push(`RequestID = ${literal}`);
  }

  return { where: terms.join(' AND '), rejected: [...new Set(rejected)] };
}
