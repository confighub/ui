// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useApiInfoQuery } from '@confighub/rtk-query';
import { switchOrganization } from '@/auth/session';

export const ORG_QUERY_PARAM = 'org';

interface UseOrgQueryParamProps {
  currentOrgExternalId: string | undefined;
}

/**
 * Hook that checks for an 'org' query parameter in the URL.
 *
 * The parameter is the external (identity provider) id of the organization a
 * shared link was made in. If it differs from the current organization, the
 * hook starts a fresh login and returns to the same page without the parameter.
 * The identity provider prompts the user to pick an organization on the way,
 * so the link degrades to a prompt rather than switching silently: the UI has
 * no way to name the organization to the provider (it only has the id), and
 * the provider is the only party that knows every organization the user may
 * enter. Dropping the parameter from the return path is what stops the loop
 * if the user picks a different organization than the link was made in.
 *
 * Without an identity provider there is one organization and no login route,
 * so the parameter is ignored.
 *
 * @param currentOrgExternalId - The external ID of the user's current organization
 */
export const useOrgQueryParam = ({ currentOrgExternalId }: UseOrgQueryParamProps) => {
  const [searchParams] = useSearchParams();
  const { data: info } = useApiInfoQuery();
  const hasChecked = useRef(false);

  useEffect(() => {
    // Only run once per mount, and only when both the user and the server info
    // are known; returning before either is here does not count as the check.
    if (hasChecked.current || !currentOrgExternalId || !info) {
      return;
    }
    hasChecked.current = true;

    // No identity provider means no second organization to land in.
    if (!info.AuthIssuer) {
      return;
    }

    const requestedOrgId = searchParams.get(ORG_QUERY_PARAM);

    if (requestedOrgId && requestedOrgId !== currentOrgExternalId) {
      // Return to this page, preserving path and other query params, but without
      // the org param.
      const url = new URL(window.location.href);
      url.searchParams.delete(ORG_QUERY_PARAM);

      switchOrganization(url.pathname + url.search);
    }
  }, [currentOrgExternalId, info, searchParams]);
};

/**
 * Builds a shareable URL for the current page that includes the org parameter.
 * A recipient in another organization is taken through a fresh login, where the
 * identity provider asks which organization to enter, and then lands on this page.
 *
 * @param orgExternalId - The external ID of the organization to include in the URL
 * @returns The current URL with the org parameter appended
 */
export const buildShareableUrl = (orgExternalId: string): string => {
  const url = new URL(window.location.href);
  url.searchParams.set(ORG_QUERY_PARAM, orgExternalId);
  return url.toString();
};
