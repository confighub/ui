// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { BlameField, BlameOrigin, UnitBlame } from '@confighub/rtk-query';

import type { GateField } from './gateModel';

/** Where a row's current value came from: the hops of its Blame chain. */
export interface FieldOrigin {
  /** The Blame field, in the form the server names it (merge keys), for Keep on merge. */
  field: BlameField;
  here?: BlameOrigin;
  from: BlameOrigin;
  /** The Spaces between the origin and this Unit. */
  via: string[];
  /** The value came from another Unit, by a merge or a Link. */
  upstream: boolean;
  protected: boolean;
}

/**
 * The Blame fields of a Unit that hold a finding of a gate. The server places each finding on its
 * field (positional and merge-key paths, ancestors to their leaves), so the client only reads the
 * Gate and the Path the finding named; it never matches paths itself.
 */
export const blameFieldsForFinding = (
  blame: UnitBlame[] | undefined,
  field: Pick<
    GateField,
    'unitId' | 'spaceSlug' | 'unitSlug' | 'path' | 'resourceType' | 'resourceName'
  >,
  gateName: string,
): BlameField[] => {
  // By the Unit's ID; a Blame answer without one names the Unit on each field by its slugs.
  const sameUnit = (f: BlameField, u: UnitBlame) =>
    u.UnitID
      ? u.UnitID === field.unitId
      : f.SpaceSlug === field.spaceSlug && f.UnitSlug === field.unitSlug;
  return (blame ?? [])
    .flatMap((u) => (u.Fields ?? []).filter((f) => sameUnit(f, u)))
    .filter(
      (f) =>
        (!field.resourceType || !f.ResourceType || f.ResourceType === field.resourceType) &&
        (!field.resourceName || !f.ResourceName || f.ResourceName === field.resourceName) &&
        (f.Validation ?? []).some(
          (v) => v.Gate === gateName && (v.Path || f.Path) === field.path,
        ),
    );
};

const originOfField = (field: BlameField): FieldOrigin | undefined => {
  const chain = field.Chain ?? [];
  if (chain.length === 0) return undefined;
  const here = chain[0];
  const from = chain[chain.length - 1];
  const upstream =
    from.UnitID && field.UnitID
      ? from.UnitID !== field.UnitID
      : from.SpaceSlug !== field.SpaceSlug;
  return {
    field,
    here,
    from,
    via: chain
      .slice(1, -1)
      .map((hop) => hop.SpaceSlug ?? '')
      .filter(Boolean),
    upstream,
    protected: !!field.Protected,
  };
};

/** A Unit of a hop: its ID, or its `SPACE/Unit` when the hop has no ID. */
export const originUnitKey = (
  origin: Pick<BlameOrigin, 'UnitID' | 'SpaceSlug' | 'UnitSlug'>,
) => origin.UnitID ?? `${origin.SpaceSlug}/${origin.UnitSlug}`;

/**
 * The origin of a row. A finding on a block matches the leaves under it; it has one origin only
 * when every leaf came from the same Unit.
 */
export const originForFinding = (fields: BlameField[]): FieldOrigin | undefined => {
  const origins = fields.map(originOfField).filter((o): o is FieldOrigin => !!o);
  if (origins.length === 0) return undefined;
  const first = origins[0];
  if (
    origins.some(
      (o) =>
        originUnitKey(o.from) !== originUnitKey(first.from) || o.upstream !== first.upstream,
    )
  ) {
    return undefined;
  }
  return first;
};

/** `SPACE/Unit` of a hop. */
export const hopUnitLabel = (hop: Pick<BlameOrigin, 'SpaceSlug' | 'UnitSlug'>) =>
  [hop.SpaceSlug, hop.UnitSlug].filter(Boolean).join('/');

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

/** The User of a hop that no person made: a Trigger, a Link, or a resolve. */
const NO_PERSON = 'automation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The username of the person who made a hop's change. None for a change no person made, and none
 * when the server could not read the username and sent the user's ID in its place: an ID names
 * no one a reader knows.
 */
const hopPerson = (hop: Pick<BlameOrigin, 'User' | 'UserID'>): string | undefined => {
  const user = hop.User;
  if (!user || user === NO_PERSON || user === hop.UserID || UUID.test(user)) return undefined;
  return user;
};

/**
 * "alice with set-container-image-reference, ChangeOrder fanimg1700-base/invoke-bump, Revision 4,
 * 16 Oct". SetBy names what made the change, never who, so the person who made it leads; a change
 * that no person made is named by its SetBy alone.
 */
export const hopDescription = (hop: BlameOrigin): { text: string; date?: string } => {
  const what = hop.SetBy || hop.Source;
  const person = hopPerson(hop);
  const parts = [person ? (what ? `${person} with ${what}` : person) : what || 'a change'];
  if (hop.ChangeOrders?.length) parts.push(`ChangeOrder ${hop.ChangeOrders[0]}`);
  if (hop.RevisionNum !== undefined) parts.push(`Revision ${hop.RevisionNum}`);
  const date = hop.When ? SHORT_DATE.format(new Date(hop.When)) : undefined;
  return { text: parts.join(', '), date };
};
