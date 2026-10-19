// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { HoverCard, HoverCardBadge, HoverCardHeader, HoverCardTitle } from '@/components/hover-card/HoverCard';
import { formatRelative } from '@/utility/date-format';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { LIVE_TONE_COLOR } from '../x/apps/componentTheme';
import { LIVE_TONE_LEGEND, liveStatusText, type VitalTone } from '../x/apps/liveStatus';
import type { MatrixCell, MatrixDeployment, MatrixRow, TargetColumn, TargetMatrix } from './targetMatrix';

// ============================================================================
// CONSTANTS
// ============================================================================

const COMPONENT_COL_WIDTH = 200;
const CELL_MIN_WIDTH = 132;
const MONO_FONT = '"JetBrains Mono", ui-monospace, monospace';

/** The tone legend's words, for a cell's badge. */
const TONE_LABEL = Object.fromEntries(LIVE_TONE_LEGEND.map(({ tone, label }) => [tone, label])) as Record<VitalTone, string>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Where the Component view opens a Space's pane. */
const variantHref = (componentName: string, spaceId: string) =>
  `/components?app=${encodeURIComponent(componentName)}&space=${encodeURIComponent(spaceId)}`;

// ============================================================================
// CELL DETAILS
// ============================================================================

interface CellDetailsProps {
  row: MatrixRow;
  column: TargetColumn;
  cell: MatrixCell;
  /** Pinned details carry links; the hover preview leaves them out, since the pointer cannot reach them. */
  withLinks: boolean;
  onReleaseOpen: (deployment: MatrixDeployment) => void;
}

/** The theme's caption variant is uppercase; links and names keep their case. */
const LINK_SX = { fontSize: '0.6875rem', textTransform: 'none' } as const;

const DeploymentLinks = ({
  componentName,
  deployment,
  onReleaseOpen,
}: {
  componentName: string;
  deployment: MatrixDeployment;
  onReleaseOpen: (deployment: MatrixDeployment) => void;
}) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, mt: 0.5 }}>
    {deployment.release?.releaseId && (
      <Link component='button' sx={LINK_SX} onClick={() => onReleaseOpen(deployment)} data-testid='target-cell-release-link'>
        Release details
      </Link>
    )}
    <Link component={RouterLink} sx={LINK_SX} to={variantHref(componentName, deployment.spaceId)}>
      Open variant
    </Link>
    <Link component={RouterLink} sx={LINK_SX} to={`/releases?component=${encodeURIComponent(componentName)}`}>
      Releases
    </Link>
    <Link component={RouterLink} sx={LINK_SX} to={`/spaces/${deployment.spaceId}`}>
      Space
    </Link>
  </Box>
);

