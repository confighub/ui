// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';
import { type NodeProps, useStore } from 'reactflow';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import type { TargetRead } from '@confighub/rtk-query';
import { componentTheme } from '../componentTheme';
import type { OverallPhase, PerSpacePhase, PerSpaceStatus } from '../useCreateVariantMutation';
import { sanitizeVariantSlug, validateVariantName } from '../variantValidation';
import { COMPOSER_WIDTH } from './composerLayout';

// ============================================================================
// TYPES
// ============================================================================

export interface ComposerSubmitValues {
  variantNames: string[];
  targetId?: string;
  namespace?: string;
}

export interface ComposerNodeData {
  /** The deployment (Space) this variant will be cloned from. */
  parentId: string;
  parentSlug: string;
  componentSlug: string;
  /** Existing sibling variant names, for client-side collision validation. */
  siblingVariantNames: string[];
  targets: TargetRead[];
  hasK8sUnits: boolean;
  overallPhase: OverallPhase;
  /** Keyed by requested name — see useCreateVariantMutation.ts's docstring on why. */
  perSpaceStatus: Map<string, PerSpaceStatus>;
  onSubmit: (values: ComposerSubmitValues) => void;
  onCancel: () => void;
  onRetryNamespace: (name: string) => void;
}

interface ParsedNameRow {
  name: string;
  isCollision: boolean;
  isInvalid: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Splits the name field on commas — the composer's one input doubles as a
 *  list field, taught by the hint below it (mirrors the accepted design
 *  mockup). Blank segments (trailing commas, doubled commas) are dropped. */
function parseNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const segment of raw.split(',')) {
    const name = segment.trim();
    if (!name) continue;
    const key = sanitizeVariantSlug(name);
    if (seen.has(key)) continue; // de-dupe by slug — "dev, dev" is one request
    seen.add(key);
    names.push(name);
  }
  return names;
}

const PHASE_LABEL: Record<PerSpacePhase, string> = {
  cloning: 'Cloning space…',
  cloningUnits: 'Cloning units…',
  namespacing: 'Setting namespace…',
  success: 'Created',
  nameCollision: 'Already exists',
  cloneFailed: 'Failed',
  unitCloneFailed: 'Unit clone failed',
  namespaceFailed: 'Namespace failed',
};

const IN_FLIGHT_ROW_PHASES: ReadonlySet<PerSpacePhase> = new Set(['cloning', 'cloningUnits', 'namespacing']);
const FAILED_ROW_PHASES: ReadonlySet<PerSpacePhase> = new Set([
  'nameCollision',
  'cloneFailed',
  'unitCloneFailed',
  'namespaceFailed',
]);

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * The inline on-canvas composer — a real ReactFlow node (not a docked pane)
 * anchored to its parent's lane. Positioned by composerLayout.ts, entered by
 * DeploymentFlowNode's click affordance or the 'V' key
 * (ComponentFlowGraph.tsx), and submits through useCreateVariantMutation —
 * N names in one session (Phase 2): the same name field doubles as a
 * comma-separated list, one bulkCreateSpaces + one bulkCreateUnits call
 * clone all of them, and each requested name gets its own status row so one
 * space's failure never blocks or hides the others.
 *
 * Counter-scaled against the live canvas zoom so it never shrinks below its
 * authored size — a registered node type gets viewport POSITIONING for
 * free, but still renders inside the pane's `scale(zoom)` transform like
 * every other card unless it cancels that out itself. `useStore` (not
 * `useReactFlow().getZoom()`) is required here specifically because it's
 * reactive: this component must re-render as zoom changes, not just read
 * the zoom once at mount.
 */
