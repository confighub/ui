// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Writing a ServiceAccount's credentials: registering a public key, issuing a
 * long-lived token, and taking either away. Each of these is acting as the
 * account, so the server requires Impersonate on it; a refusal says so.
 */

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
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
  useCreateServiceAccountUserKeyMutation,
  useCreateServiceAccountUserTokenMutation,
  type IssuedUserTokenRead,
} from '@confighub/rtk-query';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { consoleTokens as T } from '@/pages/change-orders/consoleStyle';
import { getApiErrorMessage } from '@/utility/error-functions';

function CommandBlock({ command }: { command: string }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        background: T.surfaceSunk,
        border: `1px solid ${T.line}`,
        borderRadius: '8px',
        padding: '6px 6px 6px 12px',
        fontFamily: T.mono,
        fontSize: 12.5,
        overflowX: 'auto',
      }}
    >
      <Box component='code' sx={{ flex: 1, whiteSpace: 'pre' }}>
        {command}
      </Box>
      <CopyToClipboard text={command} title='Copy command' />
    </Box>
  );
}

interface KeyForm {
  PublicJWK: string;
  Description: string;
}

function parseJwk(text: string): Record<string, unknown> | string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'This is not JSON. Paste the public key as a JWK.';
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return 'A JWK is a JSON object.';
  const jwk = parsed as Record<string, unknown>;
  if (typeof jwk.kty !== 'string') return 'A JWK has a kty field.';
  // A private JWK carries `d`. Refusing it here keeps a private key from leaving the browser.
  if ('d' in jwk) return 'This is a private key. Paste only its public half.';
  return jwk;
}

export function RegisterKeyDialog({
  serviceAccountId,
  slug,
  open,
  onClose,
}: {
  serviceAccountId: string;
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const [register, { isLoading }] = useCreateServiceAccountUserKeyMutation();
  const [error, setError] = useState<string>();
  const { control, handleSubmit, reset } = useForm<KeyForm>({ defaultValues: { PublicJWK: '', Description: '' } });
  const close = () => {
    reset();
    setError(undefined);
    onClose();
  };
  const submit = handleSubmit(async (form) => {
    setError(undefined);
    const jwk = parseJwk(form.PublicJWK);
    if (typeof jwk === 'string') {
      setError(jwk);
      return;
    }
    try {
      await register({ serviceAccountId, createUserKeyRequest: { PublicJWK: jwk, Description: form.Description.trim() || undefined } }).unwrap();
      close();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The key could not be registered.');
    }
  });

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth='md'>
      <form onSubmit={submit} data-testid='register-key-form'>
        <DialogTitle>Register a key for {slug}</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 1 }}>
            Whoever holds the private key authenticates as {slug}. ConfigHub only ever sees the public half. The usual way is to generate the pair on
            the machine that will use it:
          </Typography>
          <CommandBlock command={`cub serviceaccount key add ${slug} --generate ${slug} --description "<where it runs>"`} />
          <Typography variant='body2' color='text.secondary' sx={{ mt: 2, mb: 1 }}>
            Or paste a public key you already have, as a JWK:
          </Typography>
          <Stack spacing={2}>
            <Controller
              name='PublicJWK'
              control={control}
              rules={{ required: 'Paste a public key' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  multiline
                  minRows={4}
                  label='Public key (JWK)'
                  placeholder='{"kty":"OKP","crv":"Ed25519","x":"…"}'
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message}
                  inputProps={{ 'data-testid': 'register-key-jwk', style: { fontFamily: T.mono, fontSize: 12.5 } }}
                />
              )}
            />
            <Controller
              name='Description'
              control={control}
              render={({ field }) => <TextField {...field} label='Description' placeholder='Which host or pipeline holds the private key' />}
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
          <Button type='submit' variant='contained' disabled={isLoading} data-testid='register-key-submit'>
            Register key
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const EXPIRY_CHOICES = [
  { value: 'never', label: 'Never' },
  { value: '30', label: 'In 30 days' },
  { value: '90', label: 'In 90 days' },
  { value: '365', label: 'In a year' },
] as const;

