// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import { ActionContextButton } from '@/components/action-context-button/ActionContextButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { Header } from '@/components/header/Header';
import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import { Main } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { AddSpacePage } from '@/pages/add-space/AddSpacePage';
import { EmptySpaceList } from '@/pages/space-list/components/empty-space-list/EmptySpaceList';
import { SpacesTable } from '@/pages/space-list/components/spaces-table/SpacesTable';
import { useListSpacesQuery } from '@confighub/rtk-query';
import { useBulkDeleteSpacesMutation } from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

const Container = styled('div')`
  width: 100%;
`;

export const SpaceListPage = () => {
  const [isAddSpacePageOpen, setIsAddSpacePageOpen] = useState(false);
  const [serverErrors, setServerErrors] = useState<Array<string>>([]);
  const [isDeleteSpacesModalOpen, setIsDeleteSpacesModalOpen] = useState(false);
  const [selectedSpaces, setSelectedSpaces] = useState<Array<string>>([]);

  // Fetch all spaces first (without filter) to get label options
  const { data: allSpaces = [], isFetching: isFetchingAll, refetch: refetchAll } = useListSpacesQuery({ summary: true }, { refetchOnFocus: true });

  // Extract label options from all spaces for the Labels filter dropdown
  const labelOptions = useMemo(() => {
    const spaceEntities = allSpaces.map((s) => s.Space);
    return extractLabelOptions(spaceEntities);
  }, [allSpaces]);

  // Use the QueryBuilder hook - manages all filter state internally
  // labelOptions updates when allSpaces loads, causing re-render
  // syncToUrl enables URL param persistence for shareable filter links
  // Map spaces to {id, name} for the save filter space dropdown
  const spaces = useMemo(
    () => allSpaces.map((s) => ({ id: s.Space?.SpaceID || '', name: s.Space?.DisplayName || s.Space?.Slug || '', labels: s.Space?.Labels })).filter((s) => s.id),
    [allSpaces],
  );

  // Extract slug options from spaces for the Slug autocomplete
  const slugOptions = useMemo(
    () => allSpaces.map((s) => ({
      slug: s.Space?.Slug || '',
      spaceName: '',
    })).filter((s) => s.slug),
    [allSpaces],
  );

  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'Space',
    spaces,
    slugs: slugOptions,
    labelOptions,
    syncToUrl: true,
  });

  // Fetch filtered spaces (skip if no filter applied to avoid duplicate query)
  const { data: filteredSpaces = [], isFetching: isFetchingFiltered, refetch: refetchFiltered } = useListSpacesQuery(
    {
      summary: true,
      where: whereClause,
    },
    { skip: !whereClause, refetchOnFocus: true },
  );

  const whereClauseRef = useRef(whereClause);
  whereClauseRef.current = whereClause;

  const refetch = useCallback(() => {
    if (whereClauseRef.current) {
      refetchFiltered();
    }
    refetchAll();
  }, [refetchFiltered, refetchAll]);

  // Display filtered spaces if filter is applied, otherwise all spaces
  const displayedSpaces = whereClause ? filteredSpaces : allSpaces;
  const isLoading = isFetchingAll || isFetchingFiltered;

  const [
    bulkDeleteSpaces,
    { isSuccess: isBulkDeleteSuccess, error: bulkDeleteError, data: bulkDeleteData },
  ] = useBulkDeleteSpacesMutation();

  useBulkApiErrorMessage(
    bulkDeleteError,
    isBulkDeleteSuccess,
    bulkDeleteData,
    setServerErrors,
  );

  const onSpaceDeleted = async () => {
    await bulkDeleteSpaces({
      where: `SpaceID IN (${selectedSpaces.map((id) => `'${id}'`).join(',')})`,
    });

    setIsDeleteSpacesModalOpen(false);
  };

  const disableDelete = selectedSpaces.length === 0;

  return (
    <Container>
      <Header
        breadCrumbs={[
          {
            name: 'Spaces',
          },
        ]}
        addButtonText='Add'
        actions={
          <Tooltip arrow placement='bottom' title='Refresh space list'>
            <IconButton
              size='small'
              onClick={() => refetch()}
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
        onAddButtonClick={() => setIsAddSpacePageOpen(true)}
        deleteButton={
          <ActionContextButton
            label='Delete'
            conditions={[
              {
                condition: disableDelete,
                message: 'Select at least one space to delete.',
              },
            ]}
            disabled={disableDelete}
            onActionSelected={() => setIsDeleteSpacesModalOpen(true)}
          />
        }
      />
      <Main>
        <ErrorList errors={serverErrors} onClose={() => setServerErrors([])} />
        <SpacesTable
          onRowSelected={(selectedRows) => setSelectedSpaces(selectedRows)}
          spaces={displayedSpaces}
          isLoading={isLoading}
          filterElement={QueryBuilderElement}
          noRowsOverlay={
            <FilteredEmptyState entityName='spaces' onClearFilters={clearFilters} />
          }
          emptyState={<EmptySpaceList onAddSpace={() => setIsAddSpacePageOpen(true)} />}
          hasNoData={allSpaces.length === 0}
        />
        <AddSpacePage open={isAddSpacePageOpen} onClose={() => setIsAddSpacePageOpen(false)} />
        <ConfirmationModal
          isOpen={isDeleteSpacesModalOpen}
          onClose={() => setIsDeleteSpacesModalOpen(false)}
          onSubmit={onSpaceDeleted}
          modalDescriptionText={`Are you sure you want to delete the selected Spaces?`}
          modalTitleText='Delete Spaces'
        />
      </Main>
    </Container>
  );
};

export default SpaceListPage;
