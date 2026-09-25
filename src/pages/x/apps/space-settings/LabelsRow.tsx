// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * User-authored Space labels (design-mockups/variant-settings/BUILD-PLAN.md
 * commit 5). Reuses the `unit-details/AddLabelPopover.tsx` + `LabelChip.tsx`
 * idiom rather than a new component, per BUILD-PLAN step 16 — those two
 * components write immediately in their existing UnitDetailsPane call site,
 * but here `onAdd`/delete only update the STAGED draft (`onChange` below);
 * the sheet's single Save/Discard model (BUILD-PLAN "one model, no
 * exceptions") is what actually persists it via `usePatchSpaceMutation`.
 *
 * `Variant` is filtered out via `RESERVED_LABEL_KEYS`
 * (`useCreateVariantMutation.ts:41`) — the rename row above owns it, and two
 * editors for one value invites drift (step 17). It still appears, locked,
 * under show-more (`ShowMoreSection.tsx`).
 *
 * `Stage`/`PreviousStage` have no dedicated row or editor of their own — the
 * ChangeWorkflow Unit owns rollout staging now, and editing these two labels
 * (when anything still sets them) happens through this generic Labels row or
 * the CLI, same as any other label.
 */
import { useState } from 'react';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';
import { AddLabelPopover } from '../unit-details/AddLabelPopover';
import { LabelChip } from '../unit-details/LabelChip';
import { RESERVED_LABEL_KEYS } from '../useCreateVariantMutation';

/** Label keys with their own dedicated row elsewhere in this sheet — kept out of the generic chip list here. */
const DEDICATED_ROW_LABEL_KEYS: string[] = RESERVED_LABEL_KEYS;

export interface LabelsRowProps {
  /** Full current Labels map (including Variant and any other dedicated-row keys) — needed so `onChange` can be built as a full-map replacement without losing keys this row doesn't own. */
  labels: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}

export function LabelsRow({ labels, onChange, disabled }: LabelsRowProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const userAuthoredEntries = Object.entries(labels).filter(([k]) => !DEDICATED_ROW_LABEL_KEYS.includes(k));

  const handleAdd = (key: string, value: string) => {
    const next = { ...labels };
    if (editingKey && editingKey !== key) delete next[editingKey];
    next[key] = value;
    onChange(next);
    setEditingKey(null);
  };

  const handleDelete = (key: string) => {
    const next = { ...labels };
    delete next[key];
    onChange(next);
  };

  return (
    <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
      <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault, mb: 0.75 }}>
        Labels <Box component='span' sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, fontWeight: 400, color: componentTheme.fgSubtle }}>Space.Labels</Box>
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
        {userAuthoredEntries.map(([key, value]) => (
          <LabelChip
            key={key}
            labelKey={key}
            value={value}
            onDelete={disabled ? undefined : () => handleDelete(key)}
            onEdit={
              disabled
                ? undefined
                : (el) => { setEditingKey(key); setAnchorEl(el); }
            }
          />
        ))}
        <Box
          component='button'
          disabled={disabled}
          onClick={(e: React.MouseEvent<HTMLElement>) => { setEditingKey(null); setAnchorEl(e.currentTarget); }}
          data-testid='space-settings-add-label'
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            height: 24,
            padding: '0 10px',
            borderRadius: '9999px',
            border: `1px dashed ${componentTheme.borderDefault}`,
            background: 'none',
            color: componentTheme.fgMuted,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add
        </Box>
      </Box>
      <AddLabelPopover
        anchorEl={anchorEl}
        open={!!anchorEl}
        onClose={() => { setAnchorEl(null); setEditingKey(null); }}
        onAdd={handleAdd}
        type='Labels'
        initialKey={editingKey ?? undefined}
        initialValue={editingKey ? labels[editingKey] : undefined}
      />
    </Box>
  );
}
