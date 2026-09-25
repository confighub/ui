// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

export const isGoZeroTime = (date: string | Date | null | undefined): boolean => {
  if (!date) return true;

  if (date instanceof Date) {
    return date.getFullYear() <= 1;
  }

  return date.startsWith('0001-') || date.startsWith('0000-');
};

export const getDateWithFallback = (
  primaryDate: string | null | undefined,
  fallbackDate: string | null | undefined,
): Date | null => {
  const dateToUse = isGoZeroTime(primaryDate) ? fallbackDate : primaryDate;
  return dateToUse ? new Date(dateToUse) : null;
};
