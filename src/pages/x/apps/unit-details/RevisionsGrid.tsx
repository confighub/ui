// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { componentTheme } from '../componentTheme';

export interface RevisionsGridProps {
  spaceId: string;
  unitId: string;
  headRevisionNum?: number;
  lastReleasedRevisionNum?: number;
  /** How many revisions this unit is behind its upstream head (0 = up to date). */
  behindHead?: number;
}

/** Builds the unit-detail revision-viewer URL for a specific revision number. */
const buildRevisionViewerHref = (spaceId: string, unitId: string, revisionNum: number) =>
  `/units/${spaceId}/${unitId}?revisionViewer=true&revision=${revisionNum}&viewMode=single&tab=2`;

interface CellProps {
  label: string;
  value: number;
  spaceId: string;
  unitId: string;
  ahead?: boolean;
  subLabel?: string;
}

const RevisionCell = ({ label, value, spaceId, unitId, ahead, subLabel }: CellProps) => (
  <Box
    component={value ? 'a' : 'div'}
    {...(value
      ? {
          href: buildRevisionViewerHref(spaceId, unitId, value),
          target: '_blank',
          rel: 'noopener noreferrer',
        }
      : {})}
    sx={{
      display: 'flex',
      flexDirection: 'column',
      gap: '2px',
      flex: 1,
      minWidth: 0,
      padding: '5px 10px',
      border: `1px solid ${componentTheme.borderMuted}`,
      borderRadius: `${componentTheme.radiusMd}px`,
      background: componentTheme.bgDefault,
      textDecoration: 'none',
      // Flat chip look, matching the Upstream/Downstream relationship chips
      // (no drop shadow, no lift — hover is a border-color/background change only).
      ...(value
        ? {
            cursor: 'pointer',
            transition: 'border-color 0.12s, background 0.12s',
            '&:hover': {
              borderColor: componentTheme.accent,
              background: componentTheme.accentMuted,
            },
          }
        : {
            // Inert / non-clickable card (revision 0 or absent = "never applied").
            opacity: 0.6,
          }),
    }}
  >
    <Typography
      sx={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: componentTheme.fgSubtle,
        fontFamily: componentTheme.fontSans,
      }}
    >
      {label}
    </Typography>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
      <Typography
        component='span'
        sx={{
          fontFamily: componentTheme.fontMono,
          fontSize: 13,
          fontWeight: 700,
          color: ahead ? componentTheme.upgrade : componentTheme.fgDefault,
        }}
      >
        {`r${value}`}
      </Typography>
      {subLabel && (
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 600,
            color: componentTheme.upgrade,
            fontFamily: componentTheme.fontSans,
            whiteSpace: 'nowrap',
          }}
        >
          {subLabel}
        </Typography>
      )}
    </Box>
  </Box>
);

/**
 * Two-column revision summary: Head / Last Released. The Head cell is
 * color-coded with the `upgrade` token and carries an "N behind head" sub-label
 * when the unit's upstream has advanced beyond its merged revision.
 */
export const RevisionsGrid = ({
  spaceId,
  unitId,
  headRevisionNum = 0,
  lastReleasedRevisionNum = 0,
  behindHead = 0,
}: RevisionsGridProps) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'stretch',
      gap: '8px',
      padding: '10px 16px',
      background: componentTheme.bgSubtle,
      borderTop: `1px solid ${componentTheme.borderSubtle}`,
      borderBottom: `1px solid ${componentTheme.borderSubtle}`,
    }}
  >
    <RevisionCell
      label='Head'
      value={headRevisionNum}
      spaceId={spaceId}
      unitId={unitId}
      ahead={behindHead > 0}
      subLabel={behindHead > 0 ? `${behindHead} behind head` : undefined}
    />
    <RevisionCell
      label='Last Released'
      value={lastReleasedRevisionNum}
      spaceId={spaceId}
      unitId={unitId}
    />
  </Box>
);
