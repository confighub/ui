// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import LocalExplorer from './pages/plugin-explorer/LocalExplorer';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalExplorer />
  </StrictMode>,
);
