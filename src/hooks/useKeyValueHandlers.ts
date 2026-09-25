// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { FieldValues, UseFormSetValue, UseFormWatch } from 'react-hook-form';

import {
  IAddLabelInput,
  PropertyType,
} from '@/components/forms/add-label-modal/AddLabelModal';

export const useKeyValueHandlers = <T extends FieldValues>(
  setValue: UseFormSetValue<T>,
  watch: UseFormWatch<T>,
) => {
  const onItemAdded = (item: IAddLabelInput, type: PropertyType) => {
    const fieldName = type;
    // @ts-expect-error TODO: Fix type error
    const currentValue = watch(fieldName) || {};

    // For DeleteGates and DestroyGates, convert value to boolean
    const isGateType = type === 'DeleteGates' || type === 'DestroyGates';
    const value = isGateType ? true : item.value;

    // @ts-expect-error TODO: Fix type error
    setValue(fieldName, { ...currentValue, [item.key]: value });
  };

  const onItemDeleted = (item: IAddLabelInput, type: PropertyType) => {
    const fieldName = type;
    // @ts-expect-error TODO: Fix type error
    const items = { ...watch(fieldName) };
    if (items && typeof items === 'object') {
      // @ts-expect-error TODO: Fix type error
      delete items[item.key];
      // @ts-expect-error TODO: Fix type error
      setValue(fieldName, items);
    }
  };

  const createTypeHandlers = (type: PropertyType) => ({
    onAdded: (item: IAddLabelInput) => onItemAdded(item, type),
    onDeleted: (item: IAddLabelInput) => onItemDeleted(item, type),
  });

  return {
    onItemAdded,
    onItemDeleted,
    labelHandlers: createTypeHandlers('Labels'),
    annotationHandlers: createTypeHandlers('Annotations'),
    deleteGateHandlers: createTypeHandlers('DeleteGates'),
    destroyGateHandlers: createTypeHandlers('DestroyGates'),
  };
};
