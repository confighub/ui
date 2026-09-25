// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useState } from 'react';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { useLazyListAllResourcesQuery } from '@confighub/rtk-query';
import { TOP_NAV_HEIGHT } from '@/utility/constants';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';

import { ResourceRow } from '../../hooks/useResourceRows';
import { ResourceOverview } from './friendly/ResourceOverview';
import { hasFriendlyView } from './friendly/registry';

interface ResourceDrawerProps {
  /** Row to display. When null, drawer is closed. */
  row: ResourceRow | null;
  onClose: () => void;
}

interface BodyState {
  yaml: string | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_BODY: BodyState = { yaml: null, loading: false, error: null };

type DrawerTab = 'overview' | 'yaml';

/**
 * Renders one resource in a right-hand Drawer with two tabs: a friendly
 * Overview (kind-specific sections for common resource types) and the raw
 * YAML.
 *
 * The body is fetched on open rather than carried by every table row: it is the
 * resource in its original toolchain-native form, comments and field order
 * intact, and a table has no use for it. ConfigHub stores it alongside the
 * queryable projection, so this is a single-row read rather than a re-extraction
 * of the whole parent unit.
 */
export function ResourceDrawer({ row, onClose }: ResourceDrawerProps) {
  const [triggerListResources] = useLazyListAllResourcesQuery();
  const [body, setBody] = useState<BodyState>(INITIAL_BODY);
  const [tab, setTab] = useState<DrawerTab>('overview');

  // Fetch the body when the drawer opens (or the row changes). Imperative,
  // because we want a clear separation between the org-wide table fetch and
  // this single-resource fetch.
  const fetchBody = useCallback(
    async (target: ResourceRow) => {
      setBody({ yaml: null, loading: true, error: null });
      const result = await triggerListResources({
        where: `ResourceID = '${target.ResourceID}'`,
        rawData: true,
        select: 'ResourceID',
      });
      if (result.error) {
        setBody({ yaml: null, loading: false, error: 'Failed to fetch resource body.' });
        return;
      }
      // RawData is declared as a byte-format string in the spec, so it arrives
      // base64-encoded. atob yields one byte per code unit; the TextDecoder
      // turns those back into the UTF-8 the document was written in.
      const encoded = result.data?.[0]?.RawData;
      if (!encoded) {
        setBody({
          yaml: null,
          loading: false,
          error: 'Resource not found in the current Unit data.',
        });
        return;
      }
      try {
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        setBody({ yaml: new TextDecoder().decode(bytes), loading: false, error: null });
      } catch {
        setBody({ yaml: null, loading: false, error: 'Failed to decode resource body.' });
      }
    },
    [triggerListResources],
  );

  const open = row !== null;

  return (
    <Drawer
      anchor='right'
      open={open}
      onClose={onClose}
      slotProps={{
        paper: {
          sx: { width: { xs: '100%', md: 720 }, display: 'flex', flexDirection: 'column' },
        },
      }}
      // Imperatively trigger fetch when the drawer opens with a new row.
      SlideProps={{
        onEntering: () => {
          if (row) {
            fetchBody(row);
            // Default to the friendly view for types we render well; fall
            // back to raw YAML for everything else.
            setTab(hasFriendlyView(row.ResourceType) ? 'overview' : 'yaml');
          }
        },
      }}
    >
      {row && (
        <>
          <Stack
            direction='row'
            alignItems='center'
            justifyContent='space-between'
            sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant='subtitle1' fontWeight={600} noWrap>
                {row.ResourceName}
              </Typography>
              <Typography variant='caption' color='text.secondary' noWrap>
                {row.ResourceType}
              </Typography>
            </Box>
            <IconButton size='small' onClick={onClose} aria-label='Close drawer'>
              <CloseIcon fontSize='small' />
            </IconButton>
          </Stack>

          <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Stack direction='row' spacing={2} flexWrap='wrap'>
              <MetaItem label='Unit'>
                <Link
                  href={`/units/${row.SpaceID}/${row.UnitID}`}
                  target='_blank'
                  rel='noopener noreferrer'
                  underline='hover'
                  sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                >
                  {row.UnitSlug}
                </Link>
              </MetaItem>
              <MetaItem label='Space'>
                <Typography variant='caption' sx={{ fontFamily: 'monospace' }}>
                  {row.SpaceSlug}
                </Typography>
              </MetaItem>
              {row.TargetSlug && (
                <MetaItem label='Target'>
                  <Typography variant='caption' sx={{ fontFamily: 'monospace' }}>
                    {row.TargetSlug}
                  </Typography>
                </MetaItem>
              )}
              {row.ToolchainType && (
                <MetaItem label='Toolchain'>
                  <Typography variant='caption' sx={{ fontFamily: 'monospace' }}>
                    {row.ToolchainType}
                  </Typography>
                </MetaItem>
              )}
            </Stack>
          </Box>

          <Tabs
            value={tab}
            onChange={(_, v: DrawerTab) => setTab(v)}
            variant='fullWidth'
            sx={{ borderBottom: 1, borderColor: 'divider', minHeight: 36 }}
          >
            <Tab label='Overview' value='overview' sx={{ minHeight: 36 }} />
            <Tab label='YAML' value='yaml' sx={{ minHeight: 36 }} />
          </Tabs>

          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              p: 1,
              overflow: tab === 'overview' ? 'auto' : 'hidden',
            }}
          >
            {body.loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                <CircularProgress size={24} />
              </Box>
            )}
            {body.error && (
              <Alert severity='error' sx={{ m: 1 }}>
                {body.error}
              </Alert>
            )}
            {!body.loading && !body.error && body.yaml !== null && (
              <>
                {tab === 'overview' ? (
                  <ResourceOverview yaml={body.yaml} resourceType={row.ResourceType} />
                ) : (
                  <CodeEditor
                    value={body.yaml}
                    toolchainType='Kubernetes/YAML'
                    readonly
                    // CodeEditor's internal fallback height assumes a
                    // full-viewport container. This drawer's paper is offset
                    // below the top nav by the theme's MuiDrawer override, so
                    // pass the same arithmetic minus the nav to avoid
                    // overflowing the shortened paper.
                    height={`calc(100vh - ${TOP_NAV_HEIGHT + 220}px)`}
                  />
                )}
              </>
            )}
          </Box>
        </>
      )}
    </Drawer>
  );
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography
        variant='caption'
        color='text.secondary'
        sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}
      >
        {label}
      </Typography>
      {children}
    </Box>
  );
}
