// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { SxProps, Theme } from '@mui/material/styles';

import type { Permissions } from '@confighub/rtk-query';

import { consoleTokens as T } from '@/pages/change-orders/consoleStyle';
import { isGoZeroTime } from '@/utility/datetime-utils';

/** A time the server sent, unless it is missing or Go's zero time, which the API uses for "never". */
export function isSetTime(value: string | undefined): value is string {
  return value !== undefined && value !== '' && !isGoZeroTime(value) && !Number.isNaN(Date.parse(value));
}

/** Epoch milliseconds of a set time, or undefined. */
export function timeOf(value: string | undefined): number | undefined {
  return isSetTime(value) ? Date.parse(value) : undefined;
}

export interface DetailColumn {
  label: string;
  /** A CSS grid track, such as `minmax(140px, 1fr)` or `90px`. */
  width: string;
  align?: 'right';
}

export function detailGrid(columns: readonly DetailColumn[]): SxProps<Theme> {
  return {
    display: 'grid',
    alignItems: 'center',
    gap: '0 12px',
    padding: '0 12px',
    gridTemplateColumns: columns.map((column) => column.width).join(' '),
  };
}

/** The page shell both consoles sit in: the canvas, its padding, and the organization row. */
export const CONSOLE_PAGE_SX = {
  padding: '20px 22px',
  background: '#f4f5f7',
  minHeight: '100%',
  // A flex item of the page shell's row: without `flex: 1` it shrinks to its content.
  flex: 1,
  fontFamily: T.sans,
  lineHeight: T.lh,
  color: T.ink,
  fontSize: 12.5,
} as const;

/** Every User and Group a Permissions map names, for resolving them in one read. */
export function permissionSubjects(permissions: Permissions | undefined): { userIds: string[]; groupIds: string[] } {
  const userIds = new Set<string>();
  const groupIds = new Set<string>();
  for (const subjects of Object.values(permissions ?? {})) {
    for (const [id, on] of Object.entries(subjects.UserIDs ?? {})) if (on) userIds.add(id);
    for (const [id, on] of Object.entries(subjects.GroupIDs ?? {})) if (on) groupIds.add(id);
  }
  return { userIds: [...userIds], groupIds: [...groupIds] };
}

/** The server's rule for DisplayName, which @confighub/api does not export. */
export const DISPLAY_NAME_RULE = {
  pattern: {
    value: /^[A-Za-z0-9]([-_ .|A-Za-z0-9]*[A-Za-z0-9.!?])?$/,
    message: 'Letters, digits, spaces and - _ . |, starting with a letter or digit',
  },
};
