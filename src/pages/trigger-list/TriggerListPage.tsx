// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import {
  ActionButton,
  type EnablementRule,
  createEnablementRule,
} from '@/components/action-button/ActionButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { Header } from '@/components/header/Header';
import { IncludeHiddenToggle } from '@/components/hidden-entities/IncludeHiddenToggle';
import { useIncludeHidden } from '@/components/hidden-entities/useIncludeHidden';
import { extractLabelOptions, useQueryBuilder } from '@/components/query-builder';
import { Main } from '@/components/styled';
import { runChunkedBulkWrite } from '@/hooks/chunkedBulkWrite';
import { useAppDispatch } from '@/hooks/useApp';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import { AddTriggerDrawer } from '@/pages/space-detail/components/add-trigger-drawer/AddTriggerDrawer';
import { BulkEditTriggersDrawer } from '@/pages/space-detail/components/bulk-edit-triggers-drawer/BulkEditTriggersDrawer';
import { CreateTriggerButton } from '@/pages/space-detail/components/create-trigger-button/CreateTriggerButton';
import { TriggersTable } from '@/pages/space-detail/components/triggers-table/TriggersTable';
import { requestTriggerCreation } from '@/state/slices/invokerRequest';
import { getApiErrorMessage } from '@/utility/error-functions';
import {
  type SpaceRead,
  type TriggerRead,
  useBulkDeleteTriggersMutation,
  useListAllTriggersQuery,
  useListSpacesQuery,
} from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const Container = styled('div')`
  width: 100%;
`;

/**
 * Every Trigger in the organization, from all Spaces. Triggers are created, edited, updated in
 * bulk and deleted here as on a Space's Triggers tab; a new one is created in a Space the user
 * picks.
 */
