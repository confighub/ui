// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  ActionButton,
  type EnablementRule,
  createEnablementRule,
} from '@/components/action-button/ActionButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { Header } from '@/components/header/Header';
import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import { Main } from '@/components/styled';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import { AddTargetDrawer } from '@/pages/target-list/components/add-target-drawer/AddTargetDrawer';
import { BulkEditTargetsDrawer } from '@/pages/target-list/components/bulk-edit-targets-drawer/BulkEditTargetsDrawer';
import { EmptyTargetList } from '@/pages/target-list/components/empty-target-list/EmptyTargetList';
import {
  TargetRead,
  useBulkDeleteTargetsMutation,
  useListAllTargetsQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import { styled } from '@mui/material';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';

import { TargetsTable } from './components/targets-table/TargetsTable';

const Container = styled('div')`
  width: 100%;
`;

interface ModalState {
  deleteTarget: boolean;
  addTarget: boolean;
  bulkEditTarget: boolean;
  targetDetail: boolean;
}

const INITIAL_MODAL_STATE: ModalState = {
  deleteTarget: false,
  addTarget: false,
  bulkEditTarget: false,
  targetDetail: false,
};

export const TargetListPage = () => {
  // Consolidated modal state
  const [modals, setModals] = useState<ModalState>(INITIAL_MODAL_STATE);
  const [errorMessage, setErrorMessage] = useState<Array<string>>([]);
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);

  // URL-controlled edit drawer state
  const { editEntityId, isDrawerOpen, closeEditDrawer } = useEditDrawerUrl();

  // Fetch spaces for QueryBuilder
  const { data: spacesData = [] } = useListSpacesQuery({});
  const spaces = useMemo(
    () =>
      spacesData
        .filter((s) => s.Space?.SpaceID && s.Space?.DisplayName)
        .map((s) => ({
          id: s.Space!.SpaceID!,
          name: s.Space!.DisplayName!,
          labels: s.Space!.Labels,
        })),
    [spacesData],
  );

  // Fetch all targets first (without filter) to get label options
  const { data: allTargets = [], isFetching: isFetchingAll, refetch: refetchAll } = useListAllTargetsQuery({
    include: 'SpaceID,BridgeWorkerID',
  }, { refetchOnFocus: true });

  // Extract label options from all targets for the Labels filter dropdown
  const labelOptions = useMemo(() => {
    const targetEntities = allTargets.map((t) => t.Target);
    return extractLabelOptions(targetEntities);
  }, [allTargets]);

  // Extract slug options from targets for the Slug autocomplete
  const slugOptions = useMemo(
    () => allTargets.map((t) => ({
      slug: t.Target?.Slug || '',
      spaceName: t.Space?.DisplayName || t.Space?.Slug || '',
    })).filter((s) => s.slug),
    [allTargets],
  );

  // Use the QueryBuilder hook - manages all filter state internally
  // syncToUrl enables URL param persistence for shareable filter links
  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'Target',
    spaces,
    slugs: slugOptions,
    labelOptions,
    syncToUrl: true,
  });

  // Fetch filtered targets
  const { data: filteredTargets = [], isFetching: isFetchingFiltered, refetch: refetchFiltered } = useListAllTargetsQuery(
    { where: whereClause, include: 'SpaceID,BridgeWorkerID' },
    { skip: !whereClause, refetchOnFocus: true },
  );

  // Display filtered targets if filter is applied, otherwise all targets
  const targets = whereClause ? filteredTargets : allTargets;
  const isLoading = isFetchingAll || isFetchingFiltered;

  // Derive target to edit from URL param
  const targetToEdit = useMemo(() => {
    if (!editEntityId) return undefined;
    return targets.find((t) => t.Target?.TargetID === editEntityId)?.Target;
  }, [editEntityId, targets]);

  const [
    bulkDeleteTargets,
    { isSuccess: isBulkDeleteSuccess, error: bulkDeleteError, data: bulkDeleteData },
  ] = useBulkDeleteTargetsMutation();

  const whereClauseRef = useRef(whereClause);
  whereClauseRef.current = whereClause;

  const refetch = useCallback(() => {
    if (whereClauseRef.current) {
      refetchFiltered();
    }
    refetchAll();
  }, [refetchFiltered, refetchAll]);

  useBulkApiErrorMessage(
    bulkDeleteError,
    isBulkDeleteSuccess,
    bulkDeleteData,
    setErrorMessage,
  );

  const deleteEnablementRules = useMemo<EnablementRule[]>(
    () => [
      createEnablementRule(
        selectedTargetIds.length === 0,
        'You need to select at least one target to delete.',
      ),
    ],
    [selectedTargetIds.length],
  );

  // Get targets for bulk editing
  const targetsToEdit = useMemo(() => {
    return selectedTargetIds
      .map((targetId) => {
        const target = targets.find((t) => t.Target?.TargetID === targetId);
        return target?.Target;
      })
      .filter(Boolean) as TargetRead[];
  }, [selectedTargetIds, targets]);

  // Modal handlers
  const updateModal = (modalKey: keyof ModalState, isOpen: boolean) => {
    setModals((prev) => ({ ...prev, [modalKey]: isOpen }));
  };

  const handleRowSelection = (newSelection: string[]) => {
    setSelectedTargetIds(newSelection);
  };

  const handleDeleteTargets = async () => {
    await bulkDeleteTargets({
      where: `TargetID IN (${selectedTargetIds.map((id) => `'${id}'`).join(',')})`,
    });

    // Clear selection after successful deletion
    setSelectedTargetIds([]);
    updateModal('deleteTarget', false);
  };

  const handleCloseDrawer = () => {
    closeEditDrawer();
    updateModal('addTarget', false);
  };

  return (
    <Container>
      <Header
        breadCrumbs={[{ name: 'Targets' }]}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh targets list'>
            <IconButton
              size='small'
              onClick={refetch}
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
        addButton={
          <Button
            data-testid='add-target-button'
            size='small'
            variant='contained'
            onClick={() => updateModal('addTarget', true)}
          >
            Add Target
          </Button>
        }
        deleteButton={
          <ActionButton
            buttonText='Delete'
            onButtonClick={() => updateModal('deleteTarget', true)}
            enablementRules={deleteEnablementRules}
          />
        }
      />
      <Main>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />
        <TargetsTable
          targets={targets}
          onRowSelected={handleRowSelection}
          selectedRows={selectedTargetIds}
          isLoading={isLoading}
          filterElement={QueryBuilderElement}
          noRowsOverlay={
            <FilteredEmptyState entityName='targets' onClearFilters={clearFilters} />
          }
          emptyState={<EmptyTargetList onAddTarget={() => updateModal('addTarget', true)} />}
          hasNoData={allTargets.length === 0}
        />
        <ConfirmationModal
          modalTitleText='Delete Targets'
          modalDescriptionText='Are you sure you want to delete the selected targets?'
          isOpen={modals.deleteTarget}
          onClose={() => updateModal('deleteTarget', false)}
          onSubmit={handleDeleteTargets}
        />
        <AddTargetDrawer
          isOpen={(isDrawerOpen && !!targetToEdit) || modals.addTarget}
          onClose={handleCloseDrawer}
          existingTarget={targetToEdit}
        />
        <BulkEditTargetsDrawer
          isOpen={modals.bulkEditTarget}
          onClose={() => updateModal('bulkEditTarget', false)}
          targetsToEdit={targetsToEdit}
          refresh={refetch}
        />
      </Main>
    </Container>
  );
};

export default TargetListPage;
