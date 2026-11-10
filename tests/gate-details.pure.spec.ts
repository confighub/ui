// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The Gates tab of the Component side pane: how gates, counts, fixes and Blame origins are
// derived, without a server.
import type { UnitBlame, UnitRead } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { fixKindOf } from '../src/pages/x/apps/gates/gateFixKinds';
import {
  blockingFindingCount,
  buildGates,
  gateAfterSave,
} from '../src/pages/x/apps/gates/gateModel';
import {
  blameFieldsForFinding,
  hopDescription,
  originForFinding,
} from '../src/pages/x/apps/gates/gateOrigin';
import { NO_DESCRIPTION, gateRuleText, ruleParts } from '../src/pages/x/apps/gates/gateRule';
import {
  duplicateEntryPath,
  fixInvocations,
  oneResourceFilter,
  quotedYaml,
  releasedYaml,
  triggerRunOutcome,
  typedValueProblem,
  writeOutcome,
} from '../src/pages/x/apps/gates/gateWrites';
import {
  elsewhereSentence,
  sameFindingElsewhere,
  sentenceText,
} from '../src/pages/x/apps/gates/sameFindingElsewhere';

const RESOURCE = {
  ResourceName: 'confighubplaceholder/mydep',
  ResourceNameWithoutScope: 'mydep',
  ResourceType: 'apps/v1/Deployment',
};
const PLACEHOLDERS = 'fanimg1700-dev/no-placeholders/vet-placeholders';
const REPLICAS = 'fanimg1700-dev/max-two-replicas/vet-celexpr';
const POD_SECURITY = 'fanimg1700-dev/pod-security-advice/vet-pod-security-standard';

const unit = (overrides: Partial<UnitRead> = {}): UnitRead =>
  ({
    UnitID: 'u-dev',
    SpaceID: 's-dev',
    Slug: 'web',
    HeadRevisionNum: 2,
    ToolchainType: 'Kubernetes/YAML',
    ValidationErrors: { [REPLICAS]: true, [PLACEHOLDERS]: true },
    ValidationWarnings: { [POD_SECURITY]: true },
    ValidationResults: {
      [REPLICAS]: [
        {
          Passed: false,
          Index: 1,
          FunctionName: 'vet-celexpr',
          Details: ['resource mydep failed validation expression'],
        },
      ],
      [PLACEHOLDERS]: [
        {
          Passed: false,
          Index: 0,
          FunctionName: 'vet-placeholders',
          FailedAttributes: [
            {
              ...RESOURCE,
              Path: 'metadata.namespace',
              AttributeName: 'resource-name',
              DataType: 'string',
              Value: 'confighubplaceholder',
            },
            {
              ...RESOURCE,
              Path: 'spec.template.spec.volumes.0.configMap.name',
              AttributeName: 'resource-name',
              DataType: 'string',
              Value: 'confighubplaceholder',
            },
          ],
        },
      ],
      [POD_SECURITY]: [
        {
          Passed: false,
          Index: 0,
          FunctionName: 'vet-pod-security-standard',
          FailedAttributes: [
            { ...RESOURCE, Path: 'spec.template.spec', AttributeName: 'none', Value: '' },
          ],
        },
      ],
    },
    ...overrides,
  }) as UnitRead;

test('gates with a field to fix in place come first, and warnings are apart', () => {
  const { gates, warnings } = buildGates([unit()], []);
  expect(gates.map((g) => g.gateName)).toEqual([PLACEHOLDERS, REPLICAS]);
  expect(warnings.map((g) => g.gateName)).toEqual([POD_SECURITY]);
});

test('the tab count is one per failed field plus one per check that names no field, never a warning', () => {
  const { gates } = buildGates([unit()], []);
  expect(blockingFindingCount(gates)).toBe(3);
});

test('awaiting/triggers is not a gate', () => {
  const { gates } = buildGates(
    [unit({ ValidationErrors: { 'awaiting/triggers': true } })],
    [],
  );
  expect(gates).toEqual([]);
});

