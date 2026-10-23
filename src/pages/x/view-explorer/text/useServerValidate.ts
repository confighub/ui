// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useListAllResourcesQuery, useListAllUnitsQuery, useListSpacesQuery } from '@confighub/rtk-query';

import { getApiErrorMessage } from '@/utility/error-functions';

import type { EntityKind } from '../model/types';

/**
 * The server's check of a filter text mode is about to apply. The client
 * parser checks the grammar; only the server knows which attribute names an
 * entity has, so text mode asks it with a one-row list call
 * (`limit=1`, ids only): a 400 means the filter is wrong, and its message says
 * why. RTK Query caches each check by its arguments, so going back to a text
 * that was already checked asks nothing.
 *
 * WhereData and ResourceType are sent for Units, but a one-row list does not
 * refuse a bad one, so they are only as checked as the client makes them.
 */

export interface ServerValidateRequest {
  where: string;
  whereData?: string;
  resourceType?: string;
}

export type ServerCheck =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | {
      status: 'invalid';
      message: string;
      /** The name the server quoted (`unrecognized attribute name \`bogus\``), to underline it. */
      attribute?: string;
    };

const SKIP = { skip: true } as const;

/** The name a server message quotes in backticks, if any. */
export function quotedAttribute(message: string): string | undefined {
  return /`([^`]+)`/.exec(message)?.[1];
}

/** Check `request` with the server; `null` checks nothing. */
export function useServerValidate(
  entity: EntityKind,
  request: ServerValidateRequest | null,
): ServerCheck {
  const where = request?.where.trim() || undefined;
  const unitArgs = {
    where,
    whereData: request?.whereData?.trim() || undefined,
    resourceType: request?.resourceType?.trim() || undefined,
    select: 'UnitID',
    include: '',
    limit: 1,
  };
  const units = useListAllUnitsQuery(unitArgs, entity === 'Unit' && request ? undefined : SKIP);
  const spaces = useListSpacesQuery(
    { where, select: 'SpaceID', limit: 1 },
    entity === 'Space' && request ? undefined : SKIP,
  );
  const resources = useListAllResourcesQuery(
    { where, select: 'ResourceID', limit: 1 },
    entity === 'Resource' && request ? undefined : SKIP,
  );

  if (!request) return { status: 'idle' };
  const q = entity === 'Unit' ? units : entity === 'Space' ? spaces : resources;
  if (q.isFetching) return { status: 'checking' };
  if (q.isError) {
    const message = getApiErrorMessage(q.error, 'ConfigHub could not read this filter.').trim();
    return { status: 'invalid', message, attribute: quotedAttribute(message) };
  }
  if (q.isSuccess) return { status: 'ok' };
  return { status: 'checking' };
}
