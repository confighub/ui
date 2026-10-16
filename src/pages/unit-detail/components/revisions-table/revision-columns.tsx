// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { DateTimeCell, UuidCell } from '@/components/data-grid/cells';
import { ColumnGroup } from '@/components/entity-data-grid/column-groups-types';
import { NavLink } from '@/components/nav-link/NavLink';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { TagBadge } from '@/components/tag-badge/TagBadge';
import { changeOrderPath } from '@/pages/change-orders/changeOrderAddress';
import { TagRead, ExtendedUnitRead } from '@confighub/rtk-query';
import { RevisionRow } from '@/types';
import { isGoZeroTime } from '@/utility/datetime-utils';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';

import { ChangeSetCell, ChipList, CountChip, TagsScrollContainer } from './revision-cells';

/**
 * The Columns panel lists the columns by group, so every column the table defines is named in
 * exactly one of these.
 */
export const REVISION_COLUMN_GROUPS: ColumnGroup[] = [
  {
    header: 'Revision',
    columns: ['RevisionNum', 'RevisionID', 'markers', 'source', 'description'],
  },
  {
    header: 'Change Management',
    columns: ['changeSet', 'ChangeSetID', 'changeOrders', 'tags', 'releases', 'attestations'],
  },
  {
    header: 'Author',
    columns: ['userName', 'UserAgent'],
  },
  {
    header: 'Validation',
    columns: ['validationErrors', 'validationWarnings', 'validationPassed', 'conflicts', 'linkFindings'],
  },
  {
    header: 'Data',
    columns: ['DataSize', 'DataHash'],
  },
  {
    header: 'Timestamps',
    columns: ['createdAt', 'updatedAt'],
  },
];

/** What a column shows by default; the rest are offered in the Columns panel. */
export const REVISION_COLUMN_VISIBILITY: Record<string, boolean> = {
  RevisionNum: true,
  RevisionID: false,
  markers: true,
  source: true,
  description: true,
  changeSet: true,
  ChangeSetID: false,
  changeOrders: true,
  tags: true,
  releases: false,
  attestations: false,
  userName: true,
  UserAgent: false,
  validationErrors: true,
  validationWarnings: false,
  validationPassed: false,
  conflicts: false,
  linkFindings: false,
  DataSize: false,
  DataHash: false,
  createdAt: false,
  updatedAt: true,
};

/**
 * An entity's slug, prefixed with its Space when that is not the Revision's own. A
 * ChangeOrder's Tags, and the ChangeOrder itself, live in the Space the change came from, so a
 * variant's Revision routinely names one from elsewhere.
 */
const qualifySlug = (slug: string, spaceSlug: string | undefined, revisionSpaceSlug: string | undefined) =>
  spaceSlug && revisionSpaceSlug && spaceSlug !== revisionSpaceSlug ? `${spaceSlug}/${slug}` : slug;

const countKeys = (map: Record<string, boolean> | undefined) => Object.keys(map ?? {}).length;

const renderUuid = (params: GridRenderCellParams<RevisionRow>) => <UuidCell params={params} />;

export interface RevisionTableColumnsOptions {
  onTagClick?: (row: RevisionRow) => void;
  onTagDelete?: (row: RevisionRow, tag: TagRead) => void;
}

