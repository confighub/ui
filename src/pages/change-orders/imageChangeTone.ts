// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** The colours and words for each bump kind, shared by the list cell and the detail hero. */

import { changeOrderBorder, changeOrderInk, changeOrderStatus, changeOrderSurface } from './changeOrdersTokens';
import type { BumpKind } from './imageChange';

/** Ink, soft ground and edge per bump kind. Shared by the pill and the marked part of the new image tag. */
export const BUMP_TONE: Record<BumpKind, { ink: string; soft: string; line: string }> = {
  major: { ink: changeOrderStatus.warn, soft: changeOrderStatus.warnSoft, line: changeOrderStatus.warnLine },
  minor: { ink: changeOrderStatus.accent, soft: changeOrderStatus.accentSoft, line: changeOrderStatus.accentLine },
  patch: { ink: changeOrderStatus.success, soft: changeOrderStatus.successGround, line: changeOrderStatus.successLine },
  downgrade: { ink: changeOrderStatus.danger, soft: changeOrderStatus.dangerSoft, line: changeOrderStatus.dangerLine },
  build: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
  digest: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
  registry: { ink: changeOrderInk.muted, soft: changeOrderSurface.inset, line: changeOrderBorder.strong },
};

export const BUMP_LABEL: Record<BumpKind, string> = {
  major: 'Major',
  minor: 'Minor',
  patch: 'Patch',
  downgrade: 'Downgrade',
  build: 'New build',
  digest: 'Digest',
  registry: 'Registry',
};
