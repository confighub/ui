// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useMemo, useState } from 'react';

import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { useLabelKeys } from '@/pages/x/view-explorer/hooks/useLabelKeys';
import {
  WhereClauseEditor,
  WhereDataClauseEditor,
} from '@/pages/x/view-explorer/components/ViewBuilder/WhereClauseEditor';

import { ALL_FIELD_SOURCES, ColumnSource, ResourceView } from '../../types';

/**
 * Attributes the Filter field completes against. The filter is evaluated
 * against the Resource entity, so the resource's own attributes are unprefixed
 * and the containing entities are addressed with a prefix. Paths into the
 * resource document go in the Data filter below, which qualifies them.
 */
const RESOURCE_WHERE_FIELDS = [
  'ResourceType',
  'ResourceName',
  'ToolchainType',
  'TargetID',
  'SpaceID',
  'UnitID',
  'CreatedAt',
  'UpdatedAt',
  'Unit.Slug',
  'Unit.DisplayName',
  'Unit.Labels',
  'Unit.ToolchainType',
  'Unit.ProviderType',
  'Unit.HeadRevisionNum',
  'Unit.LastReleasedRevisionNum',
  'Unit.UpstreamRevisionNum',
  'Unit.LastChangeDescription',
  'Space.Slug',
  'Space.DisplayName',
  'Space.Labels',
  'Target.Slug',
];

interface ResourceViewBuilderProps {
  draft: ResourceView;
  applied: ResourceView;
  isDirty: boolean;
  knownResourceTypes: string[];
  onChange: (next: ResourceView) => void;
  onApply: () => void;
  onReset: () => void;
  onCopyShareLink: () => void;
}

const SectionLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(0.5),
}));

