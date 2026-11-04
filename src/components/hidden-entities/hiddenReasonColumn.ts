// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { GridColDef, GridValidRowModel } from '@mui/x-data-grid';

/** The grid column's field, which column-visibility models name. */
export const HIDDEN_REASON_FIELD = 'HiddenReason';

/**
 * The Hidden reason column of an entity grid. It is hidden by default: an entity has a
 * HiddenReason only when it is hidden, and a list shows hidden entities only on request.
 */
export function hiddenReasonColumn<Row extends GridValidRowModel>(
  hiddenReason: (row: Row) => string | null | undefined,
): GridColDef<Row> {
  return {
    field: HIDDEN_REASON_FIELD,
    headerName: 'Hidden reason',
    minWidth: 140,
    flex: 0.5,
    valueGetter: (_value, row) => hiddenReason(row) ?? '',
  };
}
