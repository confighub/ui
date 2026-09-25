// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  ActionButton,
  type EnablementRule,
  createEnablementRule,
} from '@/components/action-button/ActionButton';
import { BridgeWorkerDeleteButton } from '@/components/bridge-worker-delete/BridgeWorkerDeleteButton';
import { ErrorList } from '@/components/error-list/ErrorList';
import { FilteredEmptyState } from '@/components/filtered-empty-state';
import { Header } from '@/components/header/Header';
import { Main } from '@/components/styled';
import { Section } from '@/components/styled/index';
import { useQueryBuilder, extractLabelOptions } from '@/components/query-builder';
import { AddBridgeWorkerDrawer } from '@/pages/bridge-worker-list/components/add-bridge-worker-drawer/AddBridgeWorkerDrawer';
import { BulkEditWorkersDrawer } from '@/pages/bridge-worker-list/components/bulk-edit-workers-drawer/BulkEditWorkersDrawer';
import { EmptyWorkerList } from '@/pages/bridge-worker-list/components/empty-worker-list/EmptyWorkerList';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import {
  BridgeWorkerRead,
  useListAllBridgeWorkersQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import RefreshIcon from '@mui/icons-material/Cached';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { styled } from '@mui/material/styles';

import { BridgeWorkerListTable } from './components/bridge-workers-list-table/BridgeWorkerListTable';

const Container = styled('div')`
  width: 100%;
`;

export const WorkerListPage = () => {
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [addBridgeWorkerOpen, setAddBridgeWorkerOpen] = useState(false);
  const [bulkEditDrawerOpen, setBulkEditDrawerOpen] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string[]>([]);

  // URL-controlled edit drawer state
  const { editEntityId, isDrawerOpen, closeEditDrawer } = useEditDrawerUrl();

  // Fetch spaces for QueryBuilder
  const { data: spacesData = [] } = useListSpacesQuery({});
  const spaces = useMemo(() =>
    spacesData
      .filter((s) => s.Space?.SpaceID && s.Space?.DisplayName)
      .map((s) => ({
        id: s.Space!.SpaceID!,
        name: s.Space!.DisplayName!,
        labels: s.Space!.Labels,
      })),
    [spacesData]
  );

  // Fetch all bridge workers (without filter) to get label options
  const { data: allBridgeWorkers = [], isFetching: isFetchingAll, refetch: refetchAll } = useListAllBridgeWorkersQuery({
    summary: true,
    include: 'SpaceID',
  }, { refetchOnFocus: true });

  // Extract label options from bridge workers for the Labels filter dropdown
  const labelOptions = useMemo(() => {
    const workers = allBridgeWorkers.map((bw) => bw.BridgeWorker);
    return extractLabelOptions(workers);
  }, [allBridgeWorkers]);

  // Extract slug options from bridge workers for the Slug autocomplete
  const slugOptions = useMemo(
    () => allBridgeWorkers.map((bw) => ({
      slug: bw.BridgeWorker?.Slug || '',
      spaceName: bw.Space?.DisplayName || bw.Space?.Slug || '',
    })).filter((s) => s.slug),
    [allBridgeWorkers],
  );

  // Use the QueryBuilder hook - manages all filter state internally
  // syncToUrl enables URL param persistence for shareable filter links
  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'BridgeWorker',
    spaces,
    slugs: slugOptions,
    labelOptions,
    syncToUrl: true,
  });

  // Fetch filtered bridge workers
  const { data: filteredBridgeWorkers = [], isFetching: isFetchingFiltered, refetch: refetchFiltered } = useListAllBridgeWorkersQuery({
    where: whereClause,
    summary: true,
    include: 'SpaceID',
  }, { skip: !whereClause, refetchOnFocus: true });

  const whereClauseRef = useRef(whereClause);
  whereClauseRef.current = whereClause;

  const refetch = useCallback(() => {
    if (whereClauseRef.current) {
      refetchFiltered();
    }
    refetchAll();
  }, [refetchFiltered, refetchAll]);

  // Display filtered workers if filter is applied, otherwise all workers
  const bridgeWorkers = whereClause ? filteredBridgeWorkers : allBridgeWorkers;
  const isLoading = isFetchingAll || isFetchingFiltered;

  // Derive worker to edit from URL param
  const workerToEdit = useMemo(() => {
    if (!editEntityId) return undefined;
    return bridgeWorkers.find((bw) => bw.BridgeWorker?.BridgeWorkerID === editEntityId)?.BridgeWorker;
  }, [editEntityId, bridgeWorkers]);

  // Find the existing server-hosted worker for this org, if one exists
  const existingServerHostedWorker = useMemo(
    () =>
      allBridgeWorkers.find((bw) => bw.BridgeWorker?.ProvidedInfo?.IsServerWorker === true)
        ?.BridgeWorker,
    [allBridgeWorkers],
  );

  // Prepare selected workers for deletion
  const selectedWorkersForDeletion = useMemo(() => {
    return selectedRows
      .map((bridgeWorkerId) => {
        const worker = bridgeWorkers.find(
          (bw) => bw.BridgeWorker?.BridgeWorkerID === bridgeWorkerId,
        );
        if (!worker?.BridgeWorker?.SpaceID) return null;

        return {
          bridgeWorkerId,
          spaceId: worker.BridgeWorker.SpaceID,
        };
      })
      .filter(Boolean) as { bridgeWorkerId: string; spaceId: string }[];
  }, [selectedRows, bridgeWorkers]);

  // Get workers for bulk editing
  const workersToEdit = useMemo(() => {
    return selectedRows
      .map((bridgeWorkerId) => {
        const worker = bridgeWorkers.find(
          (bw) => bw.BridgeWorker?.BridgeWorkerID === bridgeWorkerId,
        );
        return worker?.BridgeWorker;
      })
      .filter(Boolean) as BridgeWorkerRead[];
  }, [selectedRows, bridgeWorkers]);

  const editEnablementRules = useMemo<EnablementRule[]>(
    () => [
      createEnablementRule(
        selectedRows.length === 0,
        'You need to select at least one worker to update.',
      ),
    ],
    [selectedRows.length],
  );

  const handleCloseDrawer = () => {
    closeEditDrawer();
    setAddBridgeWorkerOpen(false);
  };

  return (
    <Container>
      <Header
        breadCrumbs={[
          {
            name: 'Bridge Workers',
          },
        ]}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh workers list'>
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
        addButton={
          <Button
            data-testid='add-bridge-worker-button'
            size='small'
            variant='contained'
            onClick={() => setAddBridgeWorkerOpen(true)}
          >
            Add
          </Button>
        }
        editButton={
          <ActionButton
            buttonText='Update'
            onButtonClick={() => setBulkEditDrawerOpen(true)}
            enablementRules={editEnablementRules}
          />
        }
        deleteButton={
          <BridgeWorkerDeleteButton
            selectedWorkers={selectedWorkersForDeletion}
            onDeleteComplete={() => setSelectedRows([])}
            setErrorMessage={setErrorMessage}
          />
        }
      />
      <Main>
        <ErrorList errors={errorMessage} onClose={() => setErrorMessage([])} />
        <Section $display={true} $direction={Direction.FadeIn} $width='100%'>
          <BridgeWorkerListTable
            bridgeWorkers={bridgeWorkers}
            selectedRows={selectedRows}
            onRowSelected={setSelectedRows}
            isLoading={isLoading}
            filterElement={QueryBuilderElement}
            noRowsOverlay={
              <FilteredEmptyState
                entityName='workers'
                onClearFilters={clearFilters}
              />
            }
            emptyState={<EmptyWorkerList onAddWorker={() => setAddBridgeWorkerOpen(true)} />}
            hasNoData={allBridgeWorkers.length === 0}
          />
        </Section>
        <AddBridgeWorkerDrawer
          isOpen={(isDrawerOpen && !!workerToEdit) || addBridgeWorkerOpen}
          onClose={handleCloseDrawer}
          existingWorker={workerToEdit}
          existingServerHostedWorker={existingServerHostedWorker}
        />
        <BulkEditWorkersDrawer
          isOpen={bulkEditDrawerOpen}
          onClose={() => setBulkEditDrawerOpen(false)}
          workersToEdit={workersToEdit}
          refresh={refetch}
        />
      </Main>
    </Container>
  );
};

export default WorkerListPage;
