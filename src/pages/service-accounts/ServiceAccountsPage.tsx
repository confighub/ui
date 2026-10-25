// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * `/service-accounts`: every ServiceAccount. `/service-accounts/:slug`: one, with
 * its keys, tokens and access.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useListServiceAccountsQuery } from '@confighub/rtk-query';

import { BackLink } from '@/components/console-detail/ConsoleDetail';
import { CONSOLE_PAGE_SX } from '@/components/console-detail/consoleDetailUtil';
import { OrganizationRow } from '@/components/organization-switcher/OrganizationRow';
import { SERVICE_ACCOUNTS_PATH } from '@/hooks/usePrincipalNames';

import { consoleTokens as T } from '../change-orders/consoleStyle';
import { ServiceAccountDetailView } from './ServiceAccountDetailView';
import { ServiceAccountList } from './ServiceAccountList';

const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

function ServiceAccountPage({ slug }: { slug: string }) {
  const { data, isLoading, isError } = useListServiceAccountsQuery({ where: `Slug = ${quote(slug)}` });
  const serviceAccount = data?.[0]?.ServiceAccount;
  // Last-used times and token expiry are read against this, so they age while the page is open.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <BackLink to={SERVICE_ACCOUNTS_PATH}>All service accounts</BackLink>
      {isLoading ? <Typography sx={{ fontSize: 13.5 }}>Loading…</Typography> : null}
      {isError ? (
        <Typography role='alert' sx={{ fontSize: 13.5, color: T.bad }}>
          The service account could not be read.
        </Typography>
      ) : null}
      {!isLoading && !isError && serviceAccount === undefined ? (
        <Box role='region' aria-label='Service account not found'>
          <Typography component='h1' sx={{ fontSize: 18, fontWeight: 650, mb: 0.5 }}>
            No service account matches “{slug}”
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: T.ink2 }}>It may have been deleted, or you may not be allowed to see it.</Typography>
        </Box>
      ) : null}
      {serviceAccount ? <ServiceAccountDetailView serviceAccount={serviceAccount} now={now} /> : null}
    </>
  );
}

export default function ServiceAccountsPage() {
  const { slug } = useParams<{ slug?: string }>();
  return (
    <Box data-testid='service-accounts-root' sx={CONSOLE_PAGE_SX}>
      <OrganizationRow />
      {slug ? <ServiceAccountPage slug={slug} /> : <ServiceAccountList />}
    </Box>
  );
}
