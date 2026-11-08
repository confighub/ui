// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The Link fields the drawer shows rather than edits: the bindings resolution found, and a
// TransformPaths Link's getter and setter functions.
import { ReactNode } from 'react';

import { detailsMono } from '@/components/details-drawer/detailsFormat';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';

export function ListTable({
  columns,
  rows,
  testId,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
  testId?: string;
}) {
  return (
    <Table size='small' data-testid={testId}>
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableCell key={column}>{column}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={i}>
            {row.map((cell, j) => (
              <TableCell key={j} sx={detailsMono}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