test('each finding type gets its fix', () => {
  expect(fixKindOf('vet-placeholders', 'resource-name', 'metadata.namespace', undefined)).toBe(
    'set',
  );
  // A missing namespace is typed in, at the path vet-namespace names.
  expect(
    fixKindOf(
      'vet-namespace',
      'namespace-name-reference',
      'metadata.namespace',
      undefined,
      'string',
    ),
  ).toBe('set');
  expect(
    fixKindOf('vet-pod-security-standard', 'none', 'spec.template.spec', undefined, ''),
  ).toBe('message');
  // vet-placeholders names a placeholder on any path "none", with its type: it is set as usual.
  expect(
    fixKindOf('vet-placeholders', 'none', 'metadata.annotations.owner', undefined, 'string'),
  ).toBe('set');
  expect(fixKindOf('vet-immutable', 'immutable', 'spec.selector', undefined)).toBe('restore');
  expect(fixKindOf('vet-disruption', 'disruption-medium', 'spec.x', undefined)).toBe('undo');
  expect(
    fixKindOf('vet-merge-keys', 'none', 'spec.template.spec.containers.2.name', undefined),
  ).toBe('duplicate');
  expect(fixKindOf('vet-format', 'none', 'a.b', 'no-truthy')).toBe('quote');
  expect(fixKindOf('vet-format', 'none', 'a.b', 'no-octal-values')).toBe('quote');
  expect(fixKindOf('vet-format', 'none', 'a.b', 'no-empty-values')).toBe('null');
  expect(fixKindOf('vet-format', 'none', 'a.b', 'no-duplicate-keys')).toBe('duplicate-key');
  expect(fixKindOf('vet-jsonschema', 'none', 'servers.0.search_base_dns', undefined)).toBe(
    'schema',
  );
  // Paths set-attributes cannot write: a leading dot (vet-schemas), a #uri suffix (vet-values).
  expect(fixKindOf('vet-schemas', 'none', '.spec.replicas', undefined)).toBe('message');
  expect(fixKindOf('vet-values', 'x', 'metadata.annotations.a#uri', undefined)).toBe(
    'message',
  );
});

test('all fixes of a Unit are one request: one set-attributes, then a delete-path per removed entry', () => {
  const { gates } = buildGates([unit()], []);
  const [ns, volume] = gates[0].fields;
  const staged = new Map([
    [ns.key, { op: 'set' as const, value: 'web-dev' }],
    [volume.key, { op: 'yaml' as const, value: quotedYaml('yes'), label: 'quote' }],
  ]);
  const removed = { ...ns, key: 'k3', path: 'spec.template.spec.containers.1.name' };
  staged.set(removed.key, { op: 'delete' as const } as never);
  const invocations = fixInvocations([ns, volume, removed], staged);
  expect(invocations.map((i) => i.FunctionName)).toEqual(['set-attributes', 'delete-path']);
  const list = JSON.parse(String(invocations[0].Arguments?.[0].Value));
  expect(list).toEqual([
    expect.objectContaining({
      Path: 'metadata.namespace',
      DataType: 'string',
      Value: 'web-dev',
      ResourceName: RESOURCE.ResourceName,
    }),
    // "Quote it" writes YAML: DataType string leaves `yes` unquoted.
    expect.objectContaining({ DataType: 'YAML', Value: '"yes"' }),
  ]);
  expect(invocations[1].Arguments).toEqual([
    { ParameterName: 'resource-type', Value: 'apps/v1/Deployment' },
    { ParameterName: 'path', Value: 'spec.template.spec.containers.1' },
  ]);
  // delete-path takes only a type and a path: it is limited to the one resource of the finding.
  expect(invocations[1].WhereResource).toBe(
    "ConfigHub.ResourceType = 'apps/v1/Deployment' AND ConfigHub.ResourceName = 'confighubplaceholder/mydep'",
  );
  expect(duplicateEntryPath('spec.template.spec.containers.2.name')).toBe(
    'spec.template.spec.containers.2',
  );
});

const chain = (unitID: string, space: string) => [
  {
    SpaceSlug: 'fanimg1700-dev',
    UnitSlug: 'web',
    UnitID: 'u-dev',
    RevisionNum: 2,
    SetBy: 'merge from fanimg1700-base/web',
    Source: 'CloneUnit',
  },
  {
    SpaceSlug: space,
    UnitSlug: 'web',
    UnitID: unitID,
    RevisionNum: 2,
    SetBy: 'test-data/deployment.yaml',
    Source: 'MergeExternal',
  },
];

