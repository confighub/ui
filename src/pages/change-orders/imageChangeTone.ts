// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The colours for each bump kind, shared by the list cell and the detail hero. */

import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderSurface } from './changeOrdersTokens';
import type { BumpKind } from './imageChange';

/**
 * Ink and soft ground per bump kind, for the marked part of the new image tag, and the line
 * a bordered mark of the bump (the hero's bump pill) draws in.
 */
export const BUMP_TONE: Record<BumpKind, { ink: string; soft: string; line: string }> = {
  major: { ink: changeOrderStatus.warn, soft: changeOrderStatus.warnSoft, line: changeOrderStatus.warnLine },
  minor: { ink: changeOrderStatus.accent, soft: changeOrderStatus.accentSoft, line: changeOrderStatus.accentLine },
  patch: { ink: changeOrderStatus.success, soft: changeOrderStatus.successGround, line: changeOrderStatus.successLine },
  downgrade: { ink: changeOrderStatus.danger, soft: changeOrderStatus.dangerSoft, line: changeOrderStatus.dangerLine },
  build: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
  digest: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
  registry: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
};
