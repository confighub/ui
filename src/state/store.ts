// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { selectedUnitsSlice } from './slices/selectedUnits';
import { confighubApi } from '@confighub/rtk-query';
import { alertSlice } from './slices/alert';
import { functionInvocationSlice } from './slices/functionInvocation';
import { initiativeInvocationSlice } from './slices/initiativeInvocation';
import { layoutSlice } from './slices/layoutSlice';
import { tourSlice } from './slices/tourSlice';
import { applyInvalidationMap } from './liveness/invalidationMap';

// Add the cross-entity invalidation edges the codegen cannot express: a
// generated mutation only ever invalidates its own entity, so without this an
// apply never refreshes revisions, a function invocation never refreshes the
// unit it rewrote, and six tag types are invalidated by nothing at all. Must
// run before the first mutation dispatch; see docs/design/ui-liveness.md.
applyInvalidationMap();

const store = configureStore({
  reducer: {
    [confighubApi.reducerPath]: confighubApi.reducer,
    alert: alertSlice.reducer,
    functionInvocation: functionInvocationSlice.reducer,
    initiativeInvocation: initiativeInvocationSlice.reducer,
    layout: layoutSlice.reducer,
    selectedUnits: selectedUnitsSlice.reducer,
    tour: tourSlice.reducer,
  },
  devTools: process.env.NODE_ENV === 'development',
  // The RTK Query cache can hold tens of MB for large units (full unit Data,
  // revision bodies, etc.). The dev-only serializableCheck / immutableCheck
  // middleware deep-walk the ENTIRE state tree (and every dispatched action
  // payload) on each action, which on a big cache costs tens of seconds and
  // stalls the UI. Exempt the API cache slice and the RTK Query fulfilled
  // action payloads from these scans so the deep-walk is bounded to the small
  // app slices. Checks stay enabled for everything else; production strips both.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Don't scan the API cache slice for non-serializable values.
        ignoredPaths: [confighubApi.reducerPath],
        // Skip the large RTK Query fulfilled/rejected actions entirely (their
        // whole per-path scan, including the big parsed-response payload). This
        // already covers the heavy payloads, so we do NOT add 'payload' to
        // ignoredActionPaths (which would weaken the dev safety net for every
        // other slice's actions).
        ignoredActions: [
          `${confighubApi.reducerPath}/executeQuery/fulfilled`,
          `${confighubApi.reducerPath}/executeQuery/rejected`,
          `${confighubApi.reducerPath}/executeMutation/fulfilled`,
          `${confighubApi.reducerPath}/executeMutation/rejected`,
        ],
        // Preserve RTK's defaults (['meta.arg','meta.baseQueryMeta']) — supplying
        // a custom array REPLACES them, so we must restate meta.arg to keep its
        // exemption for other thunks.
        ignoredActionPaths: ['meta.arg', 'meta.baseQueryMeta'],
      },
      immutableCheck: {
        // Don't deep-walk the (large, effectively immutable) API cache slice.
        ignoredPaths: [confighubApi.reducerPath],
      },
    }).concat(confighubApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;

export type AppDispatch = typeof store.dispatch;

export default store;

setupListeners(store.dispatch);
