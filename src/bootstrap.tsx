// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from 'react-error-boundary';
import { Provider as StoreProvider } from 'react-redux';
import { Outlet, RouterProvider, createBrowserRouter } from 'react-router-dom';
import { PostHogProvider } from 'posthog-js/react';
import { getAccessToken } from '@confighub/react-auth';
import { configureConfigHub } from '@confighub/rtk-query';

import { Routes } from './App.tsx';
import { AuthRoot } from './auth/AuthRoot';
import { apiBaseUrl } from './auth/config';
import { handleForbidden, handleUnauthorized } from './auth/session';
import { Theme } from './components/theme-provider/ThemeProvider';
import { TourHost } from './components/tour';
import './index.css';
import { FallbackPage } from './pages/fallback/FallbackPage';
import store from './state/store';
import { posthogKey } from './utility/telemetry';

// The API client is a module-level singleton: point it at the instance and the token
// before anything renders, since the first query is dispatched on the first render.
configureConfigHub({
  baseUrl: apiBaseUrl(),
  getToken: getAccessToken,
  onUnauthorized: handleUnauthorized,
  onForbidden: handleForbidden,
});

export const Root = () => {
  return (
    <>
      <Outlet />
      <TourHost />
    </>
  );
};

const createRouter = () =>
  createBrowserRouter([
    {
      element: <Root />,
      children: Routes(),
    },
  ], {
    future: {
      v7_fetcherPersist: true,
      v7_normalizeFormMethod: true,
      v7_partialHydration: true,
      v7_relativeSplatPath: true,
      v7_skipActionErrorRevalidation: true,
    }
  });

// The router captures window.location when it is created, so it is created only
// once AuthRoot has settled: completing an IdP redirect ends by restoring the URL
// the login started from, and a router built earlier would still be on the
// callback URL.
const AppRouter = () => {
  const router = useMemo(createRouter, []);
  return <RouterProvider router={router} future={{ v7_startTransition: true }} />;
};

const app = (
  <ErrorBoundary
    FallbackComponent={FallbackPage}
    onReset={() => {
      window.location.reload();
    }}
  >
    <StoreProvider store={store}>
      <Theme>
        <AuthRoot>
          <AppRouter />
        </AuthRoot>
      </Theme>
    </StoreProvider>
  </ErrorBoundary>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {posthogKey() ? (
      <PostHogProvider
        apiKey={posthogKey()}
        options={{
          api_host: 'https://us.i.posthog.com',
          defaults: '2025-05-24',
          capture_exceptions: true,
          debug: import.meta.env.MODE === 'development',
        }}
      >
        {app}
      </PostHogProvider>
    ) : (
      app
    )}
  </StrictMode>,
);
