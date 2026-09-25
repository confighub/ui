// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { TOP_NAV_HEIGHT } from '@/utility/constants';

import { useUnitResources, UnitResourceRow } from '../../hooks/useUnitResources';

interface ResourcesTabProps {
  spaceID: string | undefined;
  unitID: string | undefined;
}

/**
 * Master/detail layout: a list of resources at the top, the YAML body of the
 * selected resource below. We ask `get-resources` for body=native up front so
 * the YAML is available immediately on selection — for a single unit the
 * payload is small enough that lazy-loading per resource isn't worth the
 * round trip.
 */
export function ResourcesTab({ spaceID, unitID }: ResourcesTabProps) {
  const { rows, isLoading, error } = useUnitResources({
    spaceID,
    unitID,
    withBody: true,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Auto-select the first resource when results arrive (or the previous
  // selection vanished after a refetch).
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0];

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity='error'>{error}</Alert>
      </Box>
    );
  }

  if (rows.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant='body2' color='text.disabled'>
          No resources extracted from this unit.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Box
        sx={{
          maxHeight: 200,
          flexShrink: 0,
          overflowY: 'auto',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <List dense disablePadding>
          {rows.map((r) => (
            <ResourceListItem
              key={r.id}
              row={r}
              selected={selected?.id === r.id}
              onClick={() => setSelectedId(r.id)}
            />
          ))}
        </List>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, p: 1 }}>
        {selected?.ResourceBody ? (
          <CodeEditor
            value={selected.ResourceBody}
            toolchainType='Kubernetes/YAML'
            readonly
            // CodeEditor's internal fallback height assumes a full-viewport
            // container. This tab renders inside a right-anchored drawer whose
            // paper is offset below the top nav by the theme's MuiDrawer
            // override, so pass the same arithmetic minus the nav.
            height={`calc(100vh - ${TOP_NAV_HEIGHT + 220}px)`}
          />
        ) : (
          <Typography variant='body2' color='text.disabled' sx={{ p: 1 }}>
            Select a resource to inspect.
          </Typography>
        )}
      </Box>
    </Stack>
  );
}

function ResourceListItem({
  row,
  selected,
  onClick,
}: {
  row: UnitResourceRow;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <ListItemButton selected={selected} onClick={onClick} dense sx={{ py: 0.5 }}>
      <ListItemText
        primary={row.ResourceName}
        secondary={row.ResourceType}
        primaryTypographyProps={{
          variant: 'body2',
          sx: { fontFamily: 'monospace', fontSize: '0.82rem' },
        }}
        secondaryTypographyProps={{
          variant: 'caption',
          sx: { fontFamily: 'monospace', fontSize: '0.7rem' },
        }}
      />
    </ListItemButton>
  );
}
