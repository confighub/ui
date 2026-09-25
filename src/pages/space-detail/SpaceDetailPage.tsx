// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  ActionButton,
  type EnablementRule,
  createEnablementRule,
} from '@/components/action-button/ActionButton';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { ErrorList } from '@/components/error-list/ErrorList';
import { Header } from '@/components/header/Header';
import { useQueryBuilder, extractLabelOptions } from '@/components/query-builder';
import type { FilterCondition } from '@/components/query-builder/types';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Main } from '@/components/styled';
import { DetailsContainer, Section } from '@/components/styled/index.tsx';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import { useTabWithUrl } from '@/hooks/useTabWithUrl';
import { AddTriggerDrawer } from '@/pages/space-detail/components/add-trigger-drawer/AddTriggerDrawer';
import { BulkEditTriggersDrawer } from '@/pages/space-detail/components/bulk-edit-triggers-drawer/BulkEditTriggersDrawer';
import {
  type SpaceRead,
  type TriggerRead,
  useBulkDeleteTriggersMutation,
  useDeleteSpaceMutation,
  useGetSpaceQuery,
  useListAllTriggersQuery,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import Button from '@mui/material/Button';
import { styled } from '@mui/material/styles';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

import { AddUnitModal } from '../add-unit/AddUnitModal';
import { SpaceDashboard } from './components/space-dashboard/SpaceDashboard';
import { TriggersTable } from './components/triggers-table/TriggersTable';
import { useModalStates } from './hooks/useModalStates';

const TabsContainer = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
`;

export interface ISpaceSettingsUpdateInput {
  Slug: string;
  Labels?: Record<string, string>;
  Annotations?: Record<string, string>;
}

// Constants
const TABS = ['Overview', 'Triggers'];
const DEFAULT_TAB = '0';

export const SpaceDetailPage = () => {
  dayjs.extend(relativeTime);
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = parseInt(searchParams.get('tab') || DEFAULT_TAB);
  const [serverError, setServerError] = useState<Array<string>>([]);

  const { modalStates, updateModalState } = useModalStates();
  const { selectedTab, onTabSelected } = useTabWithUrl({ defaultTab: initialTab });

  // State
  const navigate = useNavigate();
  const [selectedTriggers, setSelectedTriggers] = useState<Array<string>>([]);

  // URL-controlled edit drawer state
  const { editEntityId, isDrawerOpen, closeEditDrawer } = useEditDrawerUrl();

  // Modal States
  const [isUnitAddOpen, setIsUnitAddOpen] = useState(false);

  // Api
  const [
    bulkDeleteTrigger,
    {
      isSuccess: isBulkDeleteTriggerSuccess,
      error: bulkDeleteTriggerError,
      data: bulkDeleteTriggerData,
    },
  ] = useBulkDeleteTriggersMutation();
  const [deleteSpace, { isSuccess: isDeleteSuccess, error: deleteError }] =
    useDeleteSpaceMutation();

  const { data } = useGetSpaceQuery({ spaceId: id });

  const formatError = (message: string) => setServerError([message]);

  // Error handlers
  useBulkApiErrorMessage(
    bulkDeleteTriggerError,
    isBulkDeleteTriggerSuccess,
    bulkDeleteTriggerData,
    setServerError,
  );
  useApiErrorMessage(deleteError, isDeleteSuccess, formatError, {
    onSuccess: () => navigate('/spaces'),
    onError: () => updateModalState('isDeleteSpaceModalOpen', false),
  });

  const onTriggerDeleted = async () => {
    bulkDeleteTrigger({
      where: `TriggerID IN (${selectedTriggers.map((id) => `'${id}'`).join(',')})`,
    });

    // Clear selection after successful deletion
    setSelectedTriggers([]);
    updateModalState('isTriggerDeleteModalOpen', false);
  };

  const onSpaceDeleted = () => {
    deleteSpace({
      spaceId: id,
    });
  };

  // Fetch triggers for bulk editing
  const { data: allTriggersData, refetch: refetchTriggers } = useListAllTriggersQuery({
    where: `SpaceID = '${id}'`,
    include: 'SpaceID',
  });

  // Derive trigger to edit from URL param
  const triggerToEdit = useMemo(() => {
    if (!editEntityId) return undefined;
    return allTriggersData?.find((t) => t.Trigger?.TriggerID === editEntityId)?.Trigger;
  }, [editEntityId, allTriggersData]);

  // Extract label options from triggers for the Labels filter dropdown
  const triggerLabelOptions = useMemo(() => {
    const triggerEntities = (allTriggersData || []).map((t) => t.Trigger);
    return extractLabelOptions(triggerEntities);
  }, [allTriggersData]);

  // Locked filter for the current space - triggers are always viewed within a space
  const lockedSpaceFilter = useMemo((): FilterCondition[] => {
    if (!id || !data?.Space?.Slug) return [];
    return [{
      id: 'locked-space',
      field: 'space',
      operator: 'equals',
      value: id,
      locked: true,
    }];
  }, [id, data?.Space?.Slug]);

  // Spaces list for the QueryBuilder (just the current space for display)
  const spacesForFilter = useMemo(() => {
    if (!data?.Space) return [];
    return [{ id: data.Space.SpaceID || id, name: data.Space.Slug || '' }];
  }, [data?.Space, id]);

  // Extract slug options from triggers for the Slug autocomplete
  const triggerSlugOptions = useMemo(
    () => (allTriggersData || []).map((t) => ({
      slug: t.Trigger?.Slug || '',
      spaceName: data?.Space?.DisplayName || data?.Space?.Slug || '',
    })).filter((s) => s.slug),
    [allTriggersData, data?.Space?.DisplayName, data?.Space?.Slug],
  );

  // Use QueryBuilder hook for trigger filtering
  const { QueryBuilderElement, whereClause: triggerFilter, clearFilters } = useQueryBuilder({
    entityType: 'Trigger',
    spaces: spacesForFilter,
    slugs: triggerSlugOptions,
    labelOptions: triggerLabelOptions,
    lockedFilters: lockedSpaceFilter,
    syncToUrl: true,
  });

  // Get triggers for bulk editing
  const triggersToEdit = useMemo(() => {
    return selectedTriggers
      .map((triggerId) => {
        const trigger = allTriggersData?.find((t) => t.Trigger?.TriggerID === triggerId);
        return trigger?.Trigger;
      })
      .filter(Boolean) as TriggerRead[];
  }, [selectedTriggers, allTriggersData]);

  // Memoized rules
  const deleteTriggerEnablementRule = useMemo<EnablementRule[]>(
    () => [
      createEnablementRule(
        selectedTriggers.length === 0,
        'Select at least one trigger to delete.',
      ),
    ],
    [selectedTriggers.length],
  );

  const editTriggerEnablementRule = useMemo<EnablementRule[]>(
    () => [
      createEnablementRule(
        selectedTriggers.length === 0,
        'Select at least one trigger to update.',
      ),
    ],
    [selectedTriggers.length],
  );

  const breadcrumbs = [
    {
      name: 'Spaces',
      isLink: true,
      link: '/spaces',
    },
    {
      name: data?.Space?.Slug || '',
    },
  ];

  const headerActions = (
    <>
      <Button
        variant='contained'
        size='small'
        onClick={() => updateModalState('isDeleteSpaceModalOpen', true)}
      >
        Delete Space
      </Button>
    </>
  );

  return (
    <DetailsContainer>
      <Header
        breadCrumbs={breadcrumbs}
        addButtonText='Add Trigger'
        onAddButtonClick={() => updateModalState('isAddTriggerModalOpen', true)}
        editButton={
          <ActionButton
            buttonText='Update'
            onButtonClick={() => updateModalState('isBulkEditTriggerModalOpen', true)}
            enablementRules={editTriggerEnablementRule}
          />
        }
        deleteButton={
          <ActionButton
            buttonText='Delete Trigger'
            onButtonClick={() => updateModalState('isTriggerDeleteModalOpen', true)}
            enablementRules={deleteTriggerEnablementRule}
          />
        }
        actions={headerActions}
        filters={
          <TabsContainer>
            <SettingsTabs
              tabs={TABS}
              defaultValue={initialTab}
              onTabSelected={onTabSelected}
            />
          </TabsContainer>
        }
      />
      <Main>
        <ErrorList errors={serverError} onClose={() => setServerError([])} />
        <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
          {data?.Space && (
            <SpaceDashboard
              space={data.Space}
              setServerError={formatError}
              onSpaceUpdated={() => {
                // Refresh space data
              }}
            />
          )}
        </Section>
        <Section $display={selectedTab === 1} $direction={Direction.FadeIn}>
          <TriggersTable
            spaceID={id}
            selectedRows={selectedTriggers}
            onRowSelected={(triggers: Array<string>) => setSelectedTriggers(triggers)}
            onAddTrigger={() => updateModalState('isAddTriggerModalOpen', true)}
            where={triggerFilter}
            onClearFilter={clearFilters}
            filterElement={QueryBuilderElement}
          />
        </Section>
        <AddTriggerDrawer
          key={triggerToEdit?.TriggerID || 'new'}
          isOpen={(isDrawerOpen && !!triggerToEdit) || modalStates.isAddTriggerModalOpen}
          onClose={() => {
            closeEditDrawer();
            updateModalState('isAddTriggerModalOpen', false);
          }}
          onTriggerCreated={() => {
            closeEditDrawer();
            updateModalState('isAddTriggerModalOpen', false);
          }}
          onTriggerUpdated={() => {
            closeEditDrawer();
            updateModalState('isAddTriggerModalOpen', false);
          }}
          existingTrigger={triggerToEdit}
          orgID={data?.Space?.OrganizationID || ''}
          spaceId={id || ''}
        />
        <BulkEditTriggersDrawer
          isOpen={modalStates.isBulkEditTriggerModalOpen}
          onClose={() => updateModalState('isBulkEditTriggerModalOpen', false)}
          triggersToEdit={triggersToEdit}
          refresh={refetchTriggers}
        />
        <ConfirmationModal
          isOpen={modalStates.isTriggerDeleteModalOpen}
          onClose={() => updateModalState('isTriggerDeleteModalOpen', false)}
          onSubmit={onTriggerDeleted}
          modalDescriptionText='Are you sure you want to delete the selected triggers?'
          modalTitleText='Delete Trigger'
        />
        <ConfirmationModal
          isOpen={modalStates.isDeleteSpaceModalOpen}
          onClose={() => updateModalState('isDeleteSpaceModalOpen', false)}
          onSubmit={onSpaceDeleted}
          modalDescriptionText={`Are you sure you want to delete ${data?.Space?.DisplayName}?`}
          modalTitleText='Delete Space'
        />
        <AddUnitModal
          isOpen={isUnitAddOpen}
          onClose={() => setIsUnitAddOpen(false)}
          spaces={[data?.Space as SpaceRead]}
        />
      </Main>
    </DetailsContainer>
  );
};

export default SpaceDetailPage;
