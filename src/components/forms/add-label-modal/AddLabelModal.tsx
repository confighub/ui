// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { SyntheticEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';

import type { LabelOptions } from '@/components/query-builder/types';
import { LABEL_TYPES } from '@/utility/constants';
import { addSpacesToCamelCase } from '@/utility/name-format-functions';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid2';
import TextField from '@mui/material/TextField';

export type PropertyType = 'Labels' | 'Annotations' | 'DeleteGates' | 'DestroyGates';

export interface IAddLabelInput {
  key: string;
  value: string;
}

export interface AddLabelModalProps {
  onAddModalClosed: () => void;
  onLabelAdded: (data: IAddLabelInput) => void;
  isAddModalOpen: boolean;
  $showResourceType?: boolean;
  type?: PropertyType;
  categories?: { key: string; value: string }[];
  readOnlyValue?: string | boolean | number;
  /** When provided, upgrades key/value inputs to autocomplete with existing values. */
  labelOptions?: LabelOptions;
}

export interface IAddLabelInput {
  key: string;
  value: string;
}

export const AddLabelModal = ({
  onAddModalClosed,
  onLabelAdded,
  isAddModalOpen,
  $showResourceType = false,
  type = 'Labels',
  categories = LABEL_TYPES,
  labelOptions,
}: AddLabelModalProps) => {
  const isGateType = type === 'DeleteGates' || type === 'DestroyGates';

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<IAddLabelInput>({
    defaultValues: {
      key: '',
      value: isGateType ? 'true' : '',
    },
  });

  const currentKey = watch('key');
  const valueOptions = labelOptions?.valuesByKey[currentKey] ?? [];

  const onModalClosed = () => {
    onAddModalClosed();
    setValue('key', '');
    setValue('value', isGateType ? 'true' : '');
  };

  const onResourceChanged = (
    _: SyntheticEvent<Element, Event>,
    value: { key: string; value: string } | null,
  ) => {
    if (value) setValue('key', `${value.key}-${value.value}`);
  };

  return (
    <Dialog
      open={isAddModalOpen}
      onClose={onModalClosed}
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit((data, event) => {
          event?.preventDefault();
          event?.stopPropagation();
          // For gate types, ensure value is always 'true'
          const submissionData = isGateType ? { ...data, value: 'true' } : data;
          onLabelAdded(submissionData);
          onModalClosed();
        }),
      }}
    >
      <DialogTitle>Add {addSpacesToCamelCase(type)}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ width: '600px', marginTop: '10px' }}>
          {$showResourceType && (
            <Grid size={{ xs: 12 }}>
              <Autocomplete
                fullWidth
                onChange={onResourceChanged}
                id='resource-type'
                options={categories}
                groupBy={(option) => option.key}
                getOptionLabel={(option) => option.value}
                sx={{ minWidth: '480px' }}
                size='small'
                renderInput={(params) => (
                  <TextField {...params} label='Category' placeholder='Category' />
                )}
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: isGateType ? 12 : 6 }}>
            <Controller
              name='key'
              control={control}
              rules={{ required: 'Key is required' }}
              render={({ field: { onChange, value } }) =>
                labelOptions ? (
                  <Autocomplete
                    freeSolo
                    size='small'
                    options={labelOptions.keys}
                    value={value}
                    onChange={(_, newValue) => onChange(typeof newValue === 'string' ? newValue : '')}
                    onInputChange={(_, newInputValue) => onChange(newInputValue)}
                    autoHighlight
                    openOnFocus
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size='small'
                        fullWidth
                        label='Key'
                        error={!!errors.key}
                        helperText={errors.key?.message}
                      />
                    )}
                  />
                ) : (
                  <TextField
                    size='small'
                    fullWidth
                    label='Key'
                    error={!!errors.key}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                )
              }
            />
          </Grid>
          {!isGateType && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name='value'
                control={control}
                rules={{ required: 'Value is required' }}
                render={({ field: { onChange, value } }) =>
                  labelOptions ? (
                    <Autocomplete
                      freeSolo
                      size='small'
                      options={valueOptions}
                      value={value}
                      onChange={(_, newValue) => onChange(typeof newValue === 'string' ? newValue : '')}
                      onInputChange={(_, newInputValue) => onChange(newInputValue)}
                      disabled={!currentKey}
                      autoHighlight
                      openOnFocus
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          size='small'
                          fullWidth
                          label='Value'
                          error={!!errors.value}
                          helperText={errors.value?.message}
                        />
                      )}
                    />
                  ) : (
                    <TextField
                      size='small'
                      fullWidth
                      label='Value'
                      error={!!errors.value}
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                  )
                }
              />
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onModalClosed}>
          Cancel
        </Button>
        <Button variant='contained' type='submit'>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};
