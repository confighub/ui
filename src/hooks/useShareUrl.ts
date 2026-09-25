// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo } from 'react';

import {ExtendedUnitRead } from '@confighub/rtk-query';

/**
 * Custom hook to generate a shareable URL for diff preview
 *
 * @param unitDiffs - Array of unit diff data
 * @param userId - Current user ID
 * @returns Object containing the share URL and a function to copy it to clipboard
 */
export const useShareUrl = (units: ExtendedUnitRead[], userId?: string) => {
  const shareUrl = useMemo(() => {
    const params = new URLSearchParams();
    const unitIds = units.map((unit) => unit.Unit?.UnitID).filter(Boolean);

    params.set('ids', unitIds.join(','));
    if (userId) {
      params.set('source', userId);
    }

    return `/diff?${params.toString()}`;
  }, [units, userId]);

  const fullShareUrl = useMemo(() => {
    return `${window.location.origin}${shareUrl}`;
  }, [shareUrl]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(fullShareUrl);
  };

  return {
    /** Relative URL path for the diff preview */
    shareUrl,
    /** Full URL including origin for sharing */
    fullShareUrl,
    /** Function to copy the full URL to clipboard */
    copyToClipboard,
  };
};
