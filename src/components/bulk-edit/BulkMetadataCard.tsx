// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import {
  KEY_FIELD_SX,
  VALUE_FIELD_SX,
  checkKey,
  checkValue,
} from '@/components/map-field-editor/map-field-rules';
import { SectionCard } from '@/components/styled';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

import {
  type BulkMapField,
  type BulkMetadataEdit,
  type BulkRow,
  type KeyUsage,
  keepsEachValue,
  keyUsage,
  rowsToFieldEdit,
  usageToRows,
} from './bulkMetadataEdit';

/** The maps of a selected entity that the card reads. */
export interface BulkMetadataEntity {
  Labels?: Record<string, string | null> | null;
  DeleteGates?: Record<string, boolean | null> | null;
  DestroyGates?: Record<string, boolean | null> | null;
}

interface FieldSpec {
  title: string;
  /** Names one entry, as in "Add label" and "Remove label 2". */
  itemLabel: string;
  keyPlaceholder: string;
  /** Prefixes the section's test ids, as the form of one entity does. */
  testId: string;
}

const FIELD_SPECS: Record<BulkMapField, FieldSpec> = {
  Labels: {
    title: 'Labels',
    itemLabel: 'label',
    keyPlaceholder: 'Environment',
    testId: 'bulk-labels',
  },
  DeleteGates: {
    title: 'Delete Gates',
    itemLabel: 'delete gate',
    keyPlaceholder: 'e.g., manual-review',
    testId: 'bulk-delete-gates',
  },
  DestroyGates: {
    title: 'Destroy Gates',
    itemLabel: 'destroy gate',
    keyPlaceholder: 'e.g., production-protection',
    testId: 'bulk-destroy-gates',
  },
};

interface RowErrors {
  key?: string;
  value?: string;
}

/** What is wrong with each row, by the rules the form of one entity applies. A blank row is ignored. */
const rowErrors = (rows: ReadonlyArray<BulkRow>, isLabel: boolean): RowErrors[] =>
  rows.map((row, index) => {
    const key = row.key.trim();
    if (!key) return isLabel && row.value ? { key: 'Key is required' } : {};
    const errors: RowErrors = {};
    const firstIndex = rows.findIndex((other) => other.key.trim() === key);
    const keyCheck = firstIndex !== index ? 'Duplicate key' : checkKey(key, 'label');
    if (keyCheck !== true) errors.key = keyCheck;
    if (isLabel && !(keepsEachValue(row) && row.value === '')) {
      const valueCheck = checkValue(row.value, 'label');
      if (valueCheck !== true) errors.value = valueCheck;
    }
    return errors;
  });

const hasErrors = (errors: RowErrors[]) => errors.some((e) => e.key || e.value);

interface FieldState {
  usage: KeyUsage[];
  rows: BulkRow[];
}

export interface BulkMetadataChange {
  edit: BulkMetadataEdit;
  /** False while a row has an error, when the edit must not be sent. */
  valid: boolean;
}

export interface BulkMetadataCardProps {
  /** The selected entities, whose labels and gates the card starts from. */
  entities: ReadonlyArray<BulkMetadataEntity>;
  /** The fields the entities have. */
  fields?: ReadonlyArray<BulkMapField>;
  onChange: (change: BulkMetadataChange) => void;
}

const LABELS_AND_DELETE_GATES: ReadonlyArray<BulkMapField> = ['Labels', 'DeleteGates'];

let nextRowId = 0;

/**
 * Edits the labels and gates of every selected entity, a row per key, as the form of one entity
 * does. A row's key starts as the selected entities have it, so removing the row removes the key
 * from all of them, and changing its value sets the value on all of them. A key only some of them
 * have stays on those unless the user adds it to all. A row added sets its key on all of them.
 *
 * It starts from the entities when it mounts, which a drawer does each time it opens.
 */
