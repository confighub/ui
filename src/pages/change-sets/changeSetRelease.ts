// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Releasing a ChangeSet, and the validation it needs: what the ChangeSet page says
 * about each Space a Release of the change would be published in.
 *
 * A ChangeSet is released Space by Space, in each Space it changed that has a
 * release Target (`Space.ReleaseTargetID`), at its end Tag: each Unit of the Space
 * is bundled at the Revision the ChangeSet ended on, as `cub release publish
 * --revision ChangeSet:<slug>` does. So it can be released only once it is Closed,
 * and the server refuses a Release when a Revision it would bundle has
 * ValidationErrors, or when a Unit that has been released before is not one the
 * ChangeSet ended on (leaving it out would delete it from the Target).
 *
 * The page asks the server with a dry run of the publish in each Space not yet
 * released at the end Tag, and reads the answer here:
 *
 * - **200 with a Release**: it would be published.
 * - **200 with a Message**: nothing would be: the Space's latest Release already
 *   bundles exactly this.
 * - **422**: refused, with the server's reason.
 * - **403**: the viewer may not publish in the Space.
 *
 * Pure: the hook passes the answers in, and the specs pass fakes.
 */
import type { ReleasePublishResponseRead, ResponseError } from '@confighub/rtk-query';

import type { ServerAnswer } from '../change-orders/reviews/stageReviewInputs';
import { refusalText } from '../change-orders/reviews/stageReviewInputs';

export type { ReleaseValidation as ChangeSetValidation } from '../change-orders/releaseValidation';

/** What a Release of the ChangeSet in one Space would do, or did. */
export type ReleaseSpaceStatus =
  /** Published at the ChangeSet's end Tag. */
  | { kind: 'released'; releaseNum?: number }
  /** A dry run says it would be published. */
  | { kind: 'ready' }
  /** Its latest Release already bundles exactly what this one would. */
  | { kind: 'unchanged'; releaseNum?: number }
  /** The server refuses it, for `message`. */
  | { kind: 'refused'; message: string }
  | { kind: 'noPermission' }
  /** No answer: the request failed. */
  | { kind: 'unknown'; message: string }
  | { kind: 'checking' };

export interface ReleaseSpace {
  spaceId: string;
  spaceSlug: string;
  status: ReleaseSpaceStatus;
}

export type ChangeSetRelease =
  /** No Space the ChangeSet changed has a release Target: there is nothing to release. */
  | { status: 'none' }
  | { status: 'loading' }
  /** What it reads could not be read: whether it can be released is not known. */
  | { status: 'failed' }
  /** Still Open: closing it comes first. */
  | { status: 'open'; spaces: ReleaseSpace[] }
  | { status: 'closed'; spaces: ReleaseSpace[] };

/** One error of a refusal: who it is about, what it says, and the items it names. */
function errorText(error: ResponseError | undefined): string | undefined {
  if (error?.Message === undefined || error.Message.trim() === '') return undefined;
  const metadata = error.ErrorMetadata;
  const subject = metadata?.EntitySlug
    ? `${metadata.EntityType ?? 'Unit'} ${metadata.EntitySlug}: `
    : '';
  const items = (metadata?.Items ?? [])
    .filter((item) => item.Item && item.Description)
    .map((item) => `${item.Item}: ${item.Description}`);
  return `${subject}${error.Message.trim()}${items.length > 0 ? ` (${items.join('; ')})` : ''}`;
}

/** What a dry run of the publish in one Space answered. */
export function releaseStatusOfAnswer(answer: ServerAnswer): ReleaseSpaceStatus {
  const body = (
    typeof answer.body === 'object' && answer.body !== null ? answer.body : {}
  ) as ReleasePublishResponseRead & {
    message?: string;
  };
  if (answer.status === 200) {
    if (body.Message !== undefined && body.Message !== '')
      return { kind: 'unchanged', releaseNum: body.Release?.ReleaseNum };
    return { kind: 'ready' };
  }
  if (answer.status === 403) return { kind: 'noPermission' };
  const message = errorText(body.Error) ?? refusalText(answer.body)?.trim();
  if (answer.status === 0)
    return { kind: 'unknown', message: message || 'The server could not be reached.' };
  return {
    kind: 'refused',
    message: message || `The release was refused (${answer.status}).`,
  };
}

/** The Spaces a Release would be published in now. */
export function releasableSpaces(release: ChangeSetRelease): ReleaseSpace[] {
  if (release.status !== 'closed') return [];
  return release.spaces.filter((space) => space.status.kind === 'ready');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The line beside the Release button. */
export function releaseSummaryText(release: ChangeSetRelease): string | undefined {
  switch (release.status) {
    case 'none':
      return undefined;
    case 'loading':
      return 'Checking whether it can be released…';
    case 'failed':
      return 'Whether it can be released could not be checked.';
    case 'open':
      return 'Close it to release it.';
    case 'closed': {
      const { spaces } = release;
      const count = (kind: ReleaseSpaceStatus['kind']) =>
        spaces.filter((space) => space.status.kind === kind).length;
      if (spaces.some((space) => space.status.kind === 'checking'))
        return 'Checking whether it can be released…';
      const released = count('released') + count('unchanged');
      if (released === spaces.length)
        return spaces.length === 1
          ? 'Released.'
          : `Released in ${plural(spaces.length, 'Space')}.`;
      const ready = count('ready');
      const refused = count('refused') + count('unknown');
      if (count('noPermission') === spaces.length) return 'You may not release it.';
      if (refused > 0) return `${plural(refused, 'Space')} cannot be released yet.`;
      if (ready > 0) return `Ready to release in ${plural(ready, 'Space')}.`;
      return undefined;
    }
  }
}

/** The kinds of outcome the Release section groups its Spaces by, in the order it shows them. */
export type ReleaseGroupKind = 'refused' | 'noPermission' | 'checking' | 'ready' | 'released';

/** The group a Space's outcome belongs to. A refusal or no answer is named; the rest are counted. */
export function releaseGroupOf(status: ReleaseSpaceStatus): ReleaseGroupKind {
  switch (status.kind) {
    case 'refused':
    case 'unknown':
      return 'refused';
    case 'released':
    case 'unchanged':
      return 'released';
    default:
      return status.kind;
  }
}

/** The Spaces of each group, in the order the section shows them; empty groups left out. */
export function releaseGroups(
  spaces: readonly ReleaseSpace[],
): { kind: ReleaseGroupKind; spaces: ReleaseSpace[] }[] {
  const order: ReleaseGroupKind[] = [
    'refused',
    'noPermission',
    'checking',
    'ready',
    'released',
  ];
  return order.flatMap((kind) => {
    const inGroup = spaces.filter((space) => releaseGroupOf(space.status) === kind);
    return inGroup.length === 0 ? [] : [{ kind, spaces: inGroup }];
  });
}
