// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { getEntityOptionsForField } from '../../operators';
import type { FieldConfig, FieldOptions, FilterFieldType, NamedEntity } from '../../types';

interface SlugOption {
  slug: string;
  spaceName: string;
}

export interface FieldOption {
  value: string;
  label: string;
  group?: string;
}

interface FieldOptionContext {
  spaces: NamedEntity[];
  targets: NamedEntity[];
  toolchainTypes: string[];
  resourceTypes: string[];
  fieldOptions?: FieldOptions;
  slugs?: SlugOption[];
}

/**
 * Build options for the common filter fields shared between SelectInput and MultiSelectInput.
 * Returns null if the field is not a common field (caller handles field-specific cases).
 */
export const buildCommonFieldOptions = (
  field: FilterFieldType,
  config: FieldConfig,
  context: FieldOptionContext,
): FieldOption[] | null => {
  const entities = getEntityOptionsForField(field, context);
  if (entities) {
    return entities.map((entity) => ({
      value: entity.id,
      label: entity.name,
      group: entity.group,
    }));
  }

  if (field === 'toolchainType') {
    return context.toolchainTypes.map((type) => ({
      value: type,
      label: type,
    }));
  }

  if (field === 'resourceType' && context.resourceTypes.length > 0) {
    return [
      { value: '*', label: 'All (*)' },
      ...context.resourceTypes.map((rt) => ({ value: rt, label: rt })),
    ];
  }

  // Fields with predefined options (e.g., condition, event, disabled, validating)
  if (config.options) {
    return config.options.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }

  return null;
};
