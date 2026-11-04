// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { unitConfigHref } from '@/pages/unit-detail/unitDetailHrefs';
import { Link } from '@mui/material';

import { componentTheme } from '../componentTheme';

export interface UnitLinkProps {
  spaceId?: string;
  unitId?: string;
  children: ReactNode;
  testId?: string;
}

/**
 * A Unit named in the Gates tab, as a link to the Unit's configuration page. Many findings can only
 * be fixed there. It opens a new tab, because the side pane holds the user's staged fixes
 * (docs/dev/links.md, rule 3). Without the Unit's IDs the name stays plain text.
 */
export const UnitLink = ({ spaceId, unitId, children, testId }: UnitLinkProps) =>
  spaceId && unitId ? (
    <Link
      component={RouterLink}
      to={unitConfigHref(spaceId, unitId)}
      target='_blank'
      rel='noopener noreferrer'
      data-testid={testId}
      onClick={(e) => e.stopPropagation()}
      sx={{
        color: 'inherit',
        font: 'inherit',
        textDecoration: 'underline',
        textDecorationColor: componentTheme.borderEdge,
        textUnderlineOffset: 2,
        '&:hover': {
          color: componentTheme.accent,
          textDecorationColor: componentTheme.accent,
        },
        '&:focus-visible': {
          outline: `2px solid ${componentTheme.accent}`,
          outlineOffset: 1,
          borderRadius: '2px',
        },
      }}
    >
      {children}
    </Link>
  ) : (
    <>{children}</>
  );