const CellDetails = ({ row, column, cell, withLinks, onReleaseOpen }: CellDetailsProps) => {
  const badgeColor = LIVE_TONE_COLOR[cell.tone ?? 'neutral'];
  return (
    <Box data-testid='target-cell-details'>
      <HoverCardHeader>
        <Box sx={{ overflow: 'hidden' }}>
          <HoverCardTitle variant='subtitle2'>{row.componentName}</HoverCardTitle>
          <Typography color='text.secondary' sx={{ fontSize: '0.6875rem' }}>
            on {column.spaceSlug ? `${column.spaceSlug}/` : ''}
            {column.slug}
            {column.kubernetesVersion ? ` · Kubernetes ${column.kubernetesVersion}` : ''}
          </Typography>
        </Box>
        <HoverCardBadge sx={{ bgcolor: alpha(badgeColor, 0.12), color: badgeColor }}>
          {cell.tone ? TONE_LABEL[cell.tone] : 'Not released'}
        </HoverCardBadge>
      </HoverCardHeader>
      <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
        {cell.deployments.map((deployment, idx) => (
          <Box key={deployment.spaceId}>
            <Box sx={{ py: 0.75, px: 0.5 }} data-testid='target-cell-deployment'>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, minWidth: 0 }}>
                <Typography noWrap sx={{ fontSize: '0.75rem', fontWeight: 600, minWidth: 0 }}>
                  {deployment.spaceSlug}
                </Typography>
                {deployment.variant && (
                  <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
                    {deployment.variant}
                  </Typography>
                )}
                <Box sx={{ flex: 1 }} />
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', flexShrink: 0 }}>
                  {plural(deployment.resourceCount, 'resource')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                <Box
                  sx={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    flexShrink: 0,
                    bgcolor: deployment.tone ? LIVE_TONE_COLOR[deployment.tone] : 'transparent',
                    border: deployment.tone ? 'none' : `1px solid ${LIVE_TONE_COLOR.neutral}`,
                  }}
                />
                {deployment.release ? (
                  <>
                    <Typography noWrap sx={{ fontSize: '0.6875rem', flex: 1, minWidth: 0 }}>
                      Release {deployment.release.releaseNum} · {liveStatusText(deployment.release.liveStatus)}
                    </Typography>
                    {deployment.release.createdAt && (
                      <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary', flexShrink: 0 }}>
                        {formatRelative(deployment.release.createdAt)}
                      </Typography>
                    )}
                  </>
                ) : (
                  <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }}>
                    No Release published to this Target
                  </Typography>
                )}
              </Box>
              {withLinks && (
                <DeploymentLinks componentName={row.componentName} deployment={deployment} onReleaseOpen={onReleaseOpen} />
              )}
            </Box>
            {idx < cell.deployments.length - 1 && <Divider />}
          </Box>
        ))}
      </Box>
      {!withLinks && (
        <Typography color='text.disabled' sx={{ display: 'block', mt: 0.5, fontSize: '0.625rem' }}>
          Click for links
        </Typography>
      )}
    </Box>
  );
};

// ============================================================================
// MATRIX
// ============================================================================

interface TargetMatrixTableProps {
  matrix: TargetMatrix;
  onReleaseOpen: (deployment: MatrixDeployment) => void;
}

interface Pinned {
  anchor: HTMLElement;
  row: MatrixRow;
  column: TargetColumn;
  cell: MatrixCell;
}

/**
 * Components down, Targets across. Each cell is coloured by the worst live
 * status of the Releases the Component's Spaces run on the Target, as on the
 * Releases page's heatmap; hovering it previews them, and clicking it pins
 * them with links.
 */
