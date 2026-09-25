// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';
import { Alert, Box, Container, Paper, Typography } from '@mui/material';
import { Terminal as TerminalIcon } from '@mui/icons-material';

import { useAuth } from '@confighub/react-auth';

import { Loader } from '@/components/loader/Loader';

/** The ticket `cub auth browser-session` put in the link's fragment, if any. */
const ticketFromFragment = (): string | null =>
  new URLSearchParams(window.location.hash.slice(1)).get('ticket');

/**
 * Where a browser signs in on an instance with no identity provider, and where
 * an unauthenticated one lands there. There is no login form to show: the session
 * comes from the CLI, which already holds a key. Opened from the link
 * `cub auth browser-session` prints, it redeems the ticket in the fragment;
 * otherwise it says which command produces one.
 */
export const CliSignInPage = () => {
  const { signInWithTicket } = useAuth();
  const [ticket] = useState(ticketFromFragment);
  const [failed, setFailed] = useState(false);
  const redeemed = useRef(false);

  // Redeeming is a side effect of arriving with a ticket, once: the ticket works
  // only once, and StrictMode runs effects twice in dev.
  useEffect(() => {
    if (!ticket || redeemed.current) return;
    redeemed.current = true;
    // Out of the address bar and history before anything else.
    window.history.replaceState(null, '', window.location.pathname);
    signInWithTicket(ticket)
      // A full load, so the app starts over signed in.
      .then(() => window.location.replace('/'))
      .catch(() => setFailed(true));
  }, [ticket, signInWithTicket]);

  if (ticket && !failed) {
    return <Loader isLoading={true} />;
  }

  return (
    <Container maxWidth='sm'>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          textAlign: 'center',
          gap: 2,
        }}
      >
        <TerminalIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant='h1' component='h1'>
          Sign in from the command line
        </Typography>
        {failed && (
          <Alert severity='error' sx={{ width: '100%', textAlign: 'left' }}>
            That sign-in link has expired or was already used. Run the command
            below for a new one.
          </Alert>
        )}
        <Typography variant='body1' color='text.secondary'>
          This instance has no identity provider configured, so there is no
          password to enter here. Your session comes from the CLI, which already
          holds a key.
        </Typography>
        <Paper
          variant='outlined'
          sx={{
            px: 2,
            py: 1.5,
            width: '100%',
            fontFamily: 'var(--font-mono)',
            textAlign: 'left',
            overflowX: 'auto',
          }}
        >
          cub auth browser-session
        </Paper>
        <Typography variant='body2' color='text.secondary'>
          That prints a link. Opening it signs this browser in. The link works
          once and expires shortly after it is issued.
        </Typography>
      </Box>
    </Container>
  );
};

export default CliSignInPage;
