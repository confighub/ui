// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { BlameField } from '@confighub/rtk-query';

/**
 * The same field in one Unit's blame: by Ref, else by path and the resource's name without its
 * scope (a namespace differs between Variants).
 */
export function variantField(
  fields: readonly BlameField[] | undefined,
  field: Pick<BlameField, 'Ref' | 'Path' | 'ResourceType' | 'ResourceNameWithoutScope'>,
): BlameField | undefined {
  const all = fields ?? [];
  if (field.Ref) {
    const byRef = all.find((f) => f.Ref === field.Ref);
    if (byRef) return byRef;
  }
  return all.find(
    (f) =>
      f.Path === field.Path &&
      f.ResourceType === field.ResourceType &&
      (!field.ResourceNameWithoutScope || f.ResourceNameWithoutScope === field.ResourceNameWithoutScope),
  );
}