export const TargetMatrixTable = ({ matrix, onReleaseOpen }: TargetMatrixTableProps) => {
  const theme = useTheme();
  const [pinned, setPinned] = useState<Pinned | null>(null);

  const stickyLeft = {
    position: 'sticky',
    left: 0,
    bgcolor: 'background.paper',
    borderRight: `1px solid ${theme.palette.divider}`,
  } as const;

  return (
    <Paper variant='outlined' sx={{ borderRadius: '8px', overflow: 'hidden' }} data-testid='target-matrix'>
      <TableContainer sx={{ maxHeight: 'calc(100vh - 220px)' }}>
        <Table size='small' stickyHeader sx={{ borderCollapse: 'separate' }}>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{ ...stickyLeft, zIndex: 3, width: COMPONENT_COL_WIDTH, minWidth: COMPONENT_COL_WIDTH, bgcolor: 'background.default' }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>Component</Typography>
              </TableCell>
              {matrix.columns.map((column) => (
                <TableCell
                  key={column.targetId}
                  align='center'
                  data-testid='target-column'
                  data-target={column.slug}
                  sx={{ minWidth: CELL_MIN_WIDTH, bgcolor: 'background.default', verticalAlign: 'bottom', py: 1, textTransform: 'none', letterSpacing: 'normal' }}
                >
                  <Link
                    component={RouterLink}
                    to={`/targets?edit=${column.targetId}`}
                    underline='hover'
                    sx={{ fontSize: 12, fontWeight: 700, color: 'text.primary', display: 'block', wordBreak: 'break-word' }}
                  >
                    {column.slug}
                  </Link>
                  {column.spaceSlug && (
                    <Typography sx={{ fontSize: 10.5, color: 'text.secondary', wordBreak: 'break-word' }}>
                      {column.spaceSlug}
                    </Typography>
                  )}
                  <Typography
                    data-testid='target-kubernetes-version'
                    sx={{ fontFamily: MONO_FONT, fontSize: 10.5, color: column.kubernetesVersion ? 'text.secondary' : 'text.disabled', mt: 0.25 }}
                  >
                    {column.kubernetesVersion ? `k8s ${column.kubernetesVersion}` : 'k8s —'}
                  </Typography>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {matrix.rows.map((row) => (
              <TableRow key={row.componentId} data-testid='target-matrix-row' data-component={row.componentName}>
                <TableCell sx={{ ...stickyLeft, zIndex: 1 }}>
                  <Link
                    component={RouterLink}
                    to={`/components?app=${encodeURIComponent(row.componentName)}`}
                    underline='hover'
                    sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}
                  >
                    {row.componentName}
                  </Link>
                </TableCell>
                {matrix.columns.map((column) => {
                  const cell = row.cells.get(column.targetId);
                  if (!cell) return <TableCell key={column.targetId} />;
                  const color = cell.tone ? LIVE_TONE_COLOR[cell.tone] : LIVE_TONE_COLOR.neutral;
                  const single = cell.deployments.length === 1 ? cell.deployments[0] : undefined;
                  let headline: string;
                  if (!single) headline = plural(cell.deployments.length, 'variant');
                  else if (single.release) headline = `Release ${single.release.releaseNum}`;
                  else headline = 'Not released';
                  return (
                    <TableCell key={column.targetId} sx={{ p: 0.5 }}>
                      <HoverCard
                        enabled={pinned === null}
                        content={<CellDetails row={row} column={column} cell={cell} withLinks={false} onReleaseOpen={onReleaseOpen} />}
                        placement='bottom-start'
                        offset={[0, 6]}
                        triggerSx={{ display: 'block' }}
                      >
                        <Box
                          component='button'
                          data-testid='target-cell'
                          data-tone={cell.tone ?? 'none'}
                          onClick={(event: React.MouseEvent<HTMLElement>) =>
                            setPinned({ anchor: event.currentTarget, row, column, cell })
                          }
                          sx={{
                            width: '100%',
                            textAlign: 'left',
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            px: 1,
                            py: 0.75,
                            borderRadius: '4px',
                            border: cell.tone ? '1px solid transparent' : `1px dashed ${theme.palette.divider}`,
                            borderLeft: `3px solid ${color}`,
                            bgcolor: cell.tone ? alpha(color, 0.14) : 'transparent',
                            transition: 'background 0.12s',
                            '&:hover': { bgcolor: alpha(color, cell.tone ? 0.24 : 0.08) },
                          }}
                        >
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.primary', lineHeight: 1.3 }}>
                            {headline}
                          </Typography>
                          <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.3 }}>
                            {plural(cell.resourceCount, 'resource')}
                          </Typography>
                        </Box>
                      </HoverCard>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TargetLegend />
      <Popover
        open={pinned !== null}
        anchorEl={pinned?.anchor}
        onClose={() => setPinned(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { p: 1.5, minWidth: 280, maxWidth: 400, borderRadius: '8px', mt: 0.75 } } }}
      >
        {pinned && (
          <CellDetails
            row={pinned.row}
            column={pinned.column}
            cell={pinned.cell}
            withLinks
            onReleaseOpen={(deployment) => {
              setPinned(null);
              onReleaseOpen(deployment);
            }}
          />
        )}
      </Popover>
    </Paper>
  );
};

const TargetLegend = () => {
  const theme = useTheme();
  const swatch = (color: string, dashed = false) => (
    <Box
      sx={{
        width: 11,
        height: 11,
        borderRadius: '3px',
        flexShrink: 0,
        bgcolor: dashed ? 'transparent' : color,
        border: dashed ? `1px dashed ${theme.palette.text.disabled}` : 'none',
      }}
    />
  );
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, px: 2, py: 1.25, borderTop: `1px solid ${theme.palette.divider}` }}>
      {LIVE_TONE_LEGEND.map(({ tone, label }) => (
        <Box key={tone} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {swatch(LIVE_TONE_COLOR[tone])}
          <Typography variant='caption' color='text.secondary'>
            {label}
          </Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {swatch('', true)}
        <Typography variant='caption' color='text.secondary'>
          Units on the Target, no Release
        </Typography>
      </Box>
    </Box>
  );
};
