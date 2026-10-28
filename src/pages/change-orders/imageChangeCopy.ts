// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The words the detail page uses for a set of image and version changes. Kept
 * out of the component file so the component file exports only components.
 */

import type { BumpKind, ImageChange } from './imageChange';

/** What a set of image changes belongs to, as the hero and the full diff name it. */
export interface ImageChangeSubject {
  /** The entity whose change it is, in a sentence: "This ChangeOrder changes...". */
  noun: string;
  /** Where the Units a row counts are, after "In N Units": `at the source`, or empty. */
  unitsWhere: string;
  /** Prefix of the test ids and element ids, so the elements of two subjects never share one. */
  idPrefix: string;
}

/** A ChangeOrder's change, counted in the Units at its source. */
export const CHANGE_ORDER_IMAGE_SUBJECT: ImageChangeSubject = {
  noun: 'ChangeOrder',
  unitsWhere: 'at the source',
  idPrefix: 'change-order',
};

/** `In 3 resources at the source`, or `In 3 resources`. */
export function unitsInText(unitCount: number, subject: ImageChangeSubject): string {
  const units = `${unitCount} ${unitCount === 1 ? 'resource' : 'resources'}`;
  return subject.unitsWhere === '' ? `In ${units}` : `In ${units} ${subject.unitsWhere}`;
}

/** Which kinds of change a set holds: images, version fields, or both. */
export function kindsOf(images: readonly ImageChange[]): 'images' | 'versions' | 'both' {
  const versions = images.filter((image) => image.kind === 'version').length;
  if (versions === 0) return 'images';
  return versions === images.length ? 'versions' : 'both';
}

/** The hint on a shut "Full diff": what the card above already says in full. */
export function onlyChangesHint(images: readonly ImageChange[]): string {
  const kinds = kindsOf(images);
  if (kinds === 'both') return 'Images and versions only';
  return kinds === 'versions' ? 'Versions only' : 'Images only';
}

/** The hero's bump pill: what kind of move the new image tag is. */
export const BUMP_LABEL: Record<BumpKind, string> = {
  major: 'Major bump',
  minor: 'Minor bump',
  patch: 'Patch bump',
  downgrade: 'Downgrade',
  build: 'New build',
  digest: 'New digest',
  registry: 'New registry',
};
