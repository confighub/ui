// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { AddTargetPage } from '@/pages/add-target/AddTargetPage';
import { AddUnitModal } from '@/pages/add-unit/AddUnitModal';
import {
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  SpaceRead,
  UnitRead,
} from '@confighub/rtk-query';
import { IUnitMutationModalProps } from '@/types';
import { Engine } from 'json-rules-engine';

import { CloneUnitsDrawer } from '../../../unit-list/components/modals/clone-units-drawer/CloneUnitsDrawer';
import rules, { ModalType } from '../../rules';
import { InvokeFunctionsModal } from '../invoke-units-functions-modal/InvokeFunctionsModal';

export const UnitDetailModals = {
  invoke: (data: IUnitMutationModalProps) => <InvokeFunctionsModal {...data} />,
  delete: (data: IUnitMutationModalProps) => <ConfirmationModal {...data} />,
  destroy: (data: IUnitMutationModalProps) => <ConfirmationModal {...data} />,
  upgrade: (data: IUnitMutationModalProps) => <ConfirmationModal {...data} />,
  clone: (data: IUnitMutationModalProps) => <CloneUnitsDrawer {...data} />,
  add: (data: IUnitMutationModalProps) => <AddUnitModal {...data} />,
  addTarget: (data: IUnitMutationModalProps) => (
    <AddTargetPage
      open={data.isOpen}
      onClose={data.onClose}
      onTargetAdded={() => data.refresh?.()}
    />
  ),
};

const engine = new Engine();

rules.forEach((rule) => {
  engine.addRule(rule);
});

export interface IUnitDetailModalComposerProps {
  type: ModalType;
  isOpen: {
    [key in ModalType]: boolean;
  };
  onClose: {
    [key in ModalType]: () => void;
  };
  // The input type should match the result of the onsubmit function in all modals...
  onSubmit: {
    [key in ModalType]?: (
      input?:
        | UnitRead
        | Array<UnitRead>
        | Record<string, string>
        | Array<FunctionInvocationsResponse>,
    ) => Promise<void>;
  };
  func?: FunctionSignature;
  modalTitleText?: {
    [key in ModalType]: string;
  };
  modalDescriptionText?: {
    [key in ModalType]: string;
  };
  unitsToEdit?: Array<UnitRead>;
  spaces?: Array<SpaceRead>;
  //   units?: Array<UnitRead>;
  //   spaces?: Array<SpaceRead>;
  //   func?: FunctionSignature;
  //   fromUnit?: UnitRead;
  //   toUnit?: UnitRead;
  refresh?: () => void;
  defaultToolchainType?: string;
  /** Invocation to pre-populate the form with (for edit & invoke flow) */
  invocationToEdit?: Invocation;
}

export const UnitDetailModalComposer = ({
  type,
  isOpen,
  onClose,
  onSubmit,
  func,
  modalDescriptionText,
  modalTitleText,
  unitsToEdit,
  spaces,
  refresh,
  defaultToolchainType,
  invocationToEdit,
}: IUnitDetailModalComposerProps) => {
  const [modalType, setModalType] = useState('');

  useEffect(() => {
    const evaluateModalType = async () => {
      const result = await engine.run({ type });
      const modalType = result?.events?.[0]?.type || '';
      if (modalType in UnitDetailModals) setModalType(modalType);
    };

    evaluateModalType();
  }, [type]);

  return (
    UnitDetailModals[modalType as keyof typeof UnitDetailModals]?.({
      onClose: onClose[modalType as ModalType],
      isOpen: isOpen[modalType as ModalType],
      func: func as FunctionSignature,
      onSubmit: onSubmit[modalType as ModalType],
      modalDescriptionText: modalDescriptionText?.[modalType as ModalType],
      modalTitleText: modalTitleText?.[modalType as ModalType],
      spaces,
      unitsToEdit,
      refresh,
      defaultToolchainType,
      invocationToEdit,
    }) || null
  );
};
