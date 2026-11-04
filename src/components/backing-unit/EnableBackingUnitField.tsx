// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {
  EntityRefOption,
  EntityRefSelect,
} from '@/components/entity-ref-select/EntityRefSelect';
import { useListSpacesQuery } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';

import type { BackingUnitChoice } from './backingUnitChoice';

export interface EnableBackingUnitFieldProps {
  value: BackingUnitChoice;
  onChange: (choice: BackingUnitChoice) => void;
  /** A Space or a Component is in no Space of its own, so its backing Unit's Space is chosen. */
  needsSpace?: boolean;
  disabled?: boolean;
}

/**
 * The form field that gives an entity a backing Unit, a Unit that holds its configuration and
 * records each change to it as a Revision. A form shows it only for an entity with none.
 */
export const EnableBackingUnitField = ({
  value,
  onChange,
  needsSpace = false,
  disabled = false,
}: EnableBackingUnitFieldProps) => {
  const showSpace = needsSpace && value.enabled;
  // Only the Spaces a Unit can be created in.
  const { data: spaces = [], isFetching } = useListSpacesQuery(
    { select: 'SpaceID,Slug', wherePermission: 'CreateChildren' },
    { skip: !showSpace },
  );
  const spaceOptions = useMemo<EntityRefOption[]>(
    () =>
      spaces
        .filter((s) => s.Space?.SpaceID)
        .map((s) => ({ id: s.Space!.SpaceID!, label: s.Space!.Slug }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [spaces],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            size='small'
            checked={value.enabled}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, enabled: e.target.checked })}
            slotProps={{
              input: {
                'data-testid': 'enable-backing-unit',
              } as React.InputHTMLAttributes<HTMLInputElement>,
            }}
          />
        }
        label='Keep its configuration in a backing Unit'
      />
      {showSpace && (
        <EntityRefSelect
          label='Backing Unit Space'
          value={value.spaceId}
          onChange={(spaceId) => onChange({ ...value, spaceId })}
          options={spaceOptions}
          loading={isFetching}
          disabled={disabled}
          testId='backing-unit-space'
          helperText='The Space to hold the backing Unit'
        />
      )}
    </Box>
  );
};
