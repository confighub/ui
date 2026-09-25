// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ReactNode, useEffect } from 'react';

import { ConfigHubAuthProvider, useAuth } from '@confighub/react-auth';

import { Loader } from '@/components/loader/Loader';

import { apiBaseUrl, oauthClientId } from './config';
import { registerAuthActions } from './session';

/**
 * Exposes the provider's actions to non-React code (see `session.ts`) and holds
 * rendering until the provider has settled: it may be completing an IdP redirect,
 * which ends by restoring the URL the login started from. The router must not
 * mount before that, or it reads the callback URL instead.
 */
const BearerBridge = ({ children }: { children: ReactNode }) => {
  const { status, login, logout, reauthenticate } = useAuth();

  useEffect(() => {
    registerAuthActions({ login, logout, reauthenticate });
    return () => registerAuthActions(null);
  }, [login, logout, reauthenticate]);

  if (status === 'loading') {
    return <Loader isLoading={true} />;
  }
  return <>{children}</>;
};

/**
 * Sits above the router and makes the UI an OAuth client of the instance: the auth
 * flow in `./sdk` against the configured instance and `client_id`.
 */
export const AuthRoot = ({ children }: { children: ReactNode }) => {
  return (
    <ConfigHubAuthProvider
      baseUrl={apiBaseUrl()}
      clientId={oauthClientId()}
      persist='session'
      onUnauthorized='login'
    >
      <BearerBridge>{children}</BearerBridge>
    </ConfigHubAuthProvider>
  );
};
