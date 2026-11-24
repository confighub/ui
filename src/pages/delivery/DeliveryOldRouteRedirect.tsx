// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { Navigate, useLocation } from 'react-router-dom';

/** /delivery, the GitOps page's earlier address: the same page, with the same selected Space and view. */
export default function DeliveryOldRouteRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/gitops${search}`} replace />;
}
