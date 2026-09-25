// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { DateTimeCell } from '@/components/data-grid/cells';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { TagBadge } from '@/components/tag-badge/TagBadge';
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
import { styled } from '@mui/material/styles';
import { GridColDef } from '@mui/x-data-grid';

const TagsScrollContainer = styled(Stack)(({ theme }) => ({
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.action.disabled} transparent`,
  '&::-webkit-scrollbar': {
    height: 1,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 2,
    backgroundColor: theme.palette.action.active,
  },
}));

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
