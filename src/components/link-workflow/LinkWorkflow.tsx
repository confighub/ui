// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import { ErrorList } from '@/components/error-list/ErrorList';
import { useAnalytics } from '@/hooks/useAnalytics';
import {
  type ExtendedUnitRead,
  useCreateLinkMutation,
} from '@confighub/rtk-query';
import { ENTITY_TYPES } from '@/utility/analytics-constants';
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

export const LinkWorkflow = ({
  sourceUnits,
  allUnits,
  selectedTargetUnitIds,
  onCancel,
  onSave,
}: LinkWorkflowProps) => {
  // Track saving state and errors
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const [createLink] = useCreateLinkMutation();
  const { trackEntityBulkCreated } = useAnalytics();

  // Filter all units to get the selected target units
  const selectedTargetUnits = useMemo(
    () => allUnits.filter((unit) => selectedTargetUnitIds.includes(unit.Unit?.UnitID ?? '')),
    [allUnits, selectedTargetUnitIds],
  );

  // Create links between source and target units
  const handleSave = async () => {
    if (selectedTargetUnits.length === 0) {
      setError('Please select at least one target unit');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // Create individual links for each source/target pair
      const results = await Promise.allSettled(
        sourceUnits.flatMap((sourceUnit) =>
          selectedTargetUnits.map((targetUnit) =>
            createLink({
              spaceId: sourceUnit.Unit?.SpaceID ?? '',
              link: {
                Slug: '',
                FromUnitID: sourceUnit.Unit?.UnitID ?? '',
                ToUnitID: targetUnit.Unit?.UnitID ?? '',
                ToSpaceID: targetUnit.Unit?.SpaceID ?? '',
                // Named rather than left to the legacy default: a Link with no UpdateType
                // meant NeedsProvides resolved automatically, which is what this creates.
                UpdateType: 'NeedsProvides',
                AutoUpdate: true,
              },
            }).unwrap(),
          ),
        ),
      );

      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      if (failures.length > 0) {
        const messages = failures.map((f) => {
          const reason = f.reason as { data?: { message?: string } };
          return reason?.data?.message ?? 'Unknown error';
        });
        setError(messages.join('; '));
      } else {
        trackEntityBulkCreated({
          entity_type: ENTITY_TYPES.LINK,
          count: sourceUnits.length * selectedTargetUnits.length,
        });
        onSave();
      }
    } catch (err) {
      setError(
        `Failed to create links: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

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
        <ErrorList errors={[error]} onClose={() => setError('')} />
        <Grid container spacing={2} alignItems='center'>
          {/* Source unit */}
          <Grid size={{ xs: 'auto' }}>
            <Box
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
                {sourceUnits?.[0]?.Unit?.Slug?.toUpperCase() || 'Unknown'}
              </Typography>
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
            <Button variant='outlined' size='small' onClick={onCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant='contained'
              size='small'
              onClick={handleSave}
              disabled={isSaving || selectedTargetUnits.length === 0}
            >
              {isSaving ? 'Creating Links...' : 'Create Links'}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
};
