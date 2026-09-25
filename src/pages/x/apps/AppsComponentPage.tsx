// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Header } from '@/components/header/Header';
import { QueryErrorState } from '@/components/query-error-state/QueryErrorState';
import { useListAllTargetsQuery } from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import { styled } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';

import { AppsComponentLayout } from './AppsComponentLayout';
import { AppsComponentPageSkeleton } from './AppsComponentPageSkeleton';
import { LABEL_OWNER } from './componentData';
import { CreateComponentPane } from './CreateComponentPane';
import { useComponentSpaces } from './useComponentSpaces';

const Container = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
});

const PageContent = styled(Box)({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
});

const LoadingContainer = styled(Box)({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
});

export const AppsComponentPage = memo(() => {
  const [searchParams, setSearchParams] = useSearchParams();
  const appParam = searchParams.get('app');
  const hasApp = !!appParam;

  // Spaces load as a scoped deep-link query + a cheap live poll + a slow
  // summary poll. See `useComponentSpaces` for the split and why.
  const {
    spaces,
    isSpacesLoaded,
    isSummaryLoaded,
    isLoadingFullAppList,
    isSpacesError,
    isSummaryError,
    spacesError,
    failedSpacesQuery,
    retrySpaces,
  } = useComponentSpaces(appParam);

  const [createOpen, setCreateOpen] = useState(false);

  // Distinct non-empty Owner labels among component (deployment) spaces —
  // mirrors the population AppNavigationTree groups by.
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const s of spaces) {
      if (!s.Space?.ComponentID) continue;
      const owner = s.Space?.Labels?.[LABEL_OWNER]?.trim();
      if (owner) set.add(owner);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [spaces]);

  const existingSpaceSlugs = useMemo(
    () => spaces.map((s) => s.Space?.Slug).filter((slug): slug is string => !!slug),
    [spaces],
  );

  // Targets are only read by the component graph (`AppComponentView`), never by
  // the overview matrix, so this runs in parallel but does NOT gate first paint.
  // It stays unskipped so the cache is warm when a component is opened.
  const { data: targetsData, refetch: refetchTargets } = useListAllTargetsQuery({});
  const targets = useMemo(() => targetsData ?? [], [targetsData]);

  // Same scope as the other list pages' refresh button: the queries this
  // page itself owns (spaces, targets), not the graph's own unit/dry-run
  // data further down — that already has its own background polling.
  const handleRefresh = useCallback(() => {
    retrySpaces();
    refetchTargets();
  }, [retrySpaces, refetchTargets]);

  // Paint as soon as ANY space list resolves. Targets and the summary counts
  // backfill into their own consumers without re-gating the whole page.
  if (!isSpacesLoaded) {
    if (isSpacesError) {
      return (
        <LoadingContainer>
          <QueryErrorState
            error={spacesError}
            onRetry={retrySpaces}
            context='components'
            endpoint='GET /space'
            failedQuery={failedSpacesQuery}
          />
        </LoadingContainer>
      );
    }
    // Content-shaped placeholder for the split panel the page is about to
    // render, so first paint swaps shapes rather than replacing a blank page.
    return (
      <Container>
        <Header breadCrumbs={[{ name: 'Components' }]} />
        <PageContent>
          <AppsComponentPageSkeleton variant={hasApp ? 'graph' : 'overview'} />
        </PageContent>
      </Container>
    );
  }

  return (
    <Container>
      <Header
        breadCrumbs={[{ name: 'Components' }]}
        addButtonText='New component'
        onAddButtonClick={() => setCreateOpen(true)}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh components'>
            <IconButton
              size='small'
              data-testid='refresh-button'
              onClick={handleRefresh}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
      />
      <PageContent>
        <AppsComponentLayout
          spaces={spaces}
          targets={targets}
          isLoadingFullAppList={isLoadingFullAppList}
          // The overview matrix reads summary-only counts. Show its skeleton
          // until they arrive rather than a matrix full of misleading zeros.
          // On summary failure, fall through and render what we have.
          isLoadingOverviewCounts={!isSummaryLoaded && !isSummaryError}
        />
      </PageContent>
      <CreateComponentPane
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(componentName) => {
          setCreateOpen(false);
          // Same deep-link shape AppsComponentLayout's own handleAppSelect
          // uses (and the same deliberate PUSH — out of scope for the
          // replace-everywhere rule, which covers in-page gestures, not the
          // navigation of opening a just-created component) so this reads
          // exactly like clicking the new component's tile from the overview.
          setSearchParams({ app: componentName });
        }}
        owners={owners}
        existingSpaceSlugs={existingSpaceSlugs}
      />
    </Container>
  );
});

AppsComponentPage.displayName = 'AppsComponentPage';

export default AppsComponentPage;
