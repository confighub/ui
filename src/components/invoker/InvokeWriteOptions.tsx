// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { Control } from 'react-hook-form';

import { ClearanceFieldSection } from '@/components/clearance-field/ClearanceFieldSection';
import type { ClearanceRow } from '@/components/clearance-field/clearanceRows';
import { GuardValuesSection } from '@/components/guarded-write/GuardValuesSection';
import type { GuardValues } from '@/components/guarded-write/guardValues';
import type { Clearance } from '@confighub/rtk-query';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';

/** What an invocation states besides its function: why, in which ChangeSet, and about guards. */
export interface InvokeWriteOptions {
  /** Why the change is made; it becomes the description of each Revision it makes. */
  changeDescription?: string;
  /** The open ChangeSet the write is made in. */
  changeSetId?: string;
  /** The clearance stated, before the guards acknowledged at the write or recorded by it. */
  clearance?: Clearance;
  guardValues: GuardValues;
}

export interface InvokeWriteOptionsForm {
  Clearance: ClearanceRow[];
}

/** An open ChangeSet the invocation can be made in, named with its Space. */
export interface ChangeSetOption {
  id: string;
  label: string;
}

/**
 * The options of an invocation: a change description, the ChangeSet to make it in, the guards it
 * may write over, and the guard it records on what it writes. A write to a guarded Unit asks
 * about each guard anyway; the clearance here is for people who know the vocabulary.
 */
export const InvokeWriteOptionsSection = ({
  control,
  changeDescription,
  onChangeDescriptionChange,
  changeSet,
  onChangeSetChange,
  guardValues,
  onGuardValuesChange,
  guardKeyMissing = false,
  disabled = false,
}: {
  control: Control<InvokeWriteOptionsForm>;
  changeDescription: string;
  onChangeDescriptionChange: (description: string) => void;
  /** Omitted where the invoker makes its own ChangeSet, as in an initiative. */
  changeSet?: {
    value: ChangeSetOption | null;
    options: ChangeSetOption[];
    loading: boolean;
    error: boolean;
  };
  onChangeSetChange: (changeSet: ChangeSetOption | null) => void;
  guardValues: GuardValues;
  onGuardValuesChange: (values: GuardValues) => void;
  /** Whether a run or save was attempted with a guard asked for and no key. */
  guardKeyMissing?: boolean;
  disabled?: boolean;
}) => (
  <Stack spacing={2} data-testid='invoker-write-options'>
    <TextField
      size='small'
      label='Change description'
      value={changeDescription}
      onChange={(e) => onChangeDescriptionChange(e.target.value)}
      disabled={disabled}
      multiline
      maxRows={4}
      inputProps={{ 'data-testid': 'invoker-change-description' }}
    />
    {changeSet && (
      <Autocomplete
        size='small'
        options={changeSet.options}
        value={changeSet.value}
        onChange={(_, value) => onChangeSetChange(value)}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        loading={changeSet.loading}
        disabled={disabled}
        noOptionsText={
          changeSet.error
            ? 'Could not read the ChangeSets'
            : 'No open ChangeSets in these Spaces'
        }
        renderInput={(params) => (
          <TextField
            {...params}
            label='ChangeSet'
            helperText='The selected Units join it if they are in no ChangeSet.'
          />
        )}
        data-testid='invoker-change-set'
      />
    )}
    <ClearanceFieldSection
      control={control}
      name='Clearance'
      description='The guards this invocation may write over. A path whose guards it is not cleared for is left as it is.'
      disabled={disabled}
      testId='invoker-clearance'
    />
    <Box>
      <GuardValuesSection
        values={guardValues}
        onChange={onGuardValuesChange}
        disabled={disabled}
        keyMissing={guardKeyMissing}
      />
    </Box>
  </Stack>
);
