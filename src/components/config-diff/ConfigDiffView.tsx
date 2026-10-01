// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useMemo, type CSSProperties } from 'react';

import type { ConfigDiff, ResourceDiff } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { componentTheme } from '@/pages/x/apps/componentTheme';
import { TreeDiffSection, type TreeDiffDomHooks } from '@/pages/x/apps/TreeDiffSection';
import { useColumnResize } from '@/pages/x/apps/useColumnResize';

import { buildConfigDiffTree, resourceDiffLabel } from './configDiffTree';

/** `TreeDiffSection` reads its rows from the tree it is handed, not from field diffs. */
const NO_FIELD_DIFFS: { path: string; oldValue: string; newValue: string }[] = [];

const DOM_HOOKS: TreeDiffDomHooks = {
  testIdPrefix: 'config-diff',
  srValuePrefix: { old: 'Before: ', new: 'After: ' },
};

interface ResourceDiffSectionProps {
  resource: ResourceDiff;
  /** Unique among the diff's resources: two of them can have the same type and name. */
  resourceKey: string;
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
}

const ResourceDiffSection = memo(({ resource, resourceKey, columnStyle, onDividerMouseDown, isDragging }: ResourceDiffSectionProps) => {
  const tree = useMemo(() => buildConfigDiffTree(resource.Changes ?? []), [resource.Changes]);
  const entry = useMemo(() => ({ unitId: resourceKey, fieldDiffs: NO_FIELD_DIFFS }), [resourceKey]);

  const added = resource.ChangeType === 'Add';
  const deleted = resource.ChangeType === 'Delete';
  const renamedFrom =
    resource.PreviousResource && resource.PreviousResource.ResourceName !== resource.Resource?.ResourceName
      ? resource.PreviousResource.ResourceName
      : undefined;

  return (
    <Box data-testid='config-diff-resource' sx={{ mb: 2 }}>
      <Stack
        direction='row'
        spacing={1}
        alignItems='center'
        sx={{ px: 2, py: 0.75, borderBottom: `1px solid ${componentTheme.borderDefault}` }}
      >
        <Typography
          sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600, color: componentTheme.fgDefault }}
        >
          {resourceDiffLabel(resource.Resource)}
        </Typography>
        {added && <Chip label='added' size='small' color='success' variant='outlined' sx={{ height: 18 }} />}
        {deleted && <Chip label='deleted' size='small' color='error' variant='outlined' sx={{ height: 18 }} />}
        {renamedFrom && (
          <Typography sx={{ fontSize: 12, color: componentTheme.fgMuted }}>renamed from {renamedFrom}</Typography>
        )}
      </Stack>

      {added || deleted ? (
        // A resource added or deleted whole has no path changes: the document is the change.
        <Box
          component='pre'
          data-testid='config-diff-resource-document'
          sx={{
            m: 0,
            px: 2,
            py: 1,
            fontFamily: componentTheme.fontMono,
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            color: added ? componentTheme.success : componentTheme.danger,
          }}
        >
          {added ? resource.ToValue : resource.FromValue}
        </Box>
      ) : (
        <TreeDiffSection
          entry={entry}
          tree={tree}
          keyPrefix='config-diff'
          label=''
          variant='data'
          hideLabel
          columnStyle={columnStyle}
          onDividerMouseDown={onDividerMouseDown}
          isDragging={isDragging}
          domHooks={DOM_HOOKS}
        />
      )}
    </Box>
  );
});

ResourceDiffSection.displayName = 'ResourceDiffSection';

export interface ConfigDiffViewProps {
  /** A diff the server computed: `GET .../unit/{id}/diff`, `POST /diff`, or a write's `include=Diff`. */
  diff: ConfigDiff;
}

/**
 * A `ConfigDiff`, resource by resource: each resource's changed paths as a tree with
 * the value before and the value after side by side.
 *
 * The server did the matching -- array elements by merge key, resources across
 * renames -- so an element inserted into a list is one added row, and the elements
 * after it are not reported as changed.
 */
export const ConfigDiffView = ({ diff }: ConfigDiffViewProps) => {
  // One set of column widths for every resource, so their columns line up.
  const { columnStyle, onDividerMouseDown, isDragging } = useColumnResize();

  return (
    <Box data-testid='config-diff'>
      {(diff.Resources ?? []).map((resource, i) => (
        <ResourceDiffSection
          key={i}
          resource={resource}
          resourceKey={`resource-${i}`}
          columnStyle={columnStyle}
          onDividerMouseDown={onDividerMouseDown}
          isDragging={isDragging}
        />
      ))}
    </Box>
  );
};
