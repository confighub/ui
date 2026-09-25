// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface RevisionViewerUrlState {
  isOpen: boolean;
  revisionNumber: number | null;
  viewMode: 'single' | 'diff' | 'compare' | null;
  diffTarget: 'previous' | 'next' | null;
  compareRevision1: number | null;
  compareRevision2: number | null;
}

export interface UseRevisionViewerUrlReturn {
  state: RevisionViewerUrlState;
  openRevision: (revisionNumber: number) => void;
  openDiff: (revisionNumber: number, target: 'previous' | 'next') => void;
  openCompare: (revision1: number, revision2: number) => void;
  closeDrawer: () => void;
  switchToRevision: (revisionNumber: number) => void;
  setViewMode: (viewMode: 'single' | 'diff' | 'compare') => void;
  setDiffTarget: (target: 'previous' | 'next' | null) => void;
  getCurrentUrl: () => string;
}

export const useRevisionViewerUrl = (): UseRevisionViewerUrlReturn => {
  const location = useLocation();
  const navigate = useNavigate();

  // Parse URL state from search params
  const getUrlState = (): RevisionViewerUrlState => {
    const searchParams = new URLSearchParams(location.search);
    const isOpen = searchParams.get('revisionViewer') === 'true';
    const revisionNumber = searchParams.get('revision') ? parseInt(searchParams.get('revision')!, 10) : null;
    const viewMode = searchParams.get('viewMode') as 'single' | 'diff' | 'compare' | null;
    const diffTarget = searchParams.get('diffTarget') as 'previous' | 'next' | null;
    const compareRevision1 = searchParams.get('compareRev1') ? parseInt(searchParams.get('compareRev1')!, 10) : null;
    const compareRevision2 = searchParams.get('compareRev2') ? parseInt(searchParams.get('compareRev2')!, 10) : null;

    return {
      isOpen,
      revisionNumber,
      viewMode: viewMode || (isOpen ? 'single' : null),
      diffTarget,
      compareRevision1,
      compareRevision2,
    };
  };

  const [state, setState] = useState<RevisionViewerUrlState>(getUrlState);

  // Sync with URL changes (for browser back/forward)
  useEffect(() => {
    const urlState = getUrlState();
    setState(urlState);
  }, [location.search]);

  // Update URL with new state
  const updateUrl = (newState: Partial<RevisionViewerUrlState>) => {
    const searchParams = new URLSearchParams(location.search);

    if (newState.isOpen) {
      searchParams.set('revisionViewer', 'true');
      if (newState.revisionNumber !== null && newState.revisionNumber !== undefined) {
        searchParams.set('revision', newState.revisionNumber.toString());
      }
      if (newState.viewMode) {
        searchParams.set('viewMode', newState.viewMode);
      }
      if (newState.diffTarget) {
        searchParams.set('diffTarget', newState.diffTarget);
      } else {
        searchParams.delete('diffTarget');
      }
      if (newState.compareRevision1 !== null && newState.compareRevision1 !== undefined) {
        searchParams.set('compareRev1', newState.compareRevision1.toString());
      } else {
        searchParams.delete('compareRev1');
      }
      if (newState.compareRevision2 !== null && newState.compareRevision2 !== undefined) {
        searchParams.set('compareRev2', newState.compareRevision2.toString());
      } else {
        searchParams.delete('compareRev2');
      }
    } else {
      searchParams.delete('revisionViewer');
      searchParams.delete('revision');
      searchParams.delete('viewMode');
      searchParams.delete('diffTarget');
      searchParams.delete('compareRev1');
      searchParams.delete('compareRev2');
    }

    navigate(`${location.pathname}?${searchParams.toString()}`, { replace: true });
  };

  const openRevision = (revisionNumber: number) => {
    const newState = {
      isOpen: true,
      revisionNumber,
      viewMode: 'single' as const,
      diffTarget: null,
      compareRevision1: null,
      compareRevision2: null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const openDiff = (revisionNumber: number, target: 'previous' | 'next') => {
    const newState = {
      isOpen: true,
      revisionNumber,
      viewMode: 'diff' as const,
      diffTarget: target,
      compareRevision1: null,
      compareRevision2: null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const openCompare = (revision1: number, revision2: number) => {
    const newState = {
      isOpen: true,
      revisionNumber: null,
      viewMode: 'compare' as const,
      diffTarget: null,
      compareRevision1: revision1,
      compareRevision2: revision2,
    };
    setState(newState);
    updateUrl(newState);
  };

  const closeDrawer = () => {
    const newState = {
      isOpen: false,
      revisionNumber: null,
      viewMode: null,
      diffTarget: null,
      compareRevision1: null,
      compareRevision2: null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const switchToRevision = (revisionNumber: number) => {
    const newState = {
      ...state,
      isOpen: true,
      revisionNumber,
      viewMode: 'single' as const,
      diffTarget: null,
      compareRevision1: null,
      compareRevision2: null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const setViewMode = (viewMode: 'single' | 'diff' | 'compare') => {
    const newState = {
      ...state,
      viewMode,
      diffTarget: viewMode === 'single' || viewMode === 'compare' ? null : state.diffTarget,
      compareRevision1: viewMode === 'compare' ? state.compareRevision1 : null,
      compareRevision2: viewMode === 'compare' ? state.compareRevision2 : null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const setDiffTarget = (target: 'previous' | 'next' | null) => {
    const newState = {
      ...state,
      diffTarget: target,
      viewMode: target ? ('diff' as const) : ('single' as const),
      compareRevision1: null,
      compareRevision2: null,
    };
    setState(newState);
    updateUrl(newState);
  };

  const getCurrentUrl = () => {
    return `${window.location.origin}${location.pathname}${location.search}`;
  };

  return {
    state,
    openRevision,
    openDiff,
    openCompare,
    closeDrawer,
    switchToRevision,
    setViewMode,
    setDiffTarget,
    getCurrentUrl,
  };
};
