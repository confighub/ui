// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The sections of the Link drawer's form, each shown only for the UpdateTypes that take its fields
// (`linkTypeFields`).
import type { ReactNode } from 'react';

import { type Control, Controller, type Path, get, useFieldArray, useWatch } from 'react-hook-form';

import { ClearanceFieldSection } from '@/components/clearance-field/ClearanceFieldSection';
import { EntityRefSelect } from '@/components/entity-ref-select/EntityRefSelect';
import { useParameterlessInvocationRefOptions } from '@/components/entity-ref-select/useEntityRefOptions';
import { MapFieldSection } from '@/components/map-field-editor/MapFieldSection';
import { SectionCard } from '@/components/styled';
import type { LinkRead } from '@confighub/rtk-query';
import Add from '@mui/icons-material/Add';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  EVALUATORS,
  INSERT_DATA_TYPES,
  type LinkFormInput,
  type LinkTypeFields,
  VALUE_DATA_TYPES,
  emptyBindingRow,
  emptyDownstreamPathRow,
  emptyUpstreamPathRow,
  referencedParameters,
} from './linkForm';
import { formatFunctionCall } from './linkFormat';
import { ListTable } from './LinkTables';

type LinkControl = Control<LinkFormInput>;

/** A merge key or binding Key: letters, digits, '-' and '_', starting with a letter or digit. */
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** An upstream value's Name, which expressions refer to: a legal Go and CEL identifier. */
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** The columns chosen from a list, which always hold a value and so do not count as filled in. */
const SELECT_COLUMNS = new Set(['DataType', 'Evaluator']);

/** Whether every text field of the row is blank, which leaves the row out of the Link. */
const rowIsBlank = (row: object | undefined): boolean =>
  !row ||
  Object.entries(row).every(
    ([column, value]) => SELECT_COLUMNS.has(column) || typeof value !== 'string' || !value.trim(),
  );

/**
 * A text field of one row of a list. A required field is required only once the row has
 * something in it, since a blank row is dropped.
 */
function RowText({
  control,
  row,
  column,
  label,
  placeholder,
  required = false,
  pattern,
  multiline = false,
  disabled = false,
  testId,
  size = 4,
}: {
  control: LinkControl;
  row: string;
  column: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  pattern?: [RegExp, string];
  multiline?: boolean;
  disabled?: boolean;
  testId?: string;
  size?: number;
}) {
  return (
    <Grid size={{ xs: 12, md: size }}>
      <Controller
        name={`${row}.${column}` as Path<LinkFormInput>}
        control={control}
        rules={{
          validate: (value, values) => {
            const text = String(value ?? '').trim();
            if (rowIsBlank(get(values, row))) return true;
            if (required && !text) return `${label} is required`;
            if (pattern && text && !pattern[0].test(text)) return pattern[1];
            return true;
          },
        }}
        render={({ field, fieldState }) => (
          <TextField
            {...field}
            value={field.value ?? ''}
            label={label}
            size='small'
            fullWidth
            multiline={multiline}
            maxRows={6}
            placeholder={placeholder}
            disabled={disabled}
            error={!!fieldState.error}
            helperText={fieldState.error?.message}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': testId } }}
          />
        )}
      />
    </Grid>
  );
}

function RowSelect({
  control,
  row,
  column,
  label,
  options,
  size = 2,
  testId,
}: {
  control: LinkControl;
  row: string;
  column: string;
  label: string;
  options: readonly string[];
  size?: number;
  testId?: string;
}) {
  return (
    <Grid size={{ xs: 6, md: size }}>
      <Controller
        name={`${row}.${column}` as Path<LinkFormInput>}
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value ?? ''}
            select
            label={label}
            size='small'
            fullWidth
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': testId } }}
          >
            {/* A stored value the list does not name is still shown as it is. */}
            {(options.includes(String(field.value)) || !field.value ? options : [String(field.value), ...options]).map(
              (option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ),
            )}
          </TextField>
        )}
      />
    </Grid>
  );
}

