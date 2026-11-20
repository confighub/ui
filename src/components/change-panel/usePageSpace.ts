// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The Space and Unit the current page shows, from its address: `/units/:space/:unit`,
 * `/spaces/:space`, or the Component view's open Variant (`/components?space=<SpaceID>`).
 */
import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function usePageSpace(): { spaceId?: string; unitId?: string } {
  const { pathname, search } = useLocation();
  return useMemo(() => {
    const unit = /^\/units\/([^/]+)\/([^/]+)/.exec(pathname);
    if (unit) return { spaceId: unit[1], unitId: unit[2] };
    const space = /^\/spaces\/([^/]+)/.exec(pathname);
    if (space) return { spaceId: space[1] };
    if (pathname === '/components') {
      const variant = new URLSearchParams(search).get('space');
      if (variant && UUID.test(variant)) return { spaceId: variant };
    }
    return {};
  }, [pathname, search]);
}
