// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { DATE_TIME_GRID_SLOTS, DateTimeCell } from '@/components/data-grid/cells';
import { EntityDataGrid } from '@/components/entity-data-grid/EntityDataGrid';
import { RemoveTagModal } from '@/components/remove-tag-modal/RemoveTagModal';
import { CenteredTableCell, Ellipses } from '@/components/styled';
import { TagBadge } from '@/components/tag-badge/TagBadge';
import { TagRevisionModal } from '@/components/tag-revision-modal/TagRevisionModal';
import { useGridPersistence } from '@/components/unit-data-grid/hooks/useGridPersistence';
import type { ChangeSetRead, TagRead } from '@confighub/rtk-query';
import { type RevisionRow } from '@/types';
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
import { GridColDef, useGridApiRef } from '@mui/x-data-grid';

const TagsScrollContainer = styled(Stack)(({ theme }) => ({
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.action.disabled} transparent`,
  '&::-webkit-scrollbar': {
    height: 3,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'transparent',
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 2,
    backgroundColor: theme.palette.action.disabled,
  },
}));

export interface IRevisionListTableProps {
  rows: RevisionRow[];
  changeSet: ChangeSetRead;
  setErrorMessage?: (message: string) => void;
  onRefresh?: () => void;
}

export const RevisionListTable = ({
  rows,
  changeSet,
  setErrorMessage,
  onRefresh,
}: IRevisionListTableProps) => {
  const apiRef = useGridApiRef();
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [revisionToTag, setRevisionToTag] = useState<RevisionRow | null>(null);
  const [isRemoveTagModalOpen, setIsRemoveTagModalOpen] = useState(false);
  const [tagToRemove, setTagToRemove] = useState<{ tag: TagRead; row: RevisionRow } | null>(
    null,
  );
  const changeSetID = changeSet.ChangeSetID || '';

  const initialState = {
    sorting: {
      sortModel: [{ field: 'RevisionNum', sort: 'desc' as const }],
    },
  };

  const {
    applyStoredWidths,
    columnVisibilityModel,
    onColumnVisibilityModelChange,
    sortModel,
    onSortModelChange,
  } = useGridPersistence(`grouped-revisions-table-${changeSetID || 'default'}`, {
    sortModel: [{ field: 'RevisionNum', sort: 'desc' }],
    columnVisibility: {
      createdAt: false,
      updatedAt: true,
      liveAt: true,
      tags: true,
    } as Record<string, boolean>,
  });

  const handleTagClick = (row: RevisionRow) => {
    setRevisionToTag(row);
    setIsTagModalOpen(true);
  };

  const handleTagDelete = (row: RevisionRow, tag: TagRead) => {
    setTagToRemove({ tag, row });
    setIsRemoveTagModalOpen(true);
  };

  // Memoize base columns definition
  const baseColumns: GridColDef<RevisionRow>[] = useMemo(
    () => [
      {
        field: 'unitSlug',
        headerName: 'Unit',
        minWidth: 200,
        flex: 1,
        valueGetter: (_, row) => row.Unit?.Slug || '',
        renderCell: (params) => {
          return (
            <CenteredTableCell>
              <Ellipses variant='body1'>{params.value}</Ellipses>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'RevisionNum',
        headerName: 'Number',
        minWidth: 100,
        flex: 1,
        groupable: false,
        valueGetter: (_, row) => row.RevisionNum,
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }

          return (
            <CenteredTableCell>
              <Chip label={params.row.RevisionNum} color='primary' size='small' />
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'tags',
        headerName: 'Tags',
        minWidth: 200,
        flex: 1.5,
        groupable: true,
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
                        setErrorMessage
                          ? (e) => {
                              e.stopPropagation();
                              handleTagDelete(params.row, tag);
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
          if (params.rowNode.type === 'group') {
            return '';
          }

          const isHead = params.row.RevisionNum === params.row?.Unit?.HeadRevisionNum;

          return (
            <CenteredTableCell>
              <Stack direction='row' spacing={1} alignItems='center'>
                {isHead && (
                  <>
                    <Chip label='Head' color='primary' size='small' />
                    <Tooltip title='Tag this revision'>
                      <IconButton
                        size='small'
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTagClick(params.row);
                        }}
                        sx={{ p: 0.5 }}
                      >
                        <LocalOfferOutlinedIcon color='primary' fontSize='small' />
                      </IconButton>
                    </Tooltip>
                  </>
                )}
                {params.row.RevisionNum === params.row?.Unit?.LastReleasedRevisionNum && (
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
        groupable: false,
        valueGetter: (_, row) => row.Revision?.Source,
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }

          return (
            <CenteredTableCell>
              <Typography variant='body1'>{params.row.Revision?.Source || ''}</Typography>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'description',
        headerName: 'Description',
        minWidth: 200,
        flex: 1,
        groupable: false,
        valueGetter: (_, row) => row.Revision?.Description,
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }

          return (
            <CenteredTableCell>
              <Tooltip title={params.row.Revision?.Description || ''} arrow>
                <Ellipses variant='body1'>{params.row.Revision?.Description || ''}</Ellipses>
              </Tooltip>
            </CenteredTableCell>
          );
        },
      },
      {
        field: 'userName',
        headerName: 'Edited By',
        minWidth: 180,
        flex: 1,
        groupable: false,
        valueGetter: (_, row) => row.User?.DisplayName || 'Automated',
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }
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
              <Avatar
                src={params.row.User?.ProfilePictureURL}
                sx={{ width: 24, height: 24 }}
              />
              <Tooltip title={userName} arrow>
                <Ellipses sx={{ marginLeft: '8px' }} variant='body1'>
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
        groupable: false,
        valueGetter: (_, row) => Object.entries(row.Revision?.ValidationErrors || {}).length,
        renderCell: (params) => {
          if (params.rowNode.type === 'group') {
            return '';
          }

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
        groupable: false,
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
        groupable: false,
        valueGetter: (_, row) => {
          const updatedAt = row.Revision?.UpdatedAt;
          return updatedAt && !isGoZeroTime(updatedAt) ? new Date(updatedAt) : null;
        },
        renderCell: (params) => <DateTimeCell params={params} />,
      },
    ],
    [],
  );

  // Apply stored widths to columns
  const columns = useMemo(
    () => applyStoredWidths(baseColumns),
    [applyStoredWidths, baseColumns],
  );

  return (
    <>
      <EntityDataGrid
        apiRef={apiRef}
        rows={rows}
        columns={columns}
        loading={false}
        columnVisibilityModel={columnVisibilityModel}
        onColumnVisibilityModelChange={onColumnVisibilityModelChange}
        sortModel={sortModel}
        onSortModelChange={onSortModelChange}
        disableAggregation
        initialState={initialState}
        slots={DATE_TIME_GRID_SLOTS}
      />
      {setErrorMessage && revisionToTag?.Unit && (
        <TagRevisionModal
          isOpen={isTagModalOpen}
          onClose={() => {
            setIsTagModalOpen(false);
            setRevisionToTag(null);
          }}
          unit={revisionToTag.Unit}
          selectedRevision={revisionToTag}
          setErrorMessage={setErrorMessage}
          onRefresh={onRefresh}
          changeSetId={changeSetID}
        />
      )}
      {setErrorMessage && tagToRemove?.row?.Unit && (
        <RemoveTagModal
          isOpen={isRemoveTagModalOpen}
          onClose={() => {
            setIsRemoveTagModalOpen(false);
            setTagToRemove(null);
          }}
          unit={tagToRemove.row.Unit}
          tag={tagToRemove.tag}
          setErrorMessage={setErrorMessage}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
