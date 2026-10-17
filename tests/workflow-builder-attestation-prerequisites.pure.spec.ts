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

// ---------------------------------------------------------------------------
// Editing them: the builder declares, renames and removes attestation
// prerequisites, so what it sends has to be what the server accepts, and what
// it refuses has to be refused at the keystroke rather than at the save.
// ---------------------------------------------------------------------------

import { applySaved } from '../src/pages/x/workflow-builder/api/mapping';
import {
  attestationById,
  isValidMaxAge,
  renameGate,
} from '../src/pages/x/workflow-builder/model';

test('a declaration carries a client-side id, which never reaches the wire', () => {
  const { workflow, identity } = fromWire(wire());

  expect(workflow.attestations.map((a) => a.id)).toEqual(['a0']);
  const sent = toWire(workflow, identity);
  expect(sent.AttestationPrerequisites?.[0]).not.toHaveProperty('id');
});

test('fields left at the server’s defaults are omitted rather than sent as their zero', () => {
  const { workflow, identity } = fromWire(wire({ AttestationPrerequisites: [] }));
  workflow.attestations.push({
    id: 'a5',
    Name: 'approved',
    Type: '',
    Count: 0,
    FromUserIDs: [],
    FromGroupIDs: [],
    DistinctGroups: false,
    AllowAuthors: false,
    MaxAge: '',
    IgnoreFail: false,
    Description: '',
  });

  const sent = toWire(workflow, identity).AttestationPrerequisites?.[0];
  expect(sent).toEqual({ Name: 'approved' });
});

test('a save keeps the ids the draft had, so an open editor does not remount', () => {
  const { workflow } = fromWire(wire({ AttestationPrerequisites: [] }));
  workflow.attestations.push({ id: 'a27', Name: 'approved' });
  const saved = wire({ AttestationPrerequisites: [{ Name: 'approved' }] });

  expect(applySaved(workflow, saved).workflow.attestations[0].id).toBe('a27');
});

test('a rename follows the name into entry gates, release gates and Complete', () => {
  const { workflow } = fromWire(
    wire({ Final: { Prerequisites: ['release-approval'] } }),
  );
  const a = attestationById(workflow, 'a0')!;

  renameGate(workflow, a.Name, 'prod-approval');
  a.Name = 'prod-approval';

  expect(workflow.stages[1].prereqs).toEqual(['Released', 'Healthy', 'prod-approval']);
  expect(workflow.stages[1].releasePrereqs).toEqual(['prod-approval']);
  expect(workflow.final.prereqs).toEqual(['prod-approval']);
  expect(definitionFaults(workflow).filter((p) => p.sev === 'problem')).toEqual([]);
});

test('a maximum age is a positive Go duration', () => {
  for (const ok of ['72h', '1h30m', '90m', '1.5h', '30s', '500ms']) expect(isValidMaxAge(ok)).toBe(true);
  for (const bad of ['', '0h', '0', '72', '3 days', '-1h', '1d', '1w']) expect(isValidMaxAge(bad)).toBe(false);
});

test('what the server would refuse is a problem at the keystroke, and goes to the declaration', () => {
  const { workflow } = fromWire(
    wire({
      Stages: [{ Name: 'production', Prerequisites: ['release-approval'] }],
      Final: {},
      AttestationPrerequisites: [
        RELEASE_APPROVAL,
        { Name: '' },
        { Name: 'release-approval' },
        { Name: 'Released' },
        { Name: 'odd-type', Type: '-Approval' },
        { Name: 'too-many', Count: 101 },
        { Name: 'no-groups', DistinctGroups: true },
        { Name: 'by-slug', FromGroupIDs: ['sre'] },
        { Name: 'stale', MaxAge: 'three days' },
      ],
    }),
  );

  const faults = definitionFaults(workflow).filter((p) => p.sev === 'problem');
  expect(faults.map((p) => messageText(p.msg))).toEqual([
    'An attestation prerequisite has no name.',
    'Two attestation prerequisites are named release-approval.',
    'Released shadows a built-in gate, which would leave its meaning depending on which was consulted.',
    "Attestation prerequisite odd-type has a Type of -Approval, and a Type is at most 63 characters of letters, digits, '-', '_' and '.', beginning and ending with a letter or digit.",
    'Attestation prerequisite too-many asks for 101 attesters, and a count is between 1 and 100.',
    'Attestation prerequisite no-groups requires an attester from each Group but names no Groups to draw them from.',
    'Attestation prerequisite by-slug names a Group by something other than its ID.',
    'Attestation prerequisite stale has a maximum age of three days, and a maximum age is a positive duration such as 72h.',
  ]);
  // Every one of them can be gone to: the declaration opens in the column.
  expect(faults.map((p) => p.go)).toEqual([
    { kind: 'attestation', id: 'a1' },
    { kind: 'attestation', id: 'a2' },
    { kind: 'attestation', id: 'a3' },
    { kind: 'attestation', id: 'a4' },
    { kind: 'attestation', id: 'a5' },
    { kind: 'attestation', id: 'a6' },
    { kind: 'attestation', id: 'a7' },
    { kind: 'attestation', id: 'a8' },
  ]);
});

test('a well-formed declaration with every field set is no fault', () => {
  const { workflow } = fromWire(
    wire({
      AttestationPrerequisites: [
        {
          Name: 'release-approval',
          Type: 'Security.Review-2',
          Count: 2,
          FromUserIDs: [REVIEWER_A],
          FromGroupIDs: ['00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000bb'],
          DistinctGroups: true,
          AllowAuthors: true,
          MaxAge: '72h',
          IgnoreFail: true,
          Description: 'Two teams sign off.',
        },
      ],
    }),
  );

  expect(definitionFaults(workflow).filter((p) => p.sev === 'problem')).toEqual([]);
});
