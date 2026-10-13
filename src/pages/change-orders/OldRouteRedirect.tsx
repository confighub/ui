// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Navigate, useLocation, useParams } from 'react-router-dom';

import { changeOrdersPathFromOldRoute } from './oldRoute';

/**
 * Sends an old `/rollouts/...` link to the same ChangeOrder and stage under
 * `/change-orders/...`, keeping its query string and hash. It replaces the
 * history entry, so Back does not return to an address that only redirects.
 */
export default function OldRouteRedirect() {
  const { slug, stage } = useParams<{ slug?: string; stage?: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: changeOrdersPathFromOldRoute(slug, stage), search, hash }} replace />;
}
