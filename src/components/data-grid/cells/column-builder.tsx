// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { IColumnDefinitions } from '@/types';
import { GridColDef, GridRenderCellParams, GridValidRowModel } from '@mui/x-data-grid';
import { BooleanCell } from './BooleanCell';
import { DateTimeCell } from './DateTimeCell';
import { LinkCell } from './LinkCell';
import { NumberCell } from './NumberCell';
import { NumericAggregateCell } from './NumericAggregateCell';
import { StringCell } from './StringCell';
import { UuidCell } from './UuidCell';

export function buildColumns<TRow extends GridValidRowModel>(
  definitions: IColumnDefinitions<TRow>,
  rows?: TRow[]
): GridColDef<TRow>[] {
  return Object.entries(definitions).map(([field, def]) => {
    const baseCol: Partial<GridColDef<TRow>> = {
      field,
      headerName: def.headerName,
      minWidth: def.minWidth,
      flex: def.flex,
      groupable: def.groupable ?? false,
    };

    switch (def.type) {
      case 'link':
        return {
          ...baseCol,
          valueGetter: (_, row) => (def.getText ? def.getText(row) : row[field as keyof TRow]),
          renderCell: (params: GridRenderCellParams<TRow>) => (
            <LinkCell params={params} linkTo={def.linkTo} getText={def.getText} />
          ),
        } as GridColDef<TRow>;

      case 'dateTime':
        return {
          ...baseCol,
          type: 'dateTime',
          valueGetter: def.valueGetter
            ? (_, row) => def.valueGetter!(row)
            : (_, row) => {
                const value = row[field as keyof TRow] as Date | string | null | undefined;
                return value ? new Date(value as string | Date) : null;
              },
          renderCell: (params: GridRenderCellParams<TRow>) => <DateTimeCell params={params} />,
        } as GridColDef<TRow>;

      case 'number':
        return {
          ...baseCol,
          type: 'number',
          headerAlign: 'left',
          valueGetter: def.valueGetter
            ? (_, row) => def.valueGetter!(row)
            : (_, row) => row[field as keyof TRow] as number,
          renderCell: (params: GridRenderCellParams<TRow>) => <NumberCell params={params} />,
        } as GridColDef<TRow>;

      case 'numericAggregate':
        if (!rows) {
          throw new Error(
            `numericAggregate column "${field}" requires rows parameter in buildColumns()`
          );
        }
        return {
          ...baseCol,
          type: 'number',
          headerAlign: 'left',
          valueGetter: (_, row) => def.valueGetter(row),
          renderCell: (params: GridRenderCellParams<TRow>) => (
            <NumericAggregateCell
              params={params}
              rows={rows}
              aggregateGetter={def.aggregateGetter}
            />
          ),
        } as GridColDef<TRow>;

      case 'string':
        return {
          ...baseCol,
          type: 'string',
          valueGetter: def.valueGetter
            ? (_, row) => def.valueGetter!(row)
            : (_, row) => row[field as keyof TRow] as string,
          renderCell: (params: GridRenderCellParams<TRow>) => <StringCell params={params} />,
        } as GridColDef<TRow>;

      case 'uuid':
        return {
          ...baseCol,
          type: 'string',
          valueGetter: def.valueGetter
            ? (_, row) => def.valueGetter!(row)
            : (_, row) => row[field as keyof TRow] as string,
          renderCell: (params: GridRenderCellParams<TRow>) => <UuidCell params={params} />,
        } as GridColDef<TRow>;

      case 'boolean':
        return {
          ...baseCol,
          type: 'boolean',
          valueGetter: def.valueGetter
            ? (_, row) => def.valueGetter!(row)
            : (_, row) => row[field as keyof TRow] as boolean | undefined | null,
          renderCell: (params: GridRenderCellParams<TRow>) => (
            <BooleanCell params={params} display={def.display} />
          ),
        } as GridColDef<TRow>;

      case 'custom':
        return {
          ...baseCol,
          valueGetter: def.valueGetter ? (_, row) => def.valueGetter!(row) : undefined,
          renderCell: def.renderCell,
        } as GridColDef<TRow>;
    }
  });
}
