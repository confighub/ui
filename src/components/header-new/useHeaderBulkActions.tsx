// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { useAppSelector } from '@/hooks/useApp';
import { selectIsLinkWorkflowMode } from '@/state/slices/layoutSlice';
import { isIDInvalid } from '@/utility/validation-functions';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import { SelectChangeEvent } from '@mui/material/Select';

const BULK_ACTIONS = {
  BULK_EDIT: 'Bulk_Edit',
  UPGRADE: 'Upgrade',
  DELETE: 'Delete',
  LINK: 'Link',
  ADD: 'Add',
  CLONE: 'Clone',
  BULK_RESTORE: 'Bulk_Restore',
  CREATE_CHANGESET: 'Change_Set',
} as const;

export type ModalKey = 'bulkEdit' | 'upgrade' | 'delete' | 'clone' | 'restore' | 'add';

interface ModalsOpen {
  bulkEdit: boolean;
  upgrade: boolean;
  delete: boolean;
  clone: boolean;
  restore: boolean;
  import: boolean;
  add: boolean;
}

const INITIAL_MODALS: ModalsOpen = {
  bulkEdit: false,
  upgrade: false,
  delete: false,
  clone: false,
  restore: false,
  import: false,
  add: false,
};

const ACTION_TO_MODAL: Partial<Record<string, ModalKey>> = {
  [BULK_ACTIONS.BULK_EDIT]: 'bulkEdit',
  [BULK_ACTIONS.UPGRADE]: 'upgrade',
  [BULK_ACTIONS.DELETE]: 'delete',
  [BULK_ACTIONS.CLONE]: 'clone',
  [BULK_ACTIONS.BULK_RESTORE]: 'restore',
  [BULK_ACTIONS.ADD]: 'add',
};

/**
 * Manages selected-unit state, menu item definitions, and modal open/close
 * state for the header bulk-action menu.
 */
export const useHeaderBulkActions = () => {
  const isLinkWorkflowMode = useAppSelector(selectIsLinkWorkflowMode);
  const selectedUnits = useAppSelector((state) => state.selectedUnits.units || []);
  const selectedUnit = selectedUnits.length === 1 ? selectedUnits[0].Unit : undefined;

  const [modalsOpen, setModalsOpen] = useState<ModalsOpen>(INITIAL_MODALS);

  const closeModal = (key: ModalKey) => setModalsOpen((prev) => ({ ...prev, [key]: false }));

  const unitsToEdit = useMemo(
    () =>
      selectedUnits
        .map((u) => u.Unit)
        .filter((u): u is NonNullable<typeof u> => u !== undefined),
    [selectedUnits],
  );

  const computedState = useMemo(() => {
    const selectedCount = selectedUnits.length;

    return {
      noNewRevisions:
        (selectedUnit?.HeadRevisionNum ?? 0) === (selectedUnit?.LastReleasedRevisionNum ?? 0),
      hasTargetID: !isIDInvalid(selectedUnit?.TargetID),
      selectedCount,
      hasSelection: selectedCount > 0,
      hasSingleSelection: selectedCount === 1,
      hasTwoSelections: selectedCount === 2,
      hasMultipleSelections: selectedCount > 1,
    };
  }, [selectedUnit, selectedUnits]);

  const menuItems = useMemo(
    () => [
      // Actions
      {
        label: 'Add',
        value: BULK_ACTIONS.ADD,
        group: 'Actions',
        icon: <AddCircleOutlineIcon fontSize='small' />,
        disabled: isLinkWorkflowMode,
        tooltip: isLinkWorkflowMode ? 'Add is disabled in link workflow mode.' : undefined,
      },
      {
        label: 'Clone',
        value: BULK_ACTIONS.CLONE,
        group: 'Actions',
        icon: <ContentCopyIcon fontSize='small' />,
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        tooltip: isLinkWorkflowMode
          ? 'Clone is disabled in link workflow mode.'
          : 'Select units to clone.',
      },
      {
        label: 'Delete',
        value: BULK_ACTIONS.DELETE,
        group: 'Actions',
        icon: <DeleteOutlineIcon fontSize='small' />,
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        tooltip: isLinkWorkflowMode
          ? 'Delete is disabled in link workflow mode.'
          : 'Select at least one unit to delete.',
      },
      // Updates
      {
        label: 'Update',
        value: BULK_ACTIONS.BULK_EDIT,
        group: 'Updates',
        icon: <EditIcon fontSize='small' />,
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        tooltip: isLinkWorkflowMode
          ? 'Update is disabled in link workflow mode.'
          : 'Edit target assignment, labels, delete and destroy gates across selected units.',
      },
      {
        label: 'Upgrade',
        value: BULK_ACTIONS.UPGRADE,
        group: 'Updates',
        icon: <UpgradeIcon fontSize='small' />,
        disabled: !computedState.hasSelection || isLinkWorkflowMode,
        tooltip: isLinkWorkflowMode
          ? 'Upgrade is disabled in link workflow mode.'
          : "Merge selected units with their upstream source's latest configuration.",
      },
    ],
    [computedState, isLinkWorkflowMode],
  );

  const onMenuChange = (event: SelectChangeEvent<unknown>) => {
    const modalKey = ACTION_TO_MODAL[event.target.value as string];
    if (modalKey) setModalsOpen((prev) => ({ ...prev, [modalKey]: true }));
  };

  const moreMenuConfig = {
    onChange: onMenuChange,
    items: menuItems,
    disabled: isLinkWorkflowMode,
    disabledTooltip: 'More actions are disabled in link workflow mode.',
  };

  return { unitsToEdit, moreMenuConfig, modalsOpen, closeModal } as const;
};
