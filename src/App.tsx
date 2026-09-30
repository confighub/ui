// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Suspense, lazy } from 'react';
import { Navigate } from 'react-router-dom';

import { AuthenticatedContextProvider } from './components/authenticated-context/AuthenticatedContext';
import { Loader } from './components/loader/Loader';
import './index.css';
import { FallbackPage } from './pages/fallback/FallbackPage';
import { Layout } from './pages/layout/Layout';

const SpacesListPage = lazy(() => import('./pages/space-list/SpaceListPage'));
const SpaceDetailPage = lazy(() => import('./pages/space-detail/SpaceDetailPage'));
const UnitListPage = lazy(() => import('./pages/unit-list/UnitListPage'));
const UnitDashboardPage = lazy(
  () => import('./pages/x/unit-dashboard-page/UnitDashboardPage'),
);
const UnitDetailPage = lazy(() => import('./pages/unit-detail/UnitDetailPage'));
const FunctionListPage = lazy(() => import('./pages/function-list/FunctionListPage'));
const BridgeWorkersListPage = lazy(
  () => import('./pages/bridge-worker-list/BridgeWorkerListPage'),
);
const TargetListPage = lazy(() => import('./pages/target-list/TargetListPage'));
const FunctionBrowserPage = lazy(() => import('./pages/function-browser/FunctionBrowserPage'));
const ChangeReviewPage = lazy(() => import('./pages/change-review/ChangeReviewPage'));
const AppsComponentPage = lazy(() => import('./pages/x/apps/AppsComponentPage'));
const RolloutsPage = lazy(() => import('./pages/rollouts/RolloutsPage'));
const ViewExplorerPage = lazy(() => import('./pages/x/view-explorer/ViewExplorerPage'));
const ResourceExplorerPage = lazy(
  () => import('./pages/x/resource-explorer/ResourceExplorerPage'),
);
const AccessDeniedPage = lazy(() => import('./pages/access-denied/AccessDeniedPage'));
const PendingApprovalPage = lazy(() => import('./pages/pending-approval/PendingApprovalPage'));
const CliSignInPage = lazy(() => import('./pages/cli-signin/CliSignInPage'));
const InitiativesPage = lazy(() => import('./pages/initiatives/InitiativesPage'));
const DesignSystemPage = lazy(() => import('./pages/design-system/DesignSystemPage'));
const WorkflowBuilderPage = lazy(
  () => import('./pages/x/workflow-builder/WorkflowBuilderPage'),
);

const routes = [
  {
    path: '/design-system',
    element: (
      <Suspense fallback={<Loader isLoading={true} />}>
        <DesignSystemPage />
      </Suspense>
    ),
  },
  {
    path: '/access-denied',
    element: (
      <Suspense fallback={<Loader isLoading={true} />}>
        <AccessDeniedPage />
      </Suspense>
    ),
  },
  {
    path: '/pending-approval',
    element: (
      <Suspense fallback={<Loader isLoading={true} />}>
        <PendingApprovalPage />
      </Suspense>
    ),
  },
  {
    // Reached when the instance has no identity provider, so there is no login
    // page to redirect to. Outside AuthenticatedContextProvider, because
    // arriving here means there is no session to establish.
    path: '/cli-signin',
    element: (
      <Suspense fallback={<Loader isLoading={true} />}>
        <CliSignInPage />
      </Suspense>
    ),
  },
  {
    path: '/',
    errorElement: <FallbackPage />,
    element: (
      <AuthenticatedContextProvider>
        <Layout />
      </AuthenticatedContextProvider>
    ),
    children: [
      {
        index: true,
        element: <Navigate to='/components' replace />,
      },
      {
        path: '/spaces',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <SpacesListPage />
          </Suspense>
        ),
      },
      {
        path: '/bridge-workers',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <BridgeWorkersListPage />
          </Suspense>
        ),
      },
      {
        path: '/units',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <UnitListPage />
          </Suspense>
        ),
      },
      {
        path: '/unit-dashboard',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <UnitDashboardPage />
          </Suspense>
        ),
      },
      {
        path: '/spaces/:id?',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <SpaceDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/units/:spaceID/:id',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <UnitDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/functions/:name',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <FunctionListPage />
          </Suspense>
        ),
      },
      {
        path: '/targets',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <TargetListPage />
          </Suspense>
        ),
      },
      {
        path: '/function-browser',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <FunctionBrowserPage />
          </Suspense>
        ),
      },
      {
        path: '/components',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <AppsComponentPage />
          </Suspense>
        ),
      },
      {
        path: '/rollouts/:slug?/:stage?',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <RolloutsPage />
          </Suspense>
        ),
      },
      {
        path: '/diff',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeReviewPage />
          </Suspense>
        ),
      },
      {
        path: '/x/view-explorer',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ViewExplorerPage />
          </Suspense>
        ),
      },
      {
        path: '/x/resource-explorer',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ResourceExplorerPage />
          </Suspense>
        ),
      },
      {
        path: '/x/initiatives',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        path: '/x/initiatives/new',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        path: '/x/initiatives/:id',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        path: '/x/initiatives/:id/edit',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        // Authoring a ChangeWorkflow. The bare path lists them; the id names one.
        // An id belongs in the path because it says which workflow the page is
        // about, where a query string would say how to look at some other subject.
        path: '/x/workflow-builder',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <WorkflowBuilderPage />
          </Suspense>
        ),
      },
      {
        path: '/x/workflow-builder/:changeWorkflowId',
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <WorkflowBuilderPage />
          </Suspense>
        ),
      },
      {
        path: '*',
        element: <Navigate to='/' />,
      },
    ],
  },
];

export const Routes = () => {
  return routes;
};
