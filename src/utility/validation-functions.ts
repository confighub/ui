// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const isIDInvalid = (ID: string | null | undefined) => {
  const zeroGuid = /^0{8}-0{4}-0{4}-0{4}-0{12}$/;
  return !ID || zeroGuid.test(ID);
};

export const hasValue = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';
