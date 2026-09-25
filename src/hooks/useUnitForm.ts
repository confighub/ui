// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import {
  IAddLabelInput,
  PropertyType,
} from '@/components/forms/add-label-modal/AddLabelModal';
import { TargetRead, Unit } from '@confighub/rtk-query';
import { useListAllTargetsQuery } from '@confighub/rtk-query';
import { TOOLCHAIN_ANY } from '@/utility/constants';
import { SelectChangeEvent } from '@mui/material/Select';

type UnitFormData = Unit;

interface UseUnitFormProps {
  defaultValues?: Partial<UnitFormData>;
  isImportUnit?: boolean;
  mode?: 'onSubmit' | 'onBlur' | 'onChange' | 'onTouched' | 'all';
}

export const useUnitForm = ({
  defaultValues,
  isImportUnit = false,
  mode,
}: UseUnitFormProps = {}) => {
  const baseDefaults = {
    Slug: '',
    Labels: {},
    Annotations: {},
    SpaceID: '',
    TargetID: '',
    ToolchainType: 'Kubernetes/YAML',
  };

  const importDefaults = isImportUnit
    ? {
      Where: '',
      URL: '',
    }
    : {};

  const finalDefaults: UnitFormData = {
    ...baseDefaults,
    ...importDefaults,
    ...defaultValues,
  };
  const [selectedSpaceID, setSelectedSpaceID] = useState<string>(finalDefaults.SpaceID ?? '');
  const [selectedToolchainType, setSelectedToolchainType] = useState<string>(finalDefaults.ToolchainType);
  const [labelModalIsOpen, setLabelModalIsOpen] = useState(false);
  const [isAddAnnotationsModalOpen, setIsAddAnnotationsModalOpen] = useState(false);

  const [unitData, setUnitData] = useState<UnitFormData>(finalDefaults as UnitFormData);

  const form = useForm<UnitFormData>({
    defaultValues: finalDefaults as UnitFormData,
    mode,
  });

  const formToolchainType = form.watch('ToolchainType');

  const { targets = [] } = useListAllTargetsQuery(
    {
      where: `ToolchainType IN ('${formToolchainType}', '${TOOLCHAIN_ANY}')`,
    },
    {
      skip: !formToolchainType,
      selectFromResult: ({ data }) => ({
        targets:
          data?.map((et) => et.Target).filter((t): t is TargetRead => t !== undefined) || [],
      }),
    }
  );

  const onLabelAdded = (label: IAddLabelInput, type: PropertyType = 'Labels') => {
    // @ts-expect-error TODO:
    form.setValue(type, { ...form.watch(type), [label.key]: label.value });
  };

  const onLabelDeleted = (label: IAddLabelInput, type: PropertyType = 'Labels') => {
    const labels = form.watch(type);
    if (labels) {
      delete labels[label.key];
      form.setValue(type, labels);
    }
  };

  const onSpaceSelected = (event: SelectChangeEvent<string>) => {
    const {
      target: { value },
    } = event;
    setSelectedSpaceID(value);
    form.setValue('SpaceID', value, { shouldValidate: true });
  };

  const onToolchainTypeSelected = (event: SelectChangeEvent<string>) => {
    const { target: { value } } = event;
    setSelectedToolchainType(value);
    form.setValue('ToolchainType', value, { shouldValidate: true });
  };

  const resetForm = () => {
    form.reset(finalDefaults as UnitFormData);
    setSelectedSpaceID(finalDefaults.SpaceID ?? '');
    setSelectedToolchainType(finalDefaults.ToolchainType);
    setUnitData(finalDefaults as UnitFormData);
  };

  return {
    form,
    targets,
    selectedSpaceID,
    selectedToolchainType,
    labelModalIsOpen,
    setLabelModalIsOpen,
    isAddAnnotationsModalOpen,
    setIsAddAnnotationsModalOpen,
    unitData,
    setUnitData,
    onLabelAdded,
    onLabelDeleted,
    onSpaceSelected,
    onToolchainTypeSelected,
    resetForm,
  };
};
