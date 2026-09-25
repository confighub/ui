// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

import { useAppDispatch } from '@/hooks/useApp';
import {
  LinkRead,
  UpdateLinkApiArg,
  useUpdateLinkMutation,
} from '@confighub/rtk-query';
import { setAlert } from '@/state/slices/alert.ts';
import { IUnitMutationModalProps } from '@/types';
import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
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
import TextField from '@mui/material/TextField';

export interface IUpdateLinkInput {
  Slug: string;
  FromUnitID: string;
  ToUnitID: string;
}

export interface IUpdateLinksModalProps extends IUnitMutationModalProps {
  link: LinkRead;
}

export const UpdateLinksModal = ({
  onClose,
  fromUnit,
  toUnit,
  isOpen = false,
  link,
  refresh,
}: IUpdateLinksModalProps) => {
  const dispatch = useAppDispatch();
  const [updateLink] = useUpdateLinkMutation();

  const {
    control,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<IUpdateLinkInput>({
    defaultValues: {
      Slug: '',
      FromUnitID: fromUnit?.UnitID || '',
      ToUnitID: toUnit?.UnitID || '',
    },
  });

  const onModalClosed = () => {
    onClose();
    reset();
  };

  useEffect(() => {
    if (isOpen) {
      reset({
        Slug: '',
        FromUnitID: fromUnit?.UnitID || '',
        ToUnitID: toUnit?.UnitID || '',
      });
    }

    setValue('FromUnitID', fromUnit?.UnitID || '');
    setValue('ToUnitID', toUnit?.UnitID || '');
    setValue('Slug', link?.Slug || '');
  }, [isOpen, reset, setValue, toUnit, fromUnit]);

  const onUpdateLink = async (data: IUpdateLinkInput) => {
    const input: UpdateLinkApiArg = {
      spaceId: link?.SpaceID || '',
      linkId: link?.LinkID || '',
      link: {
        ...link,
        Slug: data?.Slug,
      },
    };

    const result = await updateLink(input);

    if (result?.data) {
      refresh?.();

      dispatch(
        setAlert({
          message: `Updated link ${data?.Slug} successfully.`,
          type: 'success',
          isOpen: true,
        }),
      );

      onClose();
    } else {
      dispatch(
        setAlert({
          message: 'There was an error updating the link. Please try again.',
          type: 'error',
          isOpen: true,
        }),
      );
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onModalClosed}
      maxWidth='lg'
      PaperProps={{
        component: 'form',
        onSubmit: handleSubmit((data, event) => {
          event?.preventDefault();
          event?.stopPropagation();
          onModalClosed();
          onUpdateLink(data);
        }),
      }}
    >
      <DialogTitle>Update {link.Slug}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} size={12} sx={{ minWidth: '600px', paddingTop: '10px' }}>
          <Grid size={{ xs: 6 }}>
            <Controller
              name='Slug'
              defaultValue={link?.Slug}
              control={control}
              rules={{
                required: 'Link Name is required',
                pattern: {
                  value: SLUG_PATTERN,
                  message: SLUG_PATTERN_MESSAGE,
                },
              }}
              render={({ field }) => (
                <TextField
                  fullWidth
                  label='Link Name'
                  error={!!errors.Slug}
                  helperText={errors.Slug?.message}
                  {...field}
                />
              )}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Controller
              name='FromUnitID'
              control={control}
              rules={{ required: 'From Unit is required' }}
              render={({ field }) => (
                <FormControl fullWidth size='small'>
                  <InputLabel>From Unit</InputLabel>
                  <Select
                    label='From Unit'
                    input={<OutlinedInput label='From Unit' />}
                    size='small'
                    error={!!errors?.FromUnitID}
                    {...field}
                    value={fromUnit?.UnitID}
                  >
                    <MenuItem value={fromUnit?.UnitID}>{fromUnit?.Slug}</MenuItem>
                  </Select>
                </FormControl>
              )}
            />
          </Grid>
          <Grid size={{ xs: 1 }}>
            <SubdirectoryArrowRightIcon />
          </Grid>
          <Grid size={{ xs: 11 }}>
            <Controller
              name='ToUnitID'
              control={control}
              rules={{ required: 'To Unit is required' }}
              render={({ field }) => (
                <FormControl fullWidth size='small'>
                  <InputLabel>To Unit</InputLabel>
                  <Select
                    label='To Unit'
                    input={<OutlinedInput label='To Unit' />}
                    size='small'
                    error={!!errors?.ToUnitID}
                    {...field}
                    value={toUnit?.UnitID}
                  >
                    <MenuItem value={toUnit?.UnitID}>{toUnit?.Slug}</MenuItem>
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
