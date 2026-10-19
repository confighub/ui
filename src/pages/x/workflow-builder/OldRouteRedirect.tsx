// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { Navigate, useLocation, useParams } from 'react-router-dom';

/**
 * Sends an old `/x/workflow-builder/...` link to the same ChangeWorkflow under
 * `/change-workflows/...`, keeping its query string and hash. It replaces the
 * history entry, so Back does not return to an address that only redirects.
 */
export default function OldRouteRedirect() {
  const { changeWorkflowId } = useParams<{ changeWorkflowId?: string }>();
  const { search, hash } = useLocation();
  const pathname = changeWorkflowId
    ? `/change-workflows/${encodeURIComponent(changeWorkflowId)}`
    : '/change-workflows';
  return <Navigate to={{ pathname, search, hash }} replace />;
}
