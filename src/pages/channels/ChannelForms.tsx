// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Creating and deleting a Channel. A Channel's Commands and Subscriptions are
 * edited as its document on its own page, since they are structured enough that
 * a form would only be a worse YAML editor.
 */

import { useMemo, useState } from 'react';
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
  useCreateChannelMutation,
  useDeleteChannelMutation,
  useListServiceAccountsQuery,
  useListSpacesQuery,
  type ChannelRead,
  type Permissions,
} from '@confighub/rtk-query';

import { SLUG_PATTERN, SLUG_PATTERN_MESSAGE } from '@confighub/api';

import { DISPLAY_NAME_RULE } from '@/components/console-detail/consoleDetailUtil';
import { getApiErrorMessage } from '@/utility/error-functions';

const NO_ACCOUNT = '';

interface CreateForm {
  SpaceID: string;
  Slug: string;
  DisplayName: string;
  /** The User of the ServiceAccount given Claim, or '' for none. */
  ClaimUserID: string;
}

export function CreateChannelDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (channel: ChannelRead) => void;
}) {
  const [create, { isLoading }] = useCreateChannelMutation();
  const spaces = useListSpacesQuery({ select: 'SpaceID,Slug' }, { skip: !open });
  const serviceAccounts = useListServiceAccountsQuery({ select: 'ServiceAccountID,Slug,UserID' }, { skip: !open });
  const spaceOptions = useMemo(
    () => (spaces.data ?? []).flatMap((entry) => (entry.Space?.SpaceID ? [entry.Space] : [])).sort((a, b) => a.Slug.localeCompare(b.Slug)),
    [spaces.data],
  );
  const accountOptions = useMemo(
    () => (serviceAccounts.data ?? []).flatMap((entry) => (entry.ServiceAccount?.UserID ? [entry.ServiceAccount] : [])).sort((a, b) => a.Slug.localeCompare(b.Slug)),
    [serviceAccounts.data],
  );
  const [error, setError] = useState<string>();
  const { control, handleSubmit, reset } = useForm<CreateForm>({ defaultValues: { SpaceID: '', Slug: '', DisplayName: '', ClaimUserID: NO_ACCOUNT } });
  const close = () => {
    reset();
    setError(undefined);
    onClose();
  };
  const submit = handleSubmit(async (form) => {
    setError(undefined);
    const permissions: Permissions | undefined =
      form.ClaimUserID === NO_ACCOUNT ? undefined : { Claim: { UserIDs: { [form.ClaimUserID]: true } } };
    try {
      const created = await create({
        spaceId: form.SpaceID,
        channel: { Slug: form.Slug.trim(), DisplayName: form.DisplayName.trim() || undefined, EventPosition: 0, Permissions: permissions },
      }).unwrap();
      reset();
      onCreated(created);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The Channel could not be created.');
    }
  });

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
      <form onSubmit={submit} data-testid='create-channel-form'>
        <DialogTitle>New Channel</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            A Channel is the mailbox between ConfigHub and one bot. The bot claims it as a service account holding Claim, then receives the events it
            subscribes to and runs the commands it declares. Set those on the Channel&apos;s page after creating it.
          </Typography>
          <Stack spacing={2}>
            <Controller
              name='SpaceID'
              control={control}
              rules={{ required: 'Choose the Space the Channel belongs to' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  select
                  label='Space'
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message ?? 'Usually the Space of the deployment the bot serves'}
                  SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 360 } } } }}
                  inputProps={{ 'data-testid': 'channel-space' }}
                >
                  {spaceOptions.map((space) => (
                    <MenuItem key={space.SpaceID} value={space.SpaceID}>
                      {space.Slug}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <Controller
              name='Slug'
              control={control}
              rules={{ required: 'A name is required', pattern: { value: SLUG_PATTERN, message: SLUG_PATTERN_MESSAGE } }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  label='Name'
                  placeholder='argobot'
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message}
                  inputProps={{ 'data-testid': 'channel-slug' }}
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
            <Controller
              name='ClaimUserID'
              control={control}
              render={({ field }) => (
                <TextField {...field} select label='Claimed by' helperText='The service account the bot runs as. It is given Claim on the Channel.'>
                  <MenuItem value={NO_ACCOUNT}>
                    <em>No one yet</em>
                  </MenuItem>
                  {accountOptions.map((sa) => (
                    <MenuItem key={sa.ServiceAccountID} value={sa.UserID}>
                      {sa.Slug}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
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
          <Button type='submit' variant='contained' disabled={isLoading} data-testid='create-channel-submit'>
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export function DeleteChannelDialog({
  channel,
  connected,
  open,
  onClose,
  onDeleted,
}: {
  channel: ChannelRead;
  connected: boolean;
  open: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [remove, { isLoading }] = useDeleteChannelMutation();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const confirm = async () => {
    setError(undefined);
    try {
      await remove({ spaceId: channel.SpaceID ?? '', channelId: channel.ChannelID ?? '' }).unwrap();
      onDeleted();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The Channel could not be deleted.');
    }
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth='sm'>
      <DialogTitle>Delete {channel.Slug}?</DialogTitle>
      <DialogContent>
        <Typography variant='body2' sx={{ mb: 2 }}>
          {connected ? 'A client is connected to it now and will lose its mailbox. ' : ''}
          Its commands can no longer be run, and the events it would have received are not kept for it.
        </Typography>
        <TextField fullWidth label={`Type ${channel.Slug} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} />
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
        <Button color='error' variant='contained' disabled={typed !== channel.Slug || isLoading} onClick={() => void confirm()}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
