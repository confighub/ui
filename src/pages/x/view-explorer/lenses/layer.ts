// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { EntityKind } from '../model/types';

/** Helpers shared by the lens column's parts. */

export const modKey =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? '⌘'
    : 'Ctrl+';

/** Attribute on every floating layer the column opens, so a click in one never closes the floating column. */
export const LENS_LAYER_ATTR = 'data-vx-lens-layer';
export const lensLayerProps = { [LENS_LAYER_ATTR]: '' } as Record<string, string>;

/** Whether a click landed in one of the column's own floating layers (or any MUI menu or popper). */
export function inLensLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(
    `[${LENS_LAYER_ATTR}], .MuiPopover-root, .MuiPopper-root, .MuiMenu-root, .MuiDialog-root`,
  );
}

const NOUNS: Record<EntityKind, [string, string]> = {
  Unit: ['unit', 'units'],
  Space: ['space', 'spaces'],
  Resource: ['resource', 'resources'],
};

export const noun = (entity: EntityKind, n: number) => NOUNS[entity][n === 1 ? 0 : 1];
