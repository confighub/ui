// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { createContext, useContext, useEffect, useMemo } from 'react';

import { RequireSession } from '@/auth/RequireSession';
import { redirectToLogin } from '@/auth/session';
import { useOrgQueryParam } from '@/hooks/useOrgQueryParam';
import { telemetryEnabled } from '@/utility/telemetry';
import { OrganizationMember, useGetMeQuery } from '@confighub/rtk-query';

import posthog from 'posthog-js';

interface AuthenticatedContextType {
  userInfo: OrganizationMember;
  /**
   * True while `GET /api/me` is still in flight. Consumers that render
   * user/org-specific chrome (e.g. avatar, org switcher) should show a
   * lightweight placeholder while this is true; static nav chrome does not
   * need to wait on it.
   */
  isLoading: boolean;
}

const EMPTY_USER_INFO = {} as OrganizationMember;

const AuthenticatedContext = createContext<AuthenticatedContextType>({
  userInfo: EMPTY_USER_INFO,
  isLoading: true,
});

export const useUserInfo = () => useContext(AuthenticatedContext);

interface AuthenticatedContextProviderProps {
  children: React.ReactNode;
}

/**
 * Fetches the current user and exposes it via `useUserInfo()`.
 *
 * This deliberately does NOT block rendering of `children` while
 * `GET /api/me` is in flight. `children` here is the app `Layout` (and the
 * routed `Outlet` it renders), so mounting it immediately lets route-level
 * `React.lazy()` chunks start downloading in parallel with the auth
 * request, instead of waiting for it to resolve first. `userInfo` is always
 * a defined (possibly empty) object, and `isLoading` lets consumers that
 * need real identity (e.g. the user avatar/org switcher) render their own
 * small placeholder for just that piece.
 *
 * Redirect-on-auth-failure note: 401/403 responses are redirected globally
 * by the RTK Query base query in `confighubapi.ts` as soon as the response
 * comes back, independent of this component ever rendering. The effect
 * below is only a fallback for the (should-not-happen) case where the
 * request resolves with neither an error nor a user.
 */
export const AuthenticatedContextProvider = ({
  children,
}: AuthenticatedContextProviderProps) => (
  <RequireSession>
    <UserInfoProvider>{children}</UserInfoProvider>
  </RequireSession>
);

const UserInfoProvider = ({ children }: AuthenticatedContextProviderProps) => {
  const { data: userInfo, isLoading, error } = useGetMeQuery();

  // Check for org query parameter and trigger switch if needed for shareable URLs
  // This hook handles the case when userInfo is not yet available
  useOrgQueryParam({ currentOrgExternalId: userInfo?.ExternalOrganizationID });

  useEffect(() => {
    // Identify the user in posthog for analytics. Only when telemetry is on: the
    // bare instance would otherwise still write its persistence cookie.
    if (telemetryEnabled() && userInfo?.UserID) {
      posthog.identify(userInfo.UserID);
    }
  }, [userInfo?.UserID]);

  useEffect(() => {
    // 401/403 are already redirected by the RTK Query base query itself.
    // Fallback: if the request finished with no error and still no user,
    // redirect to login.
    if (!isLoading && !error && !userInfo) {
      console.log('No user info, redirecting to login from AuthenticatedContext');
      redirectToLogin();
    }
    // The no-identity-provider case is not handled here: reaching this branch
    // means the request succeeded, so the 401 path in the base query -- which
    // does dispatch on that -- was never taken.
  }, [isLoading, error, userInfo]);

  const contextValue = useMemo<AuthenticatedContextType>(
    () => ({ userInfo: userInfo ?? EMPTY_USER_INFO, isLoading }),
    [userInfo, isLoading],
  );

  return (
    <AuthenticatedContext.Provider value={contextValue}>
      {children}
    </AuthenticatedContext.Provider>
  );
};