const BLAME: UnitBlame[] = [
  {
    UnitID: 'u-dev',
    SpaceID: 's-dev',
    Fields: [
      {
        ...RESOURCE,
        UnitID: 'u-dev',
        SpaceSlug: 'fanimg1700-dev',
        UnitSlug: 'web',
        Path: 'spec.template.spec.volumes.?name=config-volume.configMap.name',
        Chain: chain('u-base', 'fanimg1700-base'),
        Validation: [
          {
            Gate: PLACEHOLDERS,
            Function: 'vet-placeholders',
            Path: 'spec.template.spec.volumes.0.configMap.name',
          },
        ],
      },
    ],
  },
  {
    UnitID: 'u-base',
    SpaceID: 's-base',
    Fields: [
      {
        ...RESOURCE,
        UnitID: 'u-base',
        SpaceSlug: 'fanimg1700-base',
        UnitSlug: 'web',
        Path: 'spec.template.spec.volumes.?name=config-volume.configMap.name',
        Chain: [chain('u-base', 'fanimg1700-base')[1]],
        Validation: [
          {
            Gate: 'fanimg1700-base/no-placeholders/vet-placeholders',
            Function: 'vet-placeholders',
            Path: 'spec.template.spec.volumes.0.configMap.name',
          },
        ],
      },
    ],
  },
];

test('a row takes the Blame field the server placed its finding on, and its origin upstream', () => {
  const { gates } = buildGates([unit()], []);
  const volume = gates[0].fields[1];
  const fields = blameFieldsForFinding(BLAME, volume, PLACEHOLDERS);
  expect(fields).toHaveLength(1);
  const origin = originForFinding(fields);
  expect(origin?.upstream).toBe(true);
  expect(origin?.from.SpaceSlug).toBe('fanimg1700-base');
  // The namespace row has no Blame field: "No record".
  expect(blameFieldsForFinding(BLAME, gates[0].fields[0], PLACEHOLDERS)).toEqual([]);
});

test('the same finding on its source is named, and the fix there clears both', () => {
  const found = sameFindingElsewhere(
    BLAME,
    { unitId: 'u-dev', label: 'fanimg1700-dev/web' },
    'vet-placeholders',
    ['spec.template.spec.volumes.0.configMap.name'],
    'u-base',
    { spaceId: 's-base', unitId: 'u-base', label: 'fanimg1700-base/web' },
    'fanimg1700-base',
  );
  expect(found?.units.map((u) => [u.label, u.relation])).toEqual([
    ['fanimg1700-base/web', 'set'],
    ['fanimg1700-dev/web', 'this'],
  ]);
  // The source is named as a Unit, so it can be a link to its configuration page.
  expect(elsewhereSentence(found!)).toContainEqual({
    unit: expect.objectContaining({ unitId: 'u-base', spaceId: 's-base' }),
  });
  expect(sentenceText(elsewhereSentence(found!))).toBe(
    'The same finding is on its source, fanimg1700-base/web, and on this Unit. A fix there clears both.',
  );
});

test('the Rule line says what the Trigger expects', () => {
  expect(
    ruleParts('vet-images', [
      { ParameterName: 'image-filter', Value: '{"AllowRegexp":"^ghcr\\\\.io/"}' },
    ]),
  ).toEqual([{ text: 'Allowed: values that match ' }, { code: '^ghcr\\.io/' }]);
  expect(
    ruleParts('vet-pod-security-standard', [{ ParameterName: 'level', Value: 'restricted' }]),
  ).toEqual([
    { text: 'Pod Security Standard, level ' },
    { code: 'restricted' },
    { text: ', version ' },
    { code: 'latest' },
  ]);
  expect(ruleParts('vet-namespace', [])).toEqual([
    { text: 'Every resource that is not cluster-scoped sets ' },
    { code: 'metadata.namespace' },
  ]);
  expect(ruleParts('some-other-function', [])).toEqual([]);
});

test('the Trigger Description leads a gate, and the regex of its Rule is only in details', () => {
  const rule = ruleParts('vet-images', [
    { ParameterName: 'image-filter', Value: '{"DenyRegexp":":v1\\\\.([0-9]|1[0-6])\\\\."}' },
  ]);
  expect(rule).toEqual([
    { text: 'Not allowed: values that match ' },
    { code: ':v1\\.([0-9]|1[0-6])\\.' },
  ]);
  const text = gateRuleText(
    'Prod runs cert-manager v1.17 or later. Set the image tag to v1.17.2.',
    rule,
  );
  expect(text).toEqual({
    lead: 'Prod runs cert-manager v1.17 or later. Set the image tag to v1.17.2.',
    noDescription: false,
    details: rule,
  });
});

