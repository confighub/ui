// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useTheme } from '@mui/material/styles';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Component / Blocking Gates / Unreleased Changes / Upgrades Available. */
const COLUMN_COUNT = 4;
const BODY_ROW_COUNT = 6;

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

/**
 * Mirrors `KpiTile`: 1px border, 9px radius, 14/14/13 padding, a 12px label +
 * 8px status dot header, a 30px mono count and an 11.5px footer line.
 */
const KpiTileSkeleton = () => (
  <Box
    sx={{
      border: (theme) => `1px solid ${theme.palette.divider}`,
      bgcolor: 'background.paper',
      borderRadius: '9px',
      p: '14px 14px 13px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: '10px' }}>
      <Skeleton variant='text' width={110} height={12} />
      <Skeleton variant='circular' width={8} height={8} sx={{ flexShrink: 0 }} />
    </Box>
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <Skeleton variant='rounded' width={46} height={30} sx={{ borderRadius: '4px' }} />
      <Skeleton variant='text' width={70} height={11} />
    </Box>
    <Box sx={{ mt: '9px' }}>
      <Skeleton variant='text' width='72%' height={11.5} />
    </Box>
  </Box>
);

/** Mirrors the estate-summary widget: two mono number blocks + uppercase caption. */
const EstateSummarySkeleton = () => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      flexShrink: 0,
      border: (theme) => `1px solid ${theme.palette.divider}`,
      bgcolor: 'background.paper',
      borderRadius: '9px',
      p: '10px 16px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
    }}
  >
    <Box>
      <Skeleton variant='rounded' width={30} height={22} sx={{ borderRadius: '4px' }} />
      <Skeleton variant='text' width={128} height={11} sx={{ mt: '2px' }} />
    </Box>
    <Box sx={{ width: '1px', height: 30, bgcolor: 'divider' }} />
    <Box>
      <Skeleton variant='rounded' width={52} height={22} sx={{ borderRadius: '4px' }} />
      <Skeleton variant='text' width={128} height={11} sx={{ mt: '2px' }} />
    </Box>
  </Box>
);

/** Mirrors `SectionLabel`: uppercase caption, hairline rule, optional hint. */
const SectionLabelSkeleton = ({ mt = 0 }: { mt?: number | string }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', mb: '11px', mt }}>
    <Skeleton variant='text' width={64} height={12} sx={{ flexShrink: 0 }} />
    <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
    <Skeleton variant='text' width={180} height={12} sx={{ flexShrink: 0 }} />
  </Box>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

/**
 * First-paint placeholder for `ComponentOverviewMatrix`. Every block matches the
 * real component's box metrics (KPI tiles, estate widget, 50px matrix rows) so
 * the swap to real data does not reflow the page.
 */
export const ComponentOverviewMatrixSkeleton = () => {
  const theme = useTheme();

  return (
    <Box
      aria-hidden
      sx={{ p: '22px 28px 60px', overflow: 'hidden', flex: 1, bgcolor: 'background.default' }}
    >
      <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
        {/* ── Page header + estate summary ── */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 2,
            mb: '18px',
          }}
        >
          <Skeleton variant='text' width={260} height={34} />
          <EstateSummarySkeleton />
        </Box>

        {/* ── KPI tiles ── */}
        <SectionLabelSkeleton />
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', mb: '10px' }}>
          <KpiTileSkeleton />
          <KpiTileSkeleton />
          <KpiTileSkeleton />
        </Box>

        {/* ── Filter bar ── */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', my: '16px', minHeight: 24 }}>
          <Skeleton variant='text' width={320} height={12.5} />
        </Box>

        {/* ── Matrix table ── */}
        <Paper
          elevation={0}
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: '9px',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <TableContainer>
            <Table size='small' stickyHeader>
              <TableHead>
                <TableRow>
                  {Array.from({ length: COLUMN_COUNT }, (_, i) => (
                    <TableCell
                      key={i}
                      align={i === 0 ? 'left' : 'center'}
                      sx={{
                        bgcolor: 'background.default',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        p: i === 0 ? '11px 10px 11px 18px' : '11px 10px',
                        position: 'sticky',
                        top: 0,
                        zIndex: 3,
                      }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: i === 0 ? 'flex-start' : 'center',
                          gap: '5px',
                        }}
                      >
                        <Skeleton variant='text' width={i === 0 ? 84 : 118} height={11} />
                        {i > 0 && <Skeleton variant='text' width={54} height={9.5} />}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>

              <TableBody>
                {Array.from({ length: BODY_ROW_COUNT }, (_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {/* Component name cell: health dot + name + owner/spaces line */}
                    <TableCell
                      sx={{ p: 0, height: 50, borderBottom: `1px solid ${theme.palette.divider}` }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '11px',
                          px: '14px',
                          pl: '18px',
                          height: '100%',
                        }}
                      >
                        <Skeleton variant='circular' width={9} height={9} sx={{ flexShrink: 0 }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 }}>
                          <Skeleton
                            variant='text'
                            width={120 + (rowIndex % 3) * 30}
                            height={13.5}
                          />
                          <Skeleton variant='text' width={96 + (rowIndex % 2) * 24} height={11} />
                        </Box>
                      </Box>
                    </TableCell>

                    {/* KPI data cells */}
                    {Array.from({ length: COLUMN_COUNT - 1 }, (_, colIndex) => (
                      <TableCell
                        key={colIndex}
                        align='center'
                        sx={{ p: 0, height: 50, borderBottom: `1px solid ${theme.palette.divider}` }}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '100%',
                          }}
                        >
                          <Skeleton variant='text' width={20} height={15} />
                        </Box>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* ── Recent activity ── */}
        <Box sx={{ mt: '24px' }}>
          <SectionLabelSkeleton />
          <Box sx={{ py: 2, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {Array.from({ length: 3 }, (_, i) => (
              <Box key={i} sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                <Skeleton variant='circular' width={40} height={40} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant='text' width='60%' height={18} />
                  <Skeleton variant='text' width='80%' height={16} sx={{ mt: '4px' }} />
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
