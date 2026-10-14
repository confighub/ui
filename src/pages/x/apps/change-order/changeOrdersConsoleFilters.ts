// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The ChangeOrders console's Update type and Created filters.
 *
 * Pure, so the rules are tested without a page.
 */

/** The UpdateType the server gives a ChangeOrder created without one. */
export const DEFAULT_UPDATE_TYPE = 'UpgradeUnit';

/** `ChangeOrder.UpdateType` as it takes effect: an absent one is the server's default. */
export function effectiveUpdateType(updateType: string | null | undefined): string {
  return updateType === undefined || updateType === null || updateType === '' ? DEFAULT_UPDATE_TYPE : updateType;
}

/** The start of a `YYYY-MM-DD` day in the viewer's time zone, or `undefined` for none. */
function startOfLocalDay(day: string): number | undefined {
  if (day === '') return undefined;
  const ms = new Date(`${day}T00:00:00`).getTime();
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Whether `createdAt` falls within `from` to `to`, both `YYYY-MM-DD` days in the
 * viewer's time zone and both inclusive, as `<input type="date">` gives them.
 * An empty bound is open. A ChangeOrder with no readable creation time matches
 * only when neither bound is set, since it cannot be shown to be in the range.
 */
export function createdWithin(createdAt: string | undefined, from: string, to: string): boolean {
  const start = startOfLocalDay(from);
  const toStart = startOfLocalDay(to);
  if (start === undefined && toStart === undefined) return true;
  const created = createdAt === undefined ? Number.NaN : Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  if (start !== undefined && created < start) return false;
  if (toStart !== undefined) {
    // The day after `to` begins, which DST can put 23 or 25 hours later.
    const end = new Date(toStart);
    end.setDate(end.getDate() + 1);
    if (created >= end.getTime()) return false;
  }
  return true;
}
