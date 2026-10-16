// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Main } from '@/components/styled';
import { DetailsContainer, Section } from '@/components/styled/index.tsx';
import { TriggerSelectionBar } from '@/components/trigger-selection/TriggerSelectionBar';
import { useTriggerSelection } from '@/components/trigger-selection/useTriggerSelection';
import { useApiErrorMessage } from '@/hooks/useApiErrorMessage';
import { useAppDispatch } from '@/hooks/useApp';
import { useBulkApiErrorMessage } from '@/hooks/useBulkApiErrorMessages';
import { useEditDrawerUrl } from '@/hooks/useEditDrawerUrl';
import { useTabWithUrl } from '@/hooks/useTabWithUrl';
import { AddTriggerDrawer } from '@/pages/space-detail/components/add-trigger-drawer/AddTriggerDrawer';
import { BulkEditTriggersDrawer } from '@/pages/space-detail/components/bulk-edit-triggers-drawer/BulkEditTriggersDrawer';
import { requestTriggerCreation } from '@/state/slices/invokerRequest';
import { getApiErrorMessage } from '@/utility/error-functions';
import { sumMap } from '@/utility/object-functions';
import {
  type SpaceRead,
  type TriggerRead,
  useBulkDeleteTriggersMutation,
  useDeleteSpaceMutation,
  useGetSpaceQuery,
  useListAllTriggersQuery,
  useListSpacesQuery,
  usePatchSpaceMutation,
} from '@confighub/rtk-query';
import { Direction } from '@/types/enums';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
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
const TRIGGERS_TAB = 1;

// The Triggers tab lists either the Triggers that reside in the Space or those that apply to its
// Units, which the Space selects from any Space.
const TRIGGER_VIEW_PARAM = 'triggers';
type TriggerView = 'space' | 'applied';

// The entities the settings panel names, and the summary counts the Overview shows.
const SPACE_INCLUDE = 'ComponentID,ReleaseTargetID,TriggerFilterID,TriggerIDs,AttributeFilterID';

const andWhere = (base: string, extra: string) => (extra ? `${base} AND ${extra}` : base);

