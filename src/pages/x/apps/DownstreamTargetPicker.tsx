// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { TargetRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { componentTheme } from './componentTheme';
import type { DownstreamSpec } from './useCreateDownstreamsMutation';
import {
  type VariantNameError,
  sanitizeVariantSlug,
  validateVariantName,
} from './variantValidation';

// ============================================================================
// TYPES
// ============================================================================

export interface DownstreamTargetPickerProps {
  /** All org targets (from useListAllTargetsQuery). Pass [] while loading. */
  targets: TargetRead[];
  isLoading?: boolean;
  /** Selected target IDs. Nothing is selected by default. */
  selectedTargetIds: string[];
  onChange: (targetIds: string[]) => void;
  /** Seeds each downstream's default variant name (pass the component slug). */
  componentSlug: string;
  /** Per-target variant-name overrides, keyed by TargetID. */
  variantNames: Record<string, string>;
  onVariantNameChange: (targetId: string, name: string) => void;
  disabled?: boolean;
}

// ============================================================================
// PURE HELPERS
// ============================================================================

/**
 * Default variant name for a target: `sanitizeVariantSlug(target.Slug)`.
 *
 * Exported from the component file by contract — the wizard resolves the same
 * default when building the hook input, so the two must not drift.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function defaultVariantName(target: TargetRead): string {
  return sanitizeVariantSlug(target.Slug);
}

/**
 * Resolve the effective variant name for a target: the caller's override when
 * present, otherwise the target-slug-derived default.
 */
function resolveVariantName(target: TargetRead, variantNames: Record<string, string>): string {
  const targetId = target.TargetID;
  const override = targetId === undefined ? undefined : variantNames[targetId];
  return (override ?? defaultVariantName(target)).trim();
}

/**
 * Resolve selection + overrides into hook input. Skips unknown/blank entries.
 *
 * Skipping rules, in order:
 *   - a selected ID with no matching target (stale selection) is dropped;
 *   - a resolved name that is blank, or that sanitizes to an empty slug (e.g.
 *     `"!!!"`), is dropped — there is no slug segment to create;
 *   - a resolved name whose slug duplicates an earlier entry's is dropped. Two
 *     targets cannot share one variant name because the derived space slugs
 *     would collide server-side. Comparison is slug-based so `"Prod"` and
 *     `"prod!"` count as the same name, matching `validateVariantName`.
 *
 * Selection order is preserved, so the first occurrence of a duplicated name
 * wins.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function buildDownstreamSpecs(
  selectedTargetIds: string[],
  variantNames: Record<string, string>,
  targets: TargetRead[],
): DownstreamSpec[] {
  const byId = new Map<string, TargetRead>();
  for (const target of targets) {
    if (target.TargetID) byId.set(target.TargetID, target);
  }

  const seenSlugs = new Set<string>();
  const specs: DownstreamSpec[] = [];

  for (const targetId of selectedTargetIds) {
    const target = byId.get(targetId);
    if (!target) continue;

    const variantName = resolveVariantName(target, variantNames);
    if (!variantName) continue;

    const slug = sanitizeVariantSlug(variantName);
    if (!slug || seenSlugs.has(slug)) continue;

    seenSlugs.add(slug);
    specs.push({ targetId, variantName });
  }

  return specs;
}

/** Human-readable message for a `validateVariantName` failure. */
function variantNameErrorMessage(error: VariantNameError): string {
  switch (error) {
    case 'required':
      return 'Variant name is required';
    case 'invalid':
      return 'Use letters, numbers or hyphens';
    case 'duplicate':
      return 'Another selected target already uses this name';
  }
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Checkbox list of Targets in the organization, each optionally producing one
 * deployment variant of the component being created. Every Target is a pull
 * destination, so every one is listed. Nothing is selected by default:
 * creating variants is opt-in.
 */
export function DownstreamTargetPicker({
  targets,
  isLoading = false,
  selectedTargetIds,
  onChange,
  componentSlug,
  variantNames,
  onVariantNameChange,
  disabled = false,
}: DownstreamTargetPickerProps): JSX.Element {
  if (isLoading) {
    return (
      <Box
        sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
        data-testid='downstream-target-picker-loading'
      >
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant='rounded' height={36} />
        ))}
      </Box>
    );
  }

  if (targets.length === 0) {
    return (
      <Typography sx={{ fontSize: 12, color: componentTheme.fgMuted }}>
        No targets in this organization yet. You can add deployment variants later.
      </Typography>
    );
  }

  const toggle = (targetId: string, checked: boolean) => {
    onChange(
      checked
        ? selectedTargetIds.filter((id) => id !== targetId)
        : [...selectedTargetIds, targetId],
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {targets.map((target) => {
        const targetId = target.TargetID;
        // A target without an ID cannot be cloned to — nothing to attach.
        if (!targetId) return null;

        const checked = selectedTargetIds.includes(targetId);
        const variantName = resolveVariantName(target, variantNames);

        // Siblings = the resolved names of the *other* selected targets, so a
        // collision is flagged inline rather than silently dropped by
        // buildDownstreamSpecs.
        const siblingNames = checked
          ? targets
              .filter(
                (t) =>
                  t.TargetID &&
                  t.TargetID !== targetId &&
                  selectedTargetIds.includes(t.TargetID),
              )
              .map((t) => resolveVariantName(t, variantNames))
              .filter((n) => n.length > 0)
          : [];
        const validation = checked
          ? validateVariantName(variantName, siblingNames)
          : { ok: true as const, error: undefined };
        const errorMessage = validation.error
          ? variantNameErrorMessage(validation.error)
          : undefined;

        const slug = sanitizeVariantSlug(variantName);

        return (
          <Box
            key={targetId}
            sx={{
              border: `1px solid ${checked ? componentTheme.borderDefault : componentTheme.borderSubtle}`,
              borderRadius: `${componentTheme.radiusSm}px`,
              bgcolor: checked ? componentTheme.bgSubtle : 'transparent',
              px: 0.75,
              py: 0.25,
            }}
          >
            {/* ── Row: checkbox + slug + display name + provider chip ────── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
              <Checkbox
                size='small'
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(targetId, checked)}
                inputProps={{ 'aria-label': `Create a variant for target ${target.Slug}` }}
                sx={{ p: 0.5 }}
              />
              <Typography
                sx={{
                  fontSize: 12,
                  fontFamily: componentTheme.fontMono,
                  color: componentTheme.fgDefault,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {target.Slug}
              </Typography>
              {target.DisplayName && (
                <Typography
                  sx={{
                    fontSize: 11,
                    color: componentTheme.fgMuted,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {target.DisplayName}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
            </Box>

            {/* ── Checked: inline variant name + slug preview ─────────────── */}
            {checked && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 1,
                  pl: 4,
                  pr: 0.5,
                  pt: 0.25,
                  pb: 1,
                }}
              >
                <TextField
                  label='Variant name'
                  size='small'
                  value={variantName}
                  disabled={disabled}
                  error={!validation.ok}
                  helperText={errorMessage}
                  onChange={(e) => onVariantNameChange(targetId, e.target.value)}
                  inputProps={{ autoComplete: 'off' }}
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <Chip
                  label={`${componentSlug}/${slug}`}
                  size='small'
                  sx={{
                    mt: 0.5,
                    height: 22,
                    fontSize: 11,
                    fontFamily: componentTheme.fontMono,
                    maxWidth: '45%',
                    bgcolor: componentTheme.bgInset,
                    border: `1px solid ${componentTheme.borderSubtle}`,
                    color: componentTheme.fgMuted,
                  }}
                />
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
