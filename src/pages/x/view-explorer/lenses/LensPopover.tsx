// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useState } from 'react';

import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Checkbox from '@mui/material/Checkbox';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import InputBase from '@mui/material/InputBase';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popper from '@mui/material/Popper';
import Radio from '@mui/material/Radio';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import { pushEscLayer } from '../keys/usePageShortcuts';
import { liveCountsOffText } from '../model/counts';
import {
  type FieldDef,
  STATUS_LABEL,
  fieldById,
  fieldCatalog,
  statusesFor,
} from '../model/fields';
import { lensConjuncts, lensProblem } from '../model/lens-compile';
import type { FieldLens, FieldOp, Lens, StatusKind, StatusLens } from '../model/types';
import { inLensLayer, lensLayerProps } from './layer';
import type { LensData } from './useLensData';

/**
 * The editor of one lens, beside the column: field, comparison, and the values
 * with how many rows each would keep (counted against the other lenses). Each
 * click applies at once; there is no Apply button. A Custom WHERE lens has no
 * popover: it opens in text mode.
 */

const OP_LABEL: Record<FieldOp, string> = {
  is: 'is',
  isNot: 'is not',
  matches: 'matches',
  empty: 'is empty',
  notEmpty: 'is set',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
};

/** Operators that take a list of values from the catalog. */
const LIST_OPS: readonly FieldOp[] = ['is', 'isNot'];

const MAX_VALUES = 200;

interface LensPopoverProps {
  anchor: HTMLElement | null;
  lens: Lens | undefined;
  data: LensData;
  onChange: (lens: Lens) => void;
  onRemove: (lensId: string) => void;
  onClose: () => void;
}

