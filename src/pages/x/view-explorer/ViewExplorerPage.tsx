// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import LinkIcon from '@mui/icons-material/Link';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { Header } from '@/components/header/Header';

import { SYSTEM_SPACE_SLUG, type SavedView, useViews } from './queries/useViews';
import { ExplorerDndProvider } from './dnd/ExplorerDndProvider';
import { isMod, plainKey, usePageShortcuts } from './keys/usePageShortcuts';
import { LensColumn } from './lenses/LensColumn';
import { PeekHost } from './peek/PeekHost';
import { CellPopoverHost } from './popovers/CellPopoverHost';
import { ResultsPane } from './results/ResultsPane';
import { ExplorerProvider } from './state/ExplorerProvider';
import { type Shortcut, useExplorerContext } from './state/context';
import { buildInitialState } from './state/initial';
import { ResultsProvider } from './state/ResultsProvider';
import { explorerStorage, type ExplorerStorage } from './state/storage';
import { useActiveTab, useTabActions } from './state/useExplorer';
import { ViewSwitcher } from './switcher/ViewSwitcher';
import { TAB_PANEL_ID, tabElementId } from './tabs/ids';
import { TabStrip } from './tabs/TabStrip';
import { useCopyLink } from './tabs/useCopyLink';
import { useSaveFlow } from './tabs/useSaveFlow';

/**
 * The View Explorer. A tab strip of views (the built-in "All units", the
 * viewer's pinned views, temporary and changed views); under it the view
 * being looked at, with its filters on the left and its rows on the right.
 * Every change is made in place on live rows and turns the tab into a draft
 * that is saved, saved as new, or discarded from the toolbar.
 */

const BREADCRUMBS = [{ name: 'View explorer' }];

function HeaderActions() {
  const { views, state } = useExplorerContext();
  const tab = useActiveTab();
  const copyLink = useCopyLink();
  const pinned = state.tabs.filter((t) => t.kind === 'saved' && t.pinned).length;
  return (
    <Stack direction='row' alignItems='center' spacing={1.5}>
      <Typography variant='body2' color='text.secondary' sx={{ whiteSpace: 'nowrap' }} data-testid='vx-header-meta'>
        {views.length} views shared in{' '}
        <Typography component='span' variant='body2' fontWeight={600} color='text.primary'>
          {SYSTEM_SPACE_SLUG}
        </Typography>{' '}
        · {pinned} pinned by you
      </Typography>
      <Button size='small' color='inherit' startIcon={<LinkIcon fontSize='small' />} onClick={() => void copyLink(tab)} sx={{ color: 'text.secondary' }}>
        Copy link
      </Button>
    </Stack>
  );
}

/** The page's own shortcuts. Slices add theirs through `useRegisterShortcut`. */
function useExplorerShortcuts(): Shortcut[] {
  const { dispatch } = useExplorerContext();
  const { newTemp, step } = useTabActions();
  const { save, saveAsNew } = useSaveFlow();
  return useMemo<Shortcut[]>(
    () => [
      { id: 'save', keys: '⌘S', label: 'Save the view', inText: true, matches: (e) => isMod(e) && !e.shiftKey && e.key.toLowerCase() === 's', run: save },
      { id: 'save-as', keys: '⌘⇧S', label: 'Save as a new view', inText: true, matches: (e) => isMod(e) && e.shiftKey && e.key.toLowerCase() === 's', run: saveAsNew },
      { id: 'undo', keys: '⌘Z', label: 'Undo the last change', matches: (e) => isMod(e) && !e.shiftKey && e.key.toLowerCase() === 'z', run: () => dispatch({ type: 'undo' }) },
      { id: 'new', keys: 'N', label: 'New temporary view', matches: plainKey('n'), run: () => newTemp() },
      { id: 'prev', keys: '[', label: 'Previous tab', matches: plainKey('['), run: () => step(-1) },
      { id: 'next', keys: ']', label: 'Next tab', matches: plainKey(']'), run: () => step(1) },
      { id: 'layout-table', keys: 'T', label: 'Show as a table', matches: plainKey('t'), run: () => dispatch({ type: 'setLayout', layout: 'table' }) },
      { id: 'layout-list', keys: 'L', label: 'Show as a list', matches: plainKey('l'), run: () => dispatch({ type: 'setLayout', layout: 'list' }) },
      { id: 'layout-board', keys: 'B', label: 'Show as a board', matches: plainKey('b'), run: () => dispatch({ type: 'setLayout', layout: 'board' }) },
      { id: 'layout-matrix', keys: 'M', label: 'Show as a matrix', matches: plainKey('m'), run: () => dispatch({ type: 'setLayout', layout: 'matrix' }) },
    ],
    [dispatch, newTemp, step, save, saveAsNew],
  );
}

function ExplorerBody() {
  usePageShortcuts(useExplorerShortcuts());
  const activeId = useExplorerContext().state.activeId;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}>
      <Header breadCrumbs={BREADCRUMBS} actions={<HeaderActions />} />
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', px: 2.5, pb: 2 }}>
        <TabStrip />
        <ResultsProvider>
          <Box
            data-testid='vx-card'
            id={TAB_PANEL_ID}
            role='tabpanel'
            aria-labelledby={tabElementId(activeId)}
            sx={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              bgcolor: 'background.paper',
              border: 1,
              borderTop: 0,
              borderColor: 'divider',
              borderRadius: (t) => `0 0 ${t.shape.borderRadius}px ${t.shape.borderRadius}px`,
              overflow: 'clip',
              position: 'relative',
            }}
          >
            <LensColumn />
            <ResultsPane />
          </Box>
          <CellPopoverHost />
          <PeekHost />
        </ResultsProvider>
        <ViewSwitcher />
      </Box>
    </Box>
  );
}

interface ExplorerShellProps {
  views: readonly SavedView[];
  storage: ExplorerStorage;
}

/** Built once, when the views have loaded: tabs come from the views, the URL and this browser. */
function ExplorerShell({ views, storage }: ExplorerShellProps) {
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => buildInitialState({ views, storage, params: searchParams }));
  return (
    <ExplorerProvider initialState={initial.state} initialVersions={initial.versions} initialNotice={initial.notice} views={views} storage={storage}>
      <ExplorerDndProvider>
        <ExplorerBody />
      </ExplorerDndProvider>
    </ExplorerProvider>
  );
}

export default function ViewExplorerPage() {
  const { views, isLoading, isError, refetch } = useViews();
  const { userInfo } = useUserInfo();
  const orgId = userInfo.ExternalOrganizationID || userInfo.OrganizationID || '';
  const storage = useMemo(() => explorerStorage(orgId), [orgId]);

  if (isLoading || isError) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
        <Header breadCrumbs={BREADCRUMBS} />
        <Box sx={{ px: 2.5, pt: 1 }}>
          {isError ? (
            <Alert severity='error' action={<Button size='small' onClick={() => void refetch()}>Retry</Button>}>
              The views could not be loaded.
            </Alert>
          ) : (
            <Stack spacing={1} data-testid='vx-loading'>
              <Skeleton variant='rounded' height={36} width={520} />
              <Skeleton variant='rounded' height={480} />
            </Stack>
          )}
        </Box>
      </Box>
    );
  }
  return <ExplorerShell key={orgId} views={views} storage={storage} />;
}
