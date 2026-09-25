// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { dayjs } from './dayjs-setup';
import { isGoZeroTime } from './datetime-utils';

type DateInput = string | Date | null | undefined;

function isDisplayable(date: DateInput): date is string | Date {
  if (date == null) return false;
  if (isGoZeroTime(date)) return false;
  return true;
}

/**
 * Format a date as a relative string (e.g. "2 days ago", "in 1 hour").
 * Returns '' for null, undefined, or Go zero-time values.
 */
export function formatRelative(date: DateInput): string {
  if (!isDisplayable(date)) return '';
  const d = dayjs(date);
  if (!d.isValid()) return '';
  return d.fromNow();
}

/**
 * Format a date as an absolute string in "MMM D, YYYY [at] h:mm A" form.
 * Returns '' for null, undefined, or Go zero-time values.
 *
 * The format intentionally differs from DateTimeCell's `YYYY-MM-DD HH:mm:ss`:
 * grid cells use ISO for density and column-sort affinity, while this helper
 * targets prose contexts (dashboard labels, tooltips) where long-form reads
 * more naturally.
 */
export function formatAbsolute(date: DateInput): string {
  if (!isDisplayable(date)) return '';
  const d = dayjs(date);
  if (!d.isValid()) return '';
  return d.format('MMM D, YYYY [at] h:mm A');
}
