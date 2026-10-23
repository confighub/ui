// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SortIcon from '@mui/icons-material/Sort';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { type Theme, alpha } from '@mui/material/styles';

import type { EntityRow, FieldDef } from '../model/fields';
import { isDefaultSort, sameMatrixSort } from '../model/matrix-axes';
import { editTargetTabId } from '../model/reducer';
import type { EntityKind, LensSpec, MatrixAxes, StatusKind } from '../model/types';
import { useExplorerContext } from '../state/context';
import { newId } from '../state/initial';
import { useResults } from '../state/results-context';
import { groupValueText, stepLens } from '../table/groups';
import { labelKeysOf } from '../table/label-keys';
import {
  type AxisSort,
  type Tone,
  axisFields,
  buildMatrix,
  cellSummary,
  drillLenses,
  mixOf,
  nextTotalSort,
  presentStatusKeys,
  rowStatus,
  sortAxis,
  sortLabel,
  statusKeyOf,
  toneOf,
} from './matrix/matrix-model';

/**
 * The Matrix layout: one field down, another across, each cell the rows that
 * have both values, tinted by its most urgent status with a bar of the mix.
 * A cell drills in: it adds the two values as filters and goes to the Table.
 * A total asks for a peek at its row or column.
 */

// Narrow enough that a fleet's Targets, the empty column and the total fit at 1440 without scrolling sideways.
const CELL_WIDTH = 96;
const CELL_HEIGHT = 60;
/** Past this many columns or rows a matrix is not readable (or fast); the viewer is asked for another field. */
const MAX_COLUMNS = 120;
const MAX_ROWS = 200;

const toneMain = (theme: Theme, tone: Tone) =>
  tone === 'grey' ? theme.palette.grey[400] : theme.palette[tone].main;

function toneSx(tone: Tone) {
  if (tone === 'grey')
    return { bgcolor: 'grey.100', borderColor: 'divider', color: 'text.secondary' };
  return {
    bgcolor: `${tone}.light`,
    borderColor: (theme: Theme) => alpha(theme.palette[tone].main, 0.2),
    color: `${tone}.main`,
  };
}

function ValueLabel({ value }: { value: string }) {
  const text = groupValueText(value);
  return (
    <Box
      component='span'
      sx={{ fontStyle: text ? 'normal' : 'italic', color: text ? undefined : 'text.disabled' }}
    >
      {text || 'none'}
    </Box>
  );
}

interface AxisPickerProps {
  label: string;
  field: FieldDef | undefined;
  value: string;
  fields: readonly FieldDef[];
  onPick: (field: string) => void;
  testId: string;
}

function AxisPicker({ label, field, value, fields, onPick, testId }: AxisPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const fixed = fields.filter((f) => f.category === 'field' || f.category === 'computed');
  const labels = fields.filter((f) => f.category === 'label' || f.category === 'space-label');
  const item = (f: FieldDef) => (
    <MenuItem
      key={f.id}
      selected={f.id === value}
      onClick={() => {
        setAnchor(null);
        onPick(f.id);
      }}
    >
      {f.label}
    </MenuItem>
  );
  return (
    <>
      <Button
        size='small'
        color='inherit'
        endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup='menu'
        aria-label={`${label}: ${field?.label ?? value}`}
        data-testid={testId}
        sx={{
          fontWeight: 700,
          color: 'text.primary',
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          px: 1,
          minHeight: 26,
        }}
      >
        {field?.label ?? value}
      </Button>
      {/* Mounted only while open: closing unmounts it at once. A closing menu left to its exit animation can stay mounted (invisible) while the page re-renders, and then takes every click. */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open
          onClose={() => setAnchor(null)}
          MenuListProps={{ dense: true, 'aria-label': label }}
        >
          {fixed.map(item)}
          {labels.length > 0 && (
            <ListSubheader
              sx={{
                lineHeight: '28px',
                typography: 'caption',
                textTransform: 'uppercase',
                color: 'text.disabled',
              }}
            >
              Labels
            </ListSubheader>
          )}
          {labels.map(item)}
        </Menu>
      )}
    </>
  );
}

/** The axes with one axis's sort set; Name A→Z (the default) is stored as no sort. */
function withSort(
  matrix: MatrixAxes,
  axis: 'rows' | 'cols',
  sort: AxisSort | undefined,
): MatrixAxes {
  return { ...matrix, [axis === 'rows' ? 'rowSort' : 'colSort']: sort };
}

