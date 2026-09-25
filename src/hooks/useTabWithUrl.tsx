// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

interface UseTabWithUrlOptions {
  defaultTab?: number;
  paramName?: string;
}

interface UseTabWithUrlReturn {
  selectedTab: number;
  setSelectedTab: (tab: number) => void;
  onTabSelected: (tab: number) => void;
}

export const useTabWithUrl = ({
  defaultTab = 0,
  paramName = 'tab',
}: UseTabWithUrlOptions = {}): UseTabWithUrlReturn => {
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize tab from URL or use default
  const getInitialTab = (): number => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get(paramName);
    return tabParam ? parseInt(tabParam, 10) : defaultTab;
  };

  const [selectedTab, setSelectedTab] = useState<number>(getInitialTab);

  // Sync with URL changes (for browser back/forward)
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get(paramName);
    const urlTab = tabParam ? parseInt(tabParam, 10) : defaultTab;

    if (urlTab !== selectedTab) {
      setSelectedTab(urlTab);
    }
  }, [location.search, paramName, defaultTab, selectedTab]);

  const onTabSelected = (newValue: number) => {
    setSelectedTab(newValue);

    // Update the query string with the new tab value
    const searchParams = new URLSearchParams(location.search);
    searchParams.set(paramName, newValue.toString());

    navigate(`${location.pathname}?${searchParams.toString()}`);
  };

  return {
    selectedTab,
    setSelectedTab,
    onTabSelected,
  };
};
