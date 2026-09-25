// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo } from 'react';

import { Header } from '@/components/header/Header';
import { fadeIn } from '@/components/styled';
import type { UnitRead } from '@confighub/rtk-query';
import { COMPONENT_DIMENSIONS } from '@/utility/constants';
import { isIDInvalid } from '@/utility/validation-functions';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import RefreshIcon from '@mui/icons-material/Cached';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import LayersIcon from '@mui/icons-material/Layers';
import LinkIcon from '@mui/icons-material/Link';
import RestoreIcon from '@mui/icons-material/Restore';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import { Button, IconButton, ToggleButton, Tooltip } from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';

// Moved to constants for better maintainability
const BULK_ACTIONS = {
  LINK: 'Link',
  BULK_EDIT: 'Bulk_Edit',
  DELETE: 'Delete',
  ADD: 'Add',
  CLONE: 'Clone',
  BULK_RESTORE: 'Bulk_Restore',
  CREATE_CHANGESET: 'Change_Set',
  UPGRADE: 'Upgrade',
} as const;

export interface UnitListHeaderProps {
  handleBulkActionChange: (action: string) => void;
  setIsDeleteModalOpen: (open: boolean) => void;
  setShowDiffOnApplyDrawer: (open: boolean) => void;
  selectedUnitsIds: string[];
  selectedUnit?: UnitRead;
  searchBox?: React.ReactNode;
  /**
   * When true, removes the bottom padding from the header row and suppresses
   * the Divider — passed through to the underlying Header component.
   * Set to true when ViewTabs is in the searchBox slot so the tab strip
   * appears flush below the breadcrumb row.
   */
  compactBottom?: boolean;
  onRefreshUnits?: () => void;
  isLinkWorkflowMode?: boolean;
  onToggleChangesetWorkflowMode?: () => void;
  isChangesetWorkflowMode?: boolean;
}

export const UnitListHeader = memo<UnitListHeaderProps>(
  ({
    handleBulkActionChange,
    setIsDeleteModalOpen,
    // setShowDiffOnApplyDrawer,
    selectedUnitsIds,
    selectedUnit,
    searchBox,
    compactBottom,
    onRefreshUnits,
    isLinkWorkflowMode = false,
    onToggleChangesetWorkflowMode,
    isChangesetWorkflowMode = false,
  }) => {
    // Memoized computed values
    const computedState = useMemo(() => {
      const noNewRevisions =
        (selectedUnit?.HeadRevisionNum ?? 0) === (selectedUnit?.LastReleasedRevisionNum ?? 0);
      const hasTargetID = !isIDInvalid(selectedUnit?.TargetID);
      const selectedCount = selectedUnitsIds.length;

      return {
        noNewRevisions,
        hasTargetID,
        selectedCount,
        hasSelection: selectedCount > 0,
        hasSingleSelection: selectedCount === 1,
        hasTwoSelections: selectedCount === 2,
        hasMultipleSelections: selectedCount > 1,
      };
    }, [selectedUnit, selectedUnitsIds.length]);

    // Memoized menu items
    const moreMenuItems = [
      // Actions group
      {
        label: 'Clone',
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.CLONE,
        group: 'Actions',
        icon: <ContentCopyIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Clone is disabled in link workflow mode.'
          : 'Select units to clone.',
      },
      {
        label: 'Delete',
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.DELETE,
        group: 'Actions',
        icon: <DeleteOutlineIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Delete is disabled in link workflow mode.'
          : 'Select at least one unit to delete.',
      },
      {
        label: 'Link',
        disabled: !computedState.hasSingleSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.LINK,
        group: 'Actions',
        icon: <LinkIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Link is disabled in link workflow mode.'
          : 'Link the selected unit to upstream units from which configuration data can be propagated.',
      },
      // State group
      {
        label: 'Restore',
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.BULK_RESTORE,
        group: 'State',
        icon: <RestoreIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Restore is disabled in link workflow mode.'
          : `Rollback selected units' configuration data to previous revisions.`,
      },
      // Updates group
      {
        label: 'Update',
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.BULK_EDIT,
        group: 'Updates',
        icon: <EditIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Update is disabled in link workflow mode.'
          : 'Edit target assignment, labels, delete and destroy gates across selected units.',
      },
      {
        label: 'Upgrade',
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        value: BULK_ACTIONS.UPGRADE,
        group: 'Updates',
        icon: <UpgradeIcon fontSize='small' />,
        tooltip: isLinkWorkflowMode
          ? 'Upgrade is disabled in link workflow mode.'
          : "Merge selected units with their upstream source's latest configuration.",
      },
    ];

    // Event handlers
    const handleMoreMenuChange = (event: SelectChangeEvent<unknown>) => {
      const value = event.target.value as string;

      switch (value) {
        case BULK_ACTIONS.CLONE:
          handleCloneClick();
          break;
        case BULK_ACTIONS.BULK_EDIT:
          handleBulkActionChange(value);
          break;
        case BULK_ACTIONS.DELETE:
          setIsDeleteModalOpen(true);
          break;
        case BULK_ACTIONS.LINK:
          handleBulkActionChange(value);
          break;
        case BULK_ACTIONS.BULK_RESTORE:
          handleBulkActionChange(value);
          break;
        case BULK_ACTIONS.UPGRADE:
          handleBulkActionChange(value);
          break;
      }
    };

    const handleAddClick = useCallback(() => {
      handleBulkActionChange(BULK_ACTIONS.ADD);
    }, [handleBulkActionChange]);

    const handleCloneClick = useCallback(() => {
      handleBulkActionChange(BULK_ACTIONS.CLONE);
    }, [handleBulkActionChange]);

    const handleRefreshUnitsClick = useCallback(() => {
      onRefreshUnits?.();
    }, [onRefreshUnits]);

    return (
      <Header
        breadCrumbs={[{ name: 'Units' }]}
        moreItems={{
          onChange: handleMoreMenuChange,
          items: moreMenuItems,
          disabled: isLinkWorkflowMode,
          disabledTooltip: 'More actions are disabled in link workflow mode.',
        }}
        filters={searchBox}
        compactBottom={compactBottom}
        actions={
          <>
            <IconButton
              size='small'
              data-testid='refresh-button'
              onClick={handleRefreshUnitsClick}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
              }}
            >
              <RefreshIcon />
            </IconButton>

            <Tooltip
              arrow
              placement='bottom'
              title={
                isChangesetWorkflowMode ? 'Exit Change Set bench' : 'Open Change Set bench'
              }
            >
              <ToggleButton
                value='changeset'
                selected={isChangesetWorkflowMode}
                onChange={onToggleChangesetWorkflowMode}
                size='small'
                data-testid='changeset-button'
                sx={{
                  height: COMPONENT_DIMENSIONS.INPUT_HEIGHT,
                  width: COMPONENT_DIMENSIONS.INPUT_HEIGHT,
                  color: isChangesetWorkflowMode ? 'primary.contrastText' : 'primary.main',
                  border: 'none',
                  '&.Mui-selected': {
                    backgroundColor: 'primary.main',
                    color: 'primary.contrastText',
                    '&:hover': {
                      backgroundColor: 'primary.dark',
                    },
                  },
                }}
              >
                {isChangesetWorkflowMode ? <LayersIcon /> : <AltRouteIcon />}
              </ToggleButton>
            </Tooltip>

            <Button
              variant='contained'
              size='small'
              sx={{ animation: `${fadeIn} 0.3s ease-in` }}
              onClick={handleAddClick}
            >
              Add
            </Button>
          </>
        }
      />
    );
  },
);

UnitListHeader.displayName = 'UnitListHeader';
