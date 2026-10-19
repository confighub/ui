// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import type { MapRow } from '@/components/map-field-editor/map-rows';
import { TargetRead, Unit } from '@confighub/rtk-query';
import { useListAllTargetsQuery } from '@confighub/rtk-query';
import { SelectChangeEvent } from '@mui/material/Select';

// The form edits the Unit's maps as rows, so an entry can be changed in place.
export type UnitFormData = Omit<Unit, 'Labels' | 'Annotations' | 'DeleteGates' | 'DestroyGates'> & {
  Labels: MapRow[];
  Annotations: MapRow[];
  DeleteGates: MapRow[];
  DestroyGates: MapRow[];
};

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
    Labels: [],
    Annotations: [],
    DeleteGates: [],
    DestroyGates: [],
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

  const [unitData, setUnitData] = useState<UnitFormData>(finalDefaults as UnitFormData);

  const form = useForm<UnitFormData>({
    defaultValues: finalDefaults as UnitFormData,
    mode,
  });

  const { targets = [] } = useListAllTargetsQuery(
    {},
    {
      selectFromResult: ({ data }) => ({
        targets:
          data?.map((et) => et.Target).filter((t): t is TargetRead => t !== undefined) || [],
      }),
    }
  );

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
    unitData,
    setUnitData,
    onSpaceSelected,
    onToolchainTypeSelected,
    resetForm,
  };
};
