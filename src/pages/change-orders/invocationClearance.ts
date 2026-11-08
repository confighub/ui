// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The clearance and guards of the Invocation an Invoke ChangeOrder runs. Each promotion reads the
 * Invocation afresh, so a change to them takes effect in every stage promoted after it, and in
 * none promoted before: a Space the ChangeOrder has run in counts as done, whatever its guards
 * withheld there.
 *
 * Pure: no React, so the browser-free specs can import it.
 */
import type { Clearance, ClearanceRequirement, GuardStamp, MutationConflict, WithheldGuard } from '@confighub/rtk-query';

import { guardsNotCleared, withheldGuards } from '@/utility/clearance-functions';

/**
 * The guards that withheld the given conflicts' changes and that the clearance given does not
 * cover, in key and then value order.
 */
export const guardsNotCovered = (conflicts: readonly MutationConflict[], clearance: Clearance): WithheldGuard[] =>
  withheldGuards(conflicts).filter((guard) => guardsNotCleared({ [guard.Key ?? '']: guard.Value ?? '' }, clearance).length > 0);

/** A clearance requirement as `cub --clearance` takes it: `Key`, `Key=a;b`, `Key!=a;b`, `!Key`. */
export function requirementText(requirement: ClearanceRequirement): string {
  const key = requirement.Key ?? '';
  const values = (requirement.Values ?? []).join(';');
  switch (requirement.Operator) {
    case 'In':
      return `${key}=${values}`;
    case 'NotIn':
      return `${key}!=${values}`;
    case 'DoesNotExist':
      return `!${key}`;
    default:
      return key;
  }
}

/** Guards as written, `key=value`, in key order. */
export const guardStampTexts = (guards: GuardStamp | undefined | null): string[] =>
  Object.keys(guards ?? {})
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => (guards?.[key] ? `${key}=${guards[key]}` : key));

/** The Spaces in scope the ChangeOrder has not run in yet, in scope order. */
export const spacesToPromote = (inScopeSpaceIds: readonly string[] | undefined, resolvedSpaceIds: ReadonlySet<string>): string[] =>
  (inScopeSpaceIds ?? []).filter((spaceId) => !resolvedSpaceIds.has(spaceId));

/**
 * Whether a change to the Invocation can still take effect for this ChangeOrder: it is not
 * aborted, and a Space in scope has not taken the change yet.
 */
export function invocationEditTakesEffect(input: {
  inScopeSpaceIds: readonly string[] | undefined;
  resolvedSpaceIds: ReadonlySet<string>;
  abortedReason: string;
}): boolean {
  return input.abortedReason === '' && spacesToPromote(input.inScopeSpaceIds, input.resolvedSpaceIds).length > 0;
}
