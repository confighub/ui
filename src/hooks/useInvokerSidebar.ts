// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useRef, useState } from 'react';

const INVOKER_MIN_WIDTH = 350;
const INVOKER_DEFAULT_WIDTH_RATIO = 0.33;
const INVOKER_WIDTH_STORAGE_KEY = 'rightSidebarWidth';
const INVOKER_OPEN_STORAGE_KEY = 'invokerSidebarOpen';
const INVOKER_BUTTON_BAR_WIDTH = 48;
const INVOKER_MAX_WIDTH_MARGIN = 100;
const PANEL_STORAGE_KEY = 'rightSidebarPanel';

/** Which content the one sidebar panel shows: the function invoker or the active change. */
export type SidebarPanelKind = 'functions' | 'change';

export const useInvokerSidebar = (leftNavWidth: number) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    const stored = localStorage.getItem(INVOKER_OPEN_STORAGE_KEY);
    return stored === 'true';
  });

  const [panel, setPanel] = useState<SidebarPanelKind>(() => {
    try {
      return localStorage.getItem(PANEL_STORAGE_KEY) === 'change' ? 'change' : 'functions';
    } catch {
      return 'functions';
    }
  });

  const [panelWidth, setPanelWidth] = useState<number>(() => {
    const stored = localStorage.getItem(INVOKER_WIDTH_STORAGE_KEY);
    if (stored) {
      const width = parseInt(stored, 10);
      if (!isNaN(width) && width >= INVOKER_MIN_WIDTH) {
        return width;
      }
    }
    return Math.max(
      INVOKER_MIN_WIDTH,
      (window.innerWidth - leftNavWidth) * INVOKER_DEFAULT_WIDTH_RATIO,
    );
  });

  const [isResizing, setIsResizing] = useState(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  useEffect(() => {
    localStorage.setItem(INVOKER_OPEN_STORAGE_KEY, isOpen.toString());
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(PANEL_STORAGE_KEY, panel);
    } catch {
      // Storage blocked: the panel opens on Functions next time.
    }
  }, [panel]);

  // Functions' own toggle and open (its button, the F key, a page's request) show Functions.
  const toggle = useCallback(() => {
    setIsOpen((prev) => (panel === 'functions' ? !prev : true));
    setPanel('functions');
  }, [panel]);

  const open = useCallback(() => {
    setIsOpen(true);
    setPanel('functions');
  }, []);

  /** Opens the panel on `kind`, or closes it when it already shows `kind`. */
  const togglePanel = useCallback(
    (kind: SidebarPanelKind) => {
      setIsOpen((prev) => !(prev && panel === kind));
      setPanel(kind);
    },
    [panel],
  );

  const openPanel = useCallback((kind: SidebarPanelKind) => {
    setIsOpen(true);
    setPanel(kind);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = panelWidth;
    },
    [panelWidth],
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = resizeStartX.current - e.clientX;
      const newWidth = Math.max(INVOKER_MIN_WIDTH, resizeStartWidth.current + delta);
      const maxWidth =
        window.innerWidth - leftNavWidth - INVOKER_BUTTON_BAR_WIDTH - INVOKER_MAX_WIDTH_MARGIN;
      setPanelWidth(Math.min(newWidth, maxWidth));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, leftNavWidth]);

  useEffect(() => {
    if (isResizing) return;
    localStorage.setItem(INVOKER_WIDTH_STORAGE_KEY, panelWidth.toString());
  }, [panelWidth, isResizing]);

  return {
    isOpen,
    panel,
    panelWidth,
    isResizing,
    buttonBarWidth: INVOKER_BUTTON_BAR_WIDTH,
    toggle,
    open,
    close,
    togglePanel,
    openPanel,
    handleResizeStart,
  } as const;
};