export function LensPopover({
  anchor,
  lens,
  data,
  onChange,
  onRemove,
  onClose,
}: LensPopoverProps) {
  const open = !!anchor && !!lens && lens.kind !== 'custom';

  // Esc closes this layer first. The popover is a layer outside React's tree
  // of the page keyboard, so it registers while it is open.
  useEffect(() => (open ? pushEscLayer(onClose) : undefined), [open, onClose]);

  if (!open || !lens) return null;
  return (
    <Popper
      open
      anchorEl={anchor}
      placement='right-start'
      modifiers={[{ name: 'offset', options: { offset: [-6, 10] } }]}
      sx={{ zIndex: (t) => t.zIndex.modal }}
      {...lensLayerProps}
    >
      <ClickAwayListener
        // Closes on a press outside, not a click: the field menu opens under the
        // pointer on mousedown, so that click ends on <body>, which looks outside.
        mouseEvent='onMouseDown'
        onClickAway={(e) => {
          if (anchor.contains(e.target as Node) || inLensLayer(e.target)) return;
          onClose();
        }}
      >
        <Paper
          elevation={4}
          sx={{ width: 300, border: 1, borderColor: 'divider' }}
          data-testid='vx-lens-popover'
        >
          {lens.kind === 'status' ? (
            <StatusEditor lens={lens} data={data} onChange={onChange} />
          ) : (
            <FieldEditor key={lens.id} lens={lens} data={data} onChange={onChange} />
          )}
          <Stack
            direction='row'
            alignItems='center'
            spacing={1}
            sx={{ borderTop: 1, borderColor: 'divider', px: 1.25, py: 0.875 }}
          >
            <WhereLine lens={lens} data={data} />
            <Button
              size='small'
              color='error'
              onClick={() => onRemove(lens.id)}
              data-testid='vx-lens-popover-remove'
            >
              Remove
            </Button>
          </Stack>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}

function WhereLine({ lens, data }: { lens: Lens; data: LensData }) {
  const conj = lensConjuncts(data.entity, lens);
  const problem = lensProblem(data.entity, lens);
  const text = conj ? `WHERE ${conj.join(' AND ')}` : (problem?.message ?? '');
  return (
    <Typography
      noWrap
      title={text}
      data-testid='vx-lens-where'
      sx={{
        flex: 1,
        minWidth: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: conj ? 'text.secondary' : 'warning.main',
      }}
    >
      {text}
    </Typography>
  );
}

interface ValueRowProps {
  /** One choice of several (a status), or one of many to tick (field values). */
  single?: boolean;
  label: string;
  count: number | null;
  /** Why the count shows "—" (live counts are off for a big view). */
  countTitle?: string;
  max: number;
  checked: boolean;
  onClick: () => void;
}

function ValueRow({ single, label, count, countTitle, max, checked, onClick }: ValueRowProps) {
  return (
    <ButtonBase
      onClick={onClick}
      role={single ? 'radio' : 'checkbox'}
      aria-checked={checked}
      aria-label={label}
      data-testid='vx-lens-value'
      sx={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        height: 30,
        px: 0.75,
        borderRadius: 0.75,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {single ? (
        <Radio
          size='small'
          checked={checked}
          tabIndex={-1}
          disableRipple
          sx={{ p: 0, '& svg': { fontSize: 18 } }}
        />
      ) : (
        <Checkbox
          size='small'
          checked={checked}
          tabIndex={-1}
          disableRipple
          sx={{ p: 0, '& svg': { fontSize: 18 } }}
        />
      )}
      <Typography noWrap sx={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 13 }}>
        {label}
      </Typography>
      {/* Without live counts there is no bar to draw: only the "—". */}
      <Box
        sx={{
          display: count === null ? 'none' : 'block',
          width: 40,
          height: 4,
          borderRadius: 2,
          bgcolor: 'action.hover',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            height: '100%',
            width: `${count === null ? 0 : (count / Math.max(1, max)) * 100}%`,
            bgcolor: checked ? 'primary.main' : 'text.disabled',
            opacity: checked ? 1 : 0.45,
            transition: 'width .3s',
          }}
        />
      </Box>
      <Typography
        title={count === null ? countTitle : undefined}
        sx={{
          width: 26,
          textAlign: 'right',
          fontSize: 12,
          color: 'text.disabled',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {count ?? '—'}
      </Typography>
    </ButtonBase>
  );
}

function StatusEditor({
  lens,
  data,
  onChange,
}: {
  lens: StatusLens;
  data: LensData;
  onChange: (l: Lens) => void;
}) {
  const statuses = statusesFor(data.entity);
  const counts = statuses.map((s) => data.countExcept({ kind: 'status', status: s }, lens.id));
  const max = Math.max(1, ...counts.map((c) => c ?? 0));
  return (
    <Box sx={{ p: 1.25, pb: 0.75 }}>
      <Typography
        id={`${lens.id}-status-label`}
        sx={{ fontSize: 13, fontWeight: 700, px: 0.5, pb: 0.75 }}
      >
        Status is
      </Typography>
      <Box role='radiogroup' aria-labelledby={`${lens.id}-status-label`}>
        {statuses.map((s: StatusKind, i) => (
          <ValueRow
            countTitle={data.liveCounts ? undefined : liveCountsOffText(data.entity)}
            single
            key={s}
            label={STATUS_LABEL[s]}
            count={counts[i]}
            max={max}
            checked={lens.status === s}
            onClick={() => onChange({ ...lens, status: s, enabled: true })}
          />
        ))}
      </Box>
      <Typography sx={{ fontSize: 11.5, color: 'text.disabled', px: 0.5, pt: 0.75 }}>
        One status per filter. Add another filter for a second status.
      </Typography>
    </Box>
  );
}

function lensableFields(data: LensData): FieldDef[] {
  return fieldCatalog(data.entity, data.tokenCtx.labelKeys).filter(
    (f) => f.ops.length > 0 && f.type !== 'status',
  );
}

function FieldEditor({
  lens,
  data,
  onChange,
}: {
  lens: FieldLens;
  data: LensData;
  onChange: (l: Lens) => void;
}) {
  const [search, setSearch] = useState('');
  const field = fieldById(data.entity, lens.field);
  const fields = useMemo(() => lensableFields(data), [data]);
  const ops = field?.ops ?? [];
  const listOp = LIST_OPS.includes(lens.op);
  const noValue = lens.op === 'empty' || lens.op === 'notEmpty';

  const values = useMemo(() => {
    if (!listOp) return [];
    const all = data.valuesWithCounts(lens.field, lens.id);
    const q = search.trim().toLowerCase();
    const shown = q ? all.filter((v) => v.value.toLowerCase().includes(q)) : all;
    // Chosen values first, then the values that keep most rows.
    return shown
      .sort(
        (a, b) =>
          Number(lens.values.includes(b.value)) - Number(lens.values.includes(a.value)) ||
          (b.count ?? 0) - (a.count ?? 0),
      )
      .slice(0, MAX_VALUES);
  }, [data, lens, listOp, search]);
  const max = Math.max(1, ...values.map((v) => v.count ?? 0));

  const setOp = (op: FieldOp) => {
    if (op === lens.op) return;
    const keep = LIST_OPS.includes(op) && listOp;
    onChange({ ...lens, op, values: keep ? lens.values : [], enabled: true });
  };
  const toggle = (value: string) => {
    const values = lens.values.includes(value)
      ? lens.values.filter((v) => v !== value)
      : [...lens.values, value];
    onChange({ ...lens, values, enabled: true });
  };
  const single = lens.values[0] ?? '';
  const singleCount =
    !listOp && !noValue && single
      ? data.countExcept({ ...lens, values: [single] }, lens.id)
      : null;
  const problem = lensProblem(data.entity, lens);

  return (
    <Box>
      <Stack spacing={0.75} sx={{ p: 1.25, pb: 0.5 }}>
        <Select
          size='small'
          value={field ? lens.field : ''}
          onChange={(e) => {
            const next = fieldById(data.entity, e.target.value);
            if (!next) return;
            const op = next.ops.includes(lens.op) ? lens.op : next.ops[0];
            onChange({ ...lens, field: next.id, op, values: [], enabled: true });
          }}
          // No exit transition: a menu that closes is gone at once, even on a busy page.
          MenuProps={{ slotProps: { root: lensLayerProps }, transitionDuration: { exit: 0 } }}
          inputProps={{ 'aria-label': 'Field' }}
          sx={{ fontSize: 13, fontWeight: 700 }}
        >
          {fields.map((f) => (
            <MenuItem key={f.id} value={f.id} sx={{ fontSize: 13 }}>
              {f.category === 'label' || f.category === 'space-label'
                ? `label · ${f.label}`
                : f.label}
            </MenuItem>
          ))}
        </Select>
        <ToggleButtonGroup
          size='small'
          exclusive
          value={lens.op}
          onChange={(_, op: FieldOp | null) => op && setOp(op)}
          aria-label='Comparison'
          sx={{
            flexWrap: 'wrap',
            '& .MuiToggleButton-root': {
              py: 0.25,
              px: 1,
              fontSize: 12,
              textTransform: 'none',
            },
          }}
        >
          {ops.map((op) => (
            <ToggleButton key={op} value={op} data-testid={`vx-lens-op-${op}`}>
              {OP_LABEL[op]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>
      {listOp && (
        <>
          <Stack
            direction='row'
            alignItems='center'
            spacing={0.75}
            sx={{
              mx: 1.25,
              my: 0.5,
              px: 1,
              height: 30,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            <SearchIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
            <InputBase
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search values'
              inputProps={{ 'aria-label': 'Search values', 'data-testid': 'vx-lens-search' }}
              sx={{ flex: 1, fontSize: 13 }}
            />
          </Stack>
          <Box sx={{ maxHeight: 250, overflow: 'auto', px: 0.5, pb: 0.5 }}>
            {values.map((v) => (
              <ValueRow
                countTitle={data.liveCounts ? undefined : liveCountsOffText(data.entity)}
                key={v.value}
                label={v.value}
                count={v.count}
                max={max}
                checked={lens.values.includes(v.value)}
                onClick={() => toggle(v.value)}
              />
            ))}
            {!values.length && (
              <Typography sx={{ fontSize: 12.5, color: 'text.disabled', px: 1, py: 1 }}>
                No values
              </Typography>
            )}
          </Box>
          {lens.values.length > 1 && (
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', px: 1.75, pb: 0.75 }}>
              Rows with any of these {lens.values.length} values{' '}
              {lens.op === 'isNot' ? 'are hidden' : 'show'}.
            </Typography>
          )}
        </>
      )}
      {!listOp && !noValue && (
        <Stack spacing={0.5} sx={{ mx: 1.25, my: 0.5, pb: 0.75 }}>
          <InputBase
            autoFocus
            value={single}
            onChange={(e) =>
              onChange({
                ...lens,
                values: e.target.value ? [e.target.value] : [],
                enabled: true,
              })
            }
            placeholder={lens.op === 'matches' ? 'e.g. payments-*' : 'Value'}
            inputProps={{ 'aria-label': 'Value', 'data-testid': 'vx-lens-pattern' }}
            sx={{
              height: 30,
              px: 1,
              fontSize: 13,
              fontWeight: 600,
              border: 1,
              borderColor: problem ? 'warning.main' : 'divider',
              borderRadius: 1,
            }}
          />
          <Typography
            sx={{ fontSize: 12, color: problem ? 'warning.main' : 'text.secondary' }}
          >
            {problem ? (
              problem.message
            ) : (
              <>
                <b title={data.liveCounts ? undefined : liveCountsOffText(data.entity)}>
                  {singleCount ?? '—'}
                </b>{' '}
                {lens.op === 'matches' ? 'match' : 'keep'}
                {lens.op === 'matches' ? ' · * is a wildcard' : ''}
              </>
            )}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
