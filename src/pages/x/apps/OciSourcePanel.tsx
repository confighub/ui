// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The new-component wizard's "OCI reference" source: a reference, an optional
// release namespace and registry credentials, the upload settings that only an
// OCI create has, and a Preview that has the server pull the bundle and plan the
// upload without writing anything.

import { useState } from 'react';

import { type ArrayPath, type Control, Controller, type FieldValues, type Path } from 'react-hook-form';

import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import type { UploadResult } from '@confighub/rtk-query';
import type { QueryErrorDisplay } from '@/utility/error-functions';

import { componentTheme } from './componentTheme';
import { KeyValueRows } from './KeyValueRows';
import {
  type OciSourceForm,
  describeUploadResource,
  ociSourceProblem,
  sourceNameProblem,
  uploadSkippedSecrets,
  uploadUnits,
} from './ociUpload';

/**
 * Generic over the form the unit-metadata rows live in, so the panel does not
 * have to know the shape of the wizard's whole form. The wizard holds the rows,
 * because it is what builds the create request from them.
 */
export interface OciSourcePanelProps<TFieldValues extends FieldValues> {
  form: OciSourceForm;
  onChange: (form: OciSourceForm) => void;
  onPreview: () => void;
  /** Aborts the pull that runs now. */
  onCancelPreview: () => void;
  previewing: boolean;
  /** True when the pull runs long enough that a bare spinner looks like a hang. */
  pullIsSlow: boolean;
  /** The current preview, or null when there is none or the inputs changed since. */
  preview: UploadResult | null;
  /** True when a preview was made but an input changed after it. */
  previewIsStale: boolean;
  /**
   * The failed pull, already classified. Null when the pull did not fail, and
   * also when the user cancelled it — a cancel shows no error at all.
   */
  previewError: QueryErrorDisplay | null;
  /** Why the preview can't be created from, such as an existing base Space. */
  previewBlocker: string | null;
  /** The live component slug, which is what the server names the source by default. */
  componentSlug: string;
  control: Control<TFieldValues>;
  /** The field-array path holding `UnitMetaRow`s. */
  unitMetaName: ArrayPath<TFieldValues>;
  /** That field array's rows, straight from `useFieldArray`. */
  unitMetaFields: Array<{ id: string }>;
  onAddUnitMeta: () => void;
  onRemoveUnitMeta: (index: number) => void;
}

/** The inset MUI gives a field's helper text, matched by the panel's block explainers. */
const HELPER_GUTTER = '14px';

/**
 * The bordered surface the wizard's other source modes already sit on (the
 * manual-unit box and the granularity box in CreateComponentPane). OCI groups
 * carry it too so the mode reads as part of the same wizard, not a flat page
 * bolted on beside three contained ones.
 */
const SURFACE_SX = {
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: `${componentTheme.radiusMd}px`,
  p: 1.5,
} as const;

