// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Release target row (Space.ReleaseTargetID).
 *
 * Originally shipped as a two-mode control — a locked read-only display once
 * set, gated behind a "Change or clear ›" link before the picker opened at
 * all (design-mockups/variant-settings/BUILD-PLAN.md step 9's "This field is
 * not lazy" reasoning). Rejected in review: "I don't like the change or
 * clear things. Just allow them to be changeable off the bat please." This
 * is the replacement — ONE always-editable picker, exactly like the Variant
 * name text field above it in `SpaceSettingsSheet.tsx`. Offers every Target,
 * with a "None" option inside the SAME picker standing in for clearing — not
 * a separate mode, not a separate control.
 * Stages like every other row; nothing writes until Save.
 *
 * The one piece of ceremony kept from the old design, deliberately: changing
 * an ALREADY-SET release target bulk-repoints every unit whose TargetID
 * matches the OLD target (space.go:522-559), with no per-unit validation and
 * no per-item result — a single bulk SQL UPDATE, not the 207 the unit
 * -targets row gets. A user picking a new value here deserves to know that
 * in advance. So a single compact line appears under the picker, but ONLY
 * when the pick would actually move something — i.e. only when units are
 * currently sitting on the target being replaced. Spike 2 proved `x = NULL`
 * never matches, so the common unset → set case provably touches zero units;
 * that case shows nothing at all, matching the instruction that this stay a
 * sentence, not a workflow.
 *
 * The unit-targets row this control's affected-unit count once shared visual DNA with (`UnitTargetsRow.tsx`, the enumerated
 * affected-units surface, the partial-failure strip) was cut from the
 * feature entirely in review ("Get rid of the units target section
 * completely.") — this row is now the ONLY retarget-shaped control left in
 * the sheet, and owns its own option type below rather than importing one
 * from a component that no longer exists.
 */
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';

/** Sentinel Select value for "no release target" — safe as `''` because real target IDs are non-empty UUIDs. */
const NONE_VALUE = '';

export interface ReleaseTargetOption {
  targetId: string;
  name: string;
}

export interface ReleaseTargetRowProps {
  currentTargetId: string | null;
  currentTargetName: string | null;
  targetOptions: ReleaseTargetOption[];
  /**
   * Count of units currently sitting on `currentTargetId` — sizes the
   * consequence line only. Always 0 when `currentTargetId` is null: per
   * spike 2, `TargetID = NULL` never matches in SQL three-valued logic, so
   * nothing can be "sitting on" an unset release target.
   */
  affectedUnitCount: number;
  /** `undefined` = unstaged, follow `currentTargetId`. `null` = staged to clear. `string` = staged to this target's ID. */
  draftTargetId: string | null | undefined;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function ReleaseTargetRow({
  currentTargetId,
  currentTargetName,
  targetOptions,
  affectedUnitCount,
  draftTargetId,
  onChange,
  disabled,
}: ReleaseTargetRowProps) {
  const effectiveTargetId = draftTargetId !== undefined ? draftTargetId : currentTargetId;
  const isDirty = draftTargetId !== undefined && draftTargetId !== currentTargetId;
  const movesUnits = isDirty && currentTargetId != null && affectedUnitCount > 0;
  const newTargetName = effectiveTargetId == null ? null : (targetOptions.find((t) => t.targetId === effectiveTargetId)?.name ?? effectiveTargetId);

  return (
    <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.6 }}>
        <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault }}>Release target</Typography>
        <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, color: componentTheme.fgSubtle }}>
          Space.ReleaseTargetID
        </Typography>
        {isDirty && (
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.6 }}>
            <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: componentTheme.accent }} />
            <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: componentTheme.accent }}>Unsaved</Typography>
          </Box>
        )}
      </Box>

      {targetOptions.length === 0 ? (
        <Typography data-testid='space-settings-release-target-empty' sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>
          No targets exist yet.
        </Typography>
      ) : (
        <>
          <Select<string>
            fullWidth
            size='small'
            displayEmpty
            value={effectiveTargetId ?? NONE_VALUE}
            disabled={disabled}
            onChange={(e: SelectChangeEvent<string>) => onChange(e.target.value === NONE_VALUE ? null : e.target.value)}
            data-testid='space-settings-release-target-select'
            sx={{
              height: 30,
              fontSize: 13,
              background: componentTheme.bgDefault,
              '& .MuiSelect-select': { height: 30, boxSizing: 'border-box', display: 'flex', alignItems: 'center' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: componentTheme.borderDefault },
            }}
            renderValue={(v) => (v === NONE_VALUE ? 'None' : (targetOptions.find((t) => t.targetId === v)?.name ?? v))}
          >
            <MenuItem value={NONE_VALUE} sx={{ fontStyle: 'italic', color: componentTheme.fgSubtle }}>
              None
            </MenuItem>
            {targetOptions.map((t) => (
              <MenuItem key={t.targetId} value={t.targetId}>
                {t.name}
              </MenuItem>
            ))}
          </Select>
          {movesUnits && (
            <Typography data-testid='space-settings-release-target-consequence' sx={{ fontSize: 11, color: componentTheme.attention, lineHeight: 1.5, mt: 0.6 }}>
              Moves {affectedUnitCount} unit{affectedUnitCount === 1 ? '' : 's'} off {currentTargetName ?? 'the current target'} to{' '}
              {newTargetName ?? 'no target'} the instant this saves — no per-unit validation, no per-unit result.
            </Typography>
          )}
        </>
      )}
    </Box>
  );
}
