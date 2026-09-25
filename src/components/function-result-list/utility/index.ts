// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { OUTPUT_TYPES, OutputType } from '../../../types';

export const canToggleView = (outputType: OutputType | null): boolean => {
  if (!outputType) return false;

  return [
    OUTPUT_TYPES.ATTRIBUTE_VALUE_LIST,
    OUTPUT_TYPES.RESOURCE_INFO_LIST,
    OUTPUT_TYPES.RESOURCE_LIST,
  ].includes(outputType as 'AttributeValueList' | 'ResourceInfoList' | 'ResourceList');
};

export const isCodeOnlyType = (outputType: OutputType | null): boolean => {
  if (!outputType) return true;
  return [OUTPUT_TYPES.OPAQUE, OUTPUT_TYPES.YAML, OUTPUT_TYPES.JSON].includes(
    outputType as 'Opaque' | 'YAML' | 'JSON',
  );
};