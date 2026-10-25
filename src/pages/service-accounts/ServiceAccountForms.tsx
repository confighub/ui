// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The dialogs that write a ServiceAccount: create it, change its name and role,
 * and delete it.
 */

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  useCreateServiceAccountMutation,
  useDeleteServiceAccountMutation,
  usePatchServiceAccountMutation,
  type ServiceAccountRead,
} from '@confighub/rtk-query';

import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';

import { DISPLAY_NAME_RULE } from '@/components/console-detail/consoleDetailUtil';
import { getApiErrorMessage } from '@/utility/error-functions';

import { ORG_ROLES } from './orgRoles';


interface CreateForm {
  Slug: string;
  DisplayName: string;
  OrgRole: string;
}

export function CreateServiceAccountDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (slug: string) => void }) {
  const [create, { isLoading }] = useCreateServiceAccountMutation();
  const [error, setError] = useState<string>();
  const { control, handleSubmit, reset } = useForm<CreateForm>({ defaultValues: { Slug: '', DisplayName: '', OrgRole: 'none' } });

  const close = () => {
    reset();
    setError(undefined);
    onClose();
  };
  const submit = handleSubmit(async (form) => {
    setError(undefined);
    try {
      const created = await create({
        serviceAccount: { Slug: form.Slug.trim(), DisplayName: form.DisplayName.trim() || undefined, OrgRole: form.OrgRole },
      }).unwrap();
      reset();
      onCreated(created.Slug);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The service account could not be created.');
    }
  });

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
      <form onSubmit={submit} data-testid='create-service-account-form'>
        <DialogTitle>New service account</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            A service account is an identity for a bot or pipeline. After creating it, register a key or issue a token for whatever runs as it, and
            grant it access by naming it in Permissions or giving it an organization role.
          </Typography>
          <Stack spacing={2}>
            <Controller
              name='Slug'
              control={control}
              rules={{ required: 'A name is required', pattern: { value: SLUG_PATTERN, message: SLUG_PATTERN_MESSAGE } }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  autoFocus
                  label='Name'
                  placeholder='deploy-bot'
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message ?? 'The slug it is known by, as in cub serviceaccount get <name>'}
                  inputProps={{ 'data-testid': 'service-account-slug' }}
                />
              )}
            />
            <Controller
              name='DisplayName'
              control={control}
              rules={DISPLAY_NAME_RULE}
              render={({ field, fieldState }) => (
                <TextField {...field} label='Display name' placeholder='Optional' error={fieldState.invalid} helperText={fieldState.error?.message} />
              )}
            />
            <OrgRoleField control={control} />
          </Stack>
          {error ? (
            <Alert severity='error' sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={close}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' disabled={isLoading} data-testid='create-service-account-submit'>
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

function OrgRoleField({ control }: { control: ReturnType<typeof useForm<CreateForm>>['control'] }) {
  return (
    <Controller
      name='OrgRole'
      control={control}
      render={({ field }) => (
        <TextField {...field} select label='Organization role' helperText='No higher than your own role. Most bots need None plus specific grants.'>
          {ORG_ROLES.map((role) => (
            <MenuItem key={role.value} value={role.value}>
              {role.label}
              <Typography component='span' variant='body2' color='text.secondary' sx={{ ml: 1 }}>
                {role.hint}
              </Typography>
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}

export function EditServiceAccountDialog({ serviceAccount, open, onClose }: { serviceAccount: ServiceAccountRead; open: boolean; onClose: () => void }) {
  const [patch, { isLoading }] = usePatchServiceAccountMutation();
  const [error, setError] = useState<string>();
  const { control, handleSubmit } = useForm<CreateForm>({
    values: { Slug: serviceAccount.Slug, DisplayName: serviceAccount.DisplayName ?? '', OrgRole: serviceAccount.OrgRole || 'none' },
  });
  const submit = handleSubmit(async (form) => {
    setError(undefined);
    try {
      await patch({
        serviceAccountId: serviceAccount.ServiceAccountID ?? '',
        body: { DisplayName: form.DisplayName.trim(), OrgRole: form.OrgRole, Version: serviceAccount.Version },
      }).unwrap();
      onClose();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The service account could not be changed.');
    }
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <form onSubmit={submit}>
        <DialogTitle>Edit {serviceAccount.Slug}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Controller
              name='DisplayName'
              control={control}
              rules={DISPLAY_NAME_RULE}
              render={({ field, fieldState }) => (
                <TextField {...field} label='Display name' error={fieldState.invalid} helperText={fieldState.error?.message} />
              )}
            />
            <OrgRoleField control={control} />
          </Stack>
          {error ? (
            <Alert severity='error' sx={{ mt: 2 }}>
              {error}
            </Alert>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button variant='outlined' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' disabled={isLoading}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * Deleting is confirmed by typing the slug: the account's keys and tokens stop
 * working at once, and whatever runs as it starts failing.
 */
export function DeleteServiceAccountDialog({
  serviceAccount,
  credentialCount,
  open,
  onClose,
  onDeleted,
}: {
  serviceAccount: ServiceAccountRead;
  credentialCount: number;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [remove, { isLoading }] = useDeleteServiceAccountMutation();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setError(undefined);
    try {
      await remove({ serviceAccountId: serviceAccount.ServiceAccountID ?? '' }).unwrap();
      onDeleted();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The service account could not be deleted.');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Delete {serviceAccount.Slug}?</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>
          {credentialCount > 0
            ? `Its ${credentialCount === 1 ? 'credential stops' : `${credentialCount} credentials stop`} working at once, and anything authenticating as it will fail.`
            : 'It has no credentials, so nothing should be authenticating as it.'}{' '}
          Grants that name it are left pointing at nobody.
        </Typography>
        <TextField
          fullWidth
          label={`Type ${serviceAccount.Slug} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputProps={{ 'data-testid': 'delete-service-account-confirm' }}
        />
        {error ? (
          <Alert severity='error' sx={{ mt: 2 }}>
            {error}
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button variant='outlined' onClick={onClose}>
          Cancel
        </Button>
        <Button color='error' variant='contained' disabled={typed !== serviceAccount.Slug || isLoading} onClick={() => void confirm()}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