/** One row of a list editor: its fields, and a button that removes it. */
function RowFrame({ label, onRemove, children }: { label: string; onRemove: () => void; children: ReactNode }) {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1.5 }}>
      <Stack direction='row' spacing={1} alignItems='flex-start'>
        <Grid container spacing={1.5} sx={{ flex: 1 }}>
          {children}
        </Grid>
        <IconButton aria-label={`Remove ${label}`} onClick={onRemove} size='small'>
          <DeleteOutline fontSize='small' />
        </IconButton>
      </Stack>
    </Box>
  );
}

function SwitchField({
  control,
  name,
  label,
  help,
  disabled = false,
  testId,
}: {
  control: LinkControl;
  name: 'AutoUpdate' | 'Squash' | 'MergeEnableSubtraction' | 'Protect';
  label: string;
  help: ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Box data-testid={testId}>
          <FormControlLabel
            control={
              <Switch
                checked={!!field.value}
                disabled={disabled}
                onChange={(_, checked) => field.onChange(checked)}
              />
            }
            label={label}
          />
          <FormHelperText sx={{ mt: 0 }}>{help}</FormHelperText>
        </Box>
      )}
    />
  );
}

/** How the Link resolves: automatically or when asked, and which upstream resources it reads. */
export function ResolveCard({
  control,
  takes,
  upstreamToolchain,
  currentInvocationLabel,
}: {
  control: LinkControl;
  takes: LinkTypeFields;
  /** The upstream Unit's toolchain, which a transform Invocation has to match */
  upstreamToolchain: string;
  currentInvocationLabel?: string;
}) {
  const { options: invocations, isFetching } = useParameterlessInvocationRefOptions(
    upstreamToolchain,
    !takes.transformInvocation,
  );
  if (!takes.autoUpdate) return null;
  return (
    <SectionCard title='Resolution'>
      <Stack spacing={2}>
        <SwitchField
          control={control}
          name='AutoUpdate'
          label='Auto update'
          help='Update the downstream Unit whenever the upstream Unit changes. Without it, the Link is marked Stale until it is resolved.'
          testId='link-auto-update'
        />
        {takes.whereResource && (
          <Controller
            name='WhereResource'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label='Where resource'
                size='small'
                fullWidth
                placeholder="ConfigHub.ResourceType = 'apps/v1/Deployment'"
                helperText='Only the upstream resources this expression selects are propagated.'
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-where-resource' } }}
              />
            )}
          />
        )}
        {takes.transformInvocation && (
          <Controller
            name='TransformInvocationID'
            control={control}
            render={({ field }) => (
              <EntityRefSelect
                label='Transform invocation'
                value={field.value}
                onChange={field.onChange}
                options={invocations}
                loading={isFetching}
                currentLabel={currentInvocationLabel}
                helperText={`A non-mutating ${upstreamToolchain || 'upstream'} function producing YAML, run on the upstream configuration before it is inserted.`}
                testId='link-transform-invocation'
              />
            )}
          />
        )}
      </Stack>
    </SectionCard>
  );
}

/** How a MergeUnits or UpgradeUnit Link merges its range of upstream Revisions. */
export function MergeCard({ control, takes }: { control: LinkControl; takes: LinkTypeFields }) {
  if (!takes.merge) return null;
  return (
    <SectionCard title='Merge'>
      <Stack spacing={2}>
        <Controller
          name='WhereMutation'
          control={control}
          render={({ field }) => (
            <TextField
              {...field}
              label='Where mutation'
              size='small'
              fullWidth
              placeholder="Source = 'UI'"
              helperText='Mutations of the downstream Unit whose paths a merge must not overwrite, in addition to the paths the Unit keeps on merge.'
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'link-where-mutation' } }}
            />
          )}
        />
        <SwitchField
          control={control}
          name='Squash'
          label='Squash'
          help='Merge the upstream changes as one diff in one Revision, instead of one downstream Revision for each upstream Revision.'
          testId='link-squash'
        />
        <SwitchField
          control={control}
          name='MergeEnableSubtraction'
          label='Subtract local differences'
          help="Also subtract the downstream Unit's local differences from the upstream changes before merging them."
          testId='link-merge-enable-subtraction'
        />
      </Stack>
    </SectionCard>
  );
}

