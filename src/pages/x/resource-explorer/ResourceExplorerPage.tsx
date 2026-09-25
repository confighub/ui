// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import CachedIcon from '@mui/icons-material/Cached';
import GridOnIcon from '@mui/icons-material/GridOn';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { ResourceDrawer } from './components/ResourceDrawer/ResourceDrawer';
import { ResourceGroupNavPanel } from './components/ResourceGroupNavPanel/ResourceGroupNavPanel';
import { ResourceSummaryDialog } from './components/ResourceSummaryDialog/ResourceSummaryDialog';
import { ResourceTable } from './components/ResourceTable/ResourceTable';
import { ResourceViewBuilder } from './components/ResourceViewBuilder/ResourceViewBuilder';
import { ResourceRow, useResourceRows } from './hooks/useResourceRows';
import {
  DEFAULT_VIEW,
  ResourceColumn,
  ResourceView,
  URL_PARAM,
  decodeView,
  encodeView,
  viewNeedsResourceBody,
  viewsEqual,
} from './types';
import { getCellValue } from './utils';

type SidebarTab = 'edit' | 'groups';

/**
 * Resource Explorer (experimental, /x/resource-explorer).
 *
 * A spiritual sibling of View Explorer that operates over Kubernetes resources
 * (the contents of Unit Data) instead of Units themselves. The view definition
 * — column list, filter, resource type, sort, group-by — is held entirely
 * client-side and serialized into the `?v=` URL parameter so views can be
 * shared without needing a server-side View entity.
 */
