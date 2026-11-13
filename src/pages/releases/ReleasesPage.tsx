// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Header } from '@/components/header/Header';
import { NavLink } from '@/components/nav-link/NavLink';
import { useListReleaseDetailsSinceChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import { SPACE_PARAM } from '@/hooks/useSpaceParam';
import { getApiErrorMessage } from '@/utility/error-functions';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import dayjs from 'dayjs';

import { useListComponentSpacesQuery } from '../x/apps/componentSpacesApi';
import { COMPONENT_SPACE_SELECT } from '../x/apps/useComponentSpaces';
import { ReleaseDetailsDrawer } from './ReleaseDetailsDrawer';
import { ComponentReleaseHeatmap } from './ComponentReleaseHeatmap';
import { dayKey, heatmapDays, heatmapSince, type HeatmapRow } from './releaseHeatmap';
import { releaseScope } from './releaseScope';
import { type ReleaseRow, ReleasesTable } from './ReleasesTable';

const RANGE_OPTIONS = [14, 30, 90] as const;
type RangeDays = (typeof RANGE_OPTIONS)[number];
const DEFAULT_RANGE: RangeDays = 30;

/** The URL parameters the page keeps its state in, so a link opens the same view. */
const COMPONENT_PARAM = 'component';
const DAYS_PARAM = 'days';

/** A reporter writes a Release's live status whenever it observes a change, and nothing tells this page when. */
const POLL_MS = 30_000;

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const;

function readRange(value: string | null): RangeDays {
  const days = Number(value);
  return RANGE_OPTIONS.find((option) => option === days) ?? DEFAULT_RANGE;
}

/**
 * Releases (/releases): every Component's Releases by day, as a heatmap, and,
 * once a Component is selected, a table of its Releases, newest first, each
 * opening its details. The table is `cub release list` over the Component's
 * Spaces, and the details `cub release get`.
 *
 * Selecting a Component narrows the heatmap to its row and its neighbours,
 * which leaves the room to the table. A Space in the URL (`?space=<slug>`)
 * narrows the table to that Space's Releases, and selects its Component, if it
 * has one, in the heatmap.
 */
export default function ReleasesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const spaceSlug = searchParams.get(SPACE_PARAM) ?? '';
  const componentParam = searchParams.get(COMPONENT_PARAM) ?? '';
  const rangeDays = readRange(searchParams.get(DAYS_PARAM));
  const [selectedReleaseId, setSelectedReleaseId] = useState('');

  const { data: spaces, error: spacesError } = useListComponentSpacesQuery({ select: COMPONENT_SPACE_SELECT });
  const { idBySlug, slugById, isLoaded: componentsLoaded } = useComponentSlugs();
  const scope = useMemo(
    () =>
      releaseScope({
        spaces: (spaces ?? []).map((s) => s.Space),
        spaceSlug,
        componentSlug: componentParam,
        componentIdBySlug: idBySlug,
        componentSlugById: slugById,
      }),
    [spaces, spaceSlug, componentParam, idBySlug, slugById],
  );
  const { space: selectedSpace, componentId: selectedComponentId, componentSlug, spaceIds: selectedSpaceIds } = scope;

  // Recomputed when the day changes, not on every render.
  const today = dayKey(new Date());
  const days = useMemo(() => heatmapDays(rangeDays, dayjs(today).toDate()), [rangeDays, today]);
  const since = useMemo(() => heatmapSince(rangeDays, dayjs(today).toDate()), [rangeDays, today]);

  const skipReleases = selectedSpaceIds.length === 0;
  const {
    data: releases,
    isFetching: isFetchingReleases,
    error: releasesError,
    refetch: refetchReleases,
  } = useListReleaseDetailsSinceChunkedQuery({ spaceIds: selectedSpaceIds, since }, { skip: skipReleases });
  const poll = useCallback(() => {
    if (!skipReleases) void refetchReleases();
  }, [skipReleases, refetchReleases]);
  usePolling(poll, POLL_MS);

  const rows: ReleaseRow[] = useMemo(
    () =>
      (releases ?? []).flatMap((entry) =>
        entry.Release?.ReleaseID ? [{ id: entry.Release.ReleaseID, ...entry }] : [],
      ),
    [releases],
  );
  const selectedRelease = rows.find((row) => row.id === selectedReleaseId);

  const updateParams = useCallback(
    (update: (next: URLSearchParams) => void) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        update(next);
        return next;
      }),
    [setSearchParams],
  );
  const selectComponent = useCallback(
    (row: HeatmapRow) =>
      updateParams((next) => {
        next.set(COMPONENT_PARAM, row.componentName);
        next.delete(SPACE_PARAM);
      }),
    [updateParams],
  );
  const clearSelection = useCallback(
    () =>
      updateParams((next) => {
        next.delete(COMPONENT_PARAM);
        next.delete(SPACE_PARAM);
      }),
    [updateParams],
  );
  const setRange = useCallback(
    (value: RangeDays) =>
      updateParams((next) => {
        if (value === DEFAULT_RANGE) next.delete(DAYS_PARAM);
        else next.set(DAYS_PARAM, String(value));
      }),
    [updateParams],
  );

  return (
    <Box sx={{ width: '100%' }}>
      <Header
        breadCrumbs={[{ name: 'Releases' }]}
        actions={
          <Select
            size='small'
            value={rangeDays}
            onChange={(e) => setRange(Number(e.target.value) as RangeDays)}
            inputProps={{ 'aria-label': 'Release range' }}
            data-testid='releases-range'
          >
            {RANGE_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>
                Last {n} days
              </MenuItem>
            ))}
          </Select>
        }
      />
      <Box sx={{ p: 3 }}>
        {spacesError ? (
          <Alert severity='error'>{getApiErrorMessage(spacesError) || 'Failed to load Spaces.'}</Alert>
        ) : (
          <ComponentReleaseHeatmap
            spaces={spaces ?? []}
            days={days}
            since={since}
            selectedComponentId={selectedComponentId}
            onComponentSelect={selectComponent}
          />
        )}

        {selectedSpace || selectedComponentId ? (
          <Box sx={{ mt: 3 }} data-testid='component-releases'>
            <Stack direction='row' alignItems='center' spacing={2} sx={{ mb: 1.5 }}>
              <Typography variant='h6'>{selectedSpace ? spaceSlug : componentSlug}</Typography>
              <Typography variant='body2' color='text.secondary'>
                {releases ? `${rows.length} ${rows.length === 1 ? 'Release' : 'Releases'} in the last ${rangeDays} days` : ''}
              </Typography>
              {selectedSpace ? (
                <NavLink to={`/spaces/${selectedSpace.SpaceID}`} style={linkStyle}>
                  <Typography variant='body2'>Open Space</Typography>
                </NavLink>
              ) : null}
              {componentSlug ? (
                <NavLink to={`/components?app=${encodeURIComponent(componentSlug)}`} style={linkStyle}>
                  <Typography variant='body2'>Open Component</Typography>
                </NavLink>
              ) : null}
              <Box sx={{ flex: 1 }} />
              <Tooltip title='Show every Component'>
                <IconButton size='small' aria-label='Show every Component' onClick={clearSelection}>
                  <CloseIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            </Stack>
            {releasesError ? (
              <Alert severity='error'>{getApiErrorMessage(releasesError) || 'Failed to load Releases.'}</Alert>
            ) : (
              <ReleasesTable
                rows={rows}
                isLoading={isFetchingReleases && !releases}
                onReleaseSelect={setSelectedReleaseId}
              />
            )}
          </Box>
        ) : (
          <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
            {spaceSlug && spaces
              ? `No Space is named ${spaceSlug}.`
              : componentParam && componentsLoaded
                ? `No Component is named ${componentParam}.`
                : 'Select a Component to list its Releases.'}
          </Typography>
        )}
      </Box>
      <ReleaseDetailsDrawer release={selectedRelease} onClose={() => setSelectedReleaseId('')} />
    </Box>
  );
}
