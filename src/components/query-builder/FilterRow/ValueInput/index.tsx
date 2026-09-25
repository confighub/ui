// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { isMultiSelectConfig } from '../../operators';
import type { FieldConfig, FilterCondition } from '../../types';

import { DateInput } from './DateInput';
import { LabelKeyValueInput } from './LabelKeyValueInput';
import { MultiSelectInput } from './MultiSelectInput';
import { NumberInput } from './NumberInput';
import { SelectInput } from './SelectInput';
import { TextInput } from './TextInput';

export { DateInput } from './DateInput';
export { LabelKeyValueInput } from './LabelKeyValueInput';
export { MultiSelectInput } from './MultiSelectInput';
export { NumberInput } from './NumberInput';
export { SelectInput } from './SelectInput';
export { TextInput } from './TextInput';

interface ValueInputProps {
  condition: FilterCondition;
  config: FieldConfig;
  onUpdate: (condition: FilterCondition) => void;
  onRemove: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  focusTrigger?: number;
}

/**
 * Routes to the appropriate value input component based on field config
 */
export const ValueInput = ({
  condition,
  config,
  onUpdate,
  onRemove,
  disabled = false,
  autoFocus = false,
  focusTrigger = 0,
}: ValueInputProps) => {
  const handleValueChange = (value: string) => {
    onUpdate({ ...condition, value });
  };

  // For string operators (contains/startsWith/endsWith), use TextInput even on multi-select fields
  const isStringOperator = condition.operator === 'contains' ||
    condition.operator === 'startsWith' || condition.operator === 'endsWith';

  // Route to MultiSelectInput for fields that support both single and multi-select
  if (isMultiSelectConfig(config) && !isStringOperator) {
    return (
      <MultiSelectInput
        field={condition.field}
        config={config}
        value={condition.value}
        condition={condition}
        onUpdate={onUpdate}
        onRemove={onRemove}
        disabled={disabled}
        autoFocus={autoFocus}
        focusTrigger={focusTrigger}
      />
    );
  }

  // For string operators on select fields, use TextInput for freeform entry
  if (isStringOperator) {
    return (
      <TextInput
        config={config}
        value={condition.value}
        onChange={handleValueChange}
        onRemove={onRemove}
        disabled={disabled}
        autoFocus={autoFocus}
        focusTrigger={focusTrigger}
      />
    );
  }

  switch (config.valueType) {
    case 'select':
      return (
        <SelectInput
          field={condition.field}
          config={config}
          value={condition.value}
          onChange={handleValueChange}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      );

    case 'date':
      return (
        <DateInput
          value={condition.value}
          onChange={handleValueChange}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      );

    case 'number':
      return (
        <NumberInput
          config={config}
          value={condition.value}
          onChange={handleValueChange}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      );

    case 'labelKeyValue':
      return (
        <LabelKeyValueInput
          condition={condition}
          onUpdate={onUpdate}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      );

    case 'raw':
      return (
        <TextInput
          config={config}
          value={condition.value}
          onChange={handleValueChange}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
          minWidth={180}
        />
      );

    case 'text':
    default:
      return (
        <TextInput
          config={config}
          value={condition.value}
          onChange={handleValueChange}
          onRemove={onRemove}
          disabled={disabled}
          autoFocus={autoFocus}
          focusTrigger={focusTrigger}
        />
      );
  }
};
