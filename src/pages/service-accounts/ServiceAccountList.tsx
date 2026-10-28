// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every ServiceAccount the viewer can see, as the ChangeSets list shows ChangeSets.
 *
 * A row says whether the account is in use: when one of its keys or tokens last
 * authenticated, and which one, so an account nothing has used in weeks, or one
 * with no credentials at all, stands out. Accounts in use come first, most
 * recently used first, until a column head is clicked to sort by it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useListServiceAccountsQuery, type ServiceAccountRead } from '@confighub/rtk-query';

import { StatusDot, When } from '@/components/console-detail/ConsoleDetail';
import { timeOf } from '@/components/console-detail/consoleDetailUtil';
import { ConsoleTable, type ConsoleTableColumn } from '@/components/console-table/ConsoleTable';
import { serviceAccountPath } from '@/hooks/usePrincipalNames';

import {
  ConsoleClearButton,
  ConsoleEmpty,
  ConsoleFilterBar,
  ConsoleFooter,
  ConsoleIntro,
  ConsoleSearch,
  ConsoleSelectFilter,
  ConsoleTitleRow,
} from '../change-orders/components/ConsoleParts';
import { KpiStrip, type KpiCard } from '../change-orders/components/KpiStrip';
import {
  KPI_ACTIVE_CARD_SX,
  KPI_CARD_SX,
  KPI_HINT_SX,
  KPI_LABEL_SX,
  KPI_NUM_SX,
  KPI_PARTIAL_CARD_SX,
  ABOVE_ROW_LINK_SX,
  ROW_LINK_SX,
  ageFrom,
  consoleTokens as T,
  controlSx,
  freshnessFrom,
} from '../change-orders/consoleStyle';
import { ORG_ROLES, orgRoleLabel } from './orgRoles';
import { CreateServiceAccountDialog } from './ServiceAccountForms';
import { ACTIVITY, lastUseText, useListServiceAccountCredentialsQuery, usageOf, type Activity, type Usage } from './serviceAccountUsage';

const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns: 'minmax(180px, 1.3fr) minmax(220px, 1.6fr) minmax(130px, .8fr) minmax(90px, .6fr) 60px 76px',
  '@media (max-width: 1100px)': {
    gridTemplateColumns: 'minmax(170px, 1fr) minmax(200px, 1.4fr) minmax(120px, .8fr) 76px',
  },
} as const;
const HIDE_NARROW = { '@media (max-width: 1100px)': { display: 'none' } } as const;

const RIGHT_NARROW = { ...HIDE_NARROW, textAlign: 'right' } as const;

const ACTIVITY_ORDER: Record<Activity, number> = { active: 0, idle: 1, unused: 2, none: 3, unknown: 4 };
const ACTIVITY_FILTERS = ['Active', 'Idle', 'Never used', 'No credentials'] as const;
const ACTIVITY_BY_LABEL: Record<string, Activity> = { Active: 'active', Idle: 'idle', 'Never used': 'unused', 'No credentials': 'none' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function credentialsText(usage: Usage): string {
  if (usage.activity === 'unknown') return '—';
  const parts = [];
  if (usage.liveKeys > 0) parts.push(plural(usage.liveKeys, 'key'));
  if (usage.liveTokens > 0) parts.push(plural(usage.liveTokens, 'token'));
  return parts.length === 0 ? 'None' : parts.join(' · ');
}

interface ServiceAccountItem {
  serviceAccount: ServiceAccountRead;
  usage: Usage;
  credentialsLoading: boolean;
  now: number;
}

/** Weakest first, as `ORG_ROLES` lists them; a role it does not know has no rank. */
function roleRank(role: string | undefined): number | undefined {
  const index = ORG_ROLES.findIndex((entry) => entry.value === (role || 'none'));
  return index === -1 ? undefined : index;
}

function LastUseCell({ usage, credentialsLoading }: ServiceAccountItem) {
  if (credentialsLoading) return <Typography sx={{ fontSize: 12.5, color: T.ink3 }}>…</Typography>;
  const activity = ACTIVITY[usage.activity];
  return (
    <>
      <StatusDot
        color={activity.color}
        hollow={activity.hollow}
        testId='service-accounts-row-activity'
        label={usage.lastUse ? <When value={usage.lastUse.at} /> : activity.label}
      />
      <Typography
        component='span'
        title={lastUseText(usage.lastUse)}
        sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 11.5, lineHeight: T.lh, color: T.ink3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingLeft: '14px' }}
      >
        {usage.lastUse ? `${activity.label} · ${lastUseText(usage.lastUse)}` : usage.activity === 'unknown' ? 'Credentials not readable' : ' '}
      </Typography>
    </>
  );
}

