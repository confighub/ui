// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The workflow builder and a workflow's attestation prerequisites, without a
// page: what it reads and sends back, which names it accepts, and how it says
// what a requirement asks for.
//
// The builder does not edit an attestation prerequisite's fields, but it saves
// the whole workflow, so one it dropped on the way through would be deleted by
// the next save -- along with the approvals the workflow requires.

import { expect, test } from '@playwright/test';

import type { ChangeWorkflowAttestationPrerequisite, ChangeWorkflowRead } from '@confighub/rtk-query';

import { fromWire, toWire } from '../src/pages/x/workflow-builder/api/mapping';
import {
  attestationSummary,
  definitionFaults,
  isKnownGate,
  messageText,
} from '../src/pages/x/workflow-builder/model';

const REVIEWER_A = '00000000-0000-4000-8000-00000000000a';
const REVIEWER_B = '00000000-0000-4000-8000-00000000000b';

const RELEASE_APPROVAL: ChangeWorkflowAttestationPrerequisite = {
  Name: 'release-approval',
  FromUserIDs: [REVIEWER_A, REVIEWER_B],
  AllowAuthors: true,
  Description: 'Approval before promotion to and release of production.',
};

function wire(overrides: Partial<ChangeWorkflowRead> = {}): ChangeWorkflowRead {
  return {
    ChangeWorkflowID: '00000000-0000-4000-8000-000000000001',
    SpaceID: '00000000-0000-4000-8000-000000000002',
    Slug: 'app-workflow',
    Version: 10,
    Stages: [
      { Name: 'staging', WhereSpace: "Labels.Stage = 'staging'" },
      {
        Name: 'production',
        WhereSpace: "Labels.Stage = 'production'",
        Prerequisites: ['Released', 'Healthy', 'release-approval'],
        ReleasePrerequisites: ['release-approval'],
      },
    ],
    Final: { Prerequisites: ['Released', 'Healthy'] },
    AttestationPrerequisites: [RELEASE_APPROVAL],
    ...overrides,
  } as ChangeWorkflowRead;
}

const names: Record<string, string> = { [REVIEWER_A]: 'Reviewer A', [REVIEWER_B]: 'Reviewer B' };
const nameOf = (id: string) => names[id] ?? id.slice(0, 8);

test('a save sends the attestation prerequisites and release gates back as read', () => {
  const { workflow, identity } = fromWire(wire());
  const sent = toWire(workflow, identity);

  expect(sent.AttestationPrerequisites).toEqual([RELEASE_APPROVAL]);
  expect(sent.Stages?.[1].Prerequisites).toEqual(['Released', 'Healthy', 'release-approval']);
  expect(sent.Stages?.[1].ReleasePrerequisites).toEqual(['release-approval']);
  // A Stage with no release gates sends none, rather than an empty list.
  expect(sent.Stages?.[0].ReleasePrerequisites).toBeUndefined();
});

test('an attestation prerequisite is a declared name, so naming it is no fault', () => {
  const { workflow } = fromWire(wire());

  expect(isKnownGate(workflow, 'release-approval')).toBe(true);
  expect(definitionFaults(workflow).filter((p) => p.sev === 'problem')).toEqual([]);
});

test('a release gate naming no attestation prerequisite is a fault', () => {
  const { workflow } = fromWire(
    wire({
      Stages: [{ Name: 'production', ReleasePrerequisites: ['Released'] }],
      AttestationPrerequisites: [],
    }),
  );

  const faults = definitionFaults(workflow).filter((p) => p.sev === 'problem');
  expect(faults.map((p) => messageText(p.msg))).toEqual([
    'Stage production requires Released of its Releases, which no attestation prerequisite declares.',
  ]);
});

test('a custom prerequisite may not take an attestation prerequisite’s name', () => {
  const { workflow } = fromWire(
    wire({ CustomPrerequisites: [{ Name: 'release-approval', Expression: 'cel:true' }] }),
  );

  const faults = definitionFaults(workflow).filter((p) => p.sev === 'problem');
  expect(faults.map((p) => messageText(p.msg))).toEqual([
    'A custom prerequisite and an attestation prerequisite are both named release-approval.',
  ]);
});

test('an attestation prerequisite nothing names is a note', () => {
  const { workflow } = fromWire(
    wire({ Stages: [{ Name: 'production' }], Final: {} }),
  );

  const notes = definitionFaults(workflow).filter((p) => p.sev === 'note');
  expect(notes.map((p) => messageText(p.msg))).toEqual([
    "Attestation prerequisite release-approval is named by no Stage, no Stage's Releases and not by Complete, so it gates nothing.",
  ]);
});

test('the summary says what is required, with the server’s defaults', () => {
  expect(attestationSummary(RELEASE_APPROVAL, nameOf)).toBe(
    '1 Approval from Reviewer A or Reviewer B on each Revision. Authors of the change count.',
  );
  expect(attestationSummary({ Name: 'two', Count: 2, MaxAge: '72h' }, nameOf)).toBe(
    '2 Approvals from anyone who may attest in the Space on each Revision. Authors of the change do not count. No older than 72h.',
  );
  expect(
    attestationSummary(
      { Name: 'sec', Type: 'SecurityReview', FromGroupIDs: ['g1', 'g2'], DistinctGroups: true, IgnoreFail: true },
      nameOf,
    ),
  ).toBe(
    'One SecurityReview from a member of each of 2 groups on each Revision. Authors of the change do not count. A Fail does not block.',
  );
});