export default function ResourceExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Decoded once per mount. Browser nav within the page is driven by Apply;
  // we don't try to resync if the user edits the URL by hand.
  const [applied, setApplied] = useState<ResourceView>(() =>
    decodeView(searchParams.get(URL_PARAM)),
  );
  const [draft, setDraft] = useState<ResourceView>(applied);

  const isDirty = !viewsEqual(applied, draft);

  const { rows, isLoading, error, refetch } = useResourceRows();
  const [selectedRow, setSelectedRow] = useState<ResourceRow | null>(null);
  const [snackOpen, setSnackOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Sidebar tab: "edit" (the view builder) or "groups" (the tree nav). Defaults
  // to groups whenever the applied view has any group-by columns; otherwise the
  // groups tab is empty and we surface the editor instead.
  const hasGroupBy = (applied.groupBy?.length ?? 0) > 0;
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(hasGroupBy ? 'groups' : 'edit');
  // Browsing-only state: which path through the group tree is selected.
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const needBody = useMemo(() => viewNeedsResourceBody(applied), [applied]);

  // Re-run the org-wide resource query whenever the applied filter or
  // body-need changes (initial mount, each Apply, and toggling a path column
  // in/out). Refresh is a separate path that goes through refetch directly.
  // This is the one place we need useEffect — sync of an imperative mutation
  // against a prop-derived value.
  useEffect(() => {
    refetch({
      where: applied.where ?? '',
      whereData: applied.whereData ?? '',
      resourceType: applied.resourceType ?? '',
      needBody,
    });
  }, [refetch, applied.where, applied.whereData, applied.resourceType, needBody]);

  const handleApply = useCallback(() => {
    setApplied(draft);
    setSelectedGroups([]); // group selection is tied to the view's groupBy list
    if (viewsEqual(draft, DEFAULT_VIEW)) {
      // Keep the URL clean when the user is back on the default view.
      const next = new URLSearchParams(searchParams);
      next.delete(URL_PARAM);
      setSearchParams(next, { replace: false });
    } else {
      const next = new URLSearchParams(searchParams);
      next.set(URL_PARAM, encodeView(draft));
      setSearchParams(next, { replace: false });
    }
    if ((draft.groupBy?.length ?? 0) > 0) {
      setSidebarTab('groups');
    }
  }, [draft, searchParams, setSearchParams]);

  const handleReset = useCallback(() => {
    setDraft(applied);
  }, [applied]);

  const handleRefresh = useCallback(() => {
    refetch({
      where: applied.where ?? '',
      whereData: applied.whereData ?? '',
      resourceType: applied.resourceType ?? '',
      needBody,
    });
  }, [refetch, applied.where, applied.whereData, applied.resourceType, needBody]);

  const handleCopyShareLink = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.set(URL_PARAM, encodeView(draft));
    void navigator.clipboard.writeText(url.toString()).then(() => setSnackOpen(true));
  }, [draft]);

  const handleRowClick = useCallback((row: ResourceRow) => {
    setSelectedRow(row);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setSelectedRow(null);
  }, []);

  const knownResourceTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.ResourceType) set.add(r.ResourceType);
    }
    return Array.from(set).sort();
  }, [rows]);

  // Resolve the applied groupBy column names to ResourceColumn objects (for
  // value extraction). Order follows the column list in the edit pane, not
  // the order in which folder icons were toggled — so reordering columns
  // visibly reorders the group tree. Skips names that no longer exist in the
  // column list, so a stale URL can't crash the panel.
  const groupByColumns = useMemo<ResourceColumn[]>(() => {
    const groupSet = new Set(applied.groupBy ?? []);
    return applied.columns.filter((c) => groupSet.has(c.name));
  }, [applied.columns, applied.groupBy]);

  // Apply the group selection: keep only rows whose values at each group-by
  // column match the selected path. Empty path = all rows.
  const filteredRows = useMemo(() => {
    if (selectedGroups.length === 0 || groupByColumns.length === 0) return rows;
    return rows.filter((row) => {
      for (let i = 0; i < selectedGroups.length; i++) {
        const col = groupByColumns[i];
        if (!col) return false;
        const val = getCellValue(row, col) || '(empty)';
        if (val !== selectedGroups[i]) return false;
      }
      return true;
    });
  }, [rows, selectedGroups, groupByColumns]);

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minHeight: 0 }}
    >
      <Stack
        direction='row'
        alignItems='baseline'
        justifyContent='space-between'
        sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Box>
          <Typography variant='h6' fontWeight={600}>
            Resource Explorer
          </Typography>
          <Typography variant='caption' color='text.secondary'>
            Browse Kubernetes resources across all Units in the org. View definitions are
            stored in the URL — copy the link to share.
          </Typography>
        </Box>
      </Stack>

      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          gap: 2,
          pl: 2,
          py: 2,
          pr: 0,
        }}
      >
        <Box
          sx={{
            width: 360,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <Tabs
            value={sidebarTab}
            onChange={(_, v: SidebarTab) => setSidebarTab(v)}
            variant='fullWidth'
            sx={{ minHeight: 36, mb: 1, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab
              label='Edit'
              value='edit'
              sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
            />
            <Tab
              label={`Groups${hasGroupBy ? ` (${groupByColumns.length})` : ''}`}
              value='groups'
              disabled={!hasGroupBy}
              sx={{ minHeight: 36, textTransform: 'none', fontSize: '0.78rem' }}
            />
          </Tabs>

          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {sidebarTab === 'edit' ? (
              <ResourceViewBuilder
                draft={draft}
                applied={applied}
                isDirty={isDirty}
                knownResourceTypes={knownResourceTypes}
                onChange={setDraft}
                onApply={handleApply}
                onReset={handleReset}
                onCopyShareLink={handleCopyShareLink}
              />
            ) : (
              <ResourceGroupNavPanel
                groupByColumns={groupByColumns}
                rows={rows}
                selectedGroups={selectedGroups}
                onSelectGroups={setSelectedGroups}
              />
            )}
          </Box>
        </Box>

        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Stack
            direction='row'
            alignItems='center'
            justifyContent='space-between'
            spacing={1}
            mb={1.5}
          >
            <Typography variant='subtitle2' color='text.secondary'>
              {isLoading
                ? 'Loading…'
                : `${filteredRows.length} resource${filteredRows.length !== 1 ? 's' : ''}${
                    filteredRows.length !== rows.length ? ` of ${rows.length}` : ''
                  }`}
            </Typography>
            <Stack direction='row' alignItems='center' spacing={0.5}>
              <Button
                size='small'
                variant='outlined'
                startIcon={<GridOnIcon fontSize='small' />}
                onClick={() => setSummaryOpen(true)}
                disabled={isLoading || rows.length === 0}
                sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.25 }}
              >
                Summary
              </Button>
              <Tooltip title='Refresh'>
                <span>
                  <IconButton size='small' onClick={handleRefresh} disabled={isLoading}>
                    <CachedIcon fontSize='small' />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          </Stack>

          {error && (
            <Alert severity='error' sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <ResourceTable
            view={applied}
            rows={filteredRows}
            loading={isLoading}
            onRowClick={handleRowClick}
          />
        </Box>
      </Box>

      <ResourceDrawer row={selectedRow} onClose={handleDrawerClose} />

      <ResourceSummaryDialog
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        rows={rows}
      />

      <Snackbar
        open={snackOpen}
        autoHideDuration={2000}
        onClose={() => setSnackOpen(false)}
        message='Share link copied to clipboard'
      />
    </Box>
  );
}
