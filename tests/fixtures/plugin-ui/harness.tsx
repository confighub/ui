/* eslint-disable react-refresh/only-export-components */
import { createRoot } from 'react-dom/client';

import { createConfigHubClient } from '@confighub/api';
import { ConfigHubAuthContext, type ConfigHubAuthContextValue } from '@confighub/react-auth';

import ConnectedExplorer from '../../../src/pages/plugin-explorer/ConnectedExplorer';

const noop = async () => {};
const value: ConfigHubAuthContextValue = {
  status: 'authenticated',
  user: { organizationId: 'confighub:local:org:default', idpClaims: {} },
  error: null,
  login: noop,
  logout: noop,
  reauthenticate: noop,
  signInWithTicket: noop,
  getToken: () => undefined,
  client: createConfigHubClient({ baseUrl: window.location.origin }),
};
createRoot(document.getElementById('root')!).render(
  <ConfigHubAuthContext.Provider value={value}>
    <ConnectedExplorer />
  </ConfigHubAuthContext.Provider>,
);