export function OciSourcePanel<TFieldValues extends FieldValues>({
  form,
  onChange,
  onPreview,
  onCancelPreview,
  previewing,
  pullIsSlow,
  preview,
  previewIsStale,
  previewError,
  previewBlocker,
  componentSlug,
  control,
  unitMetaName,
  unitMetaFields,
  onAddUnitMeta,
  onRemoveUnitMeta,
}: OciSourcePanelProps<TFieldValues>) {
  const [credentialsOpen, setCredentialsOpen] = useState(!!form.username);
  const [advancedOpen, setAdvancedOpen] = useState(!!form.sourceName);
  const problem = ociSourceProblem(form);
  const sourceNameError = sourceNameProblem(form.sourceName);
  // A bad source name blocks Preview, so it is never left hidden behind a
  // collapsed disclosure with nothing on screen to explain the dead button.
  const advancedExpanded = advancedOpen || !!sourceNameError;
  // Only nag about the reference once something has been typed.
  const refTouched = form.ref.trim() !== '';
  const set = (patch: Partial<OciSourceForm>) => onChange({ ...form, ...patch });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ ...SURFACE_SX, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField
          label='OCI reference'
          size='small'
          fullWidth
          value={form.ref}
          onChange={(e) => set({ ref: e.target.value })}
          placeholder='oci://ghcr.io/confighub/configs/cubbychat:1.4.0'
          error={refTouched && !!problem && problem.includes('reference')}
          helperText={
            refTouched && problem?.includes('reference')
              ? problem
              : 'One unit per resource'
          }
          inputProps={{ spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off' }}
          data-testid='create-component-oci-ref-input'
          // JetBrains Mono's ligatures draw "://" as ": /", which misreads a reference.
          sx={{
            '& .MuiInputBase-input': { fontFamily: componentTheme.fontMono, fontSize: 12.5, fontVariantLigatures: 'none' },
          }}
        />
        <TextField
          label='Release namespace (optional)'
          size='small'
          fullWidth
          value={form.namespace}
          onChange={(e) => {
            const namespace = e.target.value;
            // The server refuses CreateNamespace without a Namespace. Clearing the
            // name here clears the flag too, so emptying the field cannot leave a
            // checked box the user can no longer reach to uncheck.
            set(namespace.trim() ? { namespace } : { namespace, createNamespace: false });
          }}
          placeholder='e.g. cubbychat'
          error={!!problem && problem.includes('namespace')}
          helperText={
            problem?.includes('namespace')
              ? problem
              : 'For resources that name no namespace'
          }
          inputProps={{ spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off' }}
          data-testid='create-component-oci-namespace-input'
        />
        <Box sx={{ mt: -1 }}>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Checkbox
                size='small'
                checked={form.createNamespace}
                disabled={!form.namespace.trim()}
                onChange={(e) => set({ createNamespace: e.target.checked })}
                data-testid='create-component-oci-create-namespace'
              />
            }
            label={<Typography sx={{ fontSize: 12.5 }}>Create this namespace</Typography>}
          />
          <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, pl: 3.75 }}>
            Adds the release Namespace when the bundle does not have it. A new namespace gets the
            cluster's pod-security and NetworkPolicy defaults, so leave this off when it already exists.
          </Typography>
        </Box>
      </Box>

      <Box sx={SURFACE_SX}>
        <Button
          size='small'
          onClick={() => setCredentialsOpen((o) => !o)}
          aria-expanded={credentialsOpen}
          startIcon={
            <ChevronRightIcon
              sx={{ transform: credentialsOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            />
          }
          sx={{ textTransform: 'none' }}
        >
          Registry credentials (private registries)
        </Button>
        <Collapse in={credentialsOpen}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <TextField
                label='Username'
                size='small'
                value={form.username}
                onChange={(e) => set({ username: e.target.value })}
                autoComplete='off'
                sx={{ flex: '1 1 160px' }}
              />
              <TextField
                label='Password or token'
                size='small'
                type='password'
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
                autoComplete='new-password'
                sx={{ flex: '1 1 160px' }}
              />
            </Box>
            <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, ml: HELPER_GUTTER }}>
              Sent with the pull and used only for it. ConfigHub doesn't store them.
            </Typography>
            {problem?.includes('credentials') && (
              <Typography sx={{ fontSize: 11, color: componentTheme.attention, ml: HELPER_GUTTER }}>
                {problem}
              </Typography>
            )}
          </Box>
        </Collapse>
      </Box>

      <Box sx={SURFACE_SX}>
        <Button
          size='small'
          onClick={() => setAdvancedOpen((o) => !o)}
          aria-expanded={advancedExpanded}
          startIcon={
            <ChevronRightIcon
              sx={{ transform: advancedExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            />
          }
          sx={{ textTransform: 'none' }}
        >
          Advanced — source name and unit metadata
        </Button>
        <Collapse in={advancedExpanded}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
            <TextField
              label='Source name (optional)'
              size='small'
              fullWidth
              value={form.sourceName}
              onChange={(e) => set({ sourceName: e.target.value })}
              placeholder={componentSlug || 'component-name'}
              error={!!sourceNameError}
              helperText={sourceNameError ?? 'Defaults to the component name'}
              inputProps={{ spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', autoComplete: 'off' }}
              data-testid='create-component-oci-source-name-input'
            />
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgMuted, mb: 1 }}>
                Unit labels and annotations
              </Typography>
              <KeyValueRows
                control={control}
                name={unitMetaName}
                fields={unitMetaFields}
                onAdd={onAddUnitMeta}
                onRemove={onRemoveUnitMeta}
                keyPlaceholder='team'
                valuePlaceholder='checkout'
                addLabel='Add label or annotation'
                itemLabel='unit label or annotation'
                rowPrefix={(index) => (
                  <Controller
                    name={`${unitMetaName}.${index}.kind` as Path<TFieldValues>}
                    control={control}
                    render={({ field }) => (
                      <ToggleButtonGroup
                        exclusive
                        size='small'
                        value={field.value}
                        // A null value is the user clicking the button that is
                        // already on. A row is always one kind or the other, so
                        // that click changes nothing.
                        onChange={(_e, next) => next && field.onChange(next)}
                        aria-label={`Kind of unit metadata ${index + 1}`}
                        sx={{ flexShrink: 0, '& .MuiToggleButton-root': { textTransform: 'none', px: 1.25, py: 0.6, fontSize: 11.5 } }}
                      >
                        <ToggleButton value='label'>Label</ToggleButton>
                        <ToggleButton value='annotation'>Annotation</ToggleButton>
                      </ToggleButtonGroup>
                    )}
                  />
                )}
              />
              <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, mt: 0.5, ml: HELPER_GUTTER }}>
                Written on every unit the upload creates. A label is for filters and queries; an
                annotation is for longer text nothing queries.
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
          pt: 1.5,
          borderTop: `1px solid ${componentTheme.borderMuted}`,
        }}
      >
        <Button
          variant='outlined'
          size='small'
          onClick={onPreview}
          disabled={!!problem || previewing}
          startIcon={previewing ? <CircularProgress size={14} color='inherit' /> : undefined}
          data-testid='create-component-oci-preview-button'
          sx={{ textTransform: 'none' }}
        >
          {previewing ? 'Pulling…' : preview ? 'Preview again' : 'Preview'}
        </Button>
        {previewing && pullIsSlow && (
          <>
            <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle }} data-testid='create-component-oci-slow-pull'>
              The server still pulls the bundle from the registry. This can take up to 2 minutes.
            </Typography>
            <Button
              variant='text'
              size='small'
              onClick={onCancelPreview}
              data-testid='create-component-oci-cancel-button'
              sx={{ textTransform: 'none' }}
            >
              Cancel
            </Button>
          </>
        )}
        {!previewing && previewIsStale && (
          <Typography sx={{ fontSize: 11.5, color: componentTheme.attention }} data-testid='create-component-oci-stale-preview'>
            The inputs changed after the last preview. Preview again before you create the component.
          </Typography>
        )}
        {!preview && !previewing && !previewIsStale && !previewError && (
          <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle }}>
            Preview the units before creating. Nothing is written.
          </Typography>
        )}
      </Box>

      {previewError && (
        <Alert severity='error' sx={{ fontSize: 12 }} data-testid='create-component-oci-preview-error'>
          <AlertTitle sx={{ fontSize: 13, fontWeight: 700 }}>{previewError.headline}</AlertTitle>
          {previewError.suggestion}
          {previewError.detail && <OciErrorDetail detail={previewError.detail} />}
        </Alert>
      )}
      {preview && previewBlocker && (
        <Alert severity='error' sx={{ fontSize: 12 }}>
          {previewBlocker}
        </Alert>
      )}
      {preview && <OciPlanList result={preview} />}
    </Box>
  );
}