export const TriggerListPage = () => {
  const dispatch = useAppDispatch();
  const [selectedTriggerIds, setSelectedTriggerIds] = useState<string[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const { editEntityId, isDrawerOpen, closeEditDrawer } = useEditDrawerUrl();

  const { data: spacesData = [] } = useListSpacesQuery({});
  const spaceEntities = useMemo(
    () => spacesData.flatMap((s) => (s.Space?.SpaceID ? [s.Space] : [])) as SpaceRead[],
    [spacesData],
  );
  const spaces = useMemo(
    () => spaceEntities.map((s) => ({ id: s.SpaceID ?? '', name: s.Slug || '', labels: s.Labels })),
    [spaceEntities],
  );

  // Every Trigger, filtered or not: the filter's Label and Slug options, and the Triggers the
  // drawers open on. The arguments are those of the table's own unfiltered read, so the two
  // share one request and Refresh refreshes the table.
  const { includeHidden, setIncludeHidden, includeHiddenParam } = useIncludeHidden();
  const { data: allTriggers = [], refetch } = useListAllTriggersQuery(
    { include: 'SpaceID,ChannelID', includeHidden: includeHiddenParam },
    { refetchOnFocus: true },
  );
  const triggerById = useMemo(
    () =>
      new Map(
        allTriggers.flatMap((t) => (t.Trigger?.TriggerID ? [[t.Trigger.TriggerID, t.Trigger]] : [])),
      ),
    [allTriggers],
  );
  // A Trigger deleted, here or elsewhere, leaves the selection with the list.
  useEffect(() => {
    setSelectedTriggerIds((ids) => {
      const kept = ids.filter((id) => triggerById.has(id));
      return kept.length === ids.length ? ids : kept;
    });
  }, [triggerById]);

  const labelOptions = useMemo(
    () => extractLabelOptions(allTriggers.map((t) => t.Trigger)),
    [allTriggers],
  );
  const slugOptions = useMemo(
    () =>
      allTriggers
        .map((t) => ({ slug: t.Trigger?.Slug || '', spaceName: t.Space?.Slug || '' }))
        .filter((s) => s.slug),
    [allTriggers],
  );

  const { QueryBuilderElement, whereClause, clearFilters } = useQueryBuilder({
    entityType: 'Trigger',
    spaces,
    slugs: slugOptions,
    labelOptions,
    syncToUrl: true,
  });

  const [bulkDeleteTriggers] = useBulkDeleteTriggersMutation();

  const triggerToEdit = editEntityId ? triggerById.get(editEntityId) : undefined;
  const triggersToEdit = useMemo(
    () => selectedTriggerIds.flatMap((id) => triggerById.get(id) ?? []) as TriggerRead[],
    [selectedTriggerIds, triggerById],
  );

  // A selection can be every Trigger in the organization, so it is deleted in chunks. When
  // any fails the selection stays, so Delete can be tried again; the Triggers that were
  // deleted have left the list and so the selection.
  const deleteSelected = async () => {
    const failures = await runChunkedBulkWrite(
      'TriggerID',
      selectedTriggerIds,
      (where) => bulkDeleteTriggers({ where }).unwrap(),
      (error) => getApiErrorMessage(error, 'The Triggers could not be deleted.'),
    );
    setIsDeleteConfirmOpen(false);
    setErrorMessages(failures);
    if (failures.length === 0) setSelectedTriggerIds([]);
  };

  const closeTriggerForm = () => {
    closeEditDrawer();
    setIsCreateFormOpen(false);
  };

  const updateEnablementRules = useMemo<EnablementRule[]>(
    () => [createEnablementRule(selectedTriggerIds.length === 0, 'Select at least one trigger to update.')],
    [selectedTriggerIds.length],
  );
  const deleteEnablementRules = useMemo<EnablementRule[]>(
    () => [createEnablementRule(selectedTriggerIds.length === 0, 'Select at least one trigger to delete.')],
    [selectedTriggerIds.length],
  );

  return (
    <Container>
      <Header
        breadCrumbs={[{ name: 'Triggers' }]}
        actions={
          <Tooltip arrow placement='bottom' title='Refresh triggers list'>
            <IconButton
              size='small'
              onClick={refetch}
              sx={{ color: 'primary.main', '&:hover': { backgroundColor: 'action.hover' } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        }
        addButton={
          <CreateTriggerButton
            onCreateInInvoker={() => dispatch(requestTriggerCreation({}))}
            onCreateWithForm={() => setIsCreateFormOpen(true)}
          />
        }
        editButton={
          <ActionButton
            buttonText='Update'
            onButtonClick={() => setIsBulkEditOpen(true)}
            enablementRules={updateEnablementRules}
          />
        }
        deleteButton={
          <ActionButton
            buttonText='Delete Trigger'
            onButtonClick={() => setIsDeleteConfirmOpen(true)}
            enablementRules={deleteEnablementRules}
          />
        }
      />
      <Main>
        <ErrorList errors={errorMessages} onClose={() => setErrorMessages([])} />
        <TriggersTable
          where={whereClause}
          isFiltered={!!whereClause}
          onClearFilter={clearFilters}
          filterElement={QueryBuilderElement}
          selectedRows={selectedTriggerIds}
          onRowSelected={setSelectedTriggerIds}
          persistenceKey='all-triggers-table'
          showSpaceColumn
          editInPlace
          includeHidden={includeHiddenParam}
          customToolbarActions={
            <IncludeHiddenToggle includeHidden={includeHidden} onChange={setIncludeHidden} entities='triggers' />
          }
          emptyState={
            <Typography variant='body2' color='text.secondary' sx={{ px: 1.5, py: 1 }}>
              No Space has any Triggers. Create one with Create above.
            </Typography>
          }
        />
        <AddTriggerDrawer
          key={triggerToEdit?.TriggerID || 'new'}
          isOpen={(isDrawerOpen && !!triggerToEdit) || isCreateFormOpen}
          onClose={closeTriggerForm}
          onTriggerCreated={closeTriggerForm}
          onTriggerUpdated={closeTriggerForm}
          existingTrigger={triggerToEdit}
          orgID=''
          spaceId=''
          spaces={spaceEntities}
        />
        <BulkEditTriggersDrawer
          isOpen={isBulkEditOpen}
          onClose={() => setIsBulkEditOpen(false)}
          triggersToEdit={triggersToEdit}
          refresh={refetch}
        />
        <ConfirmationModal
          isOpen={isDeleteConfirmOpen}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onSubmit={deleteSelected}
          modalTitleText='Delete Triggers'
          modalDescriptionText='Are you sure you want to delete the selected triggers?'
        />
      </Main>
    </Container>
  );
};

export default TriggerListPage;
