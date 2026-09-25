// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

export interface ModalState {
  isAddUnitModalOpen: boolean;
  isLinkToModalOpen: boolean;
  isInvokeFunctionsModalOpen: boolean;
  isBulkEditModalOpen: boolean;
  isBulkRestoreModalOpen: boolean;
  isCloneModalOpen: boolean;
  isDeleteModalOpen: boolean;
  isUpgradeModalOpen: boolean;
  showDiffOnApplyDrawer: boolean;
  isCreateChangesetModalOpen: boolean;
}

export const useModalState = () => {
  const [modalState, setModalState] = useState<ModalState>({
    isAddUnitModalOpen: false,
    isLinkToModalOpen: false,
    isInvokeFunctionsModalOpen: false,
    isBulkEditModalOpen: false,
    isCloneModalOpen: false,
    isDeleteModalOpen: false,
    showDiffOnApplyDrawer: false,
    isCreateChangesetModalOpen: false,
    isUpgradeModalOpen: false,
    isBulkRestoreModalOpen: false,
  });

  const updateModalState = (updates: Partial<ModalState>) => {
    setModalState((prev) => ({ ...prev, ...updates }));
  };

  return { modalState, updateModalState };
};
