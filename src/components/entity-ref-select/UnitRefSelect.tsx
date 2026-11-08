// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { type ExtendedUnitRead, useListAllUnitsQuery } from '@confighub/rtk-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';

/** How many Units one search lists. */
const SEARCH_LIMIT = 50;
/** How long typing pauses before the search runs. */
const SEARCH_DELAY_MS = 250;

const unitLabel = (unit: ExtendedUnitRead): string =>
  unit.Space?.Slug ? `${unit.Space.Slug}/${unit.Unit?.Slug}` : (unit.Unit?.Slug ?? '');

export interface UnitRefSelectProps {
  label: string;
  value: ExtendedUnitRead | null;
  onChange: (unit: ExtendedUnitRead | null) => void;
  helperText?: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * A picker for one Unit in any Space of the organization, named `<space>/<unit>`. It searches the
 * server by slug as the name is typed, so it finds a Unit among more than any one page loads.
 */
export const UnitRefSelect = ({ label, value, onChange, helperText, disabled = false, testId }: UnitRefSelectProps) => {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // A typed slug is matched anywhere in the Unit's slug; nothing typed lists the first Units.
  const text = search.includes('/') ? search.slice(search.lastIndexOf('/') + 1) : search;
  const where = text.trim() ? `Slug ILIKE '%${text.trim().replace(/'/g, "''")}%'` : undefined;
  const { data = [], isFetching } = useListAllUnitsQuery(
    { where, include: 'SpaceID', limit: SEARCH_LIMIT, select: 'UnitID,Slug,SpaceID,ToolchainType' },
    { skip: disabled },
  );

  return (
    <Autocomplete
      size='small'
      options={data}
      value={value}
      loading={isFetching}
      disabled={disabled}
      filterOptions={(options) => options}
      getOptionLabel={unitLabel}
      getOptionKey={(option) => option.Unit?.UnitID ?? ''}
      isOptionEqualToValue={(a, b) => a.Unit?.UnitID === b.Unit?.UnitID}
      onChange={(_, unit) => onChange(unit)}
      inputValue={input}
      onInputChange={(_, next) => setInput(next)}
      data-testid={testId}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder='Search Units by name'
          helperText={helperText}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      )}
    />
  );
};
