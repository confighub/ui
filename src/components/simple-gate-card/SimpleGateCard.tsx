// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { UseFormSetValue, UseFormWatch } from 'react-hook-form';
import type { Path, PathValue } from 'react-hook-form';

import { SectionCard } from '@/components/styled';
import Add from '@mui/icons-material/Add';
import Delete from '@mui/icons-material/Delete';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface ISimpleGateCardProps<T extends object> {
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  gateFieldName: Path<T>;
  gateType: 'Delete' | 'Destroy';
  title: string;
  description: string;
  newGateKey: string;
  setNewGateKey: (key: string) => void;
}

/**
 * SimpleGateCard
 *
 * A simplified gate management component for adding key-value gate pairs.
 * Used in AddUnitModal for both delete and destroy gates.
 */
export const SimpleGateCard = <T extends object>({
  watch,
  setValue,
  gateFieldName,
  gateType,
  title,
  description,
  newGateKey,
  setNewGateKey,
}: ISimpleGateCardProps<T>) => {
  const gates = (watch(gateFieldName) as unknown as Record<string, boolean>) || {};

  const addGate = () => {
    if (!newGateKey.trim()) return;

    const updatedGates = {
      ...gates,
      [newGateKey.trim()]: true,
    };

    setValue(gateFieldName as Path<T>, updatedGates as PathValue<T, Path<T>>);
    setNewGateKey('');
  };

  const removeGate = (key: string) => {
    const updatedGates = { ...gates };
    delete updatedGates[key];

    setValue(gateFieldName as Path<T>, updatedGates as PathValue<T, Path<T>>);
  };

  const gateKeys = Object.keys(gates);

  return (
    <SectionCard title={title}>
      <Typography variant='body2' color='text.secondary' sx={{ mb: 3 }}>
        {description}
      </Typography>

      <Grid container spacing={2}>
        <Grid size={{ xs: 8 }}>
          <TextField
            fullWidth
            size='small'
            data-testid={`${gateType.toLowerCase()}-gate-key-input`}
            label={`${gateType} Gate Key`}
            placeholder={`e.g., manual-review, backup-verified`}
            value={newGateKey}
            onChange={(e) => setNewGateKey(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addGate();
              }
            }}
          />
        </Grid>
        <Grid size={{ xs: 4 }}>
          <Button
            data-testid={`${gateType.toLowerCase()}-add-gate-button`}
            variant='outlined'
            fullWidth
            startIcon={<Add />}
            onClick={addGate}
            disabled={!newGateKey.trim()}
            sx={{ minWidth: 'auto', px: 2, borderRadius: '8px' }}
          >
            Add Gate
          </Button>
        </Grid>
      </Grid>

      {gateKeys.length > 0 && (
        <Stack direction='row' spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
          {gateKeys.map((key) => (
            <Chip
              key={key}
              label={key}
              size='small'
              variant='outlined'
              color='primary'
              deleteIcon={
                <IconButton size='small' sx={{ width: 16, height: 16 }}>
                  <Delete sx={{ fontSize: 12 }} />
                </IconButton>
              }
              onDelete={() => removeGate(key)}
            />
          ))}
        </Stack>
      )}
    </SectionCard>
  );
};
