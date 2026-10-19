// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * `/change-sets`: every ChangeSet. `/change-sets/:space/:slug`: one ChangeSet, its
 * change, and its reviews.
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';

import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import { OrganizationRow } from '@/components/organization-switcher/OrganizationRow';

import { changeOrderFontSans, changeOrderInk, changeOrderStatus, changeOrderSurface, changeOrderType } from '../change-orders/changeOrdersTokens';
import { AllChangeSetsLink, ChangeSetDetailView } from './ChangeSetDetailView';
import { ChangeSetList } from './ChangeSetList';
import { useChangeSetDetail } from './useChangeSetDetail';

function ChangeSetPage({ space, slug, onNotice }: { space: string; slug?: string; onNotice: (message: string) => void }) {
  const detail = useChangeSetDetail({ space, slug });
  return (
    <>
      <AllChangeSetsLink />
      {detail.status === 'loading' ? <Box sx={{ fontSize: changeOrderType.size.prose }}>Loading…</Box> : null}
      {detail.status === 'error' ? (
        <Box role="alert" sx={{ fontSize: changeOrderType.size.prose, color: changeOrderStatus.danger }}>
          The ChangeSet could not be read.
        </Box>
      ) : null}
      {detail.status === 'notFound' ? (
        <Box role="region" aria-label="ChangeSet not found" sx={{ fontSize: changeOrderType.size.prose }}>
          <Box
            component="h1"
            sx={{ fontSize: changeOrderType.size.heading, lineHeight: changeOrderType.lineHeight.heading, fontWeight: changeOrderType.weight.semibold, margin: '0 0 6px' }}
          >
            No ChangeSet matches “{[space, slug].filter(Boolean).join('/')}”
          </Box>
          <Box sx={{ color: changeOrderInk.muted }}>It may have been deleted, or the address may be wrong.</Box>
        </Box>
      ) : null}
      {detail.status === 'found' ? <ChangeSetDetailView detail={detail} onNotice={onNotice} /> : null}
    </>
  );
}

export default function ChangeSetsPage() {
  const { space, slug } = useParams<{ space?: string; slug?: string }>();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <Box
      data-testid="change-sets-root"
      sx={{
        padding: '20px 22px',
        background: changeOrderSurface.page,
        minHeight: '100%',
        // A flex item of the page shell's row: without `flex: 1` it shrinks to its content.
        flex: 1,
        fontFamily: changeOrderFontSans,
        lineHeight: changeOrderType.lineHeight.body,
        color: changeOrderInk.default,
        fontSize: changeOrderType.size.body,
      }}
    >
      <OrganizationRow />
      {space === undefined || space === '' ? <ChangeSetList /> : <ChangeSetPage space={space} slug={slug} onNotice={setNotice} />}
      <Snackbar
        open={notice !== null}
        autoHideDuration={4000}
        onClose={() => setNotice(null)}
        message={notice ?? ''}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
