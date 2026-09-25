// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useAppDispatch } from '@/hooks/useApp';
import { TargetRead, UnitRead } from '@confighub/rtk-query';
import { UpdateUnitApiArg, useUpdateUnitMutation } from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import Grid from '@mui/material/Grid2';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import OutlinedInput from '@mui/material/OutlinedInput';
import Select from '@mui/material/Select';

export interface ISelectTargetInput {
  ID: string;
}

export interface SelectTargetModalProps {
  onSelectTargetModalClosed: () => void;
  targets: TargetRead[];
  isSelectTargetModalOpen: boolean;
  unit: UnitRead | undefined;
  refresh?: () => void;
}

export const SelectTargetModal = ({
  onSelectTargetModalClosed,
  targets,
  isSelectTargetModalOpen = false,
  unit = {} as UnitRead,
  refresh,
}: SelectTargetModalProps) => {
  const dispatch = useAppDispatch();
  const [updateUnit] = useUpdateUnitMutation();
  const {
    control,
    handleSubmit,
    setValue,
    reset,
    watch,
    formState: { errors },
  } = useForm<ISelectTargetInput>({
    defaultValues: {
      ID: '',
    },
  });

  const onModalClosed = () => {
    onSelectTargetModalClosed();
    reset();
  };

  useEffect(() => {
    if (isSelectTargetModalOpen) {
      reset({
        ID: '',
      });
    }
  }, [isSelectTargetModalOpen, reset]);

  const onSubmit = async (data: ISelectTargetInput) => {
    const response = await updateUnit({
      unitId: unit.UnitID || '',
      spaceId: unit.SpaceID || '',
      unit: {
        ...unit,
        TargetID: data.ID,
      },
    } as UpdateUnitApiArg);

    if (response.data) {
      dispatch(
        setAlert({
          type: 'success',
          message: 'Target updated successfully!',
        }),
      );

      refresh?.();
    } else {
      dispatch(
        setAlert({
          type: 'error',
          message: 'Failed to update the unit target.',
        }),
      );
    }
  };

  return (
    <Dialog
      open={isSelectTargetModalOpen}
      onClose={onModalClosed}
      maxWidth='lg'
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit((data, event) => {
          event?.preventDefault();
          event?.stopPropagation();
          onModalClosed();
          onSubmit(data);
        }),
      }}
    >
      <DialogTitle>Select Target</DialogTitle>
      <DialogContent>
        <Grid container sx={{ minWidth: '500px', marginTop: '10px' }}>
          <Grid size={{ xs: 12 }}>
            <Controller
              name='ID'
              control={control}
              rules={{ required: 'A target is required' }}
              render={({ field }) => (
                <FormControl fullWidth size='small'>
                  <InputLabel>Target</InputLabel>
                  <Select
                    label='Target'
                    input={<OutlinedInput label='Target' />}
                    error={!!errors.ID}
                    size='small'
                    {...field}
                    value={watch('ID')}
                    onChange={(event) => {
                      setValue('ID', event.target.value);
                    }}
                  >
                    {targets.map((target) => (
                      <MenuItem key={target?.TargetID} value={target?.TargetID}>
                        {target?.Slug}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onModalClosed}>
          Cancel
        </Button>
        <Button variant='contained' type='submit'>
          Update
        </Button>
      </DialogActions>
    </Dialog>
  );
};