export const SpaceDetailPage = () => {
  dayjs.extend(relativeTime);
  const { id = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = parseInt(searchParams.get('tab') || DEFAULT_TAB);
  const triggerView: TriggerView = searchParams.get(TRIGGER_VIEW_PARAM) === 'applied' ? 'applied' : 'space';
  const [serverError, setServerError] = useState<Array<string>>([]);
  const dispatch = useAppDispatch();

  const { modalStates, updateModalState } = useModalStates();
  const { selectedTab, onTabSelected } = useTabWithUrl({ defaultTab: initialTab });

  // State
  const navigate = useNavigate();
  const [selectedTriggers, setSelectedTriggers] = useState<Array<string>>([]);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuAnchor = useRef<HTMLDivElement>(null);

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
  const [patchSpace, { isLoading: isRefreshingTriggers, error: refreshTriggersError }] =
    usePatchSpaceMutation();

  const { data, isLoading: isSpaceLoading, refetch: refetchSpace } = useGetSpaceQuery({
    spaceId: id,
    summary: true,
    include: SPACE_INCLUDE,
  });
  const space = data?.Space;

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

  // The Triggers that reside in the Space, for the edit drawers and the filter's options
  const { data: allTriggersData, refetch: refetchTriggers } = useListAllTriggersQuery({
    where: `SpaceID = '${id}'`,
    include: 'SpaceID',
  });

  // Creating, changing or deleting a Trigger in the Space re-lists the Triggers the Space applies,
  // so the Space is reread when its Triggers change.
  const ownTriggersKey = (allTriggersData || [])
    .map((t) => `${t.Trigger?.TriggerID}:${t.Trigger?.Version}`)
    .join(',');
  const lastOwnTriggersKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (allTriggersData === undefined) return;
    if (lastOwnTriggersKey.current !== undefined && lastOwnTriggersKey.current !== ownTriggersKey) {
      refetchSpace();
    }
    lastOwnTriggersKey.current = ownTriggersKey;
  }, [allTriggersData, ownTriggersKey, refetchSpace]);

  // How the Triggers the Space applies compare with those its selector matches now
  const triggerSelection = useTriggerSelection({
    selector: space,
    ownSpaceId: id,
    skip: !space,
  });

  const refreshTriggers = async () => {
    await patchSpace({ spaceId: id, refreshTriggers: true, body: {} });
    refetchSpace();
    triggerSelection.refetch();
  };

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

  // Applied Triggers may reside in any Space, so the Space filter offers them all.
  const { data: spacesData = [] } = useListSpacesQuery({});
  const spacesForFilter = useMemo(
    () =>
      spacesData
        .filter((s) => s.Space?.SpaceID)
        .map((s) => ({ id: s.Space!.SpaceID!, name: s.Space!.Slug || '', labels: s.Space!.Labels })),
    [spacesData],
  );

  // Extract slug options from triggers for the Slug autocomplete
  const triggerSlugOptions = useMemo(
    () => (allTriggersData || []).map((t) => ({
      slug: t.Trigger?.Slug || '',
      spaceName: space?.DisplayName || space?.Slug || '',
    })).filter((s) => s.slug),
    [allTriggersData, space?.DisplayName, space?.Slug],
  );

  // Use QueryBuilder hook for trigger filtering
  const { QueryBuilderElement, whereClause: triggerFilter, clearFilters } = useQueryBuilder({
    entityType: 'Trigger',
    spaces: spacesForFilter,
    slugs: triggerSlugOptions,
    labelOptions: triggerLabelOptions,
    syncToUrl: true,
  });

  const triggerListWhere =
    triggerView === 'applied'
      ? andWhere(
          `TriggerID IN (${triggerSelection.allIds.map((tid) => `'${tid}'`).join(',')})`,
          triggerFilter,
        )
      : andWhere(`SpaceID = '${id}'`, triggerFilter);

  const setTriggerView = (view: TriggerView) => {
    setSelectedTriggers([]);
    if (view === 'applied') triggerSelection.refetch();
    const params = new URLSearchParams(searchParams);
    params.set('tab', String(TRIGGERS_TAB));
    if (view === 'applied') {
      params.set(TRIGGER_VIEW_PARAM, 'applied');
    } else {
      params.delete(TRIGGER_VIEW_PARAM);
    }
    setSearchParams(params);
  };

  // Triggers are made from the function invoker: a function, its arguments, saved as a Trigger.
  const openInvokerToCreateTrigger = () => {
    dispatch(requestTriggerCreation({ spaceId: id }));
  };

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
      name: space?.Slug || '',
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

  const isTriggersTab = selectedTab === TRIGGERS_TAB;

  const createTriggerButton = (
    <>
      <ButtonGroup variant='contained' size='small' ref={createMenuAnchor}>
        <Button onClick={openInvokerToCreateTrigger} data-testid='create-trigger-button'>
          Create
        </Button>
        <Button
          size='small'
          aria-label='More ways to create a Trigger'
          onClick={() => setCreateMenuOpen(true)}
        >
          <ArrowDropDownIcon />
        </Button>
      </ButtonGroup>
      <Menu
        anchorEl={createMenuAnchor.current}
        open={createMenuOpen}
        onClose={() => setCreateMenuOpen(false)}
      >
        <MenuItem
          onClick={() => {
            setCreateMenuOpen(false);
            openInvokerToCreateTrigger();
          }}
        >
          From a function, in the function invoker
        </MenuItem>
        <MenuItem
          onClick={() => {
            setCreateMenuOpen(false);
            updateModalState('isAddTriggerModalOpen', true);
          }}
        >
          With the Trigger form
        </MenuItem>
      </Menu>
    </>
  );

  const triggerCountInSpace = allTriggersData?.length ?? sumMap(data?.TriggerCountByEventType);

  // The Trigger Filter may reside in another Space, so it is named with its Space.
  const triggerFilterSpaceSlug = spacesForFilter.find((s) => s.id === data?.TriggerFilter?.SpaceID)?.name;
  const triggerFilterName = data?.TriggerFilter
    ? [triggerFilterSpaceSlug, data.TriggerFilter.Slug].filter(Boolean).join('/')
    : undefined;

  return (
    <DetailsContainer>
      <Header
        breadCrumbs={breadcrumbs}
        addButton={isTriggersTab ? createTriggerButton : undefined}
        editButton={
          isTriggersTab && triggerView === 'space' ? (
            <ActionButton
              buttonText='Update'
              onButtonClick={() => updateModalState('isBulkEditTriggerModalOpen', true)}
              enablementRules={editTriggerEnablementRule}
            />
          ) : undefined
        }
        deleteButton={
          isTriggersTab && triggerView === 'space' ? (
            <ActionButton
              buttonText='Delete Trigger'
              onButtonClick={() => updateModalState('isTriggerDeleteModalOpen', true)}
              enablementRules={deleteTriggerEnablementRule}
            />
          ) : undefined
        }
        actions={headerActions}
        filters={
          <TabsContainer>
            <SettingsTabs
              tabs={TABS}
              defaultValue={selectedTab}
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
              extendedSpace={data}
              isLoading={isSpaceLoading}
              setServerError={formatError}
              onSpaceUpdated={() => refetchSpace()}
              onShowAppliedTriggers={() => setTriggerView('applied')}
            />
          )}
        </Section>
        <Section $display={isTriggersTab} $direction={Direction.FadeIn}>
          {/* Inset to line up with the grid toolbar below */}
          <Box sx={{ px: 1.5, pt: 1 }}>
            <ToggleButtonGroup
              size='small'
              exclusive
              color='primary'
              value={triggerView}
              onChange={(_, view: TriggerView | null) => view && setTriggerView(view)}
              sx={{ mb: 1 }}
            >
              <ToggleButton value='space' data-testid='triggers-in-space-toggle'>
                In this Space ({triggerCountInSpace})
              </ToggleButton>
              <ToggleButton value='applied' data-testid='triggers-applied-toggle'>
                Applied to this Space ({triggerSelection.appliedCount})
              </ToggleButton>
            </ToggleButtonGroup>
            {triggerView === 'applied' && (
              <TriggerSelectionBar
                entityName='Space'
                whereTrigger={space?.WhereTrigger}
                triggerFilterName={triggerFilterName}
                selection={triggerSelection}
                onRefresh={refreshTriggers}
                isRefreshing={isRefreshingTriggers}
                refreshError={
                  refreshTriggersError
                    ? getApiErrorMessage(refreshTriggersError, 'The Triggers could not be refreshed.')
                    : undefined
                }
              />
            )}
          </Box>
          <TriggersTable
            key={triggerView}
            spaceID={id}
            where={triggerListWhere}
            skip={triggerView === 'applied' && triggerSelection.allIds.length === 0}
            selectedRows={selectedTriggers}
            onRowSelected={
              triggerView === 'space'
                ? (triggers: Array<string>) => setSelectedTriggers(triggers)
                : undefined
            }
            onAddTrigger={triggerView === 'space' ? openInvokerToCreateTrigger : undefined}
            isFiltered={!!triggerFilter}
            onClearFilter={clearFilters}
            filterElement={QueryBuilderElement}
            selectionStatusById={triggerView === 'applied' ? triggerSelection.statusById : undefined}
            persistenceKey={triggerView === 'applied' ? 'applied-triggers-table' : 'triggers-table'}
            emptyState={
              triggerView === 'applied' ? (
                <Typography variant='body2' color='text.secondary' sx={{ px: 1.5, py: 1 }}>
                  No Triggers apply to this Space.
                </Typography>
              ) : undefined
            }
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
          orgID={space?.OrganizationID || ''}
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
          modalDescriptionText={`Are you sure you want to delete ${space?.DisplayName}?`}
          modalTitleText='Delete Space'
        />
        <AddUnitModal
          isOpen={isUnitAddOpen}
          onClose={() => setIsUnitAddOpen(false)}
          spaces={[space as SpaceRead]}
        />
      </Main>
    </DetailsContainer>
  );
};

export default SpaceDetailPage;
