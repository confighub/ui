// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode, forwardRef } from 'react';
import { Link } from 'react-router-dom';

export interface NavLinkProps {
  to: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  state?: unknown;
  target?: string;
  rel?: string;
}

/**
 * A proper navigation link component that supports:
 * - Regular clicks for navigation
 * - Cmd/Ctrl+click to open in new tab
 * - Right-click context menu for "Open in new tab"
 * - Proper browser history management
 * - Preserves original text colors and styling
 * - Prevents event propagation when used in data grids
 */
export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps & React.HTMLAttributes<HTMLAnchorElement>>(
  ({ to, children, className, style, state, onClick, ...rest }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Stop propagation to prevent data grid row selection when clicking links
      e.stopPropagation();
      onClick?.(e);
    };

    return (
      <Link
        ref={ref}
        to={to}
        className={className}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          ...style,
        }}
        state={state}
        onClick={handleClick}
        {...rest}
      >
        {children}
      </Link>
    );
  },
);

NavLink.displayName = 'NavLink';
