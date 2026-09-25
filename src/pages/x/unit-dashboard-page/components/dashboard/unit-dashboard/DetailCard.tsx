// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { NavLink } from '@/components/nav-link/NavLink';
import { Ellipses } from '@/components/styled';
import { HoverCard } from '@/components/styled';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid2';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

const DetailItem = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5, 0),
}));

const Label = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  fontWeight: 600,
  textTransform: 'uppercase',
  marginBottom: theme.spacing(0.5),
}));

interface ValueProps {
  $link?: boolean;
}

const Value = styled(Ellipses, {
  shouldForwardProp: (prop) => prop !== '$link',
})<ValueProps>(({ theme, $link }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.primary,
  wordBreak: 'break-word',
  ...($link && {
    textDecoration: 'underline',
  }),
}));

// ============================================================================
// LABELS SECTION
// ============================================================================

const LABEL_COLORS = [
  '#1976d2',
  '#7b1fa2',
  '#0097a7',
  '#e64a19',
  '#388e3c',
  '#f57c00',
  '#5d4037',
  '#455a64',
  '#c2185b',
  '#303f9f',
];

const ColorDot = styled(Box)<{ $color: string }>(({ $color }) => ({
  width: 6,
  height: 6,
  borderRadius: 1,
  backgroundColor: $color,
  flexShrink: 0,
}));

const getKeyColor = (key: string): string => {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length];
};

export interface IDetailCardProps {
  /** The unit to display details for */
  unit: ExtendedUnitRead;
}

/**
 * UnitDetailCard displays basic unit information in a two-column grid layout
 * with labels above values.
 */