export const createRevisionTableColumns = (
  currentUnitExtended: ExtendedUnitRead,
  options?: RevisionTableColumnsOptions,
): GridColDef<RevisionRow>[] => [
  {
    field: 'RevisionNum',
    headerName: 'Number',
    minWidth: 100,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.RevisionNum,
    renderCell: (params) => (
      <CenteredTableCell>
        <Chip size='small' color='primary' label={params.row.RevisionNum} />
      </CenteredTableCell>
    ),
  },
  {
    field: 'tags',
    headerName: 'Tags',
    minWidth: 200,
    flex: 1.5,
    valueGetter: (_, row) => {
      const tags = row?.Tags?.map((tag) => tag.Slug).join(', ') || '';
      return tags;
    },
    renderCell: (params) => {
      const tags = params.row?.Tags || [];

      if (tags.length === 0) {
        return <CenteredTableCell />;
      }

      return (
        <CenteredTableCell
          sx={{
            overflow: 'hidden',
          }}
        >
          <TagsScrollContainer direction='row'>
            {tags.map((tag) => {
              const isChangesetTag = !!tag.ChangeSetID;
              const tagLabel = tag.DisplayName || tag.Slug || '';

              return (
                <TagBadge
                  key={tag.TagID}
                  label={tagLabel}
                  slug={tag.Slug}
                  disabled={isChangesetTag}
                  onDelete={
                    options?.onTagDelete
                      ? (e) => {
                          e.stopPropagation();
                          options.onTagDelete?.(params.row, tag);
                        }
                      : undefined
                  }
                />
              );
            })}
          </TagsScrollContainer>
        </CenteredTableCell>
      );
    },
  },
  {
    field: 'markers',
    headerName: 'Markers',
    minWidth: 280,
    flex: 1,
    renderCell: (params) => {
      const isHead = params.row.RevisionNum === currentUnitExtended?.Unit?.HeadRevisionNum;

      return (
        <CenteredTableCell>
          <Stack direction='row' spacing={1} alignItems='center'>
            {isHead && (
              <>
                <Chip label='Head' color='primary' size='small' />
                {options?.onTagClick && (
                  <Tooltip title='Tag this revision'>
                    <IconButton
                      size='small'
                      color='primary'
                      onClick={(e) => {
                        e.stopPropagation();
                        options.onTagClick?.(params.row);
                      }}
                      sx={{ p: 0.5 }}
                    >
                      <LocalOfferOutlinedIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                )}
              </>
            )}
            {params.row.RevisionNum === currentUnitExtended?.Unit?.LastReleasedRevisionNum && (
              <Chip label='Applied' color='info' size='small' />
            )}
          </Stack>
        </CenteredTableCell>
      );
    },
  },
  {
    field: 'source',
    headerName: 'Source',
    minWidth: 100,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.Source,
    renderCell: (params) => (
      <CenteredTableCell>
        <Typography variant='body1'>{params.row.Revision?.Source || ''}</Typography>
      </CenteredTableCell>
    ),
  },
  {
    field: 'description',
    headerName: 'Description',
    minWidth: 200,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.Description,
    renderCell: (params) => (
      <CenteredTableCell>
        <Tooltip title={params.row.Revision?.Description || ''} arrow>
          <Ellipses variant='body1'>{params.row.Revision?.Description || ''}</Ellipses>
        </Tooltip>
      </CenteredTableCell>
    ),
  },
  {
    field: 'RevisionID',
    headerName: 'Revision ID',
    minWidth: 160,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.RevisionID ?? '',
    renderCell: renderUuid,
  },
  {
    field: 'changeSet',
    headerName: 'ChangeSet',
    minWidth: 140,
    flex: 1,
    valueGetter: (_, row) => row.ChangeSet?.Slug ?? '',
    renderCell: (params) => <ChangeSetCell changeSet={params.row.ChangeSet} />,
  },
  {
    field: 'ChangeSetID',
    headerName: 'ChangeSet ID',
    minWidth: 160,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.ChangeSetID ?? '',
    renderCell: renderUuid,
  },
  {
    field: 'changeOrders',
    headerName: 'ChangeOrders',
    minWidth: 180,
    flex: 1.5,
    valueGetter: (_, row) =>
      (row.ChangeOrders ?? [])
        .map((order) => qualifySlug(order.Slug, order.SpaceSlug, row.Revision?.SpaceSlug))
        .sort()
        .join(', '),
    renderCell: (params) => {
      const orders = [...(params.row.ChangeOrders ?? [])].sort((a, b) => a.Slug.localeCompare(b.Slug));
      if (orders.length === 0) return <CenteredTableCell />;
      return (
        <ChipList>
          {orders.map((order) => (
            <NavLink key={order.ChangeOrderID} to={changeOrderPath(order.SpaceSlug, order.Slug)}>
              <Chip
                size='small'
                clickable
                label={qualifySlug(order.Slug, order.SpaceSlug, params.row.Revision?.SpaceSlug)}
              />
            </NavLink>
          ))}
        </ChipList>
      );
    },
  },
  {
    field: 'releases',
    headerName: 'Releases',
    minWidth: 160,
    flex: 1,
    // A Release has no slug: it is numbered within its Space, and publishing names the Tag it
    // creates for it release-<num>, so that is the name used here too.
    valueGetter: (_, row) =>
      (row.Releases ?? [])
        .map((release) => qualifySlug(`release-${release.ReleaseNum}`, release.SpaceSlug, row.Revision?.SpaceSlug))
        .join(', '),
    renderCell: (params) => {
      const releases = [...(params.row.Releases ?? [])].sort(
        (a, b) => (a.ReleaseNum ?? 0) - (b.ReleaseNum ?? 0),
      );
      if (releases.length === 0) return <CenteredTableCell />;
      return (
        <ChipList>
          {releases.map((release) => (
            <Chip
              key={release.ReleaseID}
              size='small'
              label={qualifySlug(`release-${release.ReleaseNum}`, release.SpaceSlug, params.row.Revision?.SpaceSlug)}
            />
          ))}
        </ChipList>
      );
    },
  },
  {
    field: 'attestations',
    headerName: 'Attestations',
    minWidth: 110,
    flex: 0.7,
    valueGetter: (_, row) => row.Attestations?.length ?? 0,
    renderCell: (params) => (
      <CountChip
        count={params.row.Attestations?.length ?? 0}
        color='default'
        names={(params.row.Attestations ?? []).map((attestation) =>
          [attestation.Type, attestation.Result].filter(Boolean).join(': '),
        )}
      />
    ),
  },
  {
    field: 'userName',
    headerName: 'Edited By',
    minWidth: 180,
    flex: 1,
    valueGetter: (_, row) => row.User?.DisplayName || 'Automated',
    renderCell: (params) => {
      const userName = params.row.User?.DisplayName || 'Automated';

      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            height: '100%',
            width: '100%',
          }}
        >
          <Avatar src={params.row.User?.ProfilePictureURL} sx={{ width: 24, height: 24 }} />
          <Tooltip title={userName} arrow>
            <Ellipses sx={{ marginLeft: '2px' }} variant='body1'>
              {userName}
            </Ellipses>
          </Tooltip>
        </Box>
      );
    },
  },
  {
    field: 'UserAgent',
    headerName: 'User Agent',
    minWidth: 160,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.UserAgent ?? '',
    renderCell: (params) => (
      <CenteredTableCell>
        <Tooltip title={params.row.Revision?.UserAgent || ''}>
          <Ellipses variant='body1'>{params.row.Revision?.UserAgent || ''}</Ellipses>
        </Tooltip>
      </CenteredTableCell>
    ),
  },
  {
    field: 'validationErrors',
    headerName: 'Validation Errors',
    minWidth: 100,
    flex: 1,
    valueGetter: (_, row) => Object.entries(row.Revision?.ValidationErrors || {}).length,
    renderCell: (params) => {
      const validationErrors = params.row.Revision?.ValidationErrors || {};

      return (
        <CenteredTableCell sx={{ justifyContent: 'center' }}>
          <Tooltip
            title={Object.entries(validationErrors).map(([key], index) => (
              <>
                {index !== 0 ? ', ' : ''}
                {key}
              </>
            ))}
            arrow
          >
            {Object.entries(validationErrors).length != 0 ? (
              <Chip color='error' label={Object.entries(validationErrors).length} />
            ) : (
              <></>
            )}
          </Tooltip>
        </CenteredTableCell>
      );
    },
  },
  {
    field: 'validationWarnings',
    headerName: 'Validation Warnings',
    minWidth: 100,
    flex: 1,
    valueGetter: (_, row) => countKeys(row.Revision?.ValidationWarnings),
    renderCell: (params) => (
      <CountChip
        count={countKeys(params.row.Revision?.ValidationWarnings)}
        color='warning'
        names={Object.keys(params.row.Revision?.ValidationWarnings ?? {})}
      />
    ),
  },
  {
    field: 'validationPassed',
    headerName: 'Validation Passed',
    minWidth: 100,
    flex: 1,
    valueGetter: (_, row) => countKeys(row.Revision?.ValidationPassed),
    renderCell: (params) => (
      <CountChip
        count={countKeys(params.row.Revision?.ValidationPassed)}
        color='success'
        names={Object.keys(params.row.Revision?.ValidationPassed ?? {})}
      />
    ),
  },
  {
    field: 'conflicts',
    headerName: 'Conflicts',
    minWidth: 100,
    flex: 0.7,
    valueGetter: (_, row) => row.Revision?.Conflicts?.length ?? 0,
    renderCell: (params) => (
      <CountChip
        count={params.row.Revision?.Conflicts?.length ?? 0}
        color='warning'
        names={(params.row.Revision?.Conflicts ?? []).map((conflict) =>
          [conflict.Reason, conflict.Path].filter(Boolean).join(' '),
        )}
      />
    ),
  },
  {
    field: 'linkFindings',
    headerName: 'Link Findings',
    minWidth: 100,
    flex: 0.7,
    valueGetter: (_, row) => row.Revision?.LinkFindings?.length ?? 0,
    renderCell: (params) => (
      <CountChip
        count={params.row.Revision?.LinkFindings?.length ?? 0}
        color='warning'
        names={(params.row.Revision?.LinkFindings ?? []).map((finding) =>
          [finding.Reason, finding.Path].filter(Boolean).join(' '),
        )}
      />
    ),
  },
  {
    field: 'DataSize',
    headerName: 'Data Size',
    type: 'number',
    minWidth: 100,
    flex: 0.7,
    valueGetter: (_, row) => row.Revision?.DataSize ?? 0,
    renderCell: (params) => (
      <CenteredTableCell sx={{ justifyContent: 'flex-end' }}>
        <Typography variant='body1'>{(params.row.Revision?.DataSize ?? 0).toLocaleString()} B</Typography>
      </CenteredTableCell>
    ),
  },
  {
    field: 'DataHash',
    headerName: 'Data Hash',
    minWidth: 160,
    flex: 1,
    valueGetter: (_, row) => row.Revision?.DataHash ?? '',
    renderCell: renderUuid,
  },
  {
    field: 'createdAt',
    headerName: 'Created At',
    type: 'dateTime',
    minWidth: 140,
    flex: 1,
    valueGetter: (_, row) => {
      const createdAt = row.Revision?.CreatedAt;
      return createdAt && !isGoZeroTime(createdAt) ? new Date(createdAt) : null;
    },
    renderCell: (params) => <DateTimeCell params={params} />,
  },
  {
    field: 'updatedAt',
    headerName: 'Updated At',
    type: 'dateTime',
    minWidth: 140,
    flex: 1,
    valueGetter: (_, row) => {
      const updatedAt = row.Revision?.UpdatedAt;
      return updatedAt && !isGoZeroTime(updatedAt) ? new Date(updatedAt) : null;
    },
    renderCell: (params) => <DateTimeCell params={params} />,
  },
];