const SERVICE_ACCOUNT_COLUMNS: ConsoleTableColumn<ServiceAccountItem>[] = [
  {
    id: 'name',
    header: 'Service account',
    sortValue: ({ serviceAccount }) => serviceAccount.Slug,
    cell: ({ serviceAccount }) => {
      const subline = serviceAccount.DisplayName && serviceAccount.DisplayName !== serviceAccount.Slug ? serviceAccount.DisplayName : '';
      return (
        <>
          <Typography
            component={RouterLink}
            to={serviceAccountPath(serviceAccount.Slug)}
            aria-label={`Open service account ${serviceAccount.Slug}`}
            title={serviceAccount.Slug}
            sx={{ ...ROW_LINK_SX, fontFamily: T.mono, fontSize: 13.5, lineHeight: T.lh, fontWeight: 600, color: T.ink, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {serviceAccount.Slug}
          </Typography>
          {subline ? (
            <Typography component='span' title={subline} sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 11.5, lineHeight: T.lh, color: T.ink3, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subline}
            </Typography>
          ) : null}
        </>
      );
    },
  },
  {
    id: 'use',
    header: 'Last used',
    // Most recent first on the first click; an account with no use sorts last, in the console's order.
    sortValue: ({ usage }) => (usage.lastUse ? new Date(usage.lastUse.at) : undefined),
    sortDescFirst: true,
    cell: (item) => <LastUseCell {...item} />,
  },
  {
    id: 'credentials',
    header: 'Credentials',
    sortValue: ({ usage }) => (usage.activity === 'unknown' ? undefined : usage.liveKeys + usage.liveTokens),
    cell: ({ usage, credentialsLoading }) => (
      <Typography data-testid='service-accounts-row-credentials' sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink2, whiteSpace: 'nowrap' }}>
        {credentialsLoading ? '…' : credentialsText(usage)}
      </Typography>
    ),
  },
  {
    id: 'role',
    header: 'Org role',
    sx: HIDE_NARROW,
    sortValue: ({ serviceAccount }) => roleRank(serviceAccount.OrgRole),
    cell: ({ serviceAccount }) => (
      <Typography sx={{ fontSize: 12.5, lineHeight: T.lh, color: serviceAccount.OrgRole && serviceAccount.OrgRole !== 'none' ? T.ink : T.ink3 }}>
        {orgRoleLabel(serviceAccount.OrgRole)}
      </Typography>
    ),
  },
  {
    id: 'age',
    header: 'Age',
    sx: RIGHT_NARROW,
    // Youngest first ascending, as the ages read.
    sortValue: ({ serviceAccount, now }) => {
      const created = timeOf(serviceAccount.CreatedAt);
      return created === undefined ? undefined : now - created;
    },
    cell: ({ serviceAccount, now }) => (
      <Typography sx={{ fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, color: T.ink3, textAlign: 'right' }}>{ageFrom(serviceAccount.CreatedAt, now)}</Typography>
    ),
  },
  {
    id: 'action',
    header: '',
    sx: { textAlign: 'right' },
    cell: () => (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {/* The row's link covers it, so it is a picture of a control, not a second one. */}
        <Box component='span' aria-hidden='true' sx={controlSx('quiet', true)}>
          Open
        </Box>
      </Box>
    ),
  },
];

const serviceAccountRowId = ({ serviceAccount }: ServiceAccountItem) => serviceAccount.ServiceAccountID ?? serviceAccount.Slug;
const serviceAccountRowAttributes = ({ serviceAccount, usage }: ServiceAccountItem) => ({
  'data-testid': 'service-accounts-row',
  'data-slug': serviceAccount.Slug,
  'data-activity': usage.activity,
});

