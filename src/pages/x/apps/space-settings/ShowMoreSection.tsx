// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Show-more section (design-mockups/variant-settings/BUILD-PLAN.md commit
 * 6). Governing rule, per BUILD-PLAN's "primary/show-more split": PRIMARY is
 * what a person sets; SHOW-MORE is what the system sets. Apply that rule to
 * anything added later rather than ranking by taste.
 *
 * Contents, in order: slug (read-only in v1), SpaceID (read-only, copyable),
 * the locked Variant label row, then Annotations split by authorship.
 * `DisplayName`, the deferred platform fields (`DeleteGates`, `Permissions`,
 * `WhereTrigger`, `TriggerFilterID`, `WhereAttribute`, `AttributeFilterID`),
 * and the derived read-onlys are deliberately NOT rendered here —
 * SPACE-SETTINGS.md ranks them "Defer" (out of v1 entirely, not merely
 * locked) and separately rules `DisplayName` out forever ("two names for one
 * thing; the graph reads Labels.Variant").
 *
 * === The four system-written annotation keys are HIDDEN, not locked ===
 * This is a deliberate override of BUILD-PLAN.md's own text (step 20 there
 * says "Visible, locked" for these) — the task instructions for this commit
 * explicitly correct that to hidden. `ComponentFlow-Position` /
 * `ComponentFlow-Links` (graph-layout keys that existing Spaces can still
 * carry; nothing in the UI reads or writes them) and `UpstreamSpaceID` / `TargetID`
 * (`RESERVED_ANNOTATION_KEYS`, `useCreateVariantMutation.ts:34`, written
 * `:212-213` — write-only breadcrumbs nothing reads) are filtered out of the
 * editable list AND never rendered as their own locked rows. This is a
 * DENYLIST OF FOUR LITERAL STRINGS, not a prefix rule — extend
 * `SYSTEM_ANNOTATION_KEYS` below if a fifth layout key is ever added.
 */
import { useState } from 'react';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';
import { AddLabelPopover } from '../unit-details/AddLabelPopover';
import { RESERVED_ANNOTATION_KEYS } from '../useCreateVariantMutation';

/**
 * Denylist of four literal strings — see the file header. `RESERVED_ANNOTATION_KEYS`
 * covers the two write-only breadcrumbs (`UpstreamSpaceID`, `TargetID`); the
 * two graph-layout keys have no other owner in the UI, so they are named here
 * directly.
 */
const SYSTEM_ANNOTATION_KEYS: string[] = [...RESERVED_ANNOTATION_KEYS, 'ComponentFlow-Position', 'ComponentFlow-Links'];

export interface ShowMoreSectionProps {
  slug: string;
  spaceId: string;
  variantLabelValue: string;
  annotations: Record<string, string>;
  onAnnotationsChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}

export function ShowMoreSection({ slug, spaceId, variantLabelValue, annotations, onAnnotationsChange, disabled }: ShowMoreSectionProps) {
  const [open, setOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);

  const userAuthoredAnnotations = Object.entries(annotations).filter(([k]) => !SYSTEM_ANNOTATION_KEYS.includes(k));

  const handleCopySpaceId = async () => {
    try {
      await navigator.clipboard.writeText(spaceId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard access can be denied by the browser; silently no-op rather
      // than surfacing an error for a convenience action.
    }
  };

  const handleAddAnnotation = (key: string, value: string) => {
    if (SYSTEM_ANNOTATION_KEYS.includes(key)) return; // defensive — the popover has no way to offer these, but never let a typed key collide with a system one
    onAnnotationsChange({ ...annotations, [key]: value });
    setAnchorEl(null);
  };

  const handleDeleteAnnotation = (key: string) => {
    const next = { ...annotations };
    delete next[key];
    onAnnotationsChange(next);
  };

  return (
    <Box>
      <Box
        component='button'
        onClick={() => setOpen((v) => !v)}
        data-testid='space-settings-show-more-toggle'
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          width: '100%',
          padding: '9px 16px',
          borderTop: `1px solid ${componentTheme.borderSubtle}`,
          fontSize: 12,
          fontWeight: 650,
          color: componentTheme.fgMuted,
          cursor: 'pointer',
          background: componentTheme.bgDefault,
          border: 'none',
          borderTopStyle: 'solid',
          textAlign: 'left',
        }}
      >
        <ExpandMoreIcon sx={{ fontSize: 15, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s' }} />
        {open ? 'Hide 4' : 'Show 4 more'}
      </Box>

      {open && (
        <Box sx={{ background: componentTheme.bgSubtle, borderTop: `1px solid ${componentTheme.borderDefault}` }}>
          <Box sx={{ padding: '8px 16px' }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault, mb: 0.5 }}>
              Slug <Box component='span' sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, fontWeight: 400, color: componentTheme.fgSubtle }}>read-only in v1</Box>
            </Typography>
            <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12.5, color: componentTheme.fgMuted }}>{slug}</Typography>
          </Box>

          <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault, mb: 0.5 }}>SpaceID</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 11.5, color: componentTheme.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {spaceId}
              </Typography>
              <Tooltip title={copied ? 'Copied' : 'Copy'} placement='top'>
                <IconButton size='small' onClick={handleCopySpaceId} data-testid='space-settings-copy-space-id' sx={{ width: 22, height: 22 }}>
                  <ContentCopyIcon sx={{ fontSize: 13 }} />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault, mb: 0.5 }}>
              Variant label <Box component='span' sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, fontWeight: 400, color: componentTheme.fgSubtle }}>owned by the row above</Box>
            </Typography>
            <Box
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 22,
                padding: '0 8px',
                borderRadius: '9999px',
                border: `1px dashed ${componentTheme.borderDefault}`,
                fontSize: 11,
                color: componentTheme.fgMuted,
              }}
            >
              Variant = {variantLabelValue || '(unset)'}
            </Box>
          </Box>

          <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault, mb: 0.5 }}>
              Annotations <Box component='span' sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, fontWeight: 400, color: componentTheme.fgSubtle }}>Space.Annotations</Box>
            </Typography>
            {userAuthoredAnnotations.length === 0 && <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle, fontStyle: 'italic', mb: 0.5 }}>None</Typography>}
            {userAuthoredAnnotations.map(([key, value]) => (
              <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.4 }}>
                <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 11.5, fontWeight: 700, color: componentTheme.fgDefault, minWidth: 110 }}>
                  {key}
                </Typography>
                <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 11.5, color: componentTheme.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {value}
                </Typography>
                {!disabled && (
                  <Box
                    component='button'
                    onClick={() => handleDeleteAnnotation(key)}
                    sx={{ ml: 'auto', border: 'none', background: 'none', color: componentTheme.fgSubtle, cursor: 'pointer', fontSize: 13 }}
                  >
                    ×
                  </Box>
                )}
              </Box>
            ))}
            <Box
              component='button'
              disabled={disabled}
              onClick={(e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget)}
              data-testid='space-settings-add-annotation'
              sx={{
                mt: 0.75,
                display: 'inline-flex',
                alignItems: 'center',
                height: 22,
                padding: '0 8px',
                borderRadius: `${componentTheme.radiusSm}px`,
                border: `1px dashed ${componentTheme.borderDefault}`,
                background: 'none',
                color: componentTheme.fgMuted,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add annotation
            </Box>
            <AddLabelPopover
              anchorEl={anchorEl}
              open={!!anchorEl}
              onClose={() => setAnchorEl(null)}
              onAdd={handleAddAnnotation}
              type='Annotations'
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