/** The axes swapped; each sort goes with its field. */
function swapAxes(matrix: MatrixAxes): MatrixAxes {
  return {
    rows: matrix.cols,
    cols: matrix.rows,
    rowSort: matrix.colSort,
    colSort: matrix.rowSort,
  };
}

interface SortPickerProps {
  entity: EntityKind;
  axis: 'rows' | 'cols';
  sort: AxisSort | undefined;
  statusKeys: readonly StatusKind[];
  onSort: (sort: AxisSort | undefined) => void;
}

/** "Sort: Total, most first ▾" beside an axis picker: every order the axis can take. */
function SortPicker({ entity, axis, sort, statusKeys, onSort }: SortPickerProps) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const options: AxisSort[] = [
    { key: 'name', dir: 'ASC' },
    { key: 'name', dir: 'DESC' },
    { key: 'total', dir: 'DESC' },
    { key: 'total', dir: 'ASC' },
    ...statusKeys.map((key): AxisSort => ({ key, dir: 'DESC' })),
  ];
  const noun = axis === 'rows' ? 'rows' : 'columns';
  return (
    <>
      <Button
        size='small'
        color='inherit'
        startIcon={<SortIcon sx={{ fontSize: 16 }} />}
        endIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup='menu'
        aria-label={`Sort ${noun}: ${sortLabel(entity, sort)}`}
        data-testid={`vx-matrix-${axis}-sort`}
        sx={{
          color: isDefaultSort(sort) ? 'text.secondary' : 'text.primary',
          fontWeight: isDefaultSort(sort) ? 500 : 700,
          px: 0.75,
          minHeight: 26,
          whiteSpace: 'nowrap',
        }}
      >
        {sortLabel(entity, sort)}
      </Button>
      {/* Mounted only while open: closing unmounts it at once. A closing menu left to its exit animation can stay mounted (invisible) while the page re-renders, and then takes every click. */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open
          onClose={() => setAnchor(null)}
          MenuListProps={{ dense: true, 'aria-label': `Sort ${noun}` }}
        >
          {options.map((o) => (
            <MenuItem
              key={`${o.key}:${o.dir}`}
              selected={sameMatrixSort(o, sort)}
              onClick={() => {
                setAnchor(null);
                onSort(o);
              }}
            >
              {sortLabel(entity, o)}
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}

const ariaSort = (sort: AxisSort | undefined) =>
  sort?.key === 'total' ? (sort.dir === 'DESC' ? 'descending' : 'ascending') : 'none';

export function MatrixLayout() {
  const { def, universe, derived } = useResults();
  const { dispatch, slots, toast, state } = useExplorerContext();
  const entity = def.entity;
  const { rows: rowField, cols: colField, rowSort, colSort } = def.matrix;

  const fields = useMemo(
    () => axisFields(entity, labelKeysOf(entity, universe.rows)),
    [entity, universe.rows],
  );
  const statusOf = useMemo(() => rowStatus(entity), [entity]);
  // A new axis is a new matrix: it starts at its top-left corner.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const matrix = useMemo(
    () => buildMatrix(entity, derived.rows, rowField, colField),
    [entity, derived.rows, rowField, colField],
  );
  const present = useMemo(
    () => mixOf(entity, derived.rows, statusOf),
    [entity, derived.rows, statusOf],
  );
  const statusKeys = useMemo(() => presentStatusKeys(entity, present), [entity, present]);
  // Sorted before the caps, so a long axis shows its first values in that order.
  const sortedRows = useMemo(
    () => (matrix ? sortAxis(entity, matrix.rows.groups, rowSort, statusOf) : []),
    [entity, matrix, rowSort, statusOf],
  );
  const sortedCols = useMemo(
    () => (matrix ? sortAxis(entity, matrix.cols.groups, colSort, statusOf) : []),
    [entity, matrix, colSort, statusOf],
  );

  const setSort = useCallback(
    (axis: 'rows' | 'cols', sort: AxisSort | undefined) => {
      dispatch({ type: 'setMatrixAxes', matrix: withSort(def.matrix, axis, sort) });
      scrollRef.current?.scrollTo({ left: 0, top: 0 });
    },
    [dispatch, def.matrix],
  );

  const setAxis = useCallback(
    (axis: 'rows' | 'cols', field: string) => {
      const other = axis === 'rows' ? colField : rowField;
      // Picking the other axis's field swaps the two, so the axes never match.
      const next = field === other ? swapAxes(def.matrix) : { ...def.matrix, [axis]: field };
      dispatch({ type: 'setMatrixAxes', matrix: next });
      scrollRef.current?.scrollTo({ left: 0, top: 0 });
    },
    [dispatch, def.matrix, rowField, colField],
  );

  const drill = useCallback(
    (rowValue: string, colValue: string) => {
      if (!matrix) return;
      const specs = [
        stepLens(entity, { field: matrix.rows.field.id, value: rowValue }),
        stepLens(entity, { field: matrix.cols.field.id, value: colValue }),
      ];
      // A cell is only offered when both its values can be written as a filter.
      if (specs.some((l) => l === null)) return;
      const lenses = drillLenses(def.lenses, specs as LensSpec[], () => newId('lens'));
      // The tab the drill lands on: this one, or the temporary tab a change to "All units" opens.
      const tabId = editTargetTabId(state);
      // One step: the toast's Undo and ⌘Z both take back the whole drill.
      dispatch({
        type: 'batch',
        actions: [
          {
            type: 'replaceFilter',
            lenses,
            resourceType: def.resourceType,
            whereData: def.whereData,
          },
          { type: 'setLayout', layout: 'table' },
        ],
      });
      const label = [rowValue, colValue].map((v) => groupValueText(v) || 'none').join(' × ');
      toast({
        message: `Showing ${label} in the table.`,
        severity: 'info',
        actionLabel: 'Undo',
        onAction: () => dispatch({ type: 'undo', tabId }),
      });
    },
    [matrix, entity, def.lenses, def.resourceType, def.whereData, dispatch, toast, state],
  );

  const peek = useCallback(
    (
      e: MouseEvent<HTMLElement>,
      field: FieldDef,
      value: string,
      rows: readonly EntityRow[],
    ) => {
      const lens = stepLens(entity, { field: field.id, value });
      slots.current.openPeek({
        anchorEl: e.currentTarget,
        title: `${field.label} ${groupValueText(value) || 'none'}`,
        lenses: lens ? [lens] : [],
        groupBy: [],
        rowIds: rows.map(derived.rowId),
      });
    },
    [entity, slots, derived.rowId],
  );

  const bar = (
    <Stack
      direction='row'
      alignItems='center'
      spacing={1}
      data-testid='vx-matrix-bar'
      // The bar is a size container: its end hint shows only when there is room for all of it.
      sx={{
        containerType: 'inline-size',
        px: 1.75,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.default',
        flexShrink: 0,
        minWidth: 0,
      }}
    >
      <Typography variant='body2' color='text.secondary' noWrap sx={{ flexShrink: 0 }}>
        Rows
      </Typography>
      <AxisPicker
        label='Rows'
        field={matrix?.rows.field}
        value={rowField}
        fields={fields}
        onPick={(f) => setAxis('rows', f)}
        testId='vx-matrix-rows'
      />
      <SortPicker
        entity={entity}
        axis='rows'
        sort={rowSort}
        statusKeys={statusKeys}
        onSort={(s) => setSort('rows', s)}
      />
      <Typography
        variant='body2'
        color='text.secondary'
        noWrap
        sx={{ flexShrink: 0, pl: 0.5 }}
      >
        Columns
      </Typography>
      <AxisPicker
        label='Columns'
        field={matrix?.cols.field}
        value={colField}
        fields={fields}
        onPick={(f) => setAxis('cols', f)}
        testId='vx-matrix-cols'
      />
      <SortPicker
        entity={entity}
        axis='cols'
        sort={colSort}
        statusKeys={statusKeys}
        onSort={(s) => setSort('cols', s)}
      />
      <Tooltip title='Swap rows and columns' enterDelay={400}>
        <IconButton
          size='small'
          aria-label='Swap rows and columns'
          data-testid='vx-matrix-swap'
          onClick={() => {
            dispatch({ type: 'setMatrixAxes', matrix: swapAxes(def.matrix) });
            scrollRef.current?.scrollTo({ left: 0, top: 0 });
          }}
        >
          <SwapHorizIcon fontSize='small' />
        </IconButton>
      </Tooltip>
      <Box sx={{ flex: 1 }} />
      <Stack
        direction='row'
        spacing={1.5}
        alignItems='center'
        data-testid='vx-matrix-legend'
        sx={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}
      >
        {present.map((p) => {
          const key = statusKeyOf(entity, p.status);
          const active = !!key && rowSort?.key === key && rowSort.dir === 'DESC';
          const swatch = (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: 0.5,
                bgcolor: (t: Theme) => toneMain(t, toneOf(entity, p.status)),
              }}
            />
          );
          if (!key) {
            return (
              <Stack
                key={p.status}
                direction='row'
                spacing={0.75}
                alignItems='center'
                data-status={p.status}
              >
                {swatch}
                <Typography variant='body2' color='text.secondary'>
                  {p.status}
                </Typography>
              </Stack>
            );
          }
          // A status in the legend sorts the rows by it, most first; again: back to names.
          return (
            <ButtonBase
              key={p.status}
              data-status={p.status}
              aria-pressed={active}
              aria-label={`${p.status}: sort rows, most first`}
              onClick={() => setSort('rows', active ? undefined : { key, dir: 'DESC' })}
              sx={{
                gap: 0.75,
                px: 0.75,
                height: 24,
                borderRadius: 1,
                fontSize: 12.5,
                fontWeight: active ? 700 : 400,
                color: active ? 'text.primary' : 'text.secondary',
                bgcolor: active ? 'grey.200' : 'grey.100',
                '&:hover': { bgcolor: 'grey.200', color: 'text.primary' },
                '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main' },
              }}
            >
              {swatch}
              {p.status}
            </ButtonBase>
          );
        })}
        <Typography
          variant='body2'
          color='text.disabled'
          noWrap
          sx={{ display: 'none', '@container (min-width: 1240px)': { display: 'block' } }}
        >
          · click a cell to drill in
        </Typography>
      </Stack>
    </Stack>
  );

  let body;
  if (!matrix) {
    body = (
      <Box sx={{ py: 8, textAlign: 'center' }} data-testid='vx-matrix-empty'>
        <Typography variant='h3'>Pick two fields for the axes</Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
          A matrix needs a field down the side and one across the top.
        </Typography>
      </Box>
    );
  } else if (derived.rows.length === 0) {
    body = (
      <Box sx={{ py: 8, textAlign: 'center' }} data-testid='vx-empty'>
        <Typography variant='h3'>Nothing matches</Typography>
        <Typography variant='body2' color='text.secondary' sx={{ mt: 0.5 }}>
          Turn off a filter, or press ⌘Z to undo the last change.
        </Typography>
      </Box>
    );
  } else {
    const { rows: ra, cols: ca, cells } = matrix;
    const shownRows = sortedRows.slice(0, MAX_ROWS);
    const shownCols = sortedCols.slice(0, MAX_COLUMNS);
    const clipped = [
      sortedRows.length > MAX_ROWS
        ? `the first ${MAX_ROWS} of ${sortedRows.length} ${ra.field.label} values`
        : '',
      sortedCols.length > MAX_COLUMNS
        ? `the first ${MAX_COLUMNS} of ${sortedCols.length} ${ca.field.label} values`
        : '',
    ].filter(Boolean);
    const totalHeader = (axis: 'rows' | 'cols') => {
      const sort = axis === 'rows' ? rowSort : colSort;
      const on = sort?.key === 'total';
      const Arrow = sort?.dir === 'ASC' ? ArrowUpwardIcon : ArrowDownwardIcon;
      return (
        <ButtonBase
          onClick={() => setSort(axis, nextTotalSort(sort))}
          aria-label={`Sort ${axis === 'rows' ? 'rows' : 'columns'} by total: ${on ? sortLabel(entity, sort) : 'off'}`}
          data-testid={`vx-matrix-${axis}-total-sort`}
          sx={{
            gap: 0.25,
            px: 0.5,
            borderRadius: 1,
            fontSize: 12,
            fontWeight: 700,
            color: on ? 'text.primary' : 'text.secondary',
            '& .vx-sort-hint': { opacity: 0.45 },
            '&:hover': {
              color: 'text.primary',
              bgcolor: 'grey.200',
              '& .vx-sort-hint': { opacity: 1 },
            },
            '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main' },
          }}
        >
          Total
          {on ? (
            <Arrow sx={{ fontSize: 13, color: 'primary.main' }} aria-hidden />
          ) : (
            <UnfoldMoreIcon className='vx-sort-hint' sx={{ fontSize: 13 }} aria-hidden />
          )}
        </ButtonBase>
      );
    };
    // Why a value cannot be drilled into, or null when it can.
    const blocked = (field: FieldDef, value: string) =>
      stepLens(entity, { field: field.id, value }) === null
        ? `No filter can say "${field.label} ${groupValueText(value) || 'none'}"`
        : null;
    const headCell = {
      position: 'sticky',
      top: 0,
      zIndex: 2,
      bgcolor: 'background.paper',
    } as const;
    const sideCell = {
      position: 'sticky',
      left: 0,
      zIndex: 1,
      bgcolor: 'background.paper',
    } as const;
    const total = (
      field: FieldDef,
      value: string,
      rows: readonly EntityRow[],
      testId: string,
    ) => (
      <ButtonBase
        onClick={(e) => peek(e, field, value, rows)}
        aria-label={`Peek at ${rows.length} in ${field.label} ${groupValueText(value) || 'none'}`}
        data-testid={testId}
        sx={{
          px: 1,
          height: 24,
          borderRadius: 'var(--r-pill)',
          fontWeight: 700,
          fontSize: 12.5,
          color: 'text.secondary',
          fontVariantNumeric: 'tabular-nums',
          '&:hover': { bgcolor: 'grey.200', color: 'text.primary' },
        }}
      >
        {rows.length}
      </ButtonBase>
    );
    body = (
      <Box
        ref={scrollRef}
        sx={{ flex: 1, minHeight: 0, overflow: 'auto', overscrollBehavior: 'contain' }}
        data-testid='vx-matrix'
      >
        {clipped.length > 0 && (
          <Typography
            variant='body2'
            color='text.secondary'
            sx={{ px: 1.75, pt: 1.25, position: 'sticky', left: 0 }}
            data-testid='vx-matrix-clipped'
          >
            Showing {clipped.join(' and ')}, in the order chosen. Pick a field with fewer
            values to see them all.
          </Typography>
        )}
        <Box
          component='table'
          aria-label={`${ra.field.label} by ${ca.field.label}`}
          sx={{
            borderCollapse: 'separate',
            borderSpacing: '4px',
            m: 1,
            '& th': { textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 700, p: '4px 6px' },
          }}
        >
          <thead>
            <tr>
              <Box component='th' sx={{ ...headCell, ...sideCell, zIndex: 3 }} />
              {shownCols.map((c) => (
                <Box
                  component='th'
                  key={c.value}
                  scope='col'
                  sx={{
                    ...headCell,
                    fontSize: 12,
                    color: 'text.secondary',
                    maxWidth: CELL_WIDTH,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={groupValueText(c.value)}
                >
                  <ValueLabel value={c.value} />
                </Box>
              ))}
              <Box
                component='th'
                scope='col'
                aria-sort={ariaSort(rowSort)}
                sx={{ ...headCell, textAlign: 'center !important' }}
              >
                {totalHeader('rows')}
              </Box>
            </tr>
          </thead>
          <tbody>
            {shownRows.map((r) => {
              const byCol = cells.get(r.value);
              return (
                <tr key={r.value} data-testid='vx-matrix-row' data-value={r.value}>
                  <Box
                    component='th'
                    scope='row'
                    sx={{
                      ...sideCell,
                      fontSize: 13,
                      color: 'text.primary',
                      pr: '14px !important',
                      maxWidth: 160,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={groupValueText(r.value)}
                  >
                    <ValueLabel value={r.value} />
                  </Box>
                  {shownCols.map((c) => {
                    const cellRows = byCol?.get(c.value) ?? [];
                    return (
                      <td key={c.value}>
                        <MatrixCell
                          entity={entity}
                          rows={cellRows}
                          statusOf={statusOf}
                          blockedBy={blocked(ra.field, r.value) ?? blocked(ca.field, c.value)}
                          focus={
                            rowSort && rowSort.key !== 'name' && rowSort.key !== 'total'
                              ? rowSort.key
                              : undefined
                          }
                          label={`${ra.field.label} ${groupValueText(r.value) || 'none'} × ${ca.field.label} ${groupValueText(c.value) || 'none'}`}
                          onClick={() => drill(r.value, c.value)}
                        />
                      </td>
                    );
                  })}
                  <Box component='td' sx={{ textAlign: 'center' }}>
                    {total(ra.field, r.value, r.rows, 'vx-matrix-row-total')}
                  </Box>
                </tr>
              );
            })}
            <tr>
              <Box
                component='th'
                scope='row'
                aria-sort={ariaSort(colSort)}
                sx={{ ...sideCell }}
              >
                {totalHeader('cols')}
              </Box>
              {shownCols.map((c) => (
                <Box component='td' key={c.value} sx={{ textAlign: 'center' }}>
                  {total(ca.field, c.value, c.rows, 'vx-matrix-col-total')}
                </Box>
              ))}
              <Box
                component='td'
                sx={{
                  textAlign: 'center',
                  fontWeight: 800,
                  fontSize: 12.5,
                  fontVariantNumeric: 'tabular-nums',
                }}
                data-testid='vx-matrix-total'
              >
                {derived.rows.length}
              </Box>
            </tr>
          </tbody>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', flexDirection: 'column' }}
      data-testid='vx-matrix-layout'
    >
      {bar}
      {body}
    </Box>
  );
}

interface CellProps {
  entity: EntityKind;
  rows: readonly EntityRow[];
  statusOf: (row: EntityRow) => string;
  label: string;
  /** Why this cell cannot be drilled into; it is then shown, not a button. */
  blockedBy: string | null;
  /** The status the rows are sorted by, which the summary line then counts. */
  focus?: StatusKind;
  onClick: () => void;
}

function MatrixCell({ entity, rows, statusOf, label, blockedBy, focus, onClick }: CellProps) {
  if (rows.length === 0) {
    return (
      <Box
        aria-hidden
        sx={{
          width: CELL_WIDTH,
          height: CELL_HEIGHT,
          borderRadius: 2,
          border: 1,
          borderStyle: 'dashed',
          borderColor: 'grey.200',
          display: 'grid',
          placeItems: 'center',
          color: 'grey.300',
        }}
      >
        ·
      </Box>
    );
  }
  const mix = mixOf(entity, rows, statusOf);
  const tone = toneOf(entity, mix[0]?.status ?? '');
  const content = (
    <>
      <Box
        component='span'
        sx={{
          fontSize: 18,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
        }}
        data-testid='vx-matrix-count'
      >
        {rows.length}
      </Box>
      <Box
        component='span'
        sx={{
          fontSize: 10.5,
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {cellSummary(entity, mix, focus)}
      </Box>
      <Box
        component='span'
        sx={{ display: 'flex', height: 4, borderRadius: 0.5, overflow: 'hidden', gap: '1px' }}
        aria-hidden
      >
        {mix.map((m) => (
          <Box
            key={m.status}
            component='span'
            sx={{
              flex: m.count,
              bgcolor: (t: Theme) => toneMain(t, toneOf(entity, m.status)),
            }}
          />
        ))}
      </Box>
    </>
  );
  const shape = {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    borderRadius: 2,
    border: 1,
    ...toneSx(tone),
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    px: 1,
    py: 0.875,
    textAlign: 'left',
  } as const;
  if (blockedBy) {
    return (
      <Tooltip title={`${blockedBy}, so this cell cannot open in the table.`} enterDelay={400}>
        <Box
          data-testid='vx-matrix-cell'
          data-drill='false'
          data-tone={tone}
          aria-label={`${label}: ${rows.length}`}
          role='group'
          sx={{ ...shape, cursor: 'default' }}
        >
          {content}
        </Box>
      </Tooltip>
    );
  }
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={`Drill in: ${label}, ${rows.length}`}
      data-testid='vx-matrix-cell'
      data-drill='true'
      data-tone={tone}
      sx={{
        ...shape,
        transition: 'transform 180ms, box-shadow 180ms',
        '&:hover': { transform: 'translateY(-2px)', boxShadow: 3 },
        '&.Mui-focusVisible': { outline: 2, outlineColor: 'primary.main', outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': {
          transition: 'none',
          '&:hover': { transform: 'none' },
        },
      }}
    >
      {content}
    </ButtonBase>
  );
}
