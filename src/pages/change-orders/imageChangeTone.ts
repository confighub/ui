// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The colours for each bump kind, shared by the list cell and the detail hero. */

import { changeOrderInk, changeOrderStatus, changeOrderSurface } from './changeOrdersTokens';
import type { BumpKind } from './imageChange';

/** Ink and soft ground per bump kind, for the marked part of the new image tag. */
export const BUMP_TONE: Record<BumpKind, { ink: string; soft: string }> = {
  major: { ink: changeOrderStatus.warn, soft: changeOrderStatus.warnSoft },
  minor: { ink: changeOrderStatus.accent, soft: changeOrderStatus.accentSoft },
  patch: { ink: changeOrderStatus.success, soft: changeOrderStatus.successGround },
  downgrade: { ink: changeOrderStatus.danger, soft: changeOrderStatus.dangerSoft },
  build: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset },
  digest: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset },
  registry: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset },
};
