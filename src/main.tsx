// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { loadRuntimeConfig } from './auth/config';

// Runtime configuration first, then the app. The app's modules read the
// configuration as they initialize (the API base URL is baked into the RTK Query
// base query at import time), so they must not be imported until it is loaded.
void loadRuntimeConfig().then(() => import('./bootstrap'));
