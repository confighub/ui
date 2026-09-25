// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback, useEffect, useState } from 'react';

import {
  ExtendedViewRead,
} from '@confighub/rtk-query';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import Tooltip from '@mui/material/Tooltip';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { ENTITY_TYPES, getAdapter, ViewEntityType } from '../../adapters';
import { useLabelKeys } from '../../hooks/useLabelKeys';
import { useResourceTypes } from '../../hooks/useResourceTypes';
import {
  DraftView,
  FILTER_SNIPPETS_BY_ENTITY,
  LABEL_PREFIX,
  SPACE_LABEL_PREFIX,
  slugFromDisplayName,
} from '../../types';
import { DeleteConfirmDialog } from '../DeleteConfirmDialog';
import { ColumnPicker } from './ColumnPicker';
import { WhereClauseEditor, WhereDataClauseEditor } from './WhereClauseEditor';

interface ViewBuilderProps {
  draft: DraftView;
  existingView: ExtendedViewRead | null;
  isSaving: boolean;
  saveError: string | null;
  onChange: (draft: DraftView) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}

const SectionLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.7rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(0.5),
}));

export function ViewBuilder({
  draft,
  existingView,
  isSaving,
  saveError,
  onChange,
  onSave,
  onCancel,
  onDelete,
}: ViewBuilderProps) {
  const isNew = !existingView;
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Auto-derive slug from display name for new views
  useEffect(() => {
    if (isNew && draft.displayName) {
      const derived = slugFromDisplayName(draft.displayName);
      if (derived !== draft.slug) {
        onChange({ ...draft, slug: derived });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.displayName, isNew]);

  const handleField = useCallback(
    <K extends keyof DraftView>(key: K, value: DraftView[K]) => {
      onChange({ ...draft, [key]: value });
    },
    [draft, onChange],
  );

  const canSave =
    draft.displayName.trim() !== '' &&
    draft.slug.trim() !== '';

  const adapter = getAdapter(draft.entityType);
  const filterSnippets = FILTER_SNIPPETS_BY_ENTITY[draft.entityType] ?? [];
  const { labelKeys, spaceLabelKeys } = useLabelKeys();
  const { resourceTypes } = useResourceTypes();
  // Resource rows use `Unit.Labels.*` for the originating unit's labels,
  // matching how the rest of the Resource column vocabulary is qualified.
  // Unit + Space views keep the historical bare `Labels.*` prefix.
  const labelColumnOptions = labelKeys.map((k) =>
    draft.entityType === 'Resource' ? `Unit.Labels.${k}` : `${LABEL_PREFIX}${k}`,
  );
  // The Space.Labels.* prefix is meaningful for Unit and Resource views (it
  // dereferences the parent space). For Space views, the row IS the space, so
  // Labels.* is enough — don't also offer Space.Labels.* as a separate axis.
  const spaceLabelColumnOptions =
    draft.entityType === 'Space'
      ? []
      : spaceLabelKeys.map((k) => `${SPACE_LABEL_PREFIX}${k}`);
  const allColumnOptions = [...adapter.allColumns, ...labelColumnOptions, ...spaceLabelColumnOptions];
  const groupBySet = new Set(draft.groupBys);
  const availableGroupByOptions = allColumnOptions.filter((c) => !groupBySet.has(c));
  const orderByOptions = ['', ...allColumnOptions];

  const handleEntityTypeChange = useCallback(
    (next: ViewEntityType) => {
      if (next === draft.entityType) return;
      const nextAdapter = getAdapter(next);
      // Switching entity types invalidates the column / group / order vocabulary
      // and the filter expressions written against the previous type. Reset
      // them to sensible defaults rather than carry broken state forward.
      onChange({
        ...draft,
        entityType: next,
        columns: nextAdapter.defaultColumns,
        groupBys: [],
        orderBy: '',
        whereClause: '',
        whereDataClause: '',
        resourceType: '',
      });
    },
    [draft, onChange],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxWidth: 560 }}>
      <Stack direction='row' alignItems='center' justifyContent='space-between'>
        <Typography variant='subtitle2' fontWeight={600} color='text.secondary'>
          {isNew ? 'NEW VIEW' : 'EDIT VIEW'}
        </Typography>
        <Stack direction='row' spacing={0.5}>
          <Button
            variant='contained'
            onClick={onSave}
            disabled={!canSave || isSaving}
            size='small'
            sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1.5, py: 0.25, minWidth: 0 }}
          >
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
          <Button
            variant='text'
            onClick={onCancel}
            size='small'
            disabled={isSaving}
            sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1, py: 0.25, minWidth: 0 }}
          >
            Cancel
          </Button>
          {onDelete && !isNew && (
            <Button
              variant='text'
              color='error'
              size='small'
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={isSaving}
              sx={{ textTransform: 'none', fontSize: '0.78rem', px: 1, py: 0.25, minWidth: 0 }}
            >
              Delete
            </Button>
          )}
        </Stack>
      </Stack>

      {saveError && <Alert severity='error' sx={{ py: 0, fontSize: '0.8rem' }}>{saveError}</Alert>}

      <Stack spacing={1}>
        <FormControl size='small' fullWidth>
          <InputLabel sx={{ fontSize: '0.85rem' }}>Entity Type</InputLabel>
          <Select
            value={draft.entityType}
            label='Entity Type'
            onChange={(e) => handleEntityTypeChange(e.target.value as ViewEntityType)}
            disabled={!isNew}
            sx={{ fontSize: '0.85rem' }}
          >
            {ENTITY_TYPES.map((t) => (
              <MenuItem key={t} value={t} sx={{ fontSize: '0.85rem' }}>
                {t}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label='Display Name'
          value={draft.displayName}
          onChange={(e) => handleField('displayName', e.target.value)}
          fullWidth
          size='small'
          required
          slotProps={{ input: { sx: { fontSize: '0.85rem' } } }}
        />
        <TextField
          label='Slug'
          value={draft.slug}
          onChange={(e) => handleField('slug', e.target.value)}
          fullWidth
          size='small'
          required
          helperText='Auto-derived from display name for new views'
          slotProps={{
            input: { sx: { fontSize: '0.85rem', fontFamily: 'monospace' } },
            formHelperText: { sx: { fontSize: '0.68rem', mt: 0.25 } },
          }}
        />
      </Stack>

      <Box>
        <SectionLabel>Filter</SectionLabel>
        <WhereClauseEditor
          value={draft.whereClause}
          onChange={(v) => handleField('whereClause', v)}
          entityType={draft.entityType}
        />
        <Stack direction='row' flexWrap='wrap' gap={0.5} mt={0.75}>
          {filterSnippets.map((snippet) => (
            <Tooltip key={snippet.label} title={snippet.description} placement='bottom'>
              <Button
                size='small'
                variant='text'
                startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                onClick={() => {
                  const current = draft.whereClause.trim();
                  const next = current
                    ? `${current} AND ${snippet.expression}`
                    : snippet.expression;
                  handleField('whereClause', next);
                }}
                sx={{
                  textTransform: 'none',
                  fontSize: '0.72rem',
                  px: 1,
                  py: 0.25,
                  minWidth: 0,
                  color: 'text.secondary',
                }}
              >
                {snippet.label}
              </Button>
            </Tooltip>
          ))}
        </Stack>
      </Box>

      {adapter.supportsDataFilter && (
        <Box>
          <SectionLabel>Data Filter</SectionLabel>
          <Stack spacing={1}>
            <FormControlLabel
              control={
                <Checkbox
                  size='small'
                  checked={draft.resourceType === '*'}
                  onChange={(_, checked) => {
                    handleField('resourceType', checked ? '*' : '');
                  }}
                />
              }
              label={
                <Typography variant='body2' sx={{ fontSize: '0.85rem' }}>
                  All resource types
                </Typography>
              }
              sx={{ ml: 0, mb: -0.5 }}
            />
            {draft.resourceType !== '*' && (
              <Autocomplete
                freeSolo
                autoHighlight
                autoComplete
                options={resourceTypes}
                value={draft.resourceType || null}
                onChange={(_, v) => handleField('resourceType', v ?? '')}
                onInputChange={(_, v, reason) => {
                  if (reason === 'input') handleField('resourceType', v);
                }}
                size='small'
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label='Resource Type'
                    placeholder='e.g. apps/v1/Deployment'
                    slotProps={{
                      input: { ...params.InputProps, sx: { fontSize: '0.85rem', fontFamily: 'monospace' } },
                      formHelperText: { sx: { fontSize: '0.68rem', mt: 0.25 } },
                    }}
                  />
                )}
              />
            )}
            <WhereDataClauseEditor
              value={draft.whereDataClause}
              onChange={(v) => handleField('whereDataClause', v)}
              disabled={!draft.resourceType}
            />
          </Stack>
        </Box>
      )}

      <Box>
        <SectionLabel>Columns</SectionLabel>
        {draft.entityType === 'Resource' && (
          <ResourcePathInput
            onAdd={(path) => {
              if (draft.columns.some((c) => c.Name === path)) return;
              handleField('columns', [
                ...draft.columns,
                {
                  Name: path,
                  ColumnType: 'DataPath',
                  ColumnSource: { DataPath: { Path: path } },
                },
              ]);
            }}
          />
        )}
        <ColumnPicker
          columns={draft.columns.filter((c) => !draft.groupBys.includes(c.Name) && c.Name !== draft.orderBy)}
          baseColumns={adapter.allColumns}
          onChange={(cols) => handleField('columns', cols)}
        />
      </Box>

      <Box>
        <SectionLabel>Group By</SectionLabel>
        {draft.groupBys.length > 0 && (
          <Stack spacing={0.5} mb={1}>
            {draft.groupBys.map((gb, idx) => (
              <Stack key={gb} direction='row' alignItems='center' spacing={0.5}>
                <Chip
                  label={`${idx + 1}. ${gb}`}
                  size='small'
                  onDelete={() => {
                    handleField('groupBys', draft.groupBys.filter((_, i) => i !== idx));
                  }}
                  deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                  sx={{ fontSize: '0.78rem', fontFamily: 'monospace' }}
                />
                <IconButton
                  size='small'
                  disabled={idx === 0}
                  onClick={() => {
                    const next = [...draft.groupBys];
                    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                    handleField('groupBys', next);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <ArrowUpwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
                <IconButton
                  size='small'
                  disabled={idx === draft.groupBys.length - 1}
                  onClick={() => {
                    const next = [...draft.groupBys];
                    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                    handleField('groupBys', next);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Stack>
            ))}
          </Stack>
        )}
        <FormControl size='small' fullWidth>
          <InputLabel sx={{ fontSize: '0.85rem' }}>Add grouping level</InputLabel>
          <Select
            value=''
            label='Add grouping level'
            onChange={(e) => {
              const col = e.target.value;
              if (col && !draft.groupBys.includes(col)) {
                handleField('groupBys', [...draft.groupBys, col]);
              }
            }}
            sx={{ fontSize: '0.85rem' }}
          >
            {availableGroupByOptions.map((col) => (
              <MenuItem key={col} value={col} sx={{ fontSize: '0.85rem' }}>
                {col}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {draft.groupBys.length === 0 && (
          <Typography variant='caption' color='text.disabled' sx={{ fontSize: '0.68rem', mt: 0.25, display: 'block' }}>
            Add columns to group units hierarchically
          </Typography>
        )}
      </Box>

      <Stack direction='row' spacing={1} alignItems='flex-start'>
        <Box sx={{ flex: 1 }}>
          <SectionLabel>Order By</SectionLabel>
          <FormControl size='small' fullWidth>
            <InputLabel sx={{ fontSize: '0.85rem' }}>Order By</InputLabel>
            <Select
              value={draft.orderBy}
              label='Order By'
              onChange={(e) => handleField('orderBy', e.target.value)}
              sx={{ fontSize: '0.85rem' }}
            >
              {orderByOptions.map((col) => (
                <MenuItem key={col} value={col} sx={{ fontSize: '0.85rem' }}>
                  {col || <em>None</em>}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ pt: 2.25 }}>
          <ToggleButtonGroup
            value={draft.orderByDirection}
            exclusive
            onChange={(_, v) => v && handleField('orderByDirection', v)}
            size='small'
            disabled={!draft.orderBy}
            sx={{ height: 32 }}
          >
            <ToggleButton value='ASC' sx={{ fontSize: '0.7rem', px: 1 }}>ASC</ToggleButton>
            <ToggleButton value='DESC' sx={{ fontSize: '0.7rem', px: 1 }}>DESC</ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Stack>

      {onDelete && (
        <DeleteConfirmDialog
          open={deleteConfirmOpen}
          viewName={draft.displayName || draft.slug}
          onConfirm={() => { setDeleteConfirmOpen(false); onDelete(); }}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}
    </Box>
  );
}

/**
 * Inline input for adding a resource-path column. The user types a dot-path
 * (e.g. `spec.replicas`); we add it as a Column with ColumnType=DataPath so
 * the cell extractor can walk the path against parsed resource bodies on
 * Resource views.
 */
function ResourcePathInput({ onAdd }: { onAdd: (path: string) => void }) {
  const [pathInput, setPathInput] = useState('');
  const submit = () => {
    const v = pathInput.trim();
    if (!v) return;
    onAdd(v);
    setPathInput('');
  };
  return (
    <Stack direction='row' spacing={0.5} mb={1} alignItems='flex-start'>
      <TextField
        size='small'
        fullWidth
        label='Add resource path'
        placeholder='e.g. spec.replicas'
        helperText='Walks the resource doc. Use spec.containers[0].image for arrays.'
        value={pathInput}
        onChange={(e) => setPathInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        slotProps={{
          input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } },
          formHelperText: { sx: { fontSize: '0.68rem', mt: 0.25 } },
        }}
      />
      <Button
        variant='outlined'
        onClick={submit}
        disabled={!pathInput.trim()}
        size='small'
        sx={{ textTransform: 'none', mt: 0.25 }}
      >
        Add
      </Button>
    </Stack>
  );
}
