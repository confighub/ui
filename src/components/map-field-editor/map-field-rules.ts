// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The layout and the server's rules shared by the forms that edit a map field as rows: the form
// of one entity (MapFieldSection) and the bulk edit of many.
import {
  ANNOTATION_KEY_MAX_LENGTH,
  ANNOTATION_KEY_PATTERN,
  ANNOTATION_KEY_PATTERN_MESSAGE,
  ANNOTATION_VALUE_MAX_LENGTH,
  LABEL_KEY_MAX_LENGTH,
  LABEL_KEY_PATTERN,
  LABEL_KEY_PATTERN_MESSAGE,
  LABEL_VALUE_MAX_LENGTH,
  LABEL_VALUE_PATTERN,
  LABEL_VALUE_PATTERN_MESSAGE,
} from '@confighub/api';

// The key column holds keys such as `Cluster.NamespaceScopedResourceTypes` without truncating
// them, and gives the rest of the row to the value, which wraps rather than being cut off.
export const KEY_FIELD_SX = { flex: '0 1 34%', minWidth: 160 } as const;
// The theme pads both a multiline field and its textarea, which would set a value further in
// than its key.
export const VALUE_FIELD_SX = {
  flex: '1 1 240px',
  minWidth: 180,
  '& .MuiInputBase-inputMultiline': { px: 0 },
} as const;

/**
 * The server's rules for the entries of a map, so a bad entry is marked before Save. Gate keys
 * follow the label key rules.
 */
export type MapFieldValidation = 'label' | 'annotation';

const KEY_RULES = {
  label: {
    maxLength: LABEL_KEY_MAX_LENGTH,
    pattern: LABEL_KEY_PATTERN,
    message: LABEL_KEY_PATTERN_MESSAGE,
  },
  annotation: {
    maxLength: ANNOTATION_KEY_MAX_LENGTH,
    pattern: ANNOTATION_KEY_PATTERN,
    message: ANNOTATION_KEY_PATTERN_MESSAGE,
  },
} as const;

export const checkKey = (key: string, validation?: MapFieldValidation): string | true => {
  if (!validation) return true;
  const rules = KEY_RULES[validation];
  if (key.length > rules.maxLength) return `Key must be ${rules.maxLength} characters or less`;
  return rules.pattern.test(key) || rules.message;
};

export const checkValue = (value: string, validation?: MapFieldValidation): string | true => {
  if (validation === 'label') {
    if (!value) return 'Value is required';
    if (value.length > LABEL_VALUE_MAX_LENGTH) {
      return `Value must be ${LABEL_VALUE_MAX_LENGTH} characters or less`;
    }
    return LABEL_VALUE_PATTERN.test(value) || LABEL_VALUE_PATTERN_MESSAGE;
  }
  if (validation === 'annotation' && value.length > ANNOTATION_VALUE_MAX_LENGTH) {
    return `Value must be ${ANNOTATION_VALUE_MAX_LENGTH} characters or less`;
  }
  return true;
};
