// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ReactNode } from 'react';

import Box from '@mui/material/Box';
import type { ConfigDiff } from '@confighub/rtk-query';

import { ConfigDiffView, type ConfigDiffColumns } from '@/components/config-diff/ConfigDiffView';
import { ChangeOrderUnitHeader, type ChangeOrderUnitHeaderProps } from '../../x/apps/change-order/ChangeOrderUnitHeader';
import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';

export interface UnitDiffRowProps
  extends Pick<ChangeOrderUnitHeaderProps, 'unitId' | 'spaceId' | 'slug' | 'resourceKind' | 'spaceName' | 'spaceHref' | 'linksHref'> {
  /** False for a Unit in which no field differs: it says so instead of drawing a diff. */
  changed: boolean;
  /** The server's diff of the changed resources (`serverDiffGroupParts`). Absent, `fallback` draws the change. */
  diff?: ConfigDiff;
  /** The page's shared columns (`useSharedDiffColumns`). */
  columns: ConfigDiffColumns;
  /** Lines between the header and the diff. */
  notes?: ReactNode;
  /** The change, drawn some other way, for a Unit with no server diff. */
  fallback?: ReactNode;
}

/**
 * One Unit's change as authored: its header, then the server's diff of the
 * fields that change, or a line that none do.
 *
 * Never a promotion record, so never "written", and never "undetermined": a
 * Unit whose change could not be established is left out and counted by the
 * caller, not drawn here.
 */
export function UnitDiffRow({
  unitId,
  spaceId,
  slug,
  resourceKind,
  spaceName,
  spaceHref,
  linksHref,
  changed,
  diff,
  columns,
  notes,
  fallback,
}: UnitDiffRowProps) {
  return (
    <Box>
      <ChangeOrderUnitHeader
        unitId={unitId}
        spaceId={spaceId}
        slug={slug}
        resourceKind={resourceKind}
        spaceName={spaceName}
        written={false}
        undetermined={false}
        unchanged={!changed}
        spaceHref={spaceHref}
        linksHref={linksHref}
      />
      {notes}
      {!changed ? (
        <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>
          No fields differ here.
        </Box>
      ) : diff !== undefined ? (
        <ConfigDiffView diff={diff} columns={columns} hideContext />
      ) : (
        fallback
      )}
    </Box>
  );
}
