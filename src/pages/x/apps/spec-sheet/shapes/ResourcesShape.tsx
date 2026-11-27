// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's resources: a grid with one column per resource (cpu, memory, then any
// other in document order) and one row each for requests and limits, numbers right-aligned.
// Each value is placed in its cell by the grid, so the drawn order stays the document order.
import { memo } from 'react';

import { FieldValue } from '../FieldValue';
import { type ShapeProps, inContainer, joinSegs } from './shapeKit';
import { Dotted } from '../Dotted';

const ROW_ORDER: Record<string, number> = { requests: 0, limits: 1 };

export const ResourcesShape = memo(function ResourcesShape({ block }: ShapeProps) {
  const cells = block.atoms.map((atom) => {
    const s = inContainer(atom).slice(1);
    const isCell =
      s.length === 2 && (s[0] === 'requests' || s[0] === 'limits') && !atom.emptyContainer;
    return { atom, row: isCell ? String(s[0]) : '', col: isCell ? String(s[1]) : '', rel: s };
  });
  const seen = [...new Set(cells.filter((c) => c.col).map((c) => c.col))];
  const columns = [
    ...['cpu', 'memory'].filter((c) => seen.includes(c)),
    ...seen.filter((c) => c !== 'cpu' && c !== 'memory'),
  ];
  // `resources: {}`: the value alone.
  if (columns.length === 0) {
    return (
      <div className='kv'>
        {cells.map(({ atom, rel }) =>
          rel.length === 0 ? (
            <FieldValue key={atom.key} atom={atom} />
          ) : (
            <div className='kvr' key={atom.key}>
              <span className='k'><Dotted>{joinSegs(rel)}</Dotted></span>
              <FieldValue atom={atom} lines={2} />
            </div>
          ),
        )}
      </div>
    );
  }
  // Consecutive cells of one row (requests or limits) are one grid row.
  const rows: { row: string; cells: typeof cells }[] = [];
  for (const cell of cells) {
    const last = rows[rows.length - 1];
    if (cell.row && last && last.row === cell.row) last.cells.push(cell);
    else rows.push({ row: cell.row, cells: [cell] });
  }
  return (
    <div
      className='grid rgrid'
      style={{ gridTemplateColumns: `max-content repeat(${columns.length}, max-content)` }}
    >
      {columns.map((c, i) => (
        <span className='h num' key={c} style={{ gridRow: 1, gridColumn: i + 2 }}>
          {c}
        </span>
      ))}
      {rows.map(({ row, cells: rowCells }) => {
        if (!row) {
          const { atom, rel } = rowCells[0];
          return (
            <div className='srow' key={atom.key} style={{ order: 2 }}>
              <span className='pair c2span'>
                <span className='k'><Dotted>{joinSegs(rel)}</Dotted></span>
                <FieldValue atom={atom} lines={2} />
              </span>
            </div>
          );
        }
        const present = new Set(rowCells.map((c) => c.col));
        return (
          <div className='srow' key={rowCells[0].atom.key} style={{ order: ROW_ORDER[row] }}>
            <span className='rl' style={{ gridColumn: 1, gridRow: 1 }}>
              {row}
            </span>
            {rowCells.map(({ atom, col }) => (
              <span
                className='num'
                key={atom.key}
                style={{ gridColumn: columns.indexOf(col) + 2, gridRow: 1 }}
              >
                <FieldValue atom={atom} />
              </span>
            ))}
            {columns
              .filter((c) => !present.has(c))
              .map((c) => (
                <span
                  className='num none'
                  key={`none-${c}`}
                  style={{ gridColumn: columns.indexOf(c) + 2, gridRow: 1 }}
                >
                  –
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
});
