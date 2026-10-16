// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The words the detail page uses for a set of image and version changes. Kept
 * out of the component file so the component file exports only components.
 */

import type { ImageChange } from './imageChange';

/** Which kinds of change a set holds: images, version fields, or both. */
export function kindsOf(images: readonly ImageChange[]): 'images' | 'versions' | 'both' {
  const versions = images.filter((image) => image.kind === 'version').length;
  if (versions === 0) return 'images';
  return versions === images.length ? 'versions' : 'both';
}

/** The hint on a shut "Full diff": what the card above already says in full. */
export function onlyChangesHint(images: readonly ImageChange[]): string {
  const kinds = kindsOf(images);
  if (kinds === 'both') return 'Only images and versions change, as shown above.';
  return kinds === 'versions' ? 'Only versions change, as shown above.' : 'Only images change, as shown above.';
}
