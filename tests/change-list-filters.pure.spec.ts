// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The ChangeSets and ChangeOrders lists' filters: annotation and label filters read from and
// written to a where expression, the Validation page's link to the changes made for a Trigger,
// and the counts the No approvals cards filter by. No page and no server.

import { expect, test } from '@playwright/test';

import type { AttestationRead, ChangeSetRead, ExtendedRevisionRead } from '@confighub/rtk-query';

import { buildWhereClauses } from '../src/components/query-builder/where-clause-builder';
import { getAvailableFieldsForEntity } from '../src/components/query-builder/operators';
import { parseWhereClausesToFilters } from '../src/components/query-builder/where-clause-parser';
import { approvalsByChangeOrder } from '../src/pages/change-orders/changeOrderApprovals';
import { approvalsByChangeSet, hasChangeToApprove } from '../src/pages/change-sets/changeSetApprovals';
import { triggerChangesWhere } from '../src/pages/initiatives/validationLinks';
import { isBotUser } from '../src/utility/bot-users';

const CHANGE_SET_FIELDS = getAvailableFieldsForEntity('ChangeSet');

const parse = (where: string) => parseWhereClausesToFilters(where, '', '', [], undefined, CHANGE_SET_FIELDS);

test.describe('annotation and label filters', () => {
  for (const [where, field, operator, labelKey, value] of [
    ["Annotations.Trigger = 'confighub-system/workload-readonly-root-filesystem'", 'annotations', 'equals', 'Trigger', 'confighub-system/workload-readonly-root-filesystem'],
    ["Annotations.Trigger != 'a/b'", 'annotations', 'notEquals', 'Trigger', 'a/b'],
    ['Annotations.Trigger IS NOT NULL', 'annotations', 'exists', 'Trigger', ''],
    ["Labels.app.kubernetes.io/name = 'web'", 'labels', 'equals', 'app.kubernetes.io/name', 'web'],
    ["Labels.team ILIKE '%pay%'", 'labels', 'contains', 'team', 'pay'],
  ] as const) {
    test(`${where} reads as one ${field} filter and writes back unchanged`, () => {
      const filters = parse(where);
      expect(filters).toHaveLength(1);
      expect(filters[0]).toMatchObject({ field, operator, labelKey, value });
      expect(buildWhereClauses(filters).where).toBe(where);
    });
  }

  test('a label and an annotation filter combine', () => {
    const where = "Labels.tier = 'prod' AND Annotations.Trigger = 'sys/rule'";
    const filters = parse(where);
    expect(filters.map((f) => f.field)).toEqual(['labels', 'annotations']);
    expect(buildWhereClauses(filters).where).toBe(where);
  });

  test('the ChangeSets and ChangeOrders lists offer the annotations filter', () => {
    expect(CHANGE_SET_FIELDS).toContain('annotations');
    expect(getAvailableFieldsForEntity('ChangeOrder')).toContain('annotations');
  });

  test('the Validation page names a Trigger\'s changes by the filter the lists read back', () => {
    const where = triggerChangesWhere('confighub-system', 'workload-readonly-root-filesystem');
    expect(where).toBe("Annotations.Trigger = 'confighub-system/workload-readonly-root-filesystem'");
    expect(parse(where)[0]).toMatchObject({ field: 'annotations', labelKey: 'Trigger' });
  });
});

function attestation(id: string, fields: Partial<AttestationRead> = {}): AttestationRead {
  return { AttestationID: id, UserID: 'u-1', CreatedAt: '2026-11-13T10:00:00Z', Result: 'Pass', Note: '', Type: 'Approval', SpaceID: 's', ...fields } as AttestationRead;
}

function revision(changeSetId: string, unitId: string, num: number, attestations: AttestationRead[] = []): ExtendedRevisionRead {
  return {
    Revision: { RevisionID: `${changeSetId}-${unitId}-r${num}`, UnitID: unitId, RevisionNum: num, UserID: 'u-author', SpaceID: 's', ChangeSetID: changeSetId },
    Attestations: attestations,
  } as ExtendedRevisionRead;
}

test.describe('ChangeSet approvals', () => {
  test('each ChangeSet counts the live approvals of its own change', () => {
    const counts = approvalsByChangeSet(
      ['approved', 'unreviewed', 'rejected', 'revoked', 'none-read'],
      [
        revision('approved', 'web', 2, [attestation('a1')]),
        revision('unreviewed', 'web', 4),
        revision('rejected', 'api', 1, [attestation('f1', { Result: 'Fail' })]),
        revision('revoked', 'db', 1, [attestation('r1')]),
      ],
      [attestation('x1', { RevokedAttestationID: 'r1' })],
    );
    expect(Object.fromEntries(counts)).toEqual({ approved: 1, unreviewed: 0, rejected: 0, revoked: 0, 'none-read': 0 });
  });

  test('an approval of an earlier Revision does not approve the change as it stands', () => {
    const counts = approvalsByChangeSet(['cs'], [revision('cs', 'web', 1, [attestation('old')]), revision('cs', 'web', 2)], []);
    expect(counts.get('cs')).toBe(0);
  });

  test('a ChangeSet open, or closed in the last 30 days, has a change still to review', () => {
    const now = Date.parse('2026-11-14T00:00:00Z');
    expect(hasChangeToApprove({ State: 'Open' } as ChangeSetRead, now)).toBe(true);
    expect(hasChangeToApprove({ State: 'Closed', UpdatedAt: '2026-11-01T00:00:00Z' } as ChangeSetRead, now)).toBe(true);
    // Closed longer ago is history, and one that is New has changed nothing.
    expect(hasChangeToApprove({ State: 'Closed', UpdatedAt: '2026-09-01T00:00:00Z' } as ChangeSetRead, now)).toBe(false);
    expect(hasChangeToApprove({ State: 'Closed' } as ChangeSetRead, now)).toBe(false);
    expect(hasChangeToApprove({ State: 'New' } as ChangeSetRead, now)).toBe(false);
  });
});

test.describe('ChangeOrder approvals', () => {
  test('each ChangeOrder counts its passed Approvals that stand', () => {
    const counts = approvalsByChangeOrder(
      ['co-1', 'co-2', 'co-3'],
      [
        attestation('a1', { ChangeOrderID: 'co-1' }),
        attestation('a2', { ChangeOrderID: 'co-1' }),
        attestation('f1', { ChangeOrderID: 'co-2', Result: 'Fail' }),
        attestation('r1', { ChangeOrderID: 'co-3' }),
        // A record that revokes another is not an approval of its own.
        attestation('x1', { ChangeOrderID: 'co-3', RevokedAttestationID: 'r1' }),
        attestation('other', { ChangeOrderID: 'co-elsewhere' }),
      ],
      [attestation('x1', { RevokedAttestationID: 'r1' })],
    );
    expect(Object.fromEntries(counts)).toEqual({ 'co-1': 2, 'co-2': 0, 'co-3': 0 });
  });
});

test.describe('bot users', () => {
  test('a ServiceAccount\'s User and a removed worker\'s are bots; a person is not', () => {
    expect(isBotUser({ ExternalID: 'confighub:serviceaccount:0f4e' })).toBe(true);
    expect(isBotUser({ ExternalID: 'confighub:worker:abc:org' })).toBe(true);
    expect(isBotUser({ ExternalID: 'kc|1234' })).toBe(false);
    expect(isBotUser({})).toBe(false);
    expect(isBotUser(undefined)).toBe(false);
  });
});
