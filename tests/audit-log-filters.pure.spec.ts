// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Audit log's filters: the where expression they make, and the page address they are kept
// in. No page and no server.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

import {
  ACTION_GROUPS,
  type AuditLogFilters,
  EMPTY_FILTERS,
  buildAuditWhere,
  clearFilters,
  filtersFromParams,
  filtersToParams,
  hasFilters,
} from '../src/pages/audit-log/auditLogFilters';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const USER = '6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f';
const UNIT = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const where = (filters: Partial<AuditLogFilters>) =>
  buildAuditWhere({ ...EMPTY_FILTERS, ...filters }, NOW);

test.describe('the where expression', () => {
  test('the default is the last 7 days, written as cub audit list --since writes it', () => {
    expect(where({})).toEqual({
      where: "OccurredAt >= '2026-11-17T12:00:00.000Z'",
      rejected: [],
    });
  });

  test('each relative range counts back from now', () => {
    expect(where({ time: '1h' }).where).toBe("OccurredAt >= '2026-11-24T11:00:00.000Z'");
    expect(where({ time: '24h' }).where).toBe("OccurredAt >= '2026-11-23T12:00:00.000Z'");
    expect(where({ time: '30d' }).where).toBe("OccurredAt >= '2026-10-25T12:00:00.000Z'");
  });

  test('a custom range runs from the start of From to the end of To, in local time', () => {
    const since = new Date(2026, 10, 17).toISOString();
    const until = new Date(2026, 10, 25).toISOString();
    expect(where({ time: 'custom', from: '2026-11-17', to: '2026-11-24' }).where).toBe(
      `OccurredAt >= '${since}' AND OccurredAt < '${until}'`,
    );
    expect(where({ time: 'custom', from: '', to: '' }).where).toBe('');
    expect(where({ time: 'custom', from: '2026-11-17', to: '' }).where).toBe(
      `OccurredAt >= '${since}'`,
    );
  });

  test('one value is =, several are IN, and duplicates are sent once', () => {
    expect(where({ time: 'custom', actions: ['Patch'] }).where).toBe("Action = 'Patch'");
    expect(
      where({
        time: 'custom',
        actions: ['Patch', 'Delete', 'Patch'],
        outcomes: ['Denied', 'Failed'],
      }).where,
    ).toBe("Action IN ('Patch', 'Delete') AND Outcome IN ('Denied', 'Failed')");
  });

  test('the subject is its type, then its ID; an ID with no type is not sent', () => {
    expect(where({ time: 'custom', subjectType: 'Unit' }).where).toBe(
      "SubjectEntityType = 'Unit'",
    );
    expect(where({ time: 'custom', subjectType: 'Unit', subjectId: UNIT }).where).toBe(
      `SubjectEntityType = 'Unit' AND SubjectEntityID = '${UNIT}'`,
    );
    expect(where({ time: 'custom', subjectId: UNIT }).where).toBe('');
  });

  test('the actor is UserID, or OnBehalfOfUserID when "on behalf of" is chosen', () => {
    expect(where({ time: 'custom', actorId: USER }).where).toBe(`UserID = '${USER}'`);
    expect(where({ time: 'custom', actorId: USER, onBehalfOf: true }).where).toBe(
      `OnBehalfOfUserID = '${USER}'`,
    );
    expect(where({ time: 'custom', onBehalfOf: true }).where).toBe('');
  });

  test('a request is its RequestID', () => {
    expect(where({ time: 'custom', requestId: 'req-8c41e2f07d' }).where).toBe(
      "RequestID = 'req-8c41e2f07d'",
    );
  });

  test('all filters together are joined with AND, the only operator the grammar has', () => {
    const result = where({
      actions: ['Delete'],
      outcomes: ['Denied'],
      subjectType: 'Unit',
      subjectId: UNIT,
      actorId: USER,
      requestId: 'r1',
    });
    expect(result.where).toBe(
      "OccurredAt >= '2026-11-17T12:00:00.000Z' AND Action = 'Delete' AND Outcome = 'Denied' AND " +
        `SubjectEntityType = 'Unit' AND SubjectEntityID = '${UNIT}' AND UserID = '${USER}' AND RequestID = 'r1'`,
    );
    expect(result.where).not.toContain(' OR ');
  });

  test('a value a string literal cannot hold is reported, never sent', () => {
    for (const bad of ["x' OR 1=1 --", 'say "hi"', 'back\\slash', 'line\nbreak']) {
      const result = where({ time: 'custom', requestId: bad, actions: [bad] });
      expect(result.where).toBe('');
      expect(result.rejected.sort()).toEqual(['Action', 'Request']);
    }
  });

  test('an ID that is not a UUID is reported, never sent', () => {
    expect(where({ time: 'custom', actorId: 'not-a-uuid' })).toEqual({
      where: '',
      rejected: ['Actor'],
    });
    expect(where({ time: 'custom', subjectType: 'Unit', subjectId: "' OR ''='" })).toEqual({
      where: "SubjectEntityType = 'Unit'",
      rejected: ['Subject'],
    });
  });
});

test.describe('the page address', () => {
  test('the bare address is the default view', () => {
    expect(filtersFromParams(new URLSearchParams())).toEqual(EMPTY_FILTERS);
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe('');
  });

  test('every filter survives a round trip, and other parameters are kept', () => {
    const filters: AuditLogFilters = {
      time: 'custom',
      from: '2026-11-01',
      to: '2026-11-24',
      actions: ['Patch', 'Delete'],
      outcomes: ['Denied'],
      subjectType: 'Unit',
      subjectId: UNIT,
      actorId: USER,
      onBehalfOf: true,
      requestId: 'r1',
    };
    const params = filtersToParams(filters, new URLSearchParams('org=acme'));
    expect(params.get('org')).toBe('acme');
    expect(filtersFromParams(params)).toEqual(filters);
  });

  test('a value the page does not know falls back to the default', () => {
    expect(filtersFromParams(new URLSearchParams('time=forever&from=yesterday')).time).toBe(
      '7d',
    );
    expect(filtersFromParams(new URLSearchParams('time=custom&from=yesterday')).from).toBe('');
  });

  test('a subject with no type, and "on behalf of" with no actor, are not written', () => {
    const params = filtersToParams({ ...EMPTY_FILTERS, subjectId: UNIT, onBehalfOf: true });
    expect(params.toString()).toBe('');
  });

  test('Clear filters keeps the time range', () => {
    const filters: AuditLogFilters = {
      ...EMPTY_FILTERS,
      time: '24h',
      actions: ['Patch'],
      requestId: 'r1',
    };
    expect(hasFilters(filters)).toBe(true);
    expect(clearFilters(filters)).toEqual({ ...EMPTY_FILTERS, time: '24h' });
    expect(hasFilters(clearFilters(filters))).toBe(false);
  });
});

test('the Action filter offers every Action the server records', () => {
  const spec = JSON.parse(
    readFileSync(
      fileURLToPath(new URL('../../public/core/openapi/openapi.json', import.meta.url)),
      'utf8',
    ),
  ) as {
    components: {
      schemas: { AuditEvent: { properties: { Action: { description: string } } } };
    };
  };
  const description = spec.components.schemas.AuditEvent.properties.Action.description;
  const served = description
    .replace(/^The verb, as a code: /, '')
    .split('.')[0]
    .split(', ');
  const offered = ACTION_GROUPS.flatMap((group) => group.actions);
  expect([...offered].sort()).toEqual([...served].sort());
});
