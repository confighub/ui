// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { CrumbKind, PageCrumb } from './trail';

/**
 * What a route puts in the trail, worked out from its address alone. Each route
 * under `Layout` has one in its `handle` (see `App.tsx`), so no page is missing
 * from the trail. `null` is for an address that only redirects.
 *
 * The key decides what counts as one page. A query parameter that selects a
 * tab, a filter or a stage is left out of the key, so those changes update the
 * crumb's address in place. A parameter that selects what the page is about is
 * in the key.
 *
 * Where the address holds an id, the label is the type's name, and the page
 * gives the real name with `useCrumbName`.
 */
export type CrumbSpec = (params: Readonly<Record<string, string | undefined>>, search: URLSearchParams) => PageCrumb | null;

export interface CrumbHandle {
  crumb: CrumbSpec;
}

const fixed =
  (key: string, kind: CrumbKind, label: string): CrumbSpec =>
  () => ({ key, kind, label });

export const crumbs = {
  components: (_params, search) => {
    const app = search.get('app');
    return app ? { key: `/components?app=${app}`, kind: 'component', label: app } : { key: '/components', kind: 'component', label: 'Components' };
  },
  spaces: fixed('/spaces', 'space', 'Spaces'),
  space: ({ id }) => (id ? { key: `/spaces/${id}`, kind: 'space', label: 'Space' } : { key: '/spaces', kind: 'space', label: 'Spaces' }),
  units: fixed('/units', 'unit', 'Units'),
  unit: ({ spaceID, id }) => ({ key: `/units/${spaceID}/${id}`, kind: 'unit', label: 'Unit' }),
  func: ({ name }) => ({ key: `/functions/${name}`, kind: 'function', label: name ?? 'Function' }),
  functionBrowser: fixed('/function-browser', 'function', 'Functions'),
  targets: fixed('/targets', 'target', 'Target list'),
  targetOverview: fixed('/target-overview', 'target', 'Targets'),
  // The selected Space is left out: the page is one page, and its crumb returns to the Space last selected.
  gitops: fixed('/gitops', 'gitops', 'GitOps'),
  triggers: fixed('/triggers', 'trigger', 'Triggers'),
  links: fixed('/links', 'link', 'Links'),
  releases: fixed('/releases', 'release', 'Releases'),
  // One page with or without a Trigger open in it.
  validation: fixed('/validation', 'validation', 'Validation'),
  diff: fixed('/diff', 'diff', 'Changes'),
  viewExplorer: fixed('/x/view-explorer', 'view', 'Views'),
  resourceExplorer: fixed('/x/resource-explorer', 'resource', 'Resources'),
  changeOrderDraft: fixed('/change-orders/new', 'changeOrder', 'New ChangeOrder'),
  // The stage is left out: a ChangeOrder is one page, and its crumb returns to the stage last open.
  // An address with one segment names the ChangeOrder by slug alone; the page replaces it with the full one.
  changeOrder: ({ space, slug }) => {
    if (!space) return { key: '/change-orders', kind: 'changeOrder', label: 'ChangeOrders' };
    if (!slug) return { key: `/change-orders/${space}`, kind: 'changeOrder', label: space };
    return { key: `/change-orders/${space}/${slug}`, kind: 'changeOrder', label: slug };
  },
  changeSet: ({ space, slug }) =>
    space && slug
      ? { key: `/change-sets/${space}/${slug}`, kind: 'changeSet', label: slug }
      : { key: '/change-sets', kind: 'changeSet', label: 'ChangeSets' },
  changeWorkflows: fixed('/change-workflows', 'changeWorkflow', 'ChangeWorkflows'),
  changeWorkflow: ({ changeWorkflowId }) => ({ key: `/change-workflows/${changeWorkflowId}`, kind: 'changeWorkflow', label: 'ChangeWorkflow' }),
  serviceAccount: ({ slug }) =>
    slug
      ? { key: `/service-accounts/${slug}`, kind: 'serviceAccount', label: slug }
      : { key: '/service-accounts', kind: 'serviceAccount', label: 'Service accounts' },
  // The filters are left out of the key: they change the crumb's address, not the page.
  auditLog: fixed('/audit-log', 'auditLog', 'Audit log'),
  channel: ({ space, slug }) =>
    space && slug ? { key: `/channels/${space}/${slug}`, kind: 'channel', label: slug } : { key: '/channels', kind: 'channel', label: 'Channels' },
  /** An address that only redirects to another. */
  none: () => null,
} satisfies Record<string, CrumbSpec>;
