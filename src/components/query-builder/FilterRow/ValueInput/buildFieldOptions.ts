// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { FieldConfig, FilterFieldType } from '../../types';

interface NamedEntity {
  id: string;
  name: string;
}

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
  if (field === 'space') {
    return context.spaces.map((space) => ({
      value: space.id,
      label: space.name,
    }));
  }

  if (field === 'target') {
    return context.targets.map((target) => ({
      value: target.id,
      label: target.name,
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

  // Fields with predefined options (e.g., condition, providerType, event, disabled, validating)
  if (config.options) {
    return config.options.map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }

  return null;
};