/**
 * What the Link says about the paths its resolve writes: whether a merge from upstream keeps
 * them, the guards it records on them, and the guards it is cleared to write over.
 */
export function WritesCard({
  control,
  takes,
  notCleared,
  onClearGuards,
}: {
  control: LinkControl;
  takes: LinkTypeFields;
  /** The guards the Link records that its clearance does not cover, as `key=value` */
  notCleared: string[];
  onClearGuards: () => void;
}) {
  if (!takes.clearance) return null;
  return (
    <SectionCard title='Writes'>
      <Stack spacing={2}>
        {takes.protectAndGuards ? (
          <>
            <SwitchField
              control={control}
              name='Protect'
              label='Keep on merge'
              help='Record the paths this Link writes as kept on merge, so a merge from upstream does not overwrite them. For a Link that delivers a value the downstream Unit then owns.'
              testId='link-protect'
            />
            <MapFieldSection
              control={control}
              name='Guards'
              title='Guards'
              description='Reasons to record on the paths this Link writes, so a later change has to be cleared for them before overwriting.'
              itemLabel='guard'
              validation='label'
              keyPlaceholder='owner'
              valuePlaceholder='transform-link'
              testId='link-guards'
            />
          </>
        ) : (
          <Typography variant='body2' color='text.secondary'>
            A merge Link does not keep or guard the paths it writes. Keeping them would stop later merges from
            updating them, and the only guards a merge carries are the ones the upstream Unit marks inherited. Keep
            or guard a path of the downstream Unit from its Blame tab.
          </Typography>
        )}
        <ClearanceFieldSection
          control={control}
          name='Clearance'
          description='The guards this Link may write over. A path whose guards it is not cleared for is left as it is, and the change is recorded as a conflict.'
          testId='link-clearance'
        />
        {notCleared.length > 0 && (
          <Box
            role='alert'
            sx={{ border: '1px solid', borderColor: 'warning.main', borderRadius: 1, p: 1.5 }}
            data-testid='link-guards-not-cleared'
          >
            <Typography variant='body2'>
              The Link records guards its clearance does not cover: {notCleared.join(', ')}. Its own next write would
              be withheld by them, so the server refuses to save it this way.
            </Typography>
            <Button size='small' onClick={onClearGuards} sx={{ mt: 1 }} data-testid='link-clear-guards'>
              Clear the Link for its guards
            </Button>
          </Box>
        )}
      </Stack>
    </SectionCard>
  );
}