export function ResourceViewBuilder({
  draft,
  applied,
  isDirty,
  knownResourceTypes,
  onChange,
  onApply,
  onReset,
  onCopyShareLink,
}: ResourceViewBuilderProps) {
  const { labelKeys, spaceLabelKeys } = useLabelKeys();

  const columnOptions = useMemo<ColumnOption[]>(
    () => buildColumnOptions(labelKeys, spaceLabelKeys),
    [labelKeys, spaceLabelKeys],
  );

  // Suppress already-selected options from the picker.
  const selectedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of draft.columns) set.add(`${c.source}::${c.key}`);
    return set;
  }, [draft.columns]);

  const availableOptions = useMemo(
    () => columnOptions.filter((opt) => !selectedKeys.has(`${opt.source}::${opt.key}`)),
    [columnOptions, selectedKeys],
  );

  const orderByOptions = useMemo(
    () => ['', ...draft.columns.map((c) => c.name)],
    [draft.columns],
  );

  const handleAddColumn = useCallback(
    (opt: ColumnOption | null) => {
      if (!opt) return;
      // Ensure unique display name within the column list.
      const existing = new Set(draft.columns.map((c) => c.name));
      let name = opt.label;
      if (existing.has(name)) {
        let i = 2;
        while (existing.has(`${name} (${i})`)) i++;
        name = `${name} (${i})`;
      }
      onChange({
        ...draft,
        columns: [...draft.columns, { name, source: opt.source, key: opt.key }],
      });
    },
    [draft, onChange],
  );

  // Path-column input state lives locally in the builder so typing doesn't
  // mutate the draft on every keystroke; the user has to commit via Add.
  const [pathInput, setPathInput] = useState('');

  const handleAddPathColumn = useCallback(() => {
    const trimmed = pathInput.trim();
    if (!trimmed) return;
    const existing = new Set(draft.columns.map((c) => c.name));
    let name = trimmed;
    if (existing.has(name)) {
      let i = 2;
      while (existing.has(`${name} (${i})`)) i++;
      name = `${name} (${i})`;
    }
    onChange({
      ...draft,
      columns: [...draft.columns, { name, source: 'resource-path', key: trimmed }],
    });
    setPathInput('');
  }, [draft, onChange, pathInput]);

  const handleRemoveColumn = useCallback(
    (index: number) => {
      const removed = draft.columns[index].name;
      const nextColumns = draft.columns.filter((_, i) => i !== index);
      onChange({
        ...draft,
        columns: nextColumns,
        orderBy: draft.orderBy === removed ? '' : draft.orderBy,
        groupBy: draft.groupBy?.filter((g) => g !== removed),
      });
    },
    [draft, onChange],
  );

  const groupBySet = useMemo(() => new Set(draft.groupBy ?? []), [draft.groupBy]);

  const handleToggleGroupBy = useCallback(
    (colName: string) => {
      const current = draft.groupBy ?? [];
      const next = current.includes(colName)
        ? current.filter((g) => g !== colName)
        : [...current, colName];
      onChange({ ...draft, groupBy: next.length > 0 ? next : undefined });
    },
    [draft, onChange],
  );

  const handleMoveColumn = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (target < 0 || target >= draft.columns.length) return;
      const nextColumns = [...draft.columns];
      const [moved] = nextColumns.splice(index, 1);
      nextColumns.splice(target, 0, moved);
      onChange({ ...draft, columns: nextColumns });
    },
    [draft, onChange],
  );

  const dirtyHint = isDirty
    ? 'Unsaved changes — click Apply to refresh the table and update the share link.'
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 560 }}>
      <Stack direction='row' alignItems='center' justifyContent='space-between'>
        <Typography variant='subtitle2' fontWeight={600} color='text.secondary'>
          RESOURCE VIEW
        </Typography>
        <Stack direction='row' spacing={0.5}>
          <Tooltip title='Copy a shareable link to this view'>
            <Button
              variant='outlined'
              onClick={onCopyShareLink}
              size='small'
              sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.25, minWidth: 0 }}
            >
              Copy link
            </Button>
          </Tooltip>
          <Button
            variant='outlined'
            onClick={onReset}
            disabled={!isDirty}
            size='small'
            sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.25, minWidth: 0 }}
          >
            Reset
          </Button>
          <Button
            variant='contained'
            onClick={onApply}
            disabled={!isDirty}
            size='small'
            sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.25, minWidth: 0 }}
          >
            Apply
          </Button>
        </Stack>
      </Stack>

      <TextField
        size='small'
        label='Name (optional)'
        value={draft.name ?? ''}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />

      <Box>
        <SectionLabel>Filter</SectionLabel>
        <WhereClauseEditor
          value={draft.where ?? ''}
          onChange={(value) => onChange({ ...draft, where: value })}
          fields={RESOURCE_WHERE_FIELDS}
          placeholder="ResourceType = 'apps/v1/Deployment' AND Space.Labels.env = 'prod'"
        />
      </Box>

      <Box>
        <SectionLabel>Data filter</SectionLabel>
        <WhereDataClauseEditor
          value={draft.whereData ?? ''}
          onChange={(value) => onChange({ ...draft, whereData: value })}
        />
      </Box>

      <Autocomplete
        size='small'
        freeSolo
        options={knownResourceTypes}
        value={draft.resourceType ?? ''}
        onChange={(_, value) =>
          onChange({ ...draft, resourceType: typeof value === 'string' ? value : '' })
        }
        onInputChange={(_, value, reason) => {
          if (reason === 'input' || reason === 'clear') {
            onChange({ ...draft, resourceType: value });
          }
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label='Resource type (apiVersion/kind, optional)'
            placeholder='apps/v1/Deployment'
          />
        )}
      />

      <Box>
        <SectionLabel>Columns</SectionLabel>
        <Stack spacing={0.5} mb={1}>
          {draft.columns.map((col, idx) => {
            const isGrouped = groupBySet.has(col.name);
            return (
              <Stack
                key={`${col.source}:${col.key}:${idx}`}
                direction='row'
                alignItems='center'
                spacing={0.5}
                sx={{ p: 0.5, borderRadius: 1, '&:hover': { backgroundColor: 'action.hover' } }}
              >
                <Chip size='small' label={sourceLabel(col.source)} sx={{ minWidth: 80 }} />
                <Typography
                  variant='body2'
                  sx={{
                    flex: 1,
                    fontFamily: 'monospace',
                    color: isGrouped ? 'text.disabled' : 'text.primary',
                    textDecoration: isGrouped ? 'line-through' : 'none',
                  }}
                >
                  {col.name}
                </Typography>
                <Tooltip
                  title={
                    isGrouped
                      ? 'Hidden from table; shown in Groups tab'
                      : 'Group rows by this column'
                  }
                >
                  <IconButton
                    size='small'
                    onClick={() => handleToggleGroupBy(col.name)}
                    color={isGrouped ? 'primary' : 'default'}
                  >
                    <FolderOutlinedIcon fontSize='small' />
                  </IconButton>
                </Tooltip>
                <IconButton
                  size='small'
                  onClick={() => handleMoveColumn(idx, -1)}
                  disabled={idx === 0}
                >
                  <ArrowUpwardIcon fontSize='small' />
                </IconButton>
                <IconButton
                  size='small'
                  onClick={() => handleMoveColumn(idx, 1)}
                  disabled={idx === draft.columns.length - 1}
                >
                  <ArrowDownwardIcon fontSize='small' />
                </IconButton>
                <IconButton size='small' onClick={() => handleRemoveColumn(idx)}>
                  <CloseIcon fontSize='small' />
                </IconButton>
              </Stack>
            );
          })}
        </Stack>

        <Autocomplete<ColumnOption>
          size='small'
          options={availableOptions}
          groupBy={(opt) => opt.group}
          getOptionLabel={(opt) => opt.label}
          isOptionEqualToValue={(a, b) => a.source === b.source && a.key === b.key}
          value={null}
          onChange={(_, value) => handleAddColumn(value)}
          renderInput={(params) => (
            <TextField {...params} label='Add column' placeholder='Pick a column to add' />
          )}
        />

        <Stack direction='row' spacing={0.5} mt={1} alignItems='flex-start'>
          <TextField
            size='small'
            fullWidth
            label='Add resource path'
            placeholder='e.g. spec.cidrBlock'
            helperText='Walks the resource doc. Use spec.containers[0].image for arrays.'
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddPathColumn();
              }
            }}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
          />
          <Button
            variant='outlined'
            onClick={handleAddPathColumn}
            disabled={!pathInput.trim()}
            size='small'
            sx={{ textTransform: 'none', mt: 0.25 }}
          >
            Add
          </Button>
        </Stack>
      </Box>

      <Stack direction='row' spacing={1}>
        <FormControl size='small' sx={{ flex: 1 }}>
          <InputLabel>Order by</InputLabel>
          <Select
            label='Order by'
            value={draft.orderBy ?? ''}
            onChange={(e) => onChange({ ...draft, orderBy: e.target.value })}
          >
            {orderByOptions.map((name) => (
              <MenuItem key={name || '__none__'} value={name}>
                {name || '(none)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <ToggleButtonGroup
          size='small'
          exclusive
          value={draft.orderByDirection ?? 'ASC'}
          onChange={(_, value) => {
            if (value === 'ASC' || value === 'DESC') {
              onChange({ ...draft, orderByDirection: value });
            }
          }}
        >
          <ToggleButton value='ASC' sx={{ textTransform: 'none' }}>
            ASC
          </ToggleButton>
          <ToggleButton value='DESC' sx={{ textTransform: 'none' }}>
            DESC
          </ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {dirtyHint && (
        <Typography variant='caption' color='warning.main'>
          {dirtyHint}
        </Typography>
      )}

      {!isDirty && (applied.where || applied.whereData) && (
        <Typography variant='caption' color='text.secondary'>
          {applied.where && (
            <>
              Applied filter:{' '}
              <code style={{ fontSize: '0.78rem' }}>WHERE {applied.where}</code>
            </>
          )}
          {applied.where && applied.whereData && <br />}
          {applied.whereData && (
            <>
              Data filter:{' '}
              <code style={{ fontSize: '0.78rem' }}>{applied.whereData}</code>
            </>
          )}
        </Typography>
      )}
    </Box>
  );
}

interface ColumnOption {
  source: ColumnSource;
  key: string;
  label: string;
  group: string;
}

function buildColumnOptions(
  unitLabelKeys: string[],
  spaceLabelKeys: string[],
): ColumnOption[] {
  const out: ColumnOption[] = [];
  for (const group of ALL_FIELD_SOURCES) {
    for (const field of group.fields) {
      out.push({ source: group.source, key: field, label: field, group: group.label });
    }
  }
  for (const k of unitLabelKeys) {
    out.push({ source: 'unit-label', key: k, label: `Unit.Labels.${k}`, group: 'Unit labels' });
  }
  for (const k of spaceLabelKeys) {
    out.push({
      source: 'space-label',
      key: k,
      label: `Space.Labels.${k}`,
      group: 'Space labels',
    });
  }
  return out;
}

function sourceLabel(source: ColumnSource): string {
  switch (source) {
    case 'resource-info':
      return 'Resource';
    case 'unit-field':
      return 'Unit';
    case 'unit-label':
      return 'Unit lbl';
    case 'space-field':
      return 'Space';
    case 'space-label':
      return 'Space lbl';
    case 'resource-path':
      return 'Path';
  }
}
