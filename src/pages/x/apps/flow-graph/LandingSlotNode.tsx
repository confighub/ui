// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';

/**
 * Outlined placeholder rendered at the slot the new variant will occupy once
 * the composer commits — see composerLayout.ts's computeLandingSlotPosition.
 * Shown even when the composer card itself has yielded to a lower Y band to
 * avoid occluding real siblings, so where the result lands is never in
 * doubt.
 *
 * Deliberately NOT counter-scaled (unlike ComposerNode): this represents
 * where a real deploymentNode card will sit, so it shrinks and grows with
 * the canvas zoom exactly like every other card does — it is a preview of a
 * future node, not a surface anyone types into.
 */
export function LandingSlotNode() {
  return (
    <Box
      sx={{
        width: 240,
        minHeight: 84,
        borderRadius: `${componentTheme.radiusLg}px`,
        border: `1.5px dashed ${componentTheme.borderEmphasis}`,
        background: 'rgba(186,61,3,0.03)',
        pointerEvents: 'none',
      }}
    />
  );
}

LandingSlotNode.displayName = 'LandingSlotNode';
