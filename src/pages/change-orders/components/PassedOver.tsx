// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import Box from '@mui/material/Box';
import type { BoxProps } from '@mui/material/Box';

import { skippedUnitReasonText } from '../../x/apps/change-order/changeOrderCopy';
import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { CollapsibleUnitGroup } from './CollapsibleUnitGroup';
import { FactLink } from './SummaryFacts';

export interface PassedOverProps {
  /** The server's `SkippedUnits`: unit id to reason code. */
  skippedUnits: Readonly<Record<string, string>>;
  /** Where each unit lives, for its link. A unit with no Space here is named but not linked. */
  spaceIdByUnitId: ReadonlyMap<string, string>;
  /** Each unit's slug. */
  slugByUnitId: ReadonlyMap<string, string>;
  /** What a unit with no slug here is called. Never its id: an id means nothing to a reader. */
  fallbackLabel: string;
  expanded: boolean;
  onToggle: () => void;
  sx?: BoxProps['sx'];
}

/**
 * "Passed over": the resources the change declined to touch inside the Spaces
 * it covers, each with the server's reason. Renders nothing when there are none.
 *
 * NOT AN ERROR, AND NOT WORDED AS ONE. A ChangeOrder over one changed resource
 * passes over every other resource in its Space; that is the ordinary case, so
 * the tone is neutral.
 *
 * Not the Spaces left out of scope either: `InScopeSpaceIDs` names no Space
 * that was considered and excluded, let alone why, so that list cannot be told
 * honestly and is not drawn here.
 */
export function PassedOver({
  skippedUnits,
  spaceIdByUnitId,
  slugByUnitId,
  fallbackLabel,
  expanded,
  onToggle,
  sx,
}: PassedOverProps) {
  const skippedEntries = Object.entries(skippedUnits);
  if (skippedEntries.length === 0) return null;
  return (
    <CollapsibleUnitGroup
      regionLabel="Resources this change passed over"
      label="Passed over"
      count={<>{skippedEntries.length} {skippedEntries.length === 1 ? 'resource' : 'resources'}</>}
      bodyId="passed-over-list"
      expanded={expanded}
      onToggle={onToggle}
      sx={sx}
    >
      <Box component="dl" sx={{ margin: 0, fontSize: changeOrderType.size.body }}>
        {skippedEntries.map(([unitId, reason]) => {
          const skippedSpaceId = spaceIdByUnitId.get(unitId);
          const skippedName = slugByUnitId.get(unitId) ?? fallbackLabel;
          return (
            <Box key={unitId} sx={{ display: 'flex', gap: '8px', padding: '2px 0' }}>
              <Box component="dt" sx={{ margin: 0, color: changeOrderInk.default, fontFamily: 'monospace' }}>
                {/* Linked only when its Space is known: a unit outside scope has no page to send a reader to. */}
                {skippedSpaceId !== undefined ? (
                  <FactLink href={`/units/${skippedSpaceId}/${unitId}`}>{skippedName}</FactLink>
                ) : (
                  skippedName
                )}
              </Box>
              <Box component="dd" sx={{ margin: 0, color: changeOrderInk.muted }}>
                {skippedUnitReasonText(reason)}
              </Box>
            </Box>
          );
        })}
      </Box>
    </CollapsibleUnitGroup>
  );
}
