// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ReactNode, useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Container } from '@mui/material';

import { useAuth } from '@confighub/react-auth';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { Loader } from '@/components/loader/Loader';

import { hasIdentityProvider, oauthClientId } from './config';
import { CLI_SIGN_IN_PATH } from './session';

const MISSING_CLIENT =
  'This deployment of the UI has no OAuth client configured, so it cannot sign in. ' +
  'Set oauthClientId in its /config.json (CONFIGHUB_UI_OAUTH_CLIENT_ID on the image).';

/**
 * Renders `children` only with a session. The hub UI has no landing page: an
 * unauthenticated visitor goes straight to the identity provider, or, on an
 * instance without one, to the page that says which CLI command signs a browser in.
 */
export const RequireSession = ({ children }: { children: ReactNode }) => {
  const { status, error, login } = useAuth();
  const loginStarted = useRef(false);
  const signsInWithProvider = hasIdentityProvider();
  const misconfigured = signsInWithProvider && !oauthClientId();

  // Once only: login() navigates away, and StrictMode runs effects twice in dev.
  useEffect(() => {
    if (
      status === 'unauthenticated' &&
      signsInWithProvider &&
      !misconfigured &&
      !loginStarted.current
    ) {
      loginStarted.current = true;
      void login();
    }
  }, [status, login, signsInWithProvider, misconfigured]);

  if (status === 'authenticated') {
    return <>{children}</>;
  }
  if (status === 'unauthenticated' && !signsInWithProvider) {
    return <Navigate to={CLI_SIGN_IN_PATH} replace />;
  }
  if (misconfigured) {
    return (
      <Container maxWidth='sm' sx={{ mt: 8 }}>
        <Alert severity='error'>{MISSING_CLIENT}</Alert>
      </Container>
    );
  }
  if (status === 'error') {
    return (
      <ErrorBox
        error={error?.message ?? 'Sign-in failed'}
        onClose={() => void login()}
      />
    );
  }
  return <Loader isLoading={true} />;
};
