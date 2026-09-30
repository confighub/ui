/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { createConfigHubClient } from '@confighub/api';
import { ConfigHubAuthContext, type ConfigHubAuthContextValue } from '@confighub/react-auth';

import CliSignInPage from '../../../src/pages/cli-signin/CliSignInPage';

declare global {
  interface Window {
    __pluginSignInAttempts: string[];
  }
}

window.__pluginSignInAttempts = [];

const noop = async () => {};
const value: ConfigHubAuthContextValue = {
  status: 'authenticated',
  user: { organizationId: 'confighub:local:org:default', idpClaims: {} },
  error: null,
  login: noop,
  logout: noop,
  reauthenticate: noop,
  signInWithTicket: async (ticket: string) => {
    window.__pluginSignInAttempts.push(ticket);
    throw new Error('fixture rejects tickets so the next ticket can be tested');
  },
  getToken: () => undefined,
  client: createConfigHubClient({ baseUrl: window.location.origin }),
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigHubAuthContext.Provider value={value}>
        <Routes>
          <Route path='*' element={<CliSignInPage />} />
        </Routes>
      </ConfigHubAuthContext.Provider>
    </BrowserRouter>
  </StrictMode>,
);
