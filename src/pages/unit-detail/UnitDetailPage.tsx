// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Dispatch, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ActionButton } from '@/components/action-button/ActionButton';
import { DiffDrawer } from '@/components/diff-drawer/DiffDrawer';
import { ErrorBox } from '@/components/error-box/ErrorBox';
import { Header } from '@/components/header/Header';
import { SelectTargetModal } from '@/components/select-targets-modal/SelectTargetsModal';
import { SettingsTabs } from '@/components/settings-tabs/SettingsTabs';
import { Section } from '@/components/styled';
import { Main } from '@/components/styled';
import { useAppDispatch } from '@/hooks/useApp';
import { useMultipleApiErrors } from '@/hooks/useMultipleApiErrorMessages';
import { LinksTab } from '@/pages/unit-detail/tabs/LinksTab';
import { RevisionsTab } from '@/pages/unit-detail/tabs/RevisionsTab';
import {
  type FunctionSignature,
  type UnitRead,
} from '@confighub/rtk-query';
import { setSelectedUnits as setGlobalSelectedUnits } from '@/state/slices/selectedUnits';
import { Direction } from '@/types/enums';
import { formatApplyGate } from '@/utility/name-format-functions';
import RefreshIcon from '@mui/icons-material/Cached';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import { Badge, IconButton, Stack, Tooltip } from '@mui/material';
import { styled } from '@mui/material/styles';

import { UnitEventsTable } from '../unit-list/components/unit-events-table/UnitEventsTable';
import { Dashboard } from './components/dashboard/Dashboard';
import {
  IUnitDetailModalComposerProps,
  UnitDetailModalComposer,
} from './components/unit-detail-modal-composer/UnitDetailModalComposer';
import { UnitDownstreamTable } from './components/unit-downstream-table/UnitDownstreamTable';
import { useUnitActions } from './hooks/useUnitActions';
import { useUnitComputedData } from './hooks/useUnitComputedData';
import { useUnitDetailData } from './hooks/useUnitDetailData';
import { ModalType } from './rules';
import { ConfigTab } from './tabs/ConfigTab';
import { MutationsTab } from './tabs/MutationsTab';
import { useRevisionDataMap } from '@/hooks/useUnitData';

const Container = styled('div')`
  width: 100%;
`;

const TabsContainer = styled('div')`
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
`;

