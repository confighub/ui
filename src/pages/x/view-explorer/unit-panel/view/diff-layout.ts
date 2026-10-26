// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { CSSProperties } from 'react';

import type { ResourceDiff } from '@confighub/rtk-query';

import type { ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import { resourceDiffLabel } from '@/components/config-diff/configDiffTree';

/**
 * How the panel's dialogs lay out a config diff: the path takes the room, and
 * the value before and after sit close together in two narrow columns. The
 * columns are fixed, so they line up across resources and need no dragging.
 */
export const PANEL_DIFF_COLUMNS: ConfigDiffColumns = {
  columnStyle: { '--col1-width': 'calc(100% - 240px)', '--col2-width': '120px' } as CSSProperties,
  onDividerMouseDown: () => undefined,
  isDragging: false,
};

/** "Deployment/unrel": the kind and the name, as the document is known, without the API group or an empty namespace. */
export function panelResourceLabel(resource: ResourceDiff['Resource']): string {
  const plain = resourceDiffLabel(resource);
  const type = resource?.ResourceType;
  const name = resource?.ResourceName?.replace(/^\//, '');
  if (!plain || !type || !name || !plain.startsWith(type)) return plain;
  return `${type.split('/').pop()}/${name}`;
}

/** The dialogs' width: the theme's breakpoints are wider than a diff of a few paths needs. */
export const DIALOG_PAPER = { paper: { sx: { maxWidth: 720 } } } as const;
