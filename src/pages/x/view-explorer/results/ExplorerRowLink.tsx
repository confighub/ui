// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { NavLink } from '@/components/nav-link/NavLink';

import { getAdapter } from '../adapters';
import type { GroupNavRow } from '../cell-value';
import type { EntityRow } from '../model/fields';
import type { EntityKind } from '../model/types';
import { withExplorerReturn } from './explorer-link';

interface ExplorerRowLinkProps {
  entity: EntityKind;
  row: EntityRow;
  /** A plain click: open the row in the details panel. */
  onOpen: () => void;
  /**
   * In a table whose rows can be picked: a ⇧-click picks a range of rows, as it
   * does on the rest of the row, instead of opening the page in a new window.
   * ⌘/Ctrl-click, middle-click and the context menu still open the page.
   */
  onRangePick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Space opens the row too, for a link that stands in for a button. */
  openOnSpace?: boolean;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  children: ReactNode;
}

/**
 * A row's name as a link to the row's own page. A plain click opens the details
 * panel in place; the browser handles every other click, so cmd-click,
 * ctrl-click and middle-click open the page in a new tab. Where `onRangePick` is
 * given, it takes the ⇧-click. Without a page for the row, the children are drawn
 * as they are.
 */
export function ExplorerRowLink({ entity, row, onOpen, onRangePick, openOnSpace, className, style, children, ...rest }: ExplorerRowLinkProps) {
  const { search } = useLocation();
  const href = getAdapter(entity).getRowHref(row as GroupNavRow);
  if (!href) return <>{children}</>;
  return (
    <NavLink
      // The page it opens offers a way back to this tab.
      to={withExplorerReturn(href, search)}
      className={className}
      style={style}
      data-testid={rest['data-testid']}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (onRangePick && e.button === 0 && e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          onRangePick(e);
          return;
        }
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        // The row, not its link, is what the arrow keys move between, so it is
        // where focus goes back to when the panel closes.
        e.currentTarget.closest<HTMLElement>('[role="row"]')?.focus();
        onOpen();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLAnchorElement>) => {
        if (openOnSpace && e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </NavLink>
  );
}
