// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useMemo } from 'react';

import { parse } from 'yaml';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';

import { GenericView } from './GenericView';
import { MetadataSection } from './MetadataSection';
import { UnknownRecord, asRecord } from './helpers';
import { lookupFriendlyView } from './registry';

interface ResourceOverviewProps {
  /** Raw YAML of the resource as stored in ConfigHub (desired state). */
  yaml: string;
  /** ResourceType string ("group/version/Kind") used to pick the view. */
  resourceType: string;
}

/**
 * The Overview tab body: parses the resource YAML once and renders the
 * common metadata sections followed by the kind-specific friendly view
 * (or the generic field dump when no view is registered for the type).
 */
export function ResourceOverview({ yaml, resourceType }: ResourceOverviewProps) {
  const doc = useMemo<UnknownRecord | null>(() => {
    try {
      return asRecord(parse(yaml)) ?? null;
    } catch {
      return null;
    }
  }, [yaml]);

  if (!doc) {
    return (
      <Alert severity='warning' sx={{ m: 1 }}>
        Could not parse this resource for the overview. Use the YAML tab to inspect it.
      </Alert>
    );
  }

  const KindView = lookupFriendlyView(resourceType) ?? GenericView;

  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <MetadataSection doc={doc} />
      <KindView doc={doc} />
    </Box>
  );
}