export const DetailCard = ({ unit }: IDetailCardProps) => {
  const [copied, setCopied] = useState(false);
  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [annotationsExpanded, setAnnotationsExpanded] = useState(false);
  const { containerRef, width: containerWidth } = useContainerWidth();

  // 3 columns when container is wide enough, otherwise 2
  const gridItemSize = containerWidth >= 500 ? 4 : 6;

  const labels = useMemo(() => {
    const raw = unit.Unit?.Labels;
    if (!raw) return [];
    return Object.entries(raw)
      .filter(([, value]) => value != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        value: value as string,
        color: getKeyColor(key),
      }));
  }, [unit.Unit?.Labels]);

  const annotations = useMemo(() => {
    const raw = unit.Unit?.Annotations;
    if (!raw) return [];
    return Object.entries(raw)
      .filter(([, value]) => value != null)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        value: value as string,
        color: getKeyColor(key),
      }));
  }, [unit.Unit?.Annotations]);

  const handleCopyUnitId = useCallback(() => {
    const unitId = unit.Unit?.UnitID;
    if (unitId) {
      navigator.clipboard.writeText(unitId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [unit.Unit?.UnitID]);

  // Compute unreleased changes status. LastReleasedRevisionNum is advanced by
  // `release publish`, so head > lastReleased means "not yet in a Release".
  const headRevisionNum = unit?.Unit?.HeadRevisionNum || 0;
  const lastReleasedRevisionNum = unit?.Unit?.LastReleasedRevisionNum || 0;
  const targetID = unit?.Unit?.TargetID || '';
  const unreleasedChanges: 'Yes' | 'No' =
    headRevisionNum > lastReleasedRevisionNum && targetID != '' ? 'Yes' : 'No';
  const upgradeAvailable: 'Yes' | 'No' =
    (unit?.UpstreamUnit?.HeadRevisionNum ?? 0) > (unit?.Unit?.UpstreamRevisionNum ?? 0)
      ? 'Yes'
      : 'No';

  return (
    <HoverCard
      variant='outlined'
      sx={{
        mx: 2,
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
      }}
    >
      <Stack
        direction='row'
        justifyContent='space-between'
        alignItems='center'
        p={1}
        sx={{ flexShrink: 0 }}
      >
        <Typography variant='h6'>Details</Typography>
      </Stack>
      <Divider />
      <Box ref={containerRef} p={1.5}>
        <Grid container spacing={0.5}>
          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Unit ID</Label>
              <Stack direction='row' alignItems='center' spacing={0.5} minWidth={0}>
                <NavLink
                  to={`/units/${unit?.Space?.SpaceID}/${unit?.Unit?.UnitID}`}
                  style={{ minWidth: 0 }}
                >
                  <Value $link>{unit.Unit?.UnitID || '—'}</Value>
                </NavLink>
                {unit.Unit?.UnitID && (
                  <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                    <IconButton size='small' onClick={handleCopyUnitId} sx={{ padding: 0.5 }}>
                      {copied ? (
                        <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                      ) : (
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Space</Label>
              <NavLink to={`/spaces/${unit?.Space?.SpaceID}`}>
                <Value $link>{unit.Space?.Slug || '—'}</Value>
              </NavLink>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Target</Label>
              {unit?.Target?.TargetID ? (
                <NavLink to={`/targets?edit=${unit?.Target?.TargetID}`}>
                  <Value $link>{unit.Target?.Slug || '—'}</Value>
                </NavLink>
              ) : (
                <Value>—</Value>
              )}
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Upstream Unit</Label>
              {unit.UpstreamUnit?.UnitID ? (
                <Stack direction='row' alignItems='center' spacing={0.5} minWidth={0}>
                  <NavLink
                    to={`/units/${unit?.UpstreamUnit?.SpaceID}/${unit?.UpstreamUnit?.UnitID}`}
                    style={{ minWidth: 0 }}
                  >
                    <Value $link>{unit.UpstreamUnit?.Slug || '—'}</Value>
                  </NavLink>

                  <Tooltip title={copied ? 'Copied!' : 'Copy'}>
                    <IconButton size='small' onClick={handleCopyUnitId} sx={{ padding: 0.5 }}>
                      {copied ? (
                        <CheckIcon sx={{ fontSize: 16, color: 'success.main' }} />
                      ) : (
                        <ContentCopyIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Tooltip>
                </Stack>
              ) : (
                <Value>—</Value>
              )}
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Toolchain</Label>
              <Value>{unit.Unit?.ToolchainType || '—'}</Value>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Unreleased Changes</Label>
              <Value>{unreleasedChanges}</Value>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Upgrade Available</Label>
              <Value>{upgradeAvailable}</Value>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Last Change Description</Label>
              <Value>{unit.Unit?.LastChangeDescription}</Value>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>App</Label>
              <Value>{unit.Unit?.Labels?.app || 'N/A'}</Value>
            </DetailItem>
          </Grid>

          <Grid size={gridItemSize}>
            <DetailItem>
              <Label>Environment</Label>
              <Value>{unit.Unit?.Labels?.environment || 'N/A'}</Value>
            </DetailItem>
          </Grid>

        </Grid>
      </Box>
      {labels.length > 0 && (
        <>
          <Divider />
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems='center'
            sx={{ px: 1.5, py: 0.5, cursor: 'pointer' }}
            onClick={() => setLabelsExpanded((prev) => !prev)}
          >
            <Stack direction='row' alignItems='center' spacing={1}>
              <Typography variant='body2' fontWeight={600} color='text.secondary'>
                Labels
              </Typography>
              <Chip
                label={labels.length}
                size='small'
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            </Stack>
            <IconButton size='small'>
              <ExpandMoreIcon
                fontSize='small'
                sx={{
                  transform: labelsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms',
                }}
              />
            </IconButton>
          </Stack>
          <Collapse in={labelsExpanded} timeout='auto' unmountOnExit>
            <Box
              sx={{
                px: 1.5,
                pb: 1.5,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
              }}
            >
              {labels.map(({ key, value, color }) => (
                <Chip
                  key={key}
                  size='small'
                  variant='outlined'
                  icon={<ColorDot $color={color} />}
                  label={`${key}: ${value}`}
                  sx={{
                    '& .MuiChip-icon': {
                      ml: 0.75,
                      mr: -0.25,
                    },
                  }}
                />
              ))}
            </Box>
          </Collapse>
        </>
      )}
      {annotations.length > 0 && (
        <>
          <Divider />
          <Stack
            direction='row'
            justifyContent='space-between'
            alignItems='center'
            sx={{ px: 1.5, py: 0.5, cursor: 'pointer' }}
            onClick={() => setAnnotationsExpanded((prev) => !prev)}
          >
            <Stack direction='row' alignItems='center' spacing={1}>
              <Typography variant='body2' fontWeight={600} color='text.secondary'>
                Annotations
              </Typography>
              <Chip
                label={annotations.length}
                size='small'
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            </Stack>
            <IconButton size='small'>
              <ExpandMoreIcon
                fontSize='small'
                sx={{
                  transform: annotationsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms',
                }}
              />
            </IconButton>
          </Stack>
          <Collapse in={annotationsExpanded} timeout='auto' unmountOnExit>
            <Box
              sx={{
                px: 1.5,
                pb: 1.5,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 0.75,
              }}
            >
              {annotations.map(({ key, value, color }) => (
                <Chip
                  key={key}
                  size='small'
                  variant='outlined'
                  icon={<ColorDot $color={color} />}
                  label={`${key}: ${value}`}
                  sx={{
                    '& .MuiChip-icon': {
                      ml: 0.75,
                      mr: -0.25,
                    },
                  }}
                />
              ))}
            </Box>
          </Collapse>
        </>
      )}
    </HoverCard>
  );
};

DetailCard.displayName = 'DetailCard';
