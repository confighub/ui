// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SIDEBAR_WIDTH = 400;
const DEFAULT_SIDEBAR_WIDTH = 500;
const MAX_SIDEBAR_WIDTH_RATIO = 0.45;
const MAX_SIDEBAR_WIDTH_RATIO_WITH_LEFT_NAV_CLOSED = 0.55; // Max width ratio for screens when left nave is closed
const SIDEBAR_WIDTH_STORAGE_KEY = 'layout-sidebar-width';
const SIDEBAR_OPEN_STORAGE_KEY = 'layout-sidebar-open';

export const useResizableSidebar = () => {
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_SIDEBAR_WIDTH;
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
    return stored ? stored === 'true' : false;
  });

  const [isNavOpen, setIsNavOpen] = useState(true);
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const maxWidth =
    window.innerWidth *
    (isNavOpen ? MAX_SIDEBAR_WIDTH_RATIO : MAX_SIDEBAR_WIDTH_RATIO_WITH_LEFT_NAV_CLOSED);

  const prevIsNavOpenRef = useRef(isNavOpen);

  // When left nav open state changes, readjust sidebar if it was at max width
  useEffect(() => {
    if (prevIsNavOpenRef.current === isNavOpen) return;

    const prevMaxWidth =
      window.innerWidth *
      (prevIsNavOpenRef.current
        ? MAX_SIDEBAR_WIDTH_RATIO
        : MAX_SIDEBAR_WIDTH_RATIO_WITH_LEFT_NAV_CLOSED);

    prevIsNavOpenRef.current = isNavOpen;

    // If sidebar was at or near the previous max, snap to the new max
    if (isSidebarOpen && sidebarWidth >= prevMaxWidth - 10) {
      setSidebarWidth(maxWidth);
    }
  }, [isNavOpen, isSidebarOpen, sidebarWidth, maxWidth]);

  // Persist sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Persist sidebar open state to localStorage
  useEffect(() => {
    localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, isSidebarOpen.toString());
  }, [isSidebarOpen]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  // Memoized resize handler to prevent unnecessary re-renders
  const handleResize = useCallback(
    (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, maxWidth));
      setSidebarWidth(clampedWidth);
    },
    [maxWidth],
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Set up and clean up resize event listeners
  useEffect(() => {
    if (isResizing) {
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', handleResizeEnd);

      return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, handleResize, handleResizeEnd]);

  const handleResizeStart = useCallback(() => {
    setIsResizing(true);
  }, []);

  const expandSidebar = useCallback(() => {
    setSidebarWidth(maxWidth);
    setIsSidebarOpen(true);
  }, [maxWidth]);

  const toggleMaximize = useCallback(() => {
    setIsMaximized((prev) => !prev);
    if (!isSidebarOpen) setIsSidebarOpen(true);
  }, [isSidebarOpen]);

  return {
    sidebarWidth,
    isSidebarOpen,
    isNavOpen,
    isMaximized,
    isFeedbackDialogOpen,
    isResizing,
    setIsNavOpen,
    setIsFeedbackDialogOpen,
    setIsSidebarOpen,
    toggleSidebar,
    handleResizeStart,
    expandSidebar,
    toggleMaximize,
  };
};