export function ServiceAccountList() {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, isError, fulfilledTimeStamp, refetch } = useListServiceAccountsQuery({});
  const serviceAccounts = useMemo(() => (data ?? []).flatMap((entry) => (entry.ServiceAccount ? [entry.ServiceAccount] : [])), [data]);
  const serviceAccountIds = useMemo(
    () => serviceAccounts.flatMap((sa) => (sa.ServiceAccountID ? [sa.ServiceAccountID] : [])).sort(),
    [serviceAccounts],
  );
  const credentials = useListServiceAccountCredentialsQuery({ serviceAccountIds }, { skip: serviceAccountIds.length === 0 });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const usageById = useMemo(() => {
    const map = new Map<string, Usage>();
    for (const sa of serviceAccounts) map.set(sa.ServiceAccountID ?? '', usageOf(credentials.data?.[sa.ServiceAccountID ?? ''], now));
    return map;
  }, [serviceAccounts, credentials.data, now]);
  const usage = useCallback((sa: ServiceAccountRead) => usageById.get(sa.ServiceAccountID ?? '') ?? usageOf(undefined, now), [usageById, now]);

  const [search, setSearch] = useState('');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const filtersActive = search !== '' || activityFilter !== 'all' || roleFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearch('');
    setActivityFilter('all');
    setRoleFilter('all');
  }, []);

  const roles = useMemo(() => [...new Set(serviceAccounts.map((sa) => orgRoleLabel(sa.OrgRole)))].sort(), [serviceAccounts]);

  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const wanted = activityFilter === 'all' ? undefined : ACTIVITY_BY_LABEL[activityFilter];
    return serviceAccounts
      .filter((sa) => {
        if (wanted !== undefined && usage(sa).activity !== wanted) return false;
        if (roleFilter !== 'all' && orgRoleLabel(sa.OrgRole) !== roleFilter) return false;
        if (needle === '') return true;
        return [sa.Slug, sa.DisplayName ?? '', ...Object.values(sa.Labels ?? {})].some((field) => field.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        const ua = usage(a);
        const ub = usage(b);
        return (
          ACTIVITY_ORDER[ua.activity] - ACTIVITY_ORDER[ub.activity] ||
          (ub.lastUse?.at ?? '').localeCompare(ua.lastUse?.at ?? '') ||
          a.Slug.localeCompare(b.Slug)
        );
      })
      .map((serviceAccount): ServiceAccountItem => ({ serviceAccount, usage: usage(serviceAccount), credentialsLoading: credentials.isLoading, now }));
  }, [serviceAccounts, search, activityFilter, roleFilter, usage, credentials.isLoading, now]);

  const count = (activity: Activity) => serviceAccounts.filter((sa) => usage(sa).activity === activity).length;
  const card = (key: Activity, hint: string, tone: string): KpiCard => ({
    key,
    label: ACTIVITY[key].label,
    hint,
    count: count(key),
    status: activityFilter === ACTIVITY[key].label ? 'on' : 'off',
    tone,
  });
  const cards: KpiCard[] = credentials.data
    ? [
        card('active', 'used in the last 7 days', T.ok),
        card('idle', 'not used for 7 days or more', T.wait),
        card('unused', 'credentials never used', T.ink2),
        card('none', 'no key or live token', T.ink2),
      ]
    : [];
  const selectCard = (key: string) => {
    const label = ACTIVITY[key as Activity].label;
    setActivityFilter((current) => (current === label ? 'all' : label));
  };

  return (
    <Box component='section' role='region' aria-label='Service accounts console' data-testid='service-accounts-console' sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}>
      <ConsoleTitleRow
        title='Service accounts'
        headingId='service-accounts-console-heading'
        count={matched.length}
        freshness={freshnessFrom(fulfilledTimeStamp ?? null, now)}
        refreshing={isFetching || credentials.isFetching}
        onRefresh={() => {
          void refetch();
          if (serviceAccountIds.length > 0) void credentials.refetch();
        }}
        actions={
          <Box component='button' type='button' data-testid='service-accounts-create' onClick={() => setCreating(true)} sx={controlSx('primary', true)}>
            New service account
          </Box>
        }
      />
      <ConsoleIntro>
        A service account is an identity for a bot or pipeline. Whatever runs as it authenticates with a key it signs with, or with a long-lived token
        where it can only hold a static secret. Last used is the latest either was used.
      </ConsoleIntro>
      <Box role='group' aria-label='Service account triage'>
        <KpiStrip
          cards={cards}
          onSelect={selectCard}
          testIdPrefix='service-accounts-card'
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
          partialCardSx={KPI_PARTIAL_CARD_SX}
        />
      </Box>
      <ConsoleFilterBar>
        <ConsoleSearch value={search} onChange={setSearch} placeholder='Search service accounts' />
        <ConsoleSelectFilter label='Status' value={activityFilter} onChange={setActivityFilter} allLabel='All' options={ACTIVITY_FILTERS} />
        <ConsoleSelectFilter label='Org role' value={roleFilter} onChange={setRoleFilter} allLabel='All roles' options={roles} />
        <ConsoleClearButton onClick={clearFilters} disabled={!filtersActive}>
          Clear filters
        </ConsoleClearButton>
      </ConsoleFilterBar>

      {isError ? (
        <Box role='alert' sx={{ border: `1px solid ${T.badLine}`, background: T.badSoft, padding: '10px 12px', fontSize: 12.5, lineHeight: T.lh, color: T.bad }}>
          {serviceAccounts.length === 0 ? 'The service accounts could not be read.' : 'The service accounts could not be read again. The list shows the last read.'}
        </Box>
      ) : null}

      <ConsoleTable
        label='Service accounts'
        data={matched}
        columns={SERVICE_ACCOUNT_COLUMNS}
        grid={GRID}
        getRowId={serviceAccountRowId}
        isLoading={isLoading}
        loadingTestId='service-accounts-loading'
        rowAttributes={serviceAccountRowAttributes}
        empty={
          <ConsoleEmpty
            message={serviceAccounts.length === 0 ? 'No service accounts yet.' : 'No service account matches these filters.'}
            action={
              serviceAccounts.length > 0 && filtersActive ? (
                <ConsoleClearButton onClick={clearFilters} disabled={false}>
                  Clear filters
                </ConsoleClearButton>
              ) : null
            }
          />
        }
        footer={<ConsoleFooter countTestId='service-accounts-count' count={plural(matched.length, 'service account')} hint='Select a row to see its keys, tokens and access.' />}
      />
      <CreateServiceAccountDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(slug) => {
          setCreating(false);
          navigate(serviceAccountPath(slug));
        }}
      />
    </Box>
  );
}
