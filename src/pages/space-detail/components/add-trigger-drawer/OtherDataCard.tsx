// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type ReactNode, useMemo, useState } from 'react';
import {
  type Control,
  Controller,
  type FieldValues,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

import {
  type EntityRefOption,
  EntityRefSelect,
} from '@/components/entity-ref-select/EntityRefSelect';
import { UnitRefSelect } from '@/components/entity-ref-select/UnitRefSelect';
import { KEY_FIELD_SX } from '@/components/map-field-editor/map-field-rules';
import { SectionCard } from '@/components/styled';
import { useListUnitsByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import type { OtherUnitRow, OtherUnitSelectionRow } from '@/hooks/triggerFormBody';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

/** The fields of a form that edits the other Units of Triggers. */
export interface OtherDataFormValues {
  OtherUnits?: OtherUnitRow[];
  OtherUnitSelections?: OtherUnitSelectionRow[];
}

/** The OtherData key rules the server applies (api.ValidateOtherDataKey). */
const OTHER_DATA_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_OTHER_DATA_KEY_LENGTH = 64;

/** Where a selection most often picks from: the Units on the same cluster as the Space. */
const SAME_TARGET_WHERE = 'Space.ReleaseTargetID = EvaluatingSpace.ReleaseTargetID';

/**
 * A row's key: required once the row has anything else, and used once across both lists, since
 * the function reads each key once.
 */
const checkKey = (
  key: string,
  values: OtherDataFormValues,
  rowHasMore: boolean,
  isFirst: boolean,
) => {
  const trimmed = (key ?? '').trim();
  if (!trimmed) return rowHasMore ? 'Key is required' : true;
  if (trimmed.length > MAX_OTHER_DATA_KEY_LENGTH)
    return `At most ${MAX_OTHER_DATA_KEY_LENGTH} characters`;
  if (!OTHER_DATA_KEY_PATTERN.test(trimmed)) return "Only letters, digits, '-' and '_'";
  const keys = [
    ...(values.OtherUnits ?? []).map((row) => row.key.trim()),
    ...(values.OtherUnitSelections ?? []).map((row) => row.key.trim()),
  ];
  return keys.filter((k) => k === trimmed).length > 1 && !isFirst ? 'Duplicate key' : true;
};

/**
 * The rows whose keys count: a Trigger that runs an Invocation sends none of its Units, whose
 * list is hidden, so a key left there does not clash with a selection.
 */
const sentRows = (
  values: OtherDataFormValues,
  runsInvocation: boolean,
): OtherDataFormValues => (runsInvocation ? { ...values, OtherUnits: [] } : values);

/** Whether this row is the first, across both lists, to use its key. */
const isFirstWithKey = (
  values: OtherDataFormValues,
  list: 'units' | 'selections',
  index: number,
) => {
  const key = (
    list === 'units'
      ? values.OtherUnits?.[index]?.key
      : values.OtherUnitSelections?.[index]?.key
  )?.trim();
  const unitIndex = (values.OtherUnits ?? []).findIndex((row) => row.key.trim() === key);
  if (unitIndex >= 0) return list === 'units' && unitIndex === index;
  return (
    list === 'selections' &&
    (values.OtherUnitSelections ?? []).findIndex((row) => row.key.trim() === key) === index
  );
};

const RemoveButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Tooltip title={`Remove ${label}`}>
    <IconButton aria-label={`Remove ${label}`} onClick={onClick} size='small' sx={{ mt: 0.5 }}>
      <DeleteOutlineIcon fontSize='small' />
    </IconButton>
  </Tooltip>
);

/**
 * OtherDataCard
 *
 * The other Units a Trigger passes its function, by the key the function reads them under: a
 * Unit it names, or a selection that each Space selecting the Trigger evaluates for itself. A
 * Trigger that runs an Invocation passes the Units the Invocation names instead of its own, but
 * may still select.
 */
export const OtherDataCard = <T extends FieldValues & OtherDataFormValues>({
  control: formControl,
  runsInvocation,
  unitFilters,
  unitFiltersLoading,
  description = 'Other Units the function reads, under the key it reads them by.',
  children,
}: {
  control: Control<T>;
  runsInvocation: boolean;
  unitFilters: EntityRefOption[];
  unitFiltersLoading: boolean;
  description?: ReactNode;
  /** More of the section, after the selections. */
  children?: ReactNode;
}) => {
  // Every form passing this card has the two lists under these names.
  const control = formControl as unknown as Control<OtherDataFormValues>;
  const units = useFieldArray({ control, name: 'OtherUnits' });
  const selections = useFieldArray({ control, name: 'OtherUnitSelections' });
  const unitRows = useWatch({ control, name: 'OtherUnits' });

  // The Units a row names, read once for all rows so each shows as space/unit. A Unit picked here
  // is kept from the picker, so it shows before any read.
  const [picked, setPicked] = useState<Record<string, ExtendedUnitRead>>({});
  const unread = useMemo(
    () =>
      [
        ...new Set(
          (unitRows ?? []).map((row) => row.unitId).filter((id) => id && !picked[id]),
        ),
      ].sort(),
    [unitRows, picked],
  );
  const {
    currentData: namedUnits = [],
    isFetching: namedUnitsLoading,
    isError: namedUnitsFailed,
  } = useListUnitsByIdChunkedQuery(
    { unitIds: unread, include: 'SpaceID', select: 'UnitID,Slug,SpaceID,ToolchainType' },
    { skip: unread.length === 0 },
  );
  const unitById = useMemo(() => {
    const byId: Record<string, ExtendedUnitRead> = {};
    namedUnits.forEach((unit) => {
      if (unit.Unit?.UnitID) byId[unit.Unit.UnitID] = unit;
    });
    return { ...byId, ...picked };
  }, [namedUnits, picked]);

  return (
    <SectionCard
      title='Other Data'
      badge={units.fields.length + selections.fields.length}
      collapsible
      testId='trigger-other-data'
    >
      <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
        {description}
      </Typography>

      <Typography variant='subtitle2' sx={{ mb: 1 }}>
        Units
      </Typography>
      {runsInvocation ? (
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          A Trigger that runs an Invocation reads the Units the Invocation names.
        </Typography>
      ) : (
        <Box sx={{ mb: 2 }}>
          {units.fields.map((row, index) => (
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
              <Controller
                name={`OtherUnits.${index}.key`}
                control={control}
                rules={{
                  validate: (key, values) =>
                    checkKey(
                      key,
                      values,
                      !!values.OtherUnits?.[index]?.unitId,
                      isFirstWithKey(values, 'units', index),
                    ),
                }}
                render={({ field, fieldState }) => (
                  <TextField
                    {...field}
                    value={field.value ?? ''}
                    label='Key'
                    size='small'
                    placeholder='policy'
                    error={!!fieldState.error}
                    helperText={fieldState.error?.message}
                    sx={KEY_FIELD_SX}
                    slotProps={{
                      htmlInput: { 'data-testid': `trigger-other-unit-key-${index}` },
                    }}
                  />
                )}
              />
              <Controller
                name={`OtherUnits.${index}.unitId`}
                control={control}
                rules={{
                  validate: (unitId, values) =>
                    unitId || !(values.OtherUnits?.[index]?.key ?? '').trim()
                      ? true
                      : 'Pick a Unit',
                }}
                render={({ field, fieldState }) => (
                  <Box sx={{ flex: '1 1 240px', minWidth: 180 }}>
                    <UnitRefSelect
                      label='Unit'
                      value={field.value ? (unitById[field.value] ?? null) : null}
                      onChange={(unit) => {
                        const unitId = unit?.Unit?.UnitID ?? '';
                        if (unit && unitId)
                          setPicked((current) => ({ ...current, [unitId]: unit }));
                        field.onChange(unitId);
                      }}
                      helperText={
                        fieldState.error?.message ??
                        (field.value && !unitById[field.value]
                          ? namedUnitsLoading
                            ? 'Loading the Unit…'
                            : namedUnitsFailed
                              ? 'Could not read the Unit'
                              : 'A Unit you cannot see, or that was deleted'
                          : undefined)
                      }
                      testId={`trigger-other-unit-unit-${index}`}
                    />
                  </Box>
                )}
              />
              <RemoveButton label={`Unit ${index + 1}`} onClick={() => units.remove(index)} />
            </Box>
          ))}
          <Button
            size='small'
            startIcon={<AddIcon />}
            onClick={() => units.append({ key: '', unitId: '' })}
            data-testid='trigger-other-unit-add'
            sx={{ textTransform: 'none' }}
          >
            Add Unit
          </Button>
        </Box>
      )}

      <Typography variant='subtitle2' sx={{ mb: 0.5 }}>
        Selections
      </Typography>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 1.5 }}>
        Each Space that selects the Trigger picks the Units for itself, and names itself as
        EvaluatingSpace in Where.
      </Typography>
      {selections.fields.map((row, index) => (
        <Stack
          key={row.id}
          spacing={1.5}
          sx={{ mb: 1.5, p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1 }}
          data-testid={`trigger-selection-${index}`}
        >
          <Box sx={{ display: 'flex', columnGap: 1, alignItems: 'flex-start' }}>
            <Controller
              name={`OtherUnitSelections.${index}.key`}
              control={control}
              rules={{
                validate: (key, values) => {
                  const selection = values.OtherUnitSelections?.[index];
                  const hasMore = !!(
                    selection?.where.trim() ||
                    selection?.filterId ||
                    selection?.whereResource.trim()
                  );
                  const sent = sentRows(values, runsInvocation);
                  return checkKey(
                    key,
                    sent,
                    hasMore,
                    isFirstWithKey(sent, 'selections', index),
                  );
                },
              }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  value={field.value ?? ''}
                  label='Key'
                  size='small'
                  placeholder='workloads'
                  error={!!fieldState.error}
                  helperText={fieldState.error?.message}
                  sx={{ flex: 1 }}
                  slotProps={{
                    htmlInput: { 'data-testid': `trigger-selection-key-${index}` },
                  }}
                />
              )}
            />
            <RemoveButton
              label={`selection ${index + 1}`}
              onClick={() => selections.remove(index)}
            />
          </Box>
          <Controller
            name={`OtherUnitSelections.${index}.where`}
            control={control}
            rules={{
              validate: (where, values) => {
                const selection = values.OtherUnitSelections?.[index];
                if (!selection?.key.trim()) return true;
                return where.trim() || selection.filterId || selection.whereResource.trim()
                  ? true
                  : 'Give it a Where, a Unit Filter or a Where Resource, or it selects every Unit';
              },
            }}
            render={({ field, fieldState }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label='Where'
                fullWidth
                size='small'
                placeholder={SAME_TARGET_WHERE}
                error={!!fieldState.error}
                helperText={fieldState.error?.message ?? 'The Units this expression selects.'}
                slotProps={{
                  htmlInput: { 'data-testid': `trigger-selection-where-${index}` },
                }}
              />
            )}
          />
          <Controller
            name={`OtherUnitSelections.${index}.filterId`}
            control={control}
            render={({ field }) => (
              <EntityRefSelect
                label='Unit Filter (Optional)'
                value={field.value ?? ''}
                onChange={field.onChange}
                options={unitFilters}
                loading={unitFiltersLoading}
                helperText='Only the Units a Filter of Units selects. With Where, both apply.'
                testId={`trigger-selection-filter-${index}`}
              />
            )}
          />
          <Controller
            name={`OtherUnitSelections.${index}.whereResource`}
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                value={field.value ?? ''}
                label='Where Resource (Optional)'
                fullWidth
                size='small'
                placeholder="ConfigHub.ResourceType = 'networking.k8s.io/v1/NetworkPolicy'"
                helperText='Only the Units holding resources this expression selects, and only those resources are passed.'
                slotProps={{
                  htmlInput: { 'data-testid': `trigger-selection-where-resource-${index}` },
                }}
              />
            )}
          />
        </Stack>
      ))}
      <Button
        size='small'
        startIcon={<AddIcon />}
        onClick={() =>
          selections.append({ key: '', where: '', filterId: '', whereResource: '' })
        }
        data-testid='trigger-selection-add'
        sx={{ textTransform: 'none' }}
      >
        Add selection
      </Button>
      {children}
    </SectionCard>
  );
};
