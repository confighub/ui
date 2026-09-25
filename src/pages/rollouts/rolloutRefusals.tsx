// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** @jsxImportSource react */

/**
 * What a promotion was refused, and the resources it could not move at all.
 *
 * ITS OWN MODULE SO A TEST CAN DRIVE IT. These render, and a renderer is where
 * this feature's one real defect lived: the row and the block both printed the
 * same refusal, which no assertion about the DATA could have seen, because the
 * data was right.
 *
 * TWO IMPORTS HERE ARE CHOSEN FOR THAT, NOT FOR STYLE. The `@jsxImportSource`
 * pragma pins this file to React's JSX runtime, because Playwright's runner
 * otherwise claims JSX for its own component tests and a spec importing this
 * would receive objects React cannot render. And MUI arrives through its barrel
 * rather than `@mui/material/Box`, because the per-component paths are directory
 * imports the Node ES resolver rejects. Change either and the renderer tests
 * stop running — silently, since they would fail to load rather than fail.
 */

import type { ReactNode } from 'react';

import { Box } from '@mui/material';

import type { RolloutResourceConflict } from '../x/apps/rollout/rolloutTypes';
import { rolloutInk, rolloutShape, rolloutStatus, rolloutSurface, rolloutType } from './rolloutsTokens';

/**
 * What the promotion was refused, in the reader's words.
 *
 * Shared by the two places a refusal appears, so they can never word it
 * differently: beneath a resource the change moved only in part, and inside the
 * block for one it could not move at all.
 */
export function RolloutRefusals({ conflicts }: { conflicts: readonly RolloutResourceConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <Box data-testid="rollout-refusals" sx={{ padding: '0 12px 8px' }}>
      {conflicts.map((conflict, index) => (
        <Box
          // Reason and resource do not identify a conflict on their own — one
          // refused resource produces one record for itself and one per path it
          // carried, so the position in this resource's own list is the only
          // thing that separates them.
          key={`${conflict.reason}-${conflict.resourceName ?? ''}-${conflict.path ?? ''}-${index}`}
          sx={{ fontSize: rolloutType.size.small, color: rolloutStatus.warn, lineHeight: rolloutType.lineHeight.body }}
        >
          <b>{conflict.reason || 'Could not be established'}</b>
          {conflict.resourceName !== undefined ? ` — ${conflict.resourceName}` : null}
          {conflict.path !== undefined && conflict.path !== '' ? ` at ${conflict.path}` : null}
          {conflict.details !== undefined && conflict.details !== '' ? (
            <Box sx={{ color: rolloutInk.subtle }}>{conflict.details}</Box>
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

/**
 * The resources the change tried to alter and could not.
 *
 * SEPARATE FROM THE LIST, NOT ANOTHER ROW IN IT. A blocked resource has no
 * changed paths, exactly like a resource the change never mentions, so listing
 * the two together would put the one thing a reader must not miss among the
 * things they asked not to see.
 *
 * Renders nothing at all when there is nothing blocked, which is also what
 * happens when the server sends no conflicts — the screen is then exactly the
 * changed resources, with no empty heading to explain.
 */
export function RolloutBlockedResources<TUnit extends { unitId: string }>({
  units,
  renderUnit,
}: {
  units: readonly TUnit[];
  /**
   * The row renderer, which ALREADY renders this resource's refusals. The block
   * must not render them again: the two share the wording component on purpose,
   * and sharing membership as well printed every reason twice.
   */
  renderUnit: (unit: TUnit) => ReactNode;
}) {
  if (units.length === 0) return null;
  return (
    <Box
      role="region"
      aria-label="Resources the change could not alter"
      data-testid="rollout-blocked-resources"
      sx={{
        marginTop: '10px',
        border: `1px solid ${rolloutStatus.warn}`,
        borderRadius: `${rolloutShape.radius.md}px`,
        background: rolloutSurface.sunk,
      }}
    >
      <Box
        sx={{
          fontSize: rolloutType.size.small,
          fontWeight: rolloutType.weight.semibold,
          color: rolloutInk.default,
          padding: '8px 12px 0',
        }}
      >
        {units.length === 1
          ? 'This resource did not change, and the change expected it to'
          : `${units.length} resources did not change, and the change expected them to`}
      </Box>
      {units.map((unit) => (
        <Box key={unit.unitId} sx={{ padding: '4px 0' }}>
          {renderUnit(unit)}
        </Box>
      ))}
    </Box>
  );
}

