// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { Header } from '@/components/header/Header';
import { RELEASE_DETAILS_INCLUDE } from '@/hooks/chunkedQueriesApi';
import { useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  useGetExtendedReleaseQuery,
  useListAllResourcesQuery,
  useListAllTargetsQuery,
} from '@confighub/rtk-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import { ReleaseDetailsDrawer } from '../releases/ReleaseDetailsDrawer';
import { useListComponentSpacesQuery } from '../x/apps/componentSpacesApi';
import { COMPONENT_SPACE_SELECT } from '../x/apps/useComponentSpaces';
import { useRunningReleases } from '../x/apps/useRunningReleases';
import { TargetMatrixTable } from './TargetMatrixTable';
import { buildTargetMatrix, countResources, type MatrixDeployment } from './targetMatrix';

/** A reporter writes a Release's live status whenever it observes a change, and nothing tells this page when. */
const POLL_MS = 30_000;

/** Every resource assigned to a Target, narrowed to what counting them by Space and Target needs. */
const RESOURCE_QUERY = { where: 'TargetID IS NOT NULL', select: 'SpaceID,TargetID' };

/**
 * Target Overview (/target-overview): every Component against every Target its
 * Spaces are on, each cell the live status of the Releases they run there and
 * the number of resources their Units hold for it. See targetMatrix.ts.
 */
export default function TargetOverviewPage() {
  const { data: spaces, error: spacesError, isLoading: spacesLoading } = useListComponentSpacesQuery({
    select: COMPONENT_SPACE_SELECT,
  });
  const { data: targets, error: targetsError, isLoading: targetsLoading } = useListAllTargetsQuery({});
  const {
    data: resources,
    error: resourcesError,
    isLoading: resourcesLoading,
    refetch: refetchResources,
  } = useListAllResourcesQuery(RESOURCE_QUERY);
  const { componentById, isLoaded: componentsLoaded } = useComponentSlugs();

  const releaseSpaces = useMemo(
    () =>
      (spaces ?? []).flatMap((s) =>
        s.Space?.SpaceID && s.Space.ComponentID
          ? [{ spaceId: s.Space.SpaceID, releaseTargetId: s.Space.ReleaseTargetID }]
          : [],
      ),
    [spaces],
  );
  const releases = useRunningReleases(releaseSpaces, { pollIntervalMs: POLL_MS });
  usePolling(refetchResources, POLL_MS);

  const resourceCounts = useMemo(() => countResources(resources ?? []), [resources]);
  const matrix = useMemo(
    () => buildTargetMatrix(spaces ?? [], componentById, targets ?? [], releases.bySpaceId, resourceCounts),
    [spaces, componentById, targets, releases.bySpaceId, resourceCounts],
  );

  const [openRelease, setOpenRelease] = useState<{ spaceId: string; releaseId: string } | null>(null);
  const { currentData: releaseDetails } = useGetExtendedReleaseQuery(
    { spaceId: openRelease?.spaceId ?? '', releaseId: openRelease?.releaseId ?? '', include: RELEASE_DETAILS_INCLUDE.include },
    { skip: !openRelease },
  );
  const handleReleaseOpen = useCallback((deployment: MatrixDeployment) => {
    const releaseId = deployment.release?.releaseId;
    if (releaseId) setOpenRelease({ spaceId: deployment.spaceId, releaseId });
  }, []);

  const error = spacesError ?? targetsError ?? resourcesError ?? releases.error;
  const loading = spacesLoading || targetsLoading || resourcesLoading || !componentsLoaded || !releases.loaded;

  let body;
  if (error) {
    body = <Alert severity='error'>{getApiErrorMessage(error) || 'Failed to load the Target Overview.'}</Alert>;
  } else if (loading) {
    body = <Skeleton variant='rounded' height={240} />;
  } else if (matrix.rows.length === 0) {
    body = (
      <Paper variant='outlined' sx={{ borderRadius: '8px', p: 2 }}>
        <Typography variant='body2' color='text.secondary'>
          No Component releases to a Target, and none of their Units is assigned to one.
        </Typography>
      </Paper>
    );
  } else {
    body = <TargetMatrixTable matrix={matrix} onReleaseOpen={handleReleaseOpen} />;
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Header breadCrumbs={[{ name: 'Targets' }]} />
      <Box sx={{ p: 3 }}>
        {!loading && !error && matrix.rows.length > 0 && (
          <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
            {matrix.rows.length} {matrix.rows.length === 1 ? 'Component' : 'Components'} on{' '}
            {matrix.columns.length} {matrix.columns.length === 1 ? 'Target' : 'Targets'}. Each cell is the latest
            Release of the Component&apos;s variants on the Target, and the resources of their Units assigned to it.
          </Typography>
        )}
        {body}
      </Box>
      <ReleaseDetailsDrawer release={openRelease ? releaseDetails : undefined} onClose={() => setOpenRelease(null)} />
    </Box>
  );
}
