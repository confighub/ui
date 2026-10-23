// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';

import type { ConfigDiff, ResourceDiff } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { componentTheme } from '@/pages/x/apps/componentTheme';
import type { KeptValue } from '@/pages/x/apps/diffTree';
import { TreeDiffSection, type TreeDiffDomHooks } from '@/pages/x/apps/TreeDiffSection';
import { useColumnResize } from '@/pages/x/apps/useColumnResize';

import { buildConfigDiffTree, resourceDiffLabel } from './configDiffTree';
import { DiffRowCommentsContext, type DiffComments } from './diffComments';

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
  hideContext: boolean;
  /** Values this resource kept, drawn as rows among its changes. */
  kept: readonly KeptValue[];
  comments?: DiffComments;
  /** Drawn under the resource's heading, above its changes. */
  prelude?: ReactNode;
  domHooks: TreeDiffDomHooks;
}

const ResourceDiffSection = memo(({ resource, resourceKey, columnStyle, onDividerMouseDown, isDragging, hideContext, kept, comments, prelude, domHooks }: ResourceDiffSectionProps) => {
  const tree = useMemo(() => {
    const changes = resource.Changes ?? [];
    return buildConfigDiffTree(hideContext ? changes.filter((change) => change.ChangeType !== 'None') : changes, kept);
  }, [resource.Changes, hideContext, kept]);
  const entry = useMemo(() => ({ unitId: resourceKey, fieldDiffs: NO_FIELD_DIFFS }), [resourceKey]);

  const added = resource.ChangeType === 'Add';
  const deleted = resource.ChangeType === 'Delete';
  const renamedFrom =
    resource.PreviousResource && resource.PreviousResource.ResourceName !== resource.Resource?.ResourceName
      ? resource.PreviousResource.ResourceName
      : undefined;
  const label = resourceDiffLabel(resource.Resource);
  const rowComments = useMemo(() => comments?.forResource(resource.Resource), [comments, resource.Resource]);

  return (
    <DiffRowCommentsContext.Provider value={rowComments}>
    <Box data-testid='config-diff-resource' sx={{ mb: 2 }}>
      {/* A resource that names nothing, changed in place, has nothing to head it. */}
      {(label || added || deleted || renamedFrom) && <Stack
        direction='row'
        spacing={1}
        alignItems='center'
        sx={{ px: 2, py: 0.75, borderBottom: `1px solid ${componentTheme.borderDefault}` }}
      >
        <Typography
          sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600, color: componentTheme.fgDefault }}
        >
          {label}
        </Typography>
        {added && <Chip label='added' size='small' color='success' variant='outlined' sx={{ height: 18 }} />}
        {deleted && <Chip label='deleted' size='small' color='error' variant='outlined' sx={{ height: 18 }} />}
        {renamedFrom && (
          <Typography sx={{ fontSize: 12, color: componentTheme.fgMuted }}>renamed from {renamedFrom}</Typography>
        )}
        {rowComments === undefined ? null : <Box sx={{ ml: 'auto !important' }}>{rowComments.renderAdd('')}</Box>}
      </Stack>}
      {rowComments === undefined ? null : rowComments.renderBelow('')}
      {prelude}

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
          domHooks={domHooks}
        />
      )}
    </Box>
    </DiffRowCommentsContext.Provider>
  );
});

ResourceDiffSection.displayName = 'ResourceDiffSection';

/** Column widths a caller shares across several views, so that all of their columns line up. */
export interface ConfigDiffColumns {
  columnStyle: CSSProperties;
  onDividerMouseDown: (columnIndex: 0 | 1, e: React.MouseEvent) => void;
  isDragging: boolean;
}

export interface ConfigDiffViewProps {
  /** A diff the server computed: `GET .../unit/{id}/diff`, `POST /diff`, or a write's `include=Diff`. */
  diff: ConfigDiff;
  /** Widths shared with other diffs on the page. Absent, the view sizes its own columns. */
  columns?: ConfigDiffColumns;
  /** Leave out the unchanged paths a diff read with `include=Context` holds, and draw the changes only. */
  hideContext?: boolean;
  /**
   * Values the change would have written and the target kept, each drawn as a row in
   * its resource's tree. A value naming no resource goes to the only resource there is.
   */
  kept?: readonly KeptValue[];
  /** Review comments on the rows, from a page that reviews this diff. */
  comments?: DiffComments;
  /** What a page draws under a resource's heading, above its changes: the release pane's image rows. */
  resourcePrelude?: (resource: ResourceDiff, index: number) => ReactNode;
  /** The rows' test ids and screen-reader prefixes, for a page that names its own. */
  domHooks?: TreeDiffDomHooks;
}

const NO_KEPT: readonly KeptValue[] = [];

/**
 * A `ConfigDiff`, resource by resource: each resource's changed paths as a tree with
 * the value before and the value after side by side.
 *
 * The server did the matching -- array elements by merge key, resources across
 * renames -- so an element inserted into a list is one added row, and the elements
 * after it are not reported as changed.
 */
export const ConfigDiffView = ({ diff, columns, hideContext = false, kept = NO_KEPT, comments, resourcePrelude, domHooks = DOM_HOOKS }: ConfigDiffViewProps) => {
  // One set of column widths for every resource, so their columns line up.
  const ownColumns = useColumnResize();
  const { columnStyle, onDividerMouseDown, isDragging } = columns ?? ownColumns;
  const resources = useMemo(() => diff.Resources ?? [], [diff.Resources]);
  const keptByResource = useMemo(
    () =>
      resources.map((resource) =>
        kept.length === 0
          ? NO_KEPT
          : kept.filter((value) =>
              value.resourceName === undefined
                ? resources.length === 1
                : value.resourceName === resource.Resource?.ResourceName,
            ),
      ),
    [resources, kept],
  );

  return (
    <Box data-testid='config-diff'>
      {resources.map((resource, i) => (
        <ResourceDiffSection
          key={i}
          resource={resource}
          resourceKey={`resource-${i}`}
          columnStyle={columnStyle}
          onDividerMouseDown={onDividerMouseDown}
          isDragging={isDragging}
          hideContext={hideContext}
          kept={keptByResource[i]}
          comments={comments}
          prelude={resourcePrelude?.(resource, i)}
          domHooks={domHooks}
        />
      ))}
    </Box>
  );
};
