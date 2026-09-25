// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';

import { ResourceRow } from '../../hooks/useResourceRows';
import { buildResourceSummary, cellCount } from '../../summary';

interface ResourceSummaryDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Resources to summarize. The caller passes the applied-filter row set
   * (not the Groups-tab narrowing) so the summary reflects the full filter.
   */
  rows: ResourceRow[];
}

const TYPE_COL_WIDTH = 220;
const CLUSTER_COL_WIDTH = 84;
const TOTAL_COL_WIDTH = 72;

/**
 * Heatmap pivot of resource counts: rows are resource types (apiVersion/kind),
 * columns are clusters (Targets), cells are counts shaded by magnitude. A
 * trailing Total column gives the per-type total (counts "overall"), and a
 * trailing Total row gives the per-cluster total. Computed entirely from the
 * rows already in memory — opening the dialog makes no API calls.
 */
export function ResourceSummaryDialog({ open, onClose, rows }: ResourceSummaryDialogProps) {
  const theme = useTheme();
  const summary = useMemo(() => buildResourceSummary(rows), [rows]);

  const { resourceTypes, clusters, rowTotals, colTotals, grandTotal, maxCell } = summary;

  // Sticky-cell backgrounds need an opaque fill so heat cells don't bleed
  // through when scrolled under them.
  const stickyBg = theme.palette.background.paper;
  // The totals band lives on sticky cells, so its fill must be opaque or
  // scrolled rows bleed through it. action.hover is translucent, so layer it
  // over the opaque paper background via a flat gradient instead of using it
  // directly as the background color.
  const totalBg = {
    backgroundColor: theme.palette.background.paper,
    backgroundImage: `linear-gradient(${theme.palette.action.hover}, ${theme.palette.action.hover})`,
  } as const;

  /** Background for a heat cell: transparent at 0, ramping with magnitude. */
  const heatBg = (count: number): string => {
    if (count <= 0 || maxCell <= 0) return 'transparent';
    const ratio = count / maxCell;
    return alpha(theme.palette.primary.main, 0.08 + 0.62 * ratio);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='lg' fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Typography variant='h6' component='span' fontWeight={600}>
          Resource summary
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          {grandTotal.toLocaleString()} resource{grandTotal !== 1 ? 's' : ''} ·{' '}
          {resourceTypes.length} type{resourceTypes.length !== 1 ? 's' : ''} ·{' '}
          {clusters.length} cluster{clusters.length !== 1 ? 's' : ''} · counts for the applied
          filters
        </Typography>
        <IconButton
          onClick={onClose}
          size='small'
          sx={{ position: 'absolute', top: 12, right: 12 }}
          aria-label='Close'
        >
          <CloseIcon fontSize='small' />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ p: 0 }}>
        {grandTotal === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant='body2' color='text.secondary'>
              No resources match the current filters.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size='small' sx={{ borderCollapse: 'separate', borderSpacing: 0 }}>
              <TableHead>
                <TableRow>
                  <HeaderCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 4,
                      minWidth: TYPE_COL_WIDTH,
                      backgroundColor: stickyBg,
                    }}
                  >
                    Resource type
                  </HeaderCell>
                  {clusters.map((c) => (
                    <Tooltip key={c.id} title={c.slug} placement='top'>
                      <HeaderCell
                        align='center'
                        sx={{ minWidth: CLUSTER_COL_WIDTH, maxWidth: CLUSTER_COL_WIDTH }}
                      >
                        <Box
                          sx={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.label}
                        </Box>
                      </HeaderCell>
                    </Tooltip>
                  ))}
                  <HeaderCell
                    align='center'
                    sx={{
                      position: 'sticky',
                      right: 0,
                      zIndex: 4,
                      minWidth: TOTAL_COL_WIDTH,
                      ...totalBg,
                      fontWeight: 700,
                    }}
                  >
                    Total
                  </HeaderCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {resourceTypes.map((type) => (
                  <TableRow key={type} hover>
                    <TableCell
                      sx={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 3,
                        backgroundColor: stickyBg,
                        fontFamily: 'monospace',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {type}
                    </TableCell>
                    {clusters.map((c) => {
                      const count = cellCount(summary, type, c.id);
                      return (
                        <TableCell
                          key={c.id}
                          align='center'
                          sx={{
                            backgroundColor: heatBg(count),
                            color: count > 0 ? 'text.primary' : 'text.disabled',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {count > 0 ? count : ''}
                        </TableCell>
                      );
                    })}
                    <TableCell
                      align='center'
                      sx={{
                        position: 'sticky',
                        right: 0,
                        zIndex: 2,
                        ...totalBg,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {(rowTotals.get(type) ?? 0).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}

                {/* Column totals (per-cluster), pinned to the bottom. */}
                <TableRow>
                  <TableCell
                    sx={{
                      position: 'sticky',
                      left: 0,
                      bottom: 0,
                      zIndex: 3,
                      ...totalBg,
                      fontWeight: 700,
                    }}
                  >
                    Total
                  </TableCell>
                  {clusters.map((c) => (
                    <TableCell
                      key={c.id}
                      align='center'
                      sx={{
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 1,
                        ...totalBg,
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {(colTotals.get(c.id) ?? 0).toLocaleString()}
                    </TableCell>
                  ))}
                  <TableCell
                    align='center'
                    sx={{
                      position: 'sticky',
                      right: 0,
                      bottom: 0,
                      zIndex: 3,
                      ...totalBg,
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {grandTotal.toLocaleString()}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Compact, non-wrapping header cell shared across the matrix header. */
function HeaderCell({
  children,
  align,
  sx,
}: {
  children: React.ReactNode;
  align?: 'center' | 'left';
  sx?: object;
}) {
  return (
    <TableCell
      align={align}
      sx={{
        fontWeight: 600,
        fontSize: '0.72rem',
        textTransform: 'none',
        whiteSpace: 'nowrap',
        ...sx,
      }}
    >
      {children}
    </TableCell>
  );
}