/** The bindings stated for a NeedsProvides Link, or an Insert Link's one place to insert at. */
export function ManualBindingsCard({ control, takes }: { control: LinkControl; takes: LinkTypeFields }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'ManualBindings' });
  if (!takes.manualBindings) return null;
  const insert = takes.oneNeededBinding;
  return (
    <SectionCard title={insert ? 'Insert at' : 'Manual bindings'} badge={insert ? undefined : fields.length}>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
        {insert
          ? 'The path in the downstream Unit where the upstream configuration is inserted: as a string, or, with the downstream Unit’s format as the data type, as configuration data.'
          : 'Bindings resolution uses as they are: each sets a needed path of the downstream Unit from a provided path of the upstream Unit. Resolution finds the rest itself.'}
      </Typography>
      {fields.map((row, index) => {
        const path = `ManualBindings.${index}`;
        return (
          <RowFrame key={row.id} label={`binding ${index + 1}`} onRemove={() => remove(index)}>
            {!insert && (
              <>
                <RowText control={control} row={path} column='Key' label='Key' pattern={[KEY_PATTERN, 'Letters, digits, - and _, starting with a letter or digit']} size={3} />
                <RowText control={control} row={path} column='AttributeName' label='Attribute' placeholder='namespace-name' size={3} />
              </>
            )}
            <RowSelect
              control={control}
              row={path}
              column='DataType'
              label='Data type'
              options={insert ? INSERT_DATA_TYPES : VALUE_DATA_TYPES}
              size={insert ? 3 : 2}
              testId={`link-binding-data-type-${index}`}
            />
            <Grid size={12}>
              <Typography variant='caption' color='text.secondary'>
                Needed, in the downstream Unit
              </Typography>
            </Grid>
            <RowText control={control} row={path} column='NeededResourceType' label='Resource type' placeholder='apps/v1/Deployment' required testId={`link-binding-needed-type-${index}`} size={3} />
            <RowText control={control} row={path} column='NeededResourceName' label='Resource name' placeholder='default/app' required testId={`link-binding-needed-name-${index}`} size={3} />
            <RowText control={control} row={path} column='NeededPath' label='Path' placeholder='metadata.namespace' required testId={`link-binding-needed-path-${index}`} size={6} />
            {!insert && (
              <>
                <Grid size={12}>
                  <Typography variant='caption' color='text.secondary'>
                    Provided, by the upstream Unit
                  </Typography>
                </Grid>
                <RowText control={control} row={path} column='ProvidedResourceType' label='Resource type' placeholder='v1/Namespace' required size={3} />
                <RowText control={control} row={path} column='ProvidedResourceName' label='Resource name' placeholder='/app' required size={3} />
                <RowText control={control} row={path} column='ProvidedPath' label='Path' placeholder='metadata.name' required size={6} />
              </>
            )}
          </RowFrame>
        );
      })}
      {(!insert || fields.length === 0) && (
        <Button size='small' startIcon={<Add />} onClick={() => append(emptyBindingRow())} data-testid='link-binding-add'>
          {insert ? 'Add the place to insert at' : 'Add binding'}
        </Button>
      )}
    </SectionCard>
  );
}

