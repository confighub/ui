// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { LABEL_VALUE_MAX_LENGTH, LABEL_VALUE_PATTERN, LABEL_VALUE_PATTERN_MESSAGE } from '@confighub/api';

import { shellQuoteArg } from '@/utility/shell-quote';

import { LABEL_OWNER } from './componentData';

/**
 * The owner of a Component is a property of the Component, not of its
 * Spaces. A Component can carry it only as an `Owner` label on each of its
 * Spaces, so the read falls back to those when the Component has no label
 * of its own. `cub` applies the same rule.
 */

type Labeled = { Labels?: Record<string, string> | null } | null | undefined;

type ComponentSpace = { ComponentID?: string | null; Labels?: Record<string, string> | null };

function ownerLabel(entity: Labeled): string {
  return entity?.Labels?.[LABEL_OWNER]?.trim() ?? '';
}

/**
 * The Component's owner: its own `Owner` label if set; else the `Owner`
 * label every one of its Spaces carries with one value; else "". Spaces that
 * disagree, a Space with no `Owner` label, or no Spaces at all give "".
 */
export function componentOwner(component: Labeled, spaces: readonly Labeled[]): string {
  const own = ownerLabel(component);
  if (own) return own;
  if (spaces.length === 0) return '';
  const first = ownerLabel(spaces[0]);
  if (!first) return '';
  return spaces.every((s) => ownerLabel(s) === first) ? first : '';
}

/**
 * The owner of every Component in `componentById`, keyed by ComponentID,
 * read with `componentOwner`. `spaces` are the Spaces to read the fallback
 * from; a Component with none of them is read from its own label alone.
 */
export function buildOwnerByComponentId(
  componentById: ReadonlyMap<string, Labeled>,
  spaces: readonly ComponentSpace[],
): Map<string, string> {
  const spacesById = new Map<string, ComponentSpace[]>();
  for (const space of spaces) {
    const id = space.ComponentID;
    if (!id) continue;
    const list = spacesById.get(id);
    if (list) list.push(space);
    else spacesById.set(id, [space]);
  }
  const owners = new Map<string, string>();
  for (const [id, component] of componentById) {
    owners.set(id, componentOwner(component, spacesById.get(id) ?? []));
  }
  return owners;
}

/** What a create with an owner must do to the Component's `Owner` label. */
export type OwnerWrite =
  /** Nothing to write: no owner was asked for, or the label already holds it. */
  | { kind: 'none' }
  /** Set the Component's `Owner` label to the requested owner. */
  | { kind: 'set' }
  /** The Component already has another owner. Nothing may be written. */
  | { kind: 'conflict'; current: string };

/**
 * Decides the write for a requested owner against the Component's current
 * owner (read with `componentOwner`). An unset owner is set. The same owner
 * is written only where it is read from the Spaces, so the Component holds
 * it from now on. A different owner is a conflict: the create must stop
 * before it writes anything.
 */
export function ownerWrite(component: Labeled, spaces: readonly Labeled[], requested: string): OwnerWrite {
  const owner = requested.trim();
  if (!owner) return { kind: 'none' };
  const current = componentOwner(component, spaces);
  if (current && current !== owner) return { kind: 'conflict', current };
  return ownerLabel(component) === owner ? { kind: 'none' } : { kind: 'set' };
}

/** The message a create shows when the Component already has another owner. */
export function ownerConflictMessage(componentSlug: string, current: string, requested: string): string {
  return (
    `Component "${componentSlug}" already has the owner "${current}". ` +
    `Select "${current}" as the owner, or change the Component's owner to "${requested.trim()}" first.`
  );
}

/**
 * Why the server would refuse `owner` as the value of the Component's
 * `Owner` label, or `null` when it accepts it. An empty owner sets no label,
 * so it is accepted. A create checks this before it writes anything, so a
 * refused owner never leaves a variant without one.
 */
export function ownerValueProblem(owner: string): string | null {
  const value = owner.trim();
  if (!value) return null;
  if (value.length > LABEL_VALUE_MAX_LENGTH) {
    return `The owner must be ${LABEL_VALUE_MAX_LENGTH} characters or less`;
  }
  if (!LABEL_VALUE_PATTERN.test(value)) return `The owner is not valid. ${LABEL_VALUE_PATTERN_MESSAGE}`;
  return null;
}

/** The `cub` command that sets the Component's owner, ready to paste in a shell. */
export function ownerSetCommand(componentSlug: string, owner: string): string {
  return `cub component update --patch ${shellQuoteArg(componentSlug)} --label ${shellQuoteArg(`${LABEL_OWNER}=${owner.trim()}`)}`;
}
