// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

export interface ModalStates {
  isUnitAddOpen: boolean;
  isAddLabelModalOpen: boolean;
  isAddAnnotationModalOpen: boolean;
  isAddTriggerModalOpen: boolean;
  isTriggerDeleteModalOpen: boolean;
  isBulkEditTriggerModalOpen: boolean;
  isDeleteSpaceModalOpen: boolean;
}

export const useModalStates = () => {
  const [modalStates, setModalStates] = useState<ModalStates>({
    isUnitAddOpen: false,
    isAddLabelModalOpen: false,
    isAddAnnotationModalOpen: false,
    isAddTriggerModalOpen: false,
    isTriggerDeleteModalOpen: false,
    isBulkEditTriggerModalOpen: false,
    isDeleteSpaceModalOpen: false,
  });

  const updateModalState = (key: keyof ModalStates, value: boolean) => {
    setModalStates((prev) => ({ ...prev, [key]: value }));
  };

  return { modalStates, updateModalState };
};