function ComposerNodeImpl({ data }: NodeProps<ComposerNodeData>) {
  const {
    parentId,
    parentSlug,
    componentSlug,
    siblingVariantNames,
    targets,
    hasK8sUnits,
    overallPhase,
    perSpaceStatus,
    onSubmit,
    onCancel,
    onRetryNamespace,
  } = data;

  const [draft, setDraft] = useState('');
  const [targetId, setTargetId] = useState('');
  const [namespace, setNamespace] = useState('');

  const zoom = useStore((s) => s.transform[2]);
  const counterScale = zoom > 0 ? 1 / zoom : 1;

  const isLocked = overallPhase === 'inFlight';
  const isPartialFailure = overallPhase === 'partialFailure';
  const hasSubmitted = overallPhase !== 'idle';

  const names = useMemo(() => parseNames(draft), [draft]);
  const isMulti = names.length > 1;

  const nameRows = useMemo<ParsedNameRow[]>(
    () =>
      names.map((name) => {
        const validation = validateVariantName(name, siblingVariantNames);
        return {
          name,
          isCollision: !validation.ok && validation.error === 'duplicate',
          isInvalid: !validation.ok && validation.error === 'invalid',
        };
      }),
    [names, siblingVariantNames],
  );

  // Collisions are skipped, not blocking — "a taken name is information,
  // not a mistake": asking for 4 names when 3 already exist should create
  // the 4th, not dead-end the whole gesture. An invalid name (bad
  // characters, sanitizes to nothing) IS blocking — that's a mistake to fix,
  // not information to skip.
  const invalidCount = nameRows.filter((r) => r.isInvalid).length;
  const freshNames = nameRows.filter((r) => !r.isCollision && !r.isInvalid).map((r) => r.name);
  const allCollided = names.length > 0 && invalidCount === 0 && freshNames.length === 0;

  const isFormReady = names.length > 0 && invalidCount === 0 && freshNames.length > 0;

  const singleName = !isMulti ? names[0] : undefined;
  const singleNameError = singleName ? nameRows[0] : undefined;

  const handleSubmit = useCallback(() => {
    if (!isFormReady || isLocked) return;
    onSubmit({
      variantNames: freshNames,
      targetId: targetId || undefined,
      namespace: namespace.trim() || undefined,
    });
  }, [isFormReady, isLocked, onSubmit, freshNames, targetId, namespace]);

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSubmit();
    },
    [handleSubmit],
  );

  const targetLabelId = `composer-target-label-${parentId}`;

  const statusRows = useMemo(() => Array.from(perSpaceStatus.values()), [perSpaceStatus]);
  const namespaceFailedCount = statusRows.filter((s) => s.phase === 'namespaceFailed').length;

  return (
    <Box
      className="nodrag nopan"
      // The counter-scale transform lives on THIS element, not the React
      // Flow node wrapper that contains it — a CSS transform never changes
      // the layout size a parent measures, so the outer `.react-flow__node`
      // always reports COMPOSER_WIDTH * zoom regardless of whether this
      // transform is applied at all. A test (or anything else) that needs
      // to observe the counter-scale actually working must measure THIS
      // element via this testid, not the node wrapper.
      data-testid="composer-scale-root"
      sx={{
        transform: `scale(${counterScale})`,
        transformOrigin: '0 0',
        width: COMPOSER_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        background: componentTheme.bgDefault,
        borderRadius: `${componentTheme.radiusLg}px`,
        boxShadow: componentTheme.shadowMd,
        border: isPartialFailure
          ? `2px solid ${componentTheme.danger}`
          : isLocked
            ? `2px solid ${componentTheme.accent}`
            : `1.5px dashed ${componentTheme.borderEmphasis}`,
      }}
    >
      <Box sx={{ p: '10px 12px 2px' }}>
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            color: componentTheme.fgSubtle,
          }}
        >
          New variant{isMulti ? 's' : ''} of {parentSlug}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: '6px 12px 12px' }}>
        <TextField
          label="Variant name"
          data-testid="composer-variant-name-input"
          size="small"
          fullWidth
          autoFocus
          required
          placeholder="name this variant"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleNameKeyDown}
          disabled={hasSubmitted}
          error={!!singleNameError?.isInvalid || invalidCount > 0}
          helperText={
            invalidCount > 0
              ? `${invalidCount} name${invalidCount > 1 ? 's' : ''} must produce a valid slug (letters, numbers, hyphens)`
              : singleName
                ? singleNameError?.isCollision
                  ? `A variant named "${singleName}" already exists in "${componentSlug}"`
                  : `Preview: ${componentSlug}/${sanitizeVariantSlug(singleName)}`
                : 'Separate with commas to create several at once'
          }
          inputProps={{ autoComplete: 'off' }}
        />

        {isMulti && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            {nameRows.map((row) => (
              <Box
                key={row.name}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  fontFamily: componentTheme.fontMono,
                  fontSize: 11,
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    fontWeight: 600,
                    color: row.isCollision ? componentTheme.fgSubtle : componentTheme.fgDefault,
                    textDecoration: row.isCollision ? 'line-through' : 'none',
                  }}
                >
                  {row.name}
                </Typography>
                {row.isCollision && (
                  <Typography component="span" sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: componentTheme.fgSubtle }}>
                    exists · skipped
                  </Typography>
                )}
                {row.isInvalid && (
                  <Typography component="span" sx={{ fontFamily: 'inherit', fontSize: 'inherit', color: componentTheme.danger }}>
                    invalid slug
                  </Typography>
                )}
              </Box>
            ))}
          </Box>
        )}

        <FormControl fullWidth size="small" disabled={hasSubmitted}>
          <InputLabel id={targetLabelId}>Target (optional)</InputLabel>
          <Select
            labelId={targetLabelId}
            data-testid="composer-target-select"
            label="Target (optional)"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            input={<OutlinedInput label="Target (optional)" />}
          >
            <MenuItem value="">
              <em>No target</em>
            </MenuItem>
            {targets.map((t) => (
              <MenuItem key={t.TargetID} value={t.TargetID ?? ''}>
                {t.Slug}
              </MenuItem>
            ))}
          </Select>
          <FormHelperText>Applied uniformly to all cloned units.</FormHelperText>
        </FormControl>

        <TextField
          label="Namespace (optional)"
          size="small"
          fullWidth
          value={namespace}
          onChange={(e) => setNamespace(e.target.value)}
          disabled={hasSubmitted}
          helperText={
            hasK8sUnits
              ? 'Applied to Kubernetes units in this variant.'
              : 'No Kubernetes units detected — this step will be skipped.'
          }
          inputProps={{ autoComplete: 'off' }}
        />

        {!hasSubmitted && (
          <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
            Note: custom links on the source unit will not be copied to the new variant.
          </Typography>
        )}

        {/* ── Per-space status list — rendered once a submit has happened.
            Each requested name gets its own row so one space's failure never
            blocks or hides the others (§3.5/§4 of the plan). ── */}
        {hasSubmitted && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {statusRows.map((row) => (
              <Box
                key={row.name}
                data-testid={`composer-status-row-${row.name}`}
                data-phase={row.phase}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.25,
                }}
              >
                {IN_FLIGHT_ROW_PHASES.has(row.phase) ? (
                  <CircularProgress size={12} thickness={5} />
                ) : row.phase === 'success' ? (
                  <CheckCircleIcon sx={{ fontSize: 14, color: componentTheme.success }} />
                ) : (
                  <ErrorOutlineIcon sx={{ fontSize: 14, color: componentTheme.danger }} />
                )}
                <Typography
                  sx={{
                    fontFamily: componentTheme.fontMono,
                    fontSize: 11,
                    fontWeight: 600,
                    color: componentTheme.fgDefault,
                    minWidth: 64,
                  }}
                >
                  {row.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: FAILED_ROW_PHASES.has(row.phase) ? componentTheme.danger : componentTheme.fgMuted,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.error?.detail}
                >
                  {PHASE_LABEL[row.phase]}
                  {row.error?.detail ? ` — ${row.error.detail}` : ''}
                </Typography>
                {row.phase === 'namespaceFailed' && (
                  <Button
                    size="small"
                    onClick={() => onRetryNamespace(row.name)}
                    sx={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', minWidth: 0, p: '2px 6px' }}
                  >
                    Retry
                  </Button>
                )}
              </Box>
            ))}
          </Box>
        )}

        {isPartialFailure && namespaceFailedCount === 0 && (
          <Alert severity="error" icon={<ErrorOutlineIcon fontSize="small" />} sx={{ fontSize: 12 }}>
            {statusRows.filter((s) => s.phase !== 'success').length} of {statusRows.length} could not be created —
            see above for details.
          </Alert>
        )}

        {isPartialFailure && namespaceFailedCount > 0 && (
          <Alert severity="warning" icon={<ErrorOutlineIcon fontSize="small" />} sx={{ fontSize: 12 }}>
            The space and units were cloned successfully for the row{namespaceFailedCount > 1 ? 's' : ''} above;
            namespace could not be set. Retry above or set it manually with{' '}
            <Box component="code" sx={{ fontFamily: componentTheme.fontMono, fontSize: 11 }}>
              cub namespace set
            </Box>
            .
          </Alert>
        )}
      </Box>

      <Box
        sx={{
          borderTop: `1px solid ${componentTheme.borderSubtle}`,
          p: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Button size="small" variant="outlined" onClick={onCancel} disabled={isLocked} sx={{ fontSize: 12 }}>
          {isPartialFailure ? 'Dismiss' : 'Cancel'}
        </Button>
        {!hasSubmitted && (
          <Button
            size="small"
            variant="contained"
            data-testid="composer-submit-button"
            onClick={handleSubmit}
            disabled={isLocked || !isFormReady}
            sx={{ fontSize: 12, ml: 'auto' }}
          >
            {isLocked ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={12} color="inherit" />
                Creating…
              </Box>
            ) : allCollided ? (
              'All names already exist'
            ) : freshNames.length > 1 ? (
              `Create ${freshNames.length}`
            ) : (
              'Create variant'
            )}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export const ComposerNode = memo(ComposerNodeImpl);
ComposerNode.displayName = 'ComposerNode';
