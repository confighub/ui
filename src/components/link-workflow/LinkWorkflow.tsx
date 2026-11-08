// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { LinkDrawer } from '@/pages/unit-detail/components/link-drawer/LinkDrawer';
import { type LinkEnd, linkEnd } from '@/pages/unit-detail/components/link-drawer/linkForm';
import type { ExtendedUnitRead } from '@confighub/rtk-query';
import EastIcon from '@mui/icons-material/East';
import { Box, Button, Stack, Typography } from '@mui/material';
import Grid from '@mui/material/Grid2';

interface LinkWorkflowProps {
  sourceUnits: ExtendedUnitRead[];
  allUnits: ExtendedUnitRead[];
  selectedTargetUnitIds: string[];
  onCancel: () => void;
  onSave: () => void;
}

const ends = (units: ExtendedUnitRead[]): LinkEnd[] =>
  units.map(linkEnd).filter((end): end is LinkEnd => end !== undefined);

/**
 * The Unit list's Link action: the Units selected when it started are the downstream Units, the
 * ones picked in the table below are the upstream Units, and the Link drawer then creates a Link
 * from each of the one to each of the other, with the settings given there.
 */
export const LinkWorkflow = ({
  sourceUnits,
  allUnits,
  selectedTargetUnitIds,
  onCancel,
  onSave,
}: LinkWorkflowProps) => {
  const [configuring, setConfiguring] = useState(false);

  // Filter all units to get the selected target units
  const selectedTargetUnits = useMemo(
    () => allUnits.filter((unit) => selectedTargetUnitIds.includes(unit.Unit?.UnitID ?? '')),
    [allUnits, selectedTargetUnitIds],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header section */}
      <Box
        sx={{
          bgcolor: 'grey.50',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Typography
          variant='caption'
          fontWeight={600}
          color='text.secondary'
          textTransform='uppercase'
        >
          Link Configuration
        </Typography>
      </Box>

      {/* Source and target units visualization */}
      <Box sx={{ p: 2, bgcolor: 'background.paper' }}>
        <Grid container spacing={2} alignItems='center'>
          {/* Source units */}
          <Grid size={{ xs: 'auto' }}>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {sourceUnits.map((unit) => (
                <Box
                  key={unit.Unit?.UnitID}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                  }}
                >
                  <Typography variant='body2' fontWeight={600}>
                    {unit.Unit?.Slug?.toUpperCase() || 'Unknown'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Grid>

          {/* Arrow icon */}
          <Grid size={{ xs: 'auto' }}>
            <EastIcon color='primary' />
          </Grid>

          {/* Target units */}
          <Grid size={{ xs: 'auto' }}>
            {selectedTargetUnits.length === 0 ? (
              <Box
                sx={{
                  px: 1.5,
                  py: 0.5,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 1,
                  textAlign: 'center',
                }}
              >
                <Typography variant='caption' color='text.disabled'>
                  Select targets from table below
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {selectedTargetUnits.map((unit) => (
                  <Box
                    key={unit.Unit?.UnitID}
                    sx={{
                      px: 1.5,
                      py: 0.5,
                      bgcolor: 'primary.main',
                      color: 'background.paper',
                      borderRadius: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                    }}
                  >
                    <Typography variant='caption' fontWeight={600}>
                      {unit?.Unit?.Slug?.toUpperCase() || 'Unknown'}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Grid>
        </Grid>
      </Box>

      {/* Footer with action buttons */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          bgcolor: 'grey.50',
          borderTop: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Stack direction='row' spacing={2} justifyContent='space-between' alignItems='center'>
          <Typography variant='caption' color='text.secondary'>
            {selectedTargetUnits.length} target unit
            {selectedTargetUnits.length !== 1 ? 's' : ''} selected
          </Typography>
          <Stack direction='row' spacing={2}>
            <Button variant='outlined' size='small' onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant='contained'
              size='small'
              onClick={() => setConfiguring(true)}
              disabled={selectedTargetUnits.length === 0}
              data-testid='link-workflow-next'
            >
              Next: Link settings
            </Button>
          </Stack>
        </Stack>
      </Box>
      <LinkDrawer
        subject={
          configuring ? { mode: 'create', from: ends(sourceUnits), to: ends(selectedTargetUnits) } : undefined
        }
        backLabel='Back to Units'
        onClose={() => setConfiguring(false)}
        onSaved={() => {
          setConfiguring(false);
          onSave();
        }}
      />
    </Box>
  );
};