test('a gate whose Trigger has no Description asks for one, and keeps its Rule in details', () => {
  const rule = ruleParts('vet-images', [
    { ParameterName: 'image-filter', Value: '{"DenyRegexp":":latest$"}' },
  ]);
  for (const description of [undefined, '', '  ']) {
    expect(gateRuleText(description, rule)).toEqual({
      lead: NO_DESCRIPTION,
      noDescription: true,
      details: rule,
    });
  }
  // A function with no Rule line has no details either.
  expect(gateRuleText(undefined, ruleParts('some-other-function', [])).details).toEqual([]);
});

test('the origin of a value names the person who set it, and the function they ran', () => {
  const hop = {
    SetBy: 'set-image-reference',
    Source: 'UpdateUnit',
    RevisionNum: 3,
    When: '2026-11-05T10:00:00Z',
  };
  expect(hopDescription({ ...hop, User: 'alice', UserID: 'u-alice' })).toEqual({
    text: 'alice with set-image-reference, Revision 3',
    date: '5 Nov',
  });
  // A change with no SetBy or Source still names the person.
  expect(hopDescription({ User: 'alice', RevisionNum: 3 }).text).toBe('alice, Revision 3');
});

test('the origin of a value that no person set names what set it', () => {
  // Triggers, Links and resolve run as no user, which the server names automation.
  expect(
    hopDescription({ SetBy: 'link base-to-prod', User: 'automation', RevisionNum: 4 }).text,
  ).toBe('link base-to-prod, Revision 4');
  expect(hopDescription({ SetBy: 'set-image-reference', RevisionNum: 3 }).text).toBe(
    'set-image-reference, Revision 3',
  );
  expect(hopDescription({ User: '' }).text).toBe('a change');
  // A server that cannot read a username sends the user's ID as the User: that names no one.
  const id = '3f1c9e2a-6b7d-4c1e-9a2b-0d4e5f6a7b8c';
  expect(
    hopDescription({ SetBy: 'set-image-reference', User: id, UserID: id, RevisionNum: 3 })
      .text,
  ).toBe('set-image-reference, Revision 3');
  expect(hopDescription({ SetBy: 'set-image-reference', User: id.toUpperCase() }).text).toBe(
    'set-image-reference',
  );
});

test('a block finding has one origin only when every leaf under it came from the same Unit', () => {
  const leaf = (path: string, unitID: string, space: string) => ({
    ...RESOURCE,
    UnitID: 'u-dev',
    SpaceSlug: 'fanimg1700-dev',
    UnitSlug: 'web',
    Path: path,
    Chain: chain(unitID, space),
    Validation: [
      {
        Gate: POD_SECURITY,
        Function: 'vet-pod-security-standard',
        Path: 'spec.template.spec',
      },
    ],
  });
  const fromBase = [
    leaf('spec.template.spec.containers.?name=nginx.name', 'u-base', 'fanimg1700-base'),
    leaf('spec.template.spec.dnsPolicy', 'u-base', 'fanimg1700-base'),
  ];
  expect(originForFinding(fromBase)?.from.SpaceSlug).toBe('fanimg1700-base');
  // One leaf was set in the Unit itself: no single origin, the row says the check names a block.
  const mixed = [
    ...fromBase,
    {
      ...leaf('spec.template.spec.containers.?name=nginx.image', 'u-dev', 'fanimg1700-dev'),
      Chain: [chain('u-dev', 'x')[0]],
    },
  ];
  expect(originForFinding(mixed)).toBeUndefined();
  expect(originForFinding([])).toBeUndefined();
});

test('a delete removes the entry in its own resource only, and several go from the last entry', () => {
  const { gates } = buildGates([unit()], []);
  const base = gates[0].fields[0];
  const entry = (resourceName: string, index: number) => ({
    ...base,
    key: `${resourceName}-${index}`,
    resourceName,
    path: `spec.template.spec.containers.${index}.name`,
  });
  const fields = [entry('ns/api', 1), entry('ns/api', 3), entry('ns/worker', 2)];
  const staged = new Map(fields.map((f) => [f.key, { op: 'delete' as const }]));
  const deletes = fixInvocations(fields, staged);
  expect(deletes.map((d) => [d.WhereResource, d.Arguments?.[1].Value])).toEqual([
    [oneResourceFilter('apps/v1/Deployment', 'ns/api'), 'spec.template.spec.containers.3'],
    [oneResourceFilter('apps/v1/Deployment', 'ns/api'), 'spec.template.spec.containers.1'],
    [oneResourceFilter('apps/v1/Deployment', 'ns/worker'), 'spec.template.spec.containers.2'],
  ]);
  expect(oneResourceFilter('a/v1/K', "o'brien")).toBe(
    "ConfigHub.ResourceType = 'a/v1/K' AND ConfigHub.ResourceName = 'o''brien'",
  );
});