/**
 * The server's own message under a classified error. A failed pull reads
 * `failed to pull <ref>: <cause>`, and that cause is what tells the user
 * whether the registry refused them, the tag is wrong, or the name does not
 * resolve — so it stays on screen, quieter than the copy above it.
 */
export function OciErrorDetail({ detail }: { detail: string }) {
  return (
    <Typography
      data-testid='create-component-oci-error-detail'
      sx={{
        mt: 0.5,
        fontSize: 11,
        fontFamily: componentTheme.fontMono,
        color: componentTheme.fgMuted,
        wordBreak: 'break-word',
      }}
    >
      {detail}
    </Typography>
  );
}

/** The Units a dry-run upload planned, with the digest it pulled. */
export function OciPlanList({ result }: { result: UploadResult }) {
  const units = uploadUnits(result);
  const skipped = uploadSkippedSecrets(result);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }} data-testid='create-component-oci-plan'>
      <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgMuted }}>
        Units to create · {units.length}
      </Typography>
      {result.SourceDigest && (
        <Typography
          sx={{ fontSize: 10.5, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle, wordBreak: 'break-all' }}
        >
          {result.SourceDigest}
        </Typography>
      )}
      {units.map((u) => (
        <Box
          key={u.Resource ?? u.Slug}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.25,
            py: 0.5,
            border: `1px solid ${componentTheme.borderMuted}`,
            borderRadius: `${componentTheme.radiusSm}px`,
            minWidth: 0,
          }}
        >
          <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            {u.Slug}
          </Typography>
          <Typography
            sx={{
              fontFamily: componentTheme.fontMono,
              fontSize: 11,
              color: componentTheme.fgSubtle,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
            title={u.Resource}
          >
            {describeUploadResource(u.Resource)}
          </Typography>
          {u.Role && u.Role !== 'Resource' && (
            <Chip label={u.Role} size='small' variant='outlined' sx={{ height: 18, fontSize: 10 }} />
          )}
        </Box>
      ))}
      {skipped.length > 0 && (
        <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
          {skipped.length} Secret{skipped.length === 1 ? ' is' : 's are'} skipped — author Secrets separately.
        </Typography>
      )}
    </Box>
  );
}
