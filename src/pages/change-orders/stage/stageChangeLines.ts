// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * How the stage card names a changed field and an image move, and what the
 * change card says when it has no outcome to show.
 */

import type { PathSegment } from '@confighub/rtk-query';

import { fieldLabelOf, shortDigest } from '../imageChange';
import { parseImagePath, parseImageRef, type ImageRef } from '../../x/apps/imageRef';
import type { ChangeOrderChangeGroup } from '../../x/apps/change-order/changeOrderTypes';
import { stageCardCopy } from './stageCardCopy';
import type { CopySegment } from './stageTypes';

/** A server path whose last segment is a container's `image`: `…containers.?name=api.image`. */
const SERVER_IMAGE_PATH = /(?:^|[.\]/])(?:containers|initContainers|ephemeralContainers)[.[/].*[.\]/]image$/;

/** Whether a changed field is a container image reference. */
export function isImageField(segments: readonly PathSegment[] | null | undefined, path: string): boolean {
  if (segments !== null && segments !== undefined && segments.length > 0) return fieldLabelOf(segments, path) === 'image';
  return parseImagePath(path) !== null || SERVER_IMAGE_PATH.test(path);
}

/**
 * The short label a changed field is shown by, everywhere on the card: the path
 * below its container, and "image tag" for an image reference.
 */
export function changeFieldLabel(segments: readonly PathSegment[] | null | undefined, path: string): string {
  if (isImageField(segments, path)) return 'image tag';
  return fieldLabelOf(segments, path);
}

/**
 * What is shown of one side of an image move: the image tag alone when the
 * repository stays the same, as the image hero shows it. A digest stands in for a
 * missing tag, or for a tag that did not move. A repository move keeps the name.
 */
function imageSideText(ref: ImageRef, other: ImageRef | null): string {
  const id = ref.tag ?? (ref.digest === null ? '' : shortDigest(ref.digest));
  const sameRepo = other !== null && other.repoPath === ref.repoPath;
  const pinned = other !== null && other.tag === ref.tag && ref.digest !== null ? shortDigest(ref.digest) : id;
  const text = sameRepo ? pinned : `${ref.repository}${ref.tag === null ? '' : `:${ref.tag}`}`;
  return text === '' ? ref.repoPath : text;
}

/** The text shown for `value` against the value on the other side of the move. */
export function imageValueText(value: string, other: string | undefined): string {
  const ref = parseImageRef(value);
  if (ref === null) return value;
  return imageSideText(ref, parseImageRef(other));
}

/** What the change card says in place of its outcome boxes, or `null` when it shows them. */
export type ChangeCardNotice =
  | { kind: 'reading' | 'unreadable' | 'nothing'; text: string }
  | { kind: 'notReached'; parts: CopySegment[] }
  | null;

export interface ChangeCardNoticeInput {
  /** `stageChangesStatus`. */
  status: 'loading' | 'resolved' | 'failed';
  /** Fields the change writes in the stage, across its Spaces. */
  fieldCount: number;
  /** The stage's groups, to tell "nothing changes" from "nothing could be read". */
  groups: Iterable<ChangeOrderChangeGroup>;
  /** Set when the change has not reached the stage before: the card says so instead. */
  notReachedFrom?: { stageId: string; name: string };
  /** Fields the change sets at the source, for the not-reached line. */
  sourceFieldCount?: number;
  /** The stage holds the change itself: it is never "not reached". */
  written?: boolean;
  /** False until the change has been read once: until then the card says it is reading. Absent: read. */
  settledOnce?: boolean;
}

/**
 * What the change card says when it has nothing to show.
 *
 * "Writes no field" is said only once the change is read and some Space could be
 * established: while it is read it says so, and where nothing could be read it
 * says that, because an empty answer is not a "nothing changes" answer. A stage
 * the change has not reached yet has nothing to show until the stage before has it.
 */
export function changeCardNotice(input: ChangeCardNoticeInput): ChangeCardNotice {
  const copy = stageCardCopy.change;
  // Until the first read settles, an empty or failed answer is a read in flight, not a verdict.
  if (input.status === 'loading' || input.settledOnce === false) return { kind: 'reading', text: copy.reading };
  if (input.fieldCount > 0) return null;
  if (input.notReachedFrom !== undefined && input.written !== true) {
    return { kind: 'notReached', parts: copy.notReached(input.notReachedFrom, input.sourceFieldCount) };
  }
  const anyRead = [...input.groups].some((g) => g.determinable);
  if (input.status === 'failed' || !anyRead) return { kind: 'unreadable', text: copy.unreadable };
  return { kind: 'nothing', text: copy.nothing };
}
