// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Suspense, lazy } from 'react';
import { Navigate, RouteObject } from 'react-router-dom';

import { AuthenticatedContextProvider } from './components/authenticated-context/AuthenticatedContext';
import { Loader } from './components/loader/Loader';
import { CrumbHandle, crumbs } from './components/trail/crumbs';
import './index.css';
import DeliveryOldRouteRedirect from './pages/delivery/DeliveryOldRouteRedirect';
import { FallbackPage } from './pages/fallback/FallbackPage';
import { Layout } from './pages/layout/Layout';

const SpacesListPage = lazy(() => import('./pages/space-list/SpaceListPage'));
const SpaceDetailPage = lazy(() => import('./pages/space-detail/SpaceDetailPage'));
const UnitListPage = lazy(() => import('./pages/unit-list/UnitListPage'));
const UnitDetailPage = lazy(() => import('./pages/unit-detail/UnitDetailPage'));
const FunctionListPage = lazy(() => import('./pages/function-list/FunctionListPage'));
const TargetListPage = lazy(() => import('./pages/target-list/TargetListPage'));
const TriggerListPage = lazy(() => import('./pages/trigger-list/TriggerListPage'));
const LinkListPage = lazy(() => import('./pages/link-list/LinkListPage'));
const FunctionBrowserPage = lazy(() => import('./pages/function-browser/FunctionBrowserPage'));
const ChangeReviewPage = lazy(() => import('./pages/change-review/ChangeReviewPage'));
const AppsComponentPage = lazy(() => import('./pages/x/apps/AppsComponentPage'));
const ChangeOrdersPage = lazy(() => import('./pages/change-orders/ChangeOrdersPage'));
const ChangeOrderDraftPage = lazy(() => import('./pages/change-orders/draft/ChangeOrderDraftPage'));
const ReleasesPage = lazy(() => import('./pages/releases/ReleasesPage'));
const TargetOverviewPage = lazy(() => import('./pages/target-overview/TargetOverviewPage'));
const DeliveryPage = lazy(() => import('./pages/delivery/DeliveryPage'));
const ServiceAccountsPage = lazy(() => import('./pages/service-accounts/ServiceAccountsPage'));
const ChannelsPage = lazy(() => import('./pages/channels/ChannelsPage'));
const ChangeOrdersOldRouteRedirect = lazy(() => import('./pages/change-orders/OldRouteRedirect'));
const ChangeSetsPage = lazy(() => import('./pages/change-sets/ChangeSetsPage'));
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
const WorkflowBuilderOldRouteRedirect = lazy(
  () => import('./pages/x/workflow-builder/OldRouteRedirect'),
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
    // Reached from a `cub auth browser-session` link, and when the instance has no
    // identity provider, so there is no login page to redirect to. Outside AuthenticatedContextProvider, because
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
    // Each page under Layout says what it puts in the trail, so the type requires a `handle`.
    children: [
      {
        index: true,
        handle: { crumb: crumbs.none },
        element: <Navigate to='/components' replace />,
      },
      {
        path: '/spaces',
        handle: { crumb: crumbs.spaces },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <SpacesListPage />
          </Suspense>
        ),
      },
      {
        path: '/units',
        handle: { crumb: crumbs.units },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <UnitListPage />
          </Suspense>
        ),
      },
      {
        path: '/spaces/:id?',
        handle: { crumb: crumbs.space },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <SpaceDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/units/:spaceID/:id',
        handle: { crumb: crumbs.unit },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <UnitDetailPage />
          </Suspense>
        ),
      },
      {
        path: '/functions/:name',
        handle: { crumb: crumbs.func },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <FunctionListPage />
          </Suspense>
        ),
      },
      {
        path: '/targets',
        handle: { crumb: crumbs.targets },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <TargetListPage />
          </Suspense>
        ),
      },
      {
        path: '/triggers',
        handle: { crumb: crumbs.triggers },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <TriggerListPage />
          </Suspense>
        ),
      },
      {
        path: '/links',
        handle: { crumb: crumbs.links },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <LinkListPage />
          </Suspense>
        ),
      },
      {
        path: '/function-browser',
        handle: { crumb: crumbs.functionBrowser },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <FunctionBrowserPage />
          </Suspense>
        ),
      },
      {
        path: '/components',
        handle: { crumb: crumbs.components },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <AppsComponentPage />
          </Suspense>
        ),
      },
      {
        // A static segment, so it ranks above the optional ones below: the draft of a new ChangeOrder.
        path: '/change-orders/new',
        handle: { crumb: crumbs.changeOrderDraft },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeOrderDraftPage />
          </Suspense>
        ),
      },
      {
        path: '/change-orders/:space?/:slug?/:stage?',
        handle: { crumb: crumbs.changeOrder },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeOrdersPage />
          </Suspense>
        ),
      },
      {
        // A sibling of /change-orders rather than nested in it: its optional :space would take the segment.
        path: '/change-sets/:space?/:slug?',
        handle: { crumb: crumbs.changeSet },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeSetsPage />
          </Suspense>
        ),
      },
      {
        // The page's earlier address. Links to it are still in bookmarks and history.
        path: '/rollouts/:slug?/:stage?',
        handle: { crumb: crumbs.none },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeOrdersOldRouteRedirect />
          </Suspense>
        ),
      },
      {
        // Not under /targets, the Target list, so the top bar marks only one of them as the current page.
        path: '/target-overview',
        handle: { crumb: crumbs.targetOverview },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <TargetOverviewPage />
          </Suspense>
        ),
      },
      {
        path: '/gitops',
        handle: { crumb: crumbs.gitops },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <DeliveryPage />
          </Suspense>
        ),
      },
      {
        // The page's earlier address.
        path: '/delivery',
        handle: { crumb: crumbs.none },
        element: <DeliveryOldRouteRedirect />,
      },
      {
        path: '/service-accounts/:slug?',
        handle: { crumb: crumbs.serviceAccount },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ServiceAccountsPage />
          </Suspense>
        ),
      },
      {
        // A Channel belongs to a Space, so its address names both.
        path: '/channels/:space?/:slug?',
        handle: { crumb: crumbs.channel },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChannelsPage />
          </Suspense>
        ),
      },
      {
        path: '/releases',
        handle: { crumb: crumbs.releases },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ReleasesPage />
          </Suspense>
        ),
      },
      {
        path: '/diff',
        handle: { crumb: crumbs.diff },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ChangeReviewPage />
          </Suspense>
        ),
      },
      {
        path: '/x/view-explorer',
        handle: { crumb: crumbs.viewExplorer },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ViewExplorerPage />
          </Suspense>
        ),
      },
      {
        path: '/x/resource-explorer',
        handle: { crumb: crumbs.resourceExplorer },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <ResourceExplorerPage />
          </Suspense>
        ),
      },
      {
        path: '/validation',
        handle: { crumb: crumbs.validation },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        path: '/validation/:triggerId',
        handle: { crumb: crumbs.validation },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <InitiativesPage />
          </Suspense>
        ),
      },
      {
        // The page's former place, when it tracked initiatives stored in Views.
        path: '/x/initiatives/*',
        handle: { crumb: crumbs.none },
        element: <Navigate to='/validation' replace />,
      },
      {
        // Authoring a ChangeWorkflow. The bare path lists them; the id names one.
        // An id belongs in the path because it says which workflow the page is
        // about, where a query string would say how to look at some other subject.
        path: '/change-workflows',
        handle: { crumb: crumbs.changeWorkflows },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <WorkflowBuilderPage />
          </Suspense>
        ),
      },
      {
        path: '/change-workflows/:changeWorkflowId',
        handle: { crumb: crumbs.changeWorkflow },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <WorkflowBuilderPage />
          </Suspense>
        ),
      },
      {
        // The page's earlier address. Links to it are still in bookmarks and history.
        path: '/x/workflow-builder/:changeWorkflowId?',
        handle: { crumb: crumbs.none },
        element: (
          <Suspense fallback={<Loader isLoading={true} />}>
            <WorkflowBuilderOldRouteRedirect />
          </Suspense>
        ),
      },
      {
        path: '*',
        handle: { crumb: crumbs.none },
        element: <Navigate to='/' />,
      },
    ] satisfies Array<RouteObject & { handle: CrumbHandle }>,
  },
];

export const Routes = () => {
  return routes;
};
