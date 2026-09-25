// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { DateTimeColumnMenu } from './DateTimeCell';

/**
 * Spread into a DataGrid's `slots` prop on any grid that has `type: 'dateTime'`
 * columns. Wires the column menu so users get the "Show absolute datetime"
 * toggle. Pairs with the `DateTimeCell` renderer that `buildColumns` applies
 * to `type: 'dateTime'` columns.
 */
export const DATE_TIME_GRID_SLOTS = { columnMenu: DateTimeColumnMenu } as const;