test('a released value is written back as YAML that keeps its type', () => {
  expect(releasedYaml('8080')).not.toBe('8080');
  expect(releasedYaml('true')).not.toBe('true');
  expect(releasedYaml(8080)).toBe('8080');
  expect(releasedYaml('nginx:latest')).toBe('nginx:latest');
  expect(releasedYaml({ matchLabels: { app: 'mydep' } })).toBe('matchLabels:\n  app: mydep');
});

test('a typed value the field cannot take is refused before it is sent', () => {
  const intField = { dataType: 'int', value: 3 };
  expect(typedValueProblem(intField, 'abc')).toBe('Enter a whole number.');
  expect(typedValueProblem(intField, '12')).toBeUndefined();
  expect(typedValueProblem({ dataType: 'bool', value: true }, 'yes')).toBe(
    'Enter true or false.',
  );
  expect(typedValueProblem({ dataType: 'string', value: 'x' }, 'anything')).toBeUndefined();
});

test('a write says whether it made a Revision, and why not', () => {
  expect(writeOutcome({ HasNewMutations: true, Success: true })).toEqual({
    status: 'written',
  });
  expect(writeOutcome({ HasNewMutations: false, Success: true })).toEqual({
    status: 'nothing',
    reason: 'The values are already set, so nothing changed.',
  });
  expect(
    writeOutcome({
      HasNewMutations: false,
      Success: true,
      Conflicts: [{ Path: 'metadata.namespace' }],
    }),
  ).toEqual({ status: 'nothing', reason: 'A guard withheld metadata.namespace.' });
  expect(
    writeOutcome({
      Success: false,
      Error: { Message: 'boom', Status: 500, Type: 'Internal' },
    }),
  ).toEqual({ status: 'failed', reason: 'boom' });
  expect(writeOutcome(undefined).status).toBe('failed');
});

test('a Trigger that calls two functions is one gate, with the findings of both', () => {
  const callA = 'fanimg1700-dev/pair/vet-placeholders';
  const callB = 'fanimg1700-dev/pair/vet-celexpr:2';
  const u = unit({
    ValidationErrors: { [callA]: true, [callB]: true },
    ValidationWarnings: {},
    ValidationTriggerIDs: { [callA]: 't-pair', [callB]: 't-pair' },
    ValidationResults: {
      [callA]: [
        {
          Passed: false,
          Index: 0,
          FunctionName: 'vet-placeholders',
          FailedAttributes: [
            {
              ...RESOURCE,
              Path: 'metadata.namespace',
              AttributeName: 'resource-name',
              DataType: 'string',
              Value: 'confighubplaceholder',
            },
          ],
        },
      ],
      [callB]: [
        {
          Passed: false,
          Index: 1,
          FunctionName: 'vet-celexpr',
          Details: ['too many replicas'],
        },
      ],
    },
  });
  const { gates } = buildGates([u], []);
  expect(gates).toHaveLength(1);
  expect(gates[0].key).toBe('t-pair');
  expect(gates[0].gateNames.sort()).toEqual([callB, callA].sort());
  expect(gates[0].findingCount).toBe(2);
  expect(gates[0].fields[0]).toMatchObject({
    gateName: callA,
    functionName: 'vet-placeholders',
    kind: 'set',
  });
});

test('a warning saved and still failing is found among the warnings, not counted as cleared', () => {
  const { gates, warnings } = buildGates([unit()], []);
  expect(gateAfterSave(warnings[0], gates, warnings)).toBe(warnings[0]);
  expect(gateAfterSave(warnings[0], gates, [])).toBeUndefined();
  expect(gateAfterSave(gates[0], gates, warnings)).toBe(gates[0]);
});

test('a re-check says when the Trigger did not run on a Unit', () => {
  expect(triggerRunOutcome({ Success: true })).toEqual({ ran: true });
  expect(
    triggerRunOutcome({
      Success: false,
      Error: { Message: 'no worker', Status: 500, Type: 'Internal' },
    }),
  ).toEqual({
    ran: false,
    reason: 'no worker',
  });
  expect(triggerRunOutcome({ Success: false })).toEqual({
    ran: false,
    reason: 'The Trigger did not run.',
  });
  expect(triggerRunOutcome(undefined).ran).toBe(false);
});