export const UnitDetailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [refresh, setRefresh] = useState(false);

  // Check if we arrived from the View Explorer
  const explorerState = location.state as {
    fromViewExplorer?: boolean;
    viewId?: string;
  } | null;

  // State
  const { id = '', spaceID = '' } = useParams();
  const [searchParams] = useSearchParams();
  const initialTab = parseInt(searchParams.get('tab') || '0');
  const [selectedTab, setSelectedTab] = useState(initialTab);

  // Modal state
  const [modalType, setModalType] = useState<ModalType>('' as ModalType);
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false);
  const [selectedFunction, setSelectedFunction] = useState<FunctionSignature | null>(null);
  // Separate state for function being edited in modal (doesn't affect view until invocation completes)
  const [modalFunction, setModalFunction] = useState<FunctionSignature | null>(null);
  const [isFunctionModalOpen, setIsFunctionModalOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isDeleteUnitModalOpen, setIsDeleteUnitModalOpen] = useState(false);
  const [isAddTargetModalOpen, setIsAddTargetModalOpen] = useState(false);
  const [isSelectedTargetModalOpen, setIsSelectTargetModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [showDiffOnUpgradeDrawer, setShowDiffOnUpgradeDrawer] = useState(false);

  // Upgrade state
  const [unitsUpgraded, setUnitsUpgraded] = useState(false);
  const [preUpgradeRevisionNum, setPreUpgradeRevisionNum] = useState<number | null>(null);
  const [postUpgradeRevisionNum, setPostUpgradeRevisionNum] = useState<number | null>(null);

  // Boostrap page data
  const {
    downstreamUnits,
    functions,
    spaces,
    links,
    revisions,
    currentUnit,
    currentUnitExtended,
    currentSpace,
    targets,
    upstreamUnit,
    setCurrentUnit,
    isFetchingUnit,
    setIsEditInvocationCancelled,
    invocationToEdit,
    setInvocationToEdit,
  } = useUnitDetailData({
    id,
    spaceID,
    refresh,
  });

  // Computed data
  const {
    canUpgradeUnit,
    downStreamPushUnavailable,
    preUpgradeRevision,
    postUpgradeRevision,
    functionOptions,
  } = useUnitComputedData({
    currentUnit,
    upstreamUnit,
    revisions,
    downstreamUnits,
    unitsUpgraded,
    preUpgradeRevisionNum,
    postUpgradeRevisionNum,
    // @ts-expect-error TODO: Fix types
    functions,
  });

  // The upgrade diff compares two stored Revisions; their configuration comes from the
  // revision-data endpoint in one request.
  const { dataFor: upgradeDiffDataFor } = useRevisionDataMap([
    preUpgradeRevision?.Revision?.RevisionID,
    postUpgradeRevision?.Revision?.RevisionID,
  ]);

  // Api methods
  const {
    onUnitDeleted,
    onUnitUpgrade,
    onFunctionInvoked,
    onBulkUnitUpgrade,
    functionInvocationError,
    apiStates,
    usePollingForValidationErrors,
  } = useUnitActions({
    unitId: id,
    spaceId: spaceID,
    currentUnit,
    onRefresh: () => setRefresh(!refresh),
    selectedFunction,
    modalFunction,
    setPreUpgradeRevisionNum,
    setPostUpgradeRevisionNum,
    setIsUpgradeModalOpen,
    setUnitsUpgraded,
    setSelectedFunction,
    setIsEditInvocationCancelled,
  });

  // Poll for ValidationErrors updates
  const { unit: polledUnit, lastPollTimestamp } = usePollingForValidationErrors(
    currentUnitExtended,
    true, // Enable polling only if unit has ValidationErrors
    5000, // Poll every 5 seconds
  );

  // Error handlers
  const { errorMessage, setErrorMessage } = useMultipleApiErrors(
    [
      {
        error: apiStates.invoke.error,
        isSuccess: apiStates.invoke.isSuccess,
        operationName: 'invoking function',
        customErrorMessage: functionInvocationError,
      },
      {
        error: apiStates.delete.error,
        isSuccess: apiStates.delete.isSuccess,
        operationName: 'deleting unit',
      },
      {
        error: apiStates.update.error,
        isSuccess: apiStates.update.isSuccess,
        operationName: 'updating unit',
      },
      {
        error: apiStates.upgrade.error,
        isSuccess: apiStates.upgrade.isSuccess,
        operationName: 'upgrading unit',
      },
    ],
    {
      errorPrefix: 'Error',
      clearErrorAfter: 5000, // Auto-clear after 5 seconds
    },
  );

  // Watch for new revision after upgrade
  useEffect(() => {
    if (
      postUpgradeRevision &&
      preUpgradeRevisionNum !== null &&
      (postUpgradeRevisionNum ?? 0) > preUpgradeRevisionNum
    ) {
      setShowDiffOnUpgradeDrawer(true);
    }
  }, [postUpgradeRevision, preUpgradeRevisionNum, postUpgradeRevisionNum]);

  useEffect(() => {
    if (currentUnitExtended?.Unit?.UnitID) {
      dispatch(
        setGlobalSelectedUnits({
          units: [currentUnitExtended],
        }),
      );
    }
    return () => {
      dispatch(setGlobalSelectedUnits({ units: [] }));
    };
  }, [currentUnitExtended, dispatch]);

  const onTabSelected = (newValue: number) => {
    setSelectedTab(newValue);
    // Update the query string with the new tab value
    const searchParams = new URLSearchParams(location.search);
    searchParams.set('tab', newValue.toString());

    navigate(`${location.pathname}?${searchParams.toString()}`, {
      replace: true,
      state: location.state,
    });
  };

  const onMoreItemsChanged = (value: string) => {
    const actions: Record<string, () => void> = {
      'Push Downstream': () => {
        onBulkUnitUpgrade();
        setRefresh(!refresh);
      },
      Delete: () => onModalTypeSelected('delete'),
      Add: () => onModalTypeSelected('add'),
      Upgrade: () => onModalTypeSelected('upgrade'),
    };

    // Execute the corresponding action if it exists
    actions[value]?.();
  };

  const composerModalProps = {
    type: modalType,
    isOpen: {
      invoke: isFunctionModalOpen && modalFunction !== null,
      delete: isDeleteUnitModalOpen,
      clone: isCloneModalOpen,
      add: isAddUnitModalOpen,
      addTarget: isAddTargetModalOpen,
      upgrade: isUpgradeModalOpen,
    },
    onClose: {
      invoke: () => {
        setIsFunctionModalOpen(false);
        setInvocationToEdit(undefined);
        setModalFunction(null);
        setIsEditInvocationCancelled(true);
      },
      delete: () => setIsDeleteUnitModalOpen(false),
      clone: () => setIsCloneModalOpen(false),
      add: () => setIsAddUnitModalOpen(false),
      addTarget: () => setIsAddTargetModalOpen(false),
      upgrade: () => setIsUpgradeModalOpen(false),
    },
    onSubmit: {
      invoke: async (data: Record<string, string>) => {
        await onFunctionInvoked(data);
      },
      delete: async () => onUnitDeleted(),
      add: async (unit: UnitRead) => {
        navigate(`/units/${unit?.SpaceID}/${unit?.UnitID}`);
      },
      upgrade: async () => onUnitUpgrade(),
    },
    func: modalFunction,
    // TODO: Based on type?
    modalDescriptionText: {
      delete: 'Are you sure you want to delete this unit?',
      upgrade: 'Are you sure you want to upgrade this unit?',
    },
    modalTitleText: {
      delete: 'Delete Unit',
      upgrade: 'Upgrade Unit',
    },
    spaces,
    refresh: () => setRefresh(!refresh),
    unitsToEdit: [currentUnit],
    defaultToolchainType: currentUnit?.ToolchainType,
    invocationToEdit,
  } as IUnitDetailModalComposerProps;

  const modalMapping: Record<
    string,
    { type: ModalType; setOpen: Dispatch<React.SetStateAction<boolean>> }
  > = {
    invoke: { type: 'invoke', setOpen: setIsFunctionModalOpen },
    delete: { type: 'delete', setOpen: setIsDeleteUnitModalOpen },
    clone: { type: 'clone', setOpen: setIsCloneModalOpen },
    add: { type: 'add', setOpen: setIsAddUnitModalOpen },
    addTarget: { type: 'addTarget', setOpen: setIsAddTargetModalOpen },
    upgrade: { type: 'upgrade', setOpen: setIsUpgradeModalOpen },
  };

  const onModalTypeSelected = (type: ModalType) => {
    const modal = modalMapping[type];
    if (modal) {
      setModalType(type);
      modal.setOpen(true);
    }
  };

  return (
    <Container>
      <Header
        breadCrumbs={[
          ...(explorerState?.fromViewExplorer
            ? [
                {
                  name: 'View Explorer',
                  isLink: true,
                  link: '/x/view-explorer',
                  state: { restoreViewId: explorerState.viewId },
                },
              ]
            : []),
          {
            name: currentSpace?.Slug || 'Space',
            isLink: true,
            link: `/spaces/${currentSpace?.SpaceID}`,
          },
          {
            name: 'Units',
            isLink: true,
            link: `/units`,
          },
          {
            name: currentUnit?.Slug,
          },
        ]}
        moreItems={{
          onChange: (event) => onMoreItemsChanged(event.target.value as string),
          items: [
            {
              label: 'Add',
              value: 'Add',
            },
            {
              label: 'Delete',
              value: 'Delete',
            },
            {
              label: 'Push Downstream',
              value: 'Push Downstream',
              disabled: downStreamPushUnavailable,
              tooltip: 'Push Downstream is only available for units with downstream units.',
            },
            {
              label: 'Upgrade',
              value: 'Upgrade',
              disabled: !canUpgradeUnit,
              tooltip:
                'No upgrades available.  Upgrade is available for cloned units with upstream changes.',
            },
          ],
        }}
        actions={
          <>
            <Tooltip arrow placement='bottom' title='Refresh unit details'>
              <IconButton
                data-testid='refresh-button'
                size='small'
                onClick={() => setRefresh(!refresh)}
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
            <ActionButton
              buttonText='Clone'
              enablementRules={[]}
              onButtonClick={() => onModalTypeSelected('clone')}
            />
          </>
        }
        filters={
          <TabsContainer>
            <SettingsTabs
              tabs={[
                canUpgradeUnit ? (
                  <Stack direction='row' spacing={2}>
                    <span>Overview</span>
                    <Tooltip title='Upgrade Needed'>
                      <Badge
                        badgeContent={<PriorityHighIcon sx={{ fontSize: '0.75rem' }} />}
                        color='warning'
                        sx={{
                          '& .MuiBadge-badge': {
                            borderRadius: '50%',
                            minWidth: '18px',
                            height: '18px',
                            padding: 0,
                          },
                        }}
                      />
                    </Tooltip>
                  </Stack>
                ) : (
                  'Overview'
                ),
                'Config',
                `Revisions (${currentUnit?.HeadRevisionNum || 0})`,
                `Links (${links?.length || 0})`,
                `Events (${currentUnit?.HeadUnitEventNum || 0})`,
                `Downstreams (${downstreamUnits?.length || 0})`,
                `Mutations (${currentUnit?.HeadMutationNum || 0})`,
              ]}
              onTabSelected={onTabSelected}
              defaultValue={selectedTab}
            />
          </TabsContainer>
        }
      />
      <Main sx={{ p: 2 }}>
        <ErrorBox sx={{ mb: 2 }} error={errorMessage} onClose={() => setErrorMessage('')} />
        <Section $display={selectedTab === 0} $direction={Direction.FadeIn}>
          {selectedTab === 0 && (
            <Dashboard
              currentUnitExtended={polledUnit ?? currentUnitExtended}
              setRefresh={() => setRefresh(!refresh)}
              // @ts-expect-error TODO:
              functions={functions}
              upstreamUnit={upstreamUnit}
              onUpgrade={() => onModalTypeSelected('upgrade')}
              isFetchingUnit={isFetchingUnit}
              lastPollTimestamp={lastPollTimestamp}
              onApplyGateClicked={(gateName: string) => {
                const formattedGate = formatApplyGate(gateName);
                const selectedFunction = functionOptions?.find(
                  (option) =>
                    option.FunctionName?.toLocaleLowerCase() ===
                    formattedGate.toLocaleLowerCase(),
                );
                if (selectedFunction !== undefined) {
                  setSelectedFunction?.(selectedFunction);
                  onModalTypeSelected('invoke');
                }
              }}
            />
          )}
        </Section>
        <ConfigTab
          unit={currentUnit}
          onConfigUpdated={() => setRefresh(!refresh)}
          selectedTab={selectedTab}
        />
        <RevisionsTab
          selectedTab={selectedTab}
          revisionRows={revisions}
          currentUnitExtended={currentUnitExtended}
          upstreamUnit={upstreamUnit}
          onRevisionApplied={() => setRefresh(!refresh)}
          onRefresh={() => setRefresh(!refresh)}
        />
        <LinksTab
          selectedTab={selectedTab}
          linkRows={links}
          onLinkAction={() => setRefresh(!refresh)}
        />
        <Section $display={selectedTab === 4} $direction={Direction.FadeIn} $width='100%'>
          <UnitEventsTable unitId={id} spaceId={spaceID} />
        </Section>
        <Section $display={selectedTab === 5} $direction={Direction.FadeIn} $width='100%'>
          <UnitDownstreamTable
            onUnitNavigation={(downstreamUnit: UnitRead) => {
              // The space id and unit id need to come from the downstream.
              navigate(`/units/${downstreamUnit?.SpaceID}/${downstreamUnit?.UnitID}?tab=0`, {
                replace: true,
              });
              setSelectedTab(0);
              setCurrentUnit(downstreamUnit);
            }}
            currentUnit={currentUnit}
            onCloneClick={() => onModalTypeSelected('clone')}
          />
        </Section>
        <MutationsTab
          selectedTab={selectedTab}
          unitExtended={currentUnitExtended}
          onTabSelected={onTabSelected}
        />
        <UnitDetailModalComposer {...composerModalProps} />
        <DiffDrawer
          isDiffDrawerOpen={showDiffOnUpgradeDrawer}
          onDiffDrawerClosed={() => {
            setShowDiffOnUpgradeDrawer(false);
            setPreUpgradeRevisionNum(null);
            setPostUpgradeRevisionNum(null);
          }}
          canRestoreDiff={false}
          fromData={upgradeDiffDataFor(preUpgradeRevision?.Revision?.RevisionID)}
          diffFromMessage={`revision number ${preUpgradeRevisionNum}`}
          toData={upgradeDiffDataFor(postUpgradeRevision?.Revision?.RevisionID)}
          diffToMessage={`revision number ${postUpgradeRevisionNum}`}
          diffFromMessagePrefix='Upgrade changes'
          defaultShowConfirmation={false}
        />
        <SelectTargetModal
          isSelectTargetModalOpen={isSelectedTargetModalOpen}
          onSelectTargetModalClosed={() => {
            setIsSelectTargetModalOpen(false);
          }}
          targets={targets}
          unit={currentUnit}
          refresh={() => setRefresh(!refresh)}
        />
      </Main>
    </Container>
  );
};

export default UnitDetailPage;