/** A TransformPaths Link's upstream values and the downstream values computed from them. */
export function TransformPathsCard({
  control,
  takes,
  link,
}: {
  control: LinkControl;
  takes: LinkTypeFields;
  /** The stored Link, for the getters and setters the form shows rather than edits */
  link?: LinkRead;
}) {
  const upstream = useFieldArray({ control, name: 'UpstreamPaths' });
  const downstream = useFieldArray({ control, name: 'DownstreamPaths' });
  const upstreamRows = useWatch({ control, name: 'UpstreamPaths' });
  const downstreamRows = useWatch({ control, name: 'DownstreamPaths' });
  if (!takes.transformPaths) return null;

  const getters = link?.UpstreamGetters ?? [];
  const setters = link?.DownstreamSetters ?? [];
  const names = new Set([
    ...(upstreamRows ?? []).map((row) => row.Name.trim()),
    ...getters.map((getter) => getter.Name ?? ''),
  ]);

  return (
    <>
      <SectionCard title='Upstream paths' badge={upstream.fields.length}>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Values read from the upstream Unit. An expression refers to one by its name, as{' '}
          <code>{'{{.Params.<name>}}'}</code> in a template and <code>{'params.<name>'}</code> in CEL.
        </Typography>
        {upstream.fields.map((row, index) => {
          const path = `UpstreamPaths.${index}`;
          return (
            <RowFrame key={row.id} label={`upstream path ${index + 1}`} onRemove={() => upstream.remove(index)}>
              <RowText control={control} row={path} column='Name' label='Name' placeholder='tag' required pattern={[NAME_PATTERN, 'Letters, digits and _, not starting with a digit']} size={3} testId={`link-upstream-name-${index}`} />
              <RowText control={control} row={path} column='ResourceType' label='Resource type' placeholder='apps/v1/Deployment' required size={3} testId={`link-upstream-type-${index}`} />
              <RowText control={control} row={path} column='ResourceName' label='Resource name' placeholder='default/app' required size={3} testId={`link-upstream-resource-${index}`} />
              <RowText control={control} row={path} column='Path' label='Path' placeholder='spec.replicas' required size={3} testId={`link-upstream-path-${index}`} />
            </RowFrame>
          );
        })}
        <Button size='small' startIcon={<Add />} onClick={() => upstream.append(emptyUpstreamPathRow())} data-testid='link-upstream-add'>
          Add upstream path
        </Button>
      </SectionCard>

      {getters.length > 0 && (
        <SectionCard title='Upstream getters' badge={getters.length}>
          <ListTable
            columns={['Name', 'Function']}
            rows={getters.map((getter) => [getter.Name ?? '', formatFunctionCall(getter.FunctionInvocation)])}
          />
          <FormHelperText>Edit getters with Edit as YAML.</FormHelperText>
        </SectionCard>
      )}

      <SectionCard title='Downstream paths' badge={downstream.fields.length}>
        <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
          Values written to the downstream Unit, each the result of an expression over the upstream values and the
          downstream Unit&apos;s Space and Unit fields.
        </Typography>
        {downstream.fields.map((row, index) => {
          const path = `DownstreamPaths.${index}`;
          const unknown = referencedParameters(downstreamRows?.[index]?.Expression ?? '').filter((n) => !names.has(n));
          return (
            <RowFrame key={row.id} label={`downstream path ${index + 1}`} onRemove={() => downstream.remove(index)}>
              <RowText control={control} row={path} column='ResourceType' label='Resource type' placeholder='apps/v1/Deployment' required size={4} testId={`link-downstream-type-${index}`} />
              <RowText control={control} row={path} column='ResourceName' label='Resource name' placeholder='default/app' required size={4} testId={`link-downstream-resource-${index}`} />
              <RowText control={control} row={path} column='Key' label='Key' pattern={[KEY_PATTERN, 'Letters, digits, - and _, starting with a letter or digit']} size={4} />
              <RowText control={control} row={path} column='Path' label='Path' placeholder='spec.template.spec.containers.?name=app.image' required size={12} testId={`link-downstream-path-${index}`} />
              <RowText control={control} row={path} column='Expression' label='Expression' placeholder='ghcr.io/org/app:{{.Params.tag}}' required multiline size={8} testId={`link-downstream-expression-${index}`} />
              <RowSelect control={control} row={path} column='Evaluator' label='Evaluator' options={EVALUATORS} />
              <RowSelect control={control} row={path} column='DataType' label='Data type' options={VALUE_DATA_TYPES} />
              {unknown.length > 0 && (
                <Grid size={12}>
                  <FormHelperText error>
                    The expression refers to {unknown.join(', ')}, which no upstream path or getter names.
                  </FormHelperText>
                </Grid>
              )}
            </RowFrame>
          );
        })}
        <Button size='small' startIcon={<Add />} onClick={() => downstream.append(emptyDownstreamPathRow())} data-testid='link-downstream-add'>
          Add downstream path
        </Button>
      </SectionCard>

      {setters.length > 0 && (
        <SectionCard title='Downstream setters' badge={setters.length}>
          <ListTable
            columns={['Function', 'Parameters']}
            rows={setters.map((setter) => [formatFunctionCall(setter.FunctionInvocation), (setter.Parameters ?? []).join(', ')])}
          />
          <FormHelperText>Edit setters with Edit as YAML.</FormHelperText>
        </SectionCard>
      )}
    </>
  );
}

/** Labels, Annotations and Delete gates, as every entity's settings form edits them. */
export function MetadataSections({ control }: { control: LinkControl }) {
  return (
    <>
      <MapFieldSection
        control={control}
        name='Labels'
        title='Labels'
        itemLabel='label'
        validation='label'
        keyPlaceholder='Environment'
        valuePlaceholder='production'
        testId='link-labels'
      />
      <MapFieldSection
        control={control}
        name='Annotations'
        title='Annotations'
        itemLabel='annotation'
        validation='annotation'
        multilineValues
        testId='link-annotations'
      />
      <MapFieldSection
        control={control}
        name='DeleteGates'
        title='Delete Gates'
        description='Delete gates prevent accidental deletion of this Link. Remove all gates before deletion.'
        itemLabel='delete gate'
        validation='label'
        keysOnly
        keyPlaceholder='e.g., manual-review'
        testId='link-delete-gates'
      />
    </>
  );
}
