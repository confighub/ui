// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Delete variant (design-mockups/variant-settings/BUILD-PLAN.md commit 7).
 * Typed confirmation is the mitigation, not a courtesy — copy specified in
 * BUILD-PLAN step 21 rather than left to the implementer: the input must
 * match the Space slug exactly, the REAL unit count must be rendered (not a
 * static placeholder), and the delete button stays disabled until it
 * matches.
 *
 * `deleteSpace` MUST pass `recursive: 'true'` — both flags on
 * `DeleteSpaceApiArg` are typed `string`, not boolean (opens
 * `confighubapi.gen.ts:6285`, field `:6289`), so `recursive: true` would not
 * compile. `recursiveForce` is deliberately left off so a delete gate can
 * still block the delete (BUILD-PLAN step 22). The existing call site
 * `SpaceDetailPage.tsx:121-123` passes NEITHER param and only works there
 * because those Spaces are empty — copying it naively would fail on every
 * real variant, which always holds units.
 */
import { useState } from 'react';

import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { useDeleteSpaceMutation } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

import { componentTheme } from '../componentTheme';

export interface DeleteRowProps {
  spaceId: string;
  slug: string;
  unitCount: number;
  onDeleted: () => void;
}

export function DeleteRow({ spaceId, slug, unitCount, onDeleted }: DeleteRowProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedSlug, setTypedSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleteSpace, { isLoading: isDeleting }] = useDeleteSpaceMutation();

  const matches = typedSlug === slug;

  const handleDelete = async () => {
    if (!matches) return;
    setError(null);
    try {
      // recursive: 'true' (string, per DeleteSpaceApiArg) — a variant Space
      // always holds units, so a non-recursive delete would 400. recursiveForce
      // is left off so an existing delete gate can still stop this.
      await deleteSpace({ spaceId, recursive: 'true' }).unwrap();
      onDeleted();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to delete the variant'));
    }
  };

  return (
    <Box data-testid='space-settings-delete-row'>
      <Box sx={{ height: 1, background: componentTheme.borderDefault, mt: 0.75 }} />
      {!confirmOpen ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, padding: '9px 16px 11px' }}>
          <Button
            size='small'
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 15 }} />}
            onClick={() => setConfirmOpen(true)}
            data-testid='space-settings-delete-open'
            sx={{ textTransform: 'none', fontWeight: 650, color: componentTheme.danger, '&:hover': { background: componentTheme.dangerFaint } }}
          >
            Delete variant…
          </Button>
          <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
            Removes the Space and all {unitCount} unit{unitCount === 1 ? '' : 's'}.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ padding: '9px 16px 12px', background: componentTheme.dangerFaint }}>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: componentTheme.danger, mb: 0.5 }}>
            Type <Box component='code' sx={{ fontFamily: componentTheme.fontMono, background: componentTheme.bgDefault, px: '4px', borderRadius: '3px' }}>{slug}</Box> to
            delete this variant. This permanently deletes the Space and all <b>{unitCount}</b> unit{unitCount === 1 ? '' : 's'} in it.
          </Typography>
          <TextField
            fullWidth
            size='small'
            autoFocus
            value={typedSlug}
            onChange={(e) => setTypedSlug(e.target.value)}
            placeholder={slug}
            data-testid='space-settings-delete-confirm-input'
            sx={{ mt: 0.5, '& .MuiInputBase-root': { height: 30, fontSize: 13, background: componentTheme.bgDefault } }}
          />
          {error && (
            <Typography sx={{ fontSize: 11.5, color: componentTheme.danger, mt: 0.5 }}>{error}</Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button
              size='small'
              onClick={() => { setConfirmOpen(false); setTypedSlug(''); setError(null); }}
              disabled={isDeleting}
              sx={{ textTransform: 'none', fontWeight: 600, color: componentTheme.fgMuted }}
            >
              Cancel
            </Button>
            <Button
              size='small'
              variant='contained'
              disabled={!matches || isDeleting}
              onClick={handleDelete}
              data-testid='space-settings-delete-confirm'
              sx={{
                textTransform: 'none',
                fontWeight: 650,
                backgroundColor: componentTheme.danger,
                '&:hover': { backgroundColor: componentTheme.dangerEmphasis },
              }}
            >
              {isDeleting ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : `Delete ${slug}`}
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
