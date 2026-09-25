// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import {
  FunctionInvocationsResponse,
  FunctionSignature,
  Invocation,
  SpaceRead,
  UnitRead,
} from '@confighub/rtk-query';
import { Engine } from 'json-rules-engine';

import { UnitModals } from '../../../constants';
import rules, { ModalType } from '../../../rules';

const engine = new Engine();

rules.forEach((rule) => {
  engine.addRule(rule);
});

export interface UnitModalComposerProps {
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
        | Array<FunctionInvocationsResponse>
        | Record<string, string>
        | undefined,
    ) => void;
  };
  unitsToEdit?: Array<UnitRead>;
  units?: Array<UnitRead>;
  spaces?: Array<SpaceRead>;
  func?: FunctionSignature;
  fromUnit?: UnitRead;
  toUnit?: UnitRead;
  refresh?: () => void;
  defaultToolchainType?: string;
  defaultChangeSetId?: string;
  /** Invocation to pre-populate the invoke modal with (for edit & invoke flow) */
  invocationToEdit?: Invocation;
}

export const UnitModalComposer = ({
  type,
  isOpen,
  units,
  unitsToEdit,
  func,
  onClose,
  refresh,
  spaces,
  onSubmit,
  fromUnit,
  toUnit,
  defaultToolchainType,
  defaultChangeSetId,
  invocationToEdit,
}: UnitModalComposerProps) => {
  const [modalType, setModalType] = useState('');

  useEffect(() => {
    const evaluateModalType = async () => {
      const result = await engine.run({ type });
      const modalType = result?.events?.[0]?.type || '';
      if (modalType in UnitModals) setModalType(modalType);
    };

    evaluateModalType();
  }, [type]);

  return (
    UnitModals[modalType as keyof typeof UnitModals]?.({
      onClose: onClose[modalType as ModalType],
      isOpen: isOpen[modalType as ModalType],
      onSubmit: onSubmit[modalType as ModalType],
      units,
      unitsToEdit,
      func,
      refresh,
      spaces,
      fromUnit,
      toUnit,
      defaultToolchainType,
      defaultChangeSetId,
      invocationToEdit,
    }) || null
  );
};