export const BulkMetadataCard = ({
  entities,
  fields = LABELS_AND_DELETE_GATES,
  onChange,
}: BulkMetadataCardProps) => {
  const [state, setState] = useState<Partial<Record<BulkMapField, FieldState>>>(() =>
    Object.fromEntries(
      fields.map((field) => {
        const usage = keyUsage(entities.map((entity) => entity[field]));
        return [field, { usage, rows: usageToRows(usage, field === 'Labels') }];
      }),
    ),
  );

  const updateRows = (field: BulkMapField, rows: BulkRow[]) => {
    const next = { ...state, [field]: { ...state[field]!, rows } };
    setState(next);
    const edit: BulkMetadataEdit = {};
    let valid = true;
    for (const f of fields) {
      const { usage, rows: fieldRows } = next[f]!;
      edit[f] = rowsToFieldEdit(usage, fieldRows, f === 'Labels');
      if (hasErrors(rowErrors(fieldRows, f === 'Labels'))) valid = false;
    }
    onChange({ edit, valid });
  };

  return (
    <>
      {fields.map((field) => {
        const { rows } = state[field]!;
        const spec = FIELD_SPECS[field];
        const isLabel = field === 'Labels';
        const errors = rowErrors(rows, isLabel);
        const setRow = (index: number, change: Partial<BulkRow>) =>
          updateRows(
            field,
            rows.map((row, i) => (i === index ? { ...row, ...change } : row)),
          );
        return (
          <SectionCard
            key={field}
            title={spec.title}
            badge={rows.length}
            collapsible
            testId={`${spec.testId}-section`}
          >
            {rows.map((row, index) => {
              // A key only some entities have, under its own name, can be put on the rest.
              const partial =
                row.existing &&
                row.existing.count < entities.length &&
                row.key.trim() === row.existing.key ? (
                  <>
                    {row.toAll
                      ? `Adding to all ${entities.length}`
                      : `On ${row.existing.count} of ${entities.length}`}
                    {' · '}
                    <Link
                      component='button'
                      type='button'
                      variant='inherit'
                      onClick={() => setRow(index, { toAll: !row.toAll })}
                      data-testid={`${spec.testId}-all-${index}`}
                      sx={{ verticalAlign: 'baseline' }}
                    >
                      {row.toAll ? 'Undo' : `Add to all ${entities.length}`}
                    </Link>
                  </>
                ) : undefined;
              const mixed =
                row.existing && row.existing.values.length > 1
                  ? `${row.existing.values.length} values`
                  : undefined;
              return (
                <Box
                  key={row.id}
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    columnGap: 1,
                    rowGap: 1,
                    alignItems: 'flex-start',
                    mb: 1.5,
                  }}
                >
                  <TextField
                    label='Key'
                    size='small'
                    value={row.key}
                    onChange={(e) => setRow(index, { key: e.target.value })}
                    placeholder={spec.keyPlaceholder}
                    error={!!errors[index].key}
                    helperText={errors[index].key ?? partial}
                    slotProps={{ htmlInput: { 'data-testid': `${spec.testId}-key-${index}` } }}
                    sx={isLabel ? KEY_FIELD_SX : { flex: 1 }}
                  />
                  {isLabel && (
                    <TextField
                      label='Value'
                      size='small'
                      value={row.value}
                      onChange={(e) => setRow(index, { value: e.target.value })}
                      placeholder={mixed}
                      error={!!errors[index].value}
                      helperText={errors[index].value}
                      slotProps={{
                        htmlInput: { 'data-testid': `${spec.testId}-value-${index}` },
                        // Raised so the placeholder saying the values differ shows.
                        inputLabel: mixed ? { shrink: true } : undefined,
                      }}
                      sx={VALUE_FIELD_SX}
                    />
                  )}
                  <Tooltip title={`Remove ${spec.itemLabel}`}>
                    <IconButton
                      aria-label={`Remove ${spec.itemLabel} ${index + 1}`}
                      onClick={() =>
                        updateRows(
                          field,
                          rows.filter((_, i) => i !== index),
                        )
                      }
                      size='small'
                      sx={{ mt: 0.5 }}
                    >
                      <DeleteOutlineIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                </Box>
              );
            })}
            <Button
              size='small'
              startIcon={<AddIcon />}
              onClick={() =>
                updateRows(field, [
                  ...rows,
                  { id: `new-${nextRowId++}`, key: '', value: isLabel ? '' : 'true' },
                ])
              }
              data-testid={`${spec.testId}-add`}
              sx={{ textTransform: 'none' }}
            >
              Add {spec.itemLabel}
            </Button>
          </SectionCard>
        );
      })}
    </>
  );
};