interface TokenForm {
  Description: string;
  Expiry: string;
}

/**
 * Issues a token and then shows it, once: ConfigHub keeps only a record of it.
 * The dialog will not close on a stray click while the token is on screen.
 */
export function IssueTokenDialog({
  serviceAccountId,
  slug,
  open,
  onClose,
}: {
  serviceAccountId: string;
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const [issue, { isLoading }] = useCreateServiceAccountUserTokenMutation();
  const [error, setError] = useState<string>();
  const [issued, setIssued] = useState<IssuedUserTokenRead>();
  const { control, handleSubmit, reset } = useForm<TokenForm>({ defaultValues: { Description: '', Expiry: 'never' } });
  const close = () => {
    reset();
    setError(undefined);
    setIssued(undefined);
    onClose();
  };
  const submit = handleSubmit(async (form) => {
    setError(undefined);
    try {
      const expiresAt = form.Expiry === 'never' ? undefined : new Date(Date.now() + Number(form.Expiry) * DAY_MS).toISOString();
      const result = await issue({
        serviceAccountId,
        createUserTokenRequest: { Description: form.Description.trim(), ExpiresAt: expiresAt },
      }).unwrap();
      setIssued(result);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'The token could not be issued.');
    }
  });

  if (issued?.Token) {
    return (
      <Dialog open={open} fullWidth maxWidth='md' data-testid='issued-token-dialog'>
        <DialogTitle>Token issued for {slug}</DialogTitle>
        <DialogContent>
          <Alert severity='warning' sx={{ mb: 2 }}>
            Copy it now. ConfigHub does not keep the token and cannot show it again.
          </Alert>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              background: T.surfaceSunk,
              border: `1px solid ${T.line}`,
              borderRadius: '8px',
              padding: '8px 8px 8px 12px',
            }}
          >
            <Box component='code' data-testid='issued-token' sx={{ flex: 1, fontFamily: T.mono, fontSize: 12, wordBreak: 'break-all' }}>
              {issued.Token}
            </Box>
            <CopyToClipboard text={issued.Token} title='Copy token' />
          </Box>
          <Typography variant='body2' color='text.secondary' sx={{ mt: 2 }}>
            Use it where a static credential is all a system can hold, such as an Argo CD repository Secret, with the username <code>token</code>.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant='contained' onClick={close} data-testid='issued-token-done'>
            I have copied it
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
      <form onSubmit={submit} data-testid='issue-token-form'>
        <DialogTitle>Issue a token for {slug}</DialogTitle>
        <DialogContent>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 2 }}>
            A long-lived token is for a system that can hold only a static secret. Anything that can sign an assertion should use a key instead. The
            token is shown once.
          </Typography>
          <Stack spacing={2}>
            <Controller
              name='Description'
              control={control}
              rules={{ required: 'Say where the token will be held, so it can be retired later' }}
              render={({ field, fieldState }) => (
                <TextField
                  {...field}
                  autoFocus
                  label='Description'
                  placeholder='Argo CD repository Secret, prod cluster'
                  error={fieldState.invalid}
                  helperText={fieldState.error?.message ?? 'Which system holds the token'}
                  inputProps={{ 'data-testid': 'issue-token-description' }}
                />
              )}
            />
            <Controller
              name='Expiry'
              control={control}
              render={({ field }) => (
                <TextField {...field} select label='Expires'>
                  {EXPIRY_CHOICES.map((choice) => (
                    <MenuItem key={choice.value} value={choice.value}>
                      {choice.label}
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
          <Button type='submit' variant='contained' disabled={isLoading} data-testid='issue-token-submit'>
            Issue token
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/** A yes/no confirmation for one credential, with the server's refusal in place. */
export function ConfirmCredentialDialog({
  open,
  title,
  body,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => {
    setError(undefined);
    onClose();
  };
  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      close();
    } catch (e: unknown) {
      setError(getApiErrorMessage(e) || 'That did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth='sm'>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography variant='body2'>{body}</Typography>
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
        <Button color='error' variant='contained' disabled={busy} onClick={() => void confirm()} data-testid='confirm-credential'>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
