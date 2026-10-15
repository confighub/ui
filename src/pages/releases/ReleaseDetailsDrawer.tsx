// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import { DetailsFields, DetailsSection } from '@/components/details-drawer/DetailsFields';
import { detailsMono, mapFields } from '@/components/details-drawer/detailsFormat';
import { NavLink } from '@/components/nav-link/NavLink';
import { isGoZeroTime } from '@/utility/datetime-utils';
import type { ExtendedReleaseRead, Permissions } from '@confighub/rtk-query';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { unitConfigHref } from '../unit-detail/unitDetailHrefs';
import {
  releaseChangeOrderHref,
  releaseChangeOrderName,
  releaseTagName,
  releaseTargetName,
  releaseUserName,
} from './releaseFields';

export interface ReleaseDetailsDrawerProps {
  /** The Release to show, or `undefined` for the drawer to be closed. */
  release: ExtendedReleaseRead | undefined;
  onClose: () => void;
}

const linkStyle = { textDecoration: 'underline', cursor: 'pointer' } as const;

function formatTime(value: string | undefined): string {
  return value && !isGoZeroTime(value) ? new Date(value).toLocaleString() : '';
}

/**
 * A normalized live-status value, followed by the reporter's own word for it
 * when that differs, as Argo CD's Error does from Failed: the reporter's word
 * is the one to search its console and logs for.
 */
function reportedValue(normalized: string | undefined, reported: string | undefined): string {
  if (!reported || reported === normalized) return normalized ?? '';
  if (!normalized) return reported;
  return `${normalized} (reported as ${reported})`;
}

function permissionFields(permissions: Permissions | undefined): Array<[string, ReactNode]> {
  return Object.entries(permissions ?? {}).map(([action, subjects]) => [
    action,
    Object.keys(subjects?.UserIDs ?? {}).join(', '),
  ]);
}

/**
 * Every field of one Release, naming what it references: what `cub release get`
 * shows.
 */
export const ReleaseDetailsDrawer = ({ release: entry, onClose }: ReleaseDetailsDrawerProps) => {
  const release = entry?.Release;
  const live = release?.LiveStatus;
  const changeOrderHref = entry && releaseChangeOrderHref(entry);
  const skippedUnits = Object.entries(release?.SkippedUnits ?? {});

  return (
    <Drawer
      anchor='right'
      open={release !== undefined}
      onClose={onClose}
      sx={{ '& .MuiDrawer-paper': { width: 1000, maxWidth: '100%' } }}
    >
      {entry !== undefined && release !== undefined && (
        <Box sx={{ p: 3 }} data-testid='release-details-drawer'>
          <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mb: 2 }}>
            <Typography variant='h6' sx={detailsMono}>
              {release.SpaceSlug} release {release.ReleaseNum}
            </Typography>
            <IconButton aria-label='Close' onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>

          <DetailsSection title='Release'>
            <DetailsFields
              fields={[
                ['Release num', String(release.ReleaseNum ?? '')],
                [
                  'Space',
                  <NavLink key='space' to={`/spaces/${release.SpaceID}`} style={linkStyle}>
                    {entry.Space?.Slug ?? release.SpaceSlug ?? release.SpaceID}
                  </NavLink>,
                ],
                ['Published', release.Published ? 'true' : 'false (withdrawn)'],
                ['Tag', releaseTagName(entry)],
                [
                  'ChangeOrder',
                  changeOrderHref ? (
                    <NavLink key='change-order' to={changeOrderHref} style={linkStyle}>
                      {releaseChangeOrderName(entry)}
                    </NavLink>
                  ) : (
                    releaseChangeOrderName(entry)
                  ),
                ],
                ['Target', releaseTargetName(entry)],
                ['Published by', releaseUserName(entry.User, release.UserID)],
                ['Unit count', String(release.UnitCount ?? 0)],
                ['Bundle base name', release.BundleBaseName],
                ['Digest', release.Digest],
                ['Manifest digest', release.ManifestDigest],
                ['Data size', release.DataSize ? `${release.DataSize} bytes` : ''],
                ['Created', formatTime(release.CreatedAt)],
                ['Updated', formatTime(release.UpdatedAt)],
                ['Release ID', release.ReleaseID],
                ['Version', release.Version !== undefined ? String(release.Version) : ''],
              ]}
            />
          </DetailsSection>

          <DetailsSection title='Live status'>
            {live ? (
              <DetailsFields
                fields={[
                  ['Sync', reportedValue(live.Sync, live.ReporterSync)],
                  ['Health', reportedValue(live.Health, live.ReporterHealth)],
                  ['Operation', reportedValue(live.Operation, live.ReporterOperation)],
                  ['Message', live.Message],
                  ['Reporter', live.Reporter],
                  ['Data source', live.DataSource],
                  ['Observed', formatTime(live.ObservedAt)],
                ]}
              />
            ) : (
              <Typography variant='body2' color='text.secondary'>
                No tool deploying this Release has reported on it.
              </Typography>
            )}
          </DetailsSection>

          {skippedUnits.length > 0 && (
            <DetailsSection title='Skipped units'>
              <Box component='ul' sx={{ m: 0, pl: 2.5, ...detailsMono }}>
                {skippedUnits.map(([unitId, reason]) => (
                  <li key={unitId}>
                    <NavLink to={unitConfigHref(release.SpaceID ?? '', unitId)} style={linkStyle}>
                      {unitId}
                    </NavLink>{' '}
                    ({reason})
                  </li>
                ))}
              </Box>
            </DetailsSection>
          )}

          {Object.keys(release.Labels ?? {}).length > 0 && (
            <DetailsSection title='Labels'>
              <DetailsFields fields={mapFields(release.Labels)} />
            </DetailsSection>
          )}

          {Object.keys(release.Annotations ?? {}).length > 0 && (
            <DetailsSection title='Annotations'>
              <DetailsFields fields={mapFields(release.Annotations)} />
            </DetailsSection>
          )}

          {Object.keys(release.DeleteGates ?? {}).length > 0 && (
            <DetailsSection title='Delete gates'>
              <DetailsFields fields={mapFields(release.DeleteGates)} />
            </DetailsSection>
          )}

          {Object.keys(release.Permissions ?? {}).length > 0 && (
            <DetailsSection title='Permissions'>
              <DetailsFields fields={permissionFields(release.Permissions)} />
            </DetailsSection>
          )}
        </Box>
      )}
    </Drawer>
  );
};
