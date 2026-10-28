// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The draft's kinds of change, as their models read them: parameter values checked as the server
 * checks them, a saved Invocation read into the row, the Invocation Create saves for an inline
 * call, switching kind in the URL and the decisions, an Invoke draft's decisions and requests,
 * a Transform paths draft's Links, sources, end and requests, and the function dry run classified
 * the detail view's way.
 */
import type { ConfigDiff, FunctionInvocationsResponse, FunctionSignature } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import { draftCopy } from '../src/pages/change-orders/draft/draftCopy';
import {
  KIND_FIELDS_CLEARED,
  applyDraftAddressPatch,
  draftCreateRequest,
  kindOfPast,
  kindSwitchPatch,
  parseDraftAddress,
  resolveDraftDecisions,
  type ResolveDraftDecisionsInput,
} from '../src/pages/change-orders/draft/draftDecisions';
import {
  type DraftInvokeLast,
  type ResolveInvokeInput,
  imageFromOf,
  imageWarningsOf,
  invocationMatches,
  nextTagsOf,
  pinPatch,
  rankInvocations,
  resolveInvokeDraft,
  sourcePatch,
  tagOfPasted,
  tagSuggestionsOf,
} from '../src/pages/change-orders/draft/draftInvoke';
import {
  type DraftFanOutLink,
  type DraftFanOutRevision,
  type DraftFanOutUnit,
  type ResolveFanOutInput,
  fanOutAvailability,
  fanOutLinksOf,
  fanOutOffered,
  resolveFanOutDraft,
} from '../src/pages/change-orders/draft/draftFanOut';
import { assembleInvokePreview, withNothingHere, withoutAdds } from '../src/pages/change-orders/draft/draftInvokePreview';
import {
  type DraftSavedInvocation,
  argLabel,
  argSlotsOfFunction,
  argSlotsOfInvocation,
  DRAFT_KINDS,
  containerOptionsOf,
  draftKindOfWord,
  containerUsesOf,
  functionErrorText,
  functionValueProblem,
  imageParametersOf,
  inlineInvocationBody,
  inlineParameters,
  invocationMode,
  rangeRefusalOf,
  sameInvocationShape,
  slugsOfWhere,
  validateInvocationParameters,
  whereOfSlugs,
} from '../src/pages/change-orders/draft/draftKinds';
import type { DraftPastChangeOrder, DraftVariant, DraftWorkflow } from '../src/pages/change-orders/draft/draftTypes';
import type { ChangeOrderOutcome } from '../src/pages/change-orders/changeOrderOutcome';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The seed's `platform/set-image-tag`, as the server stores it. */
const SET_IMAGE_TAG: DraftSavedInvocation = {
  invocationId: 'inv-image',
  slug: 'set-image-tag',
  spaceId: 'space-platform',
  spaceSlug: 'platform',
  toolchainType: 'Kubernetes/YAML',
  calls: [
    {
      FunctionName: 'set-container-image',
      Arguments: [
        { ParameterName: 'container-name', Value: '{{ .Params.container_name }}', Evaluator: 'template' },
        { ParameterName: 'container-image', Value: '{{ .Params.image }}', Evaluator: 'template' },
      ],
    },
  ],
  parameters: [
    { ParameterName: 'container_name', DataType: 'string', Required: true, Min: 0, Max: 0 },
    { ParameterName: 'image', DataType: 'string', Required: true, Min: 0, Max: 0 },
  ],
};

/** A saved `set-replicas` Invocation with its count as a parameter. */
const SCALE: DraftSavedInvocation = {
  invocationId: 'inv-scale',
  slug: 'scale',
  spaceId: 'space-base',
  spaceSlug: 'payments-base',
  toolchainType: 'Kubernetes/YAML',
  calls: [{ FunctionName: 'set-replicas', Arguments: [{ ParameterName: 'replicas', Value: 'params.count', Evaluator: 'cel' }] }],
  parameters: [{ ParameterName: 'count', DataType: 'int', Required: true }],
};

/** The functions' signatures, as `listFunctions` returns them (trimmed). */
const SIGNATURES: Record<string, FunctionSignature> = {
  'set-label': {
    FunctionName: 'set-label',
    Mutating: true,
    Description: 'Set a label',
    Parameters: [
      { ParameterName: 'label-key', DataType: 'string', Required: true },
      { ParameterName: 'label-value', DataType: 'string', Required: true },
    ],
  },
  'set-replicas': {
    FunctionName: 'set-replicas',
    Mutating: true,
    Parameters: [{ ParameterName: 'replicas', DataType: 'int', Required: true }],
  },
  'set-container-image': {
    FunctionName: 'set-container-image',
    Mutating: true,
    Parameters: [
      { ParameterName: 'container-name', DataType: 'string', Required: true, Regexp: '^\\*|[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$' },
      { ParameterName: 'container-image', DataType: 'string', Required: true },
    ],
  },
  'set-container-resources': {
    FunctionName: 'set-container-resources',
    Mutating: true,
    Parameters: [
      { ParameterName: 'container-name', DataType: 'string', Required: true },
      { ParameterName: 'operation', DataType: 'enum', Required: true, EnumValues: ['all', 'cap', 'floor'] },
      { ParameterName: 'memory', DataType: 'string', Required: true, Regexp: '^[+-]?([0-9]*(\\.[0-9]+)?)(([KMGTPE]i?)|[mk]|([eE][-+]?[0-9]+))?$' },
      { ParameterName: 'limit-factor', DataType: 'int', Required: true, Min: 0, Max: 10 },
    ],
  },
  'cel-validate': { FunctionName: 'cel-validate', Validating: true, Parameters: [] },
};
const FUNCTIONS = new Map(Object.entries(SIGNATURES));

const deployment = (name: string, containers: [string, string][], init: [string, string][] = []) => `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: payments
spec:
  template:
    spec:
${init.length === 0 ? '' : `      initContainers:\n${init.map(([n, image]) => `      - name: ${n}\n        image: ${image}\n`).join('')}`}      containers:
${containers.map(([n, image]) => `      - name: ${n}\n        image: ${image}\n`).join('')}`;

const API = deployment('payments-api', [['api', 'ghcr.io/acme/payments-api:1.15.0']], [['migrate', 'ghcr.io/acme/payments-migrate:1.15.0']]);
const WORKER = deployment('payments-worker', [['worker', 'ghcr.io/acme/payments-worker:1.15.0']]);
const CONTAINERS = containerOptionsOf([...containerUsesOf('payments-api', API), ...containerUsesOf('payments-worker', WORKER)]);

function invokeInput(overrides: Partial<ResolveInvokeInput> = {}): ResolveInvokeInput {
  return {
    address: {},
    last: undefined,
    invocations: [SET_IMAGE_TAG, SCALE],
    functions: FUNCTIONS,
    toolchainType: 'Kubernetes/YAML',
    containers: CONTAINERS,
    resources: [
      { unitSlug: 'payments-config', label: 'ConfigMap/payments-config', more: 0, workload: false },
      { unitSlug: 'payments-worker', label: 'Deployment/payments-worker', more: 0, workload: true },
      { unitSlug: 'payments-api', label: 'Deployment/payments-api', more: 0, workload: true },
    ],
    baseSpaceId: 'space-base',
    baseSpaceSlug: 'payments-base',
    ranHere: [],
    name: 'payments-2026-10-20',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Values, as ValidateInvocationParameters takes them
// ---------------------------------------------------------------------------

test.describe('parameter values, as the server checks them', () => {
  const declared = [
    { ParameterName: 'count', DataType: 'int', Required: true },
    { ParameterName: 'on', DataType: 'bool', Required: false },
    { ParameterName: 'name', DataType: 'string', Required: true },
  ];

  test('every required parameter needs a value, and an empty value is no value', () => {
    const { problems } = validateInvocationParameters(declared, { count: '', name: 'x' });
    expect(problems).toEqual([{ name: 'count', code: 'required', message: draftCopy.invoke.values.required }]);
    // An optional one left empty is simply not sent.
    expect(validateInvocationParameters(declared, { count: '3', name: 'x', on: '' }).values).toEqual({ count: 3, name: 'x' });
  });

  test('an undeclared key is refused, by name', () => {
    const { problems } = validateInvocationParameters(declared, { count: '1', name: 'x', colour: 'red' });
    expect(problems.map((problem) => [problem.code, problem.name])).toEqual([['unknown', 'colour']]);
  });

  test("an int coerces as Go's Atoi does: a sign and digits, nothing else", () => {
    expect(validateInvocationParameters(declared, { count: '+5', name: 'x' }).values.count).toBe(5);
    expect(validateInvocationParameters(declared, { count: '-2', name: 'x' }).values.count).toBe(-2);
    for (const bad of ['5.0', '1e3', ' 5', 'five'])
      expect(validateInvocationParameters(declared, { count: bad, name: 'x' }).problems.map((problem) => problem.code)).toEqual(['wholeNumber']);
  });

  test("a bool takes ParseBool's spellings, and only those", () => {
    for (const [text, value] of [['true', true], ['T', true], ['1', true], ['False', false], ['0', false]] as const)
      expect(validateInvocationParameters(declared, { count: '1', name: 'x', on: text }).values.on).toBe(value);
    expect(validateInvocationParameters(declared, { count: '1', name: 'x', on: 'yes' }).problems.map((problem) => problem.code)).toEqual(['trueOrFalse']);
  });

  test("the function's own rules: an enum's other values, and its pattern in Go's dialect", () => {
    const [, operation, memory] = argSlotsOfFunction('set-container-resources', SIGNATURES['set-container-resources'].Parameters ?? []);
    expect(functionValueProblem(operation, 'all')).toBeUndefined();
    expect(functionValueProblem(operation, 'most')?.code).toBe('oneOf');
    expect(functionValueProblem(memory, '1Gi')).toBeUndefined();
    expect(functionValueProblem(memory, 'lots')?.code).toBe('pattern');
    const [container] = argSlotsOfFunction('set-container-image', SIGNATURES['set-container-image'].Parameters ?? []);
    expect(functionValueProblem(container, 'api')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A saved Invocation, read into the row
// ---------------------------------------------------------------------------

test.describe('a saved Invocation, read into the row', () => {
  test('set-image-tag runs through the image rows: its container and image are each one declared parameter', () => {
    expect(imageParametersOf(SET_IMAGE_TAG)).toEqual({ container: 'container_name', image: 'image' });
    expect(invocationMode(SET_IMAGE_TAG)).toBe('image');
  });

  test('one that fixes the image, or reads it from part of a template, is given its parameters one by one', () => {
    const fixed: DraftSavedInvocation = {
      ...SET_IMAGE_TAG,
      calls: [{ FunctionName: 'set-container-image', Arguments: [{ ParameterName: 'container-name', Value: '{{ .Params.container_name }}', Evaluator: 'template' }, { ParameterName: 'container-image', Value: 'ghcr.io/x:{{ .Params.tag }}', Evaluator: 'template' }] }],
      parameters: [{ ParameterName: 'container_name', DataType: 'string', Required: true }, { ParameterName: 'tag', DataType: 'string', Required: true }],
    };
    expect(imageParametersOf(fixed)).toBeUndefined();
    expect(invocationMode(fixed)).toBe('value');
    expect(invocationMode(SCALE)).toBe('value');
  });

  test("its declared parameters are the row's inputs, named by the arguments they feed", () => {
    expect(argSlotsOfInvocation(SET_IMAGE_TAG).map((slot) => [slot.name, slot.label, slot.sense])).toEqual([
      ['container_name', 'container', 'container'],
      ['image', 'image', 'text'],
    ]);
    expect(argSlotsOfInvocation(SCALE).map((slot) => [slot.name, slot.label])).toEqual([['count', 'replicas']]);
  });

  test("a function's arguments drop the function's own word", () => {
    expect(argLabel('label-key', 'set-label')).toBe('key');
    expect(argLabel('label-value', 'set-label')).toBe('value');
    expect(argLabel('env-var', 'set-env-var')).toBe('variable');
    expect(argLabel('container-name', 'set-env-var')).toBe('container');
    expect(argLabel('limit-factor', 'set-container-resources')).toBe('limit-factor');
  });

  test('a past ChangeOrder is the kind of its update type: every Invoke one is Invoke, whatever it ran', () => {
    const past = (updateType: string, InvocationID?: string) => ({ updateType, changeOrder: { Slug: 'x', InvocationID } }) as DraftPastChangeOrder;
    expect(kindOfPast(past('UpgradeUnit'))).toBe('baseChanges');
    expect(kindOfPast(past('MergeUnits'))).toBe('baseChanges');
    expect(kindOfPast(past('Invoke', 'inv-image'))).toBe('invoke');
    expect(kindOfPast(past('Invoke', 'inv-scale'))).toBe('invoke');
    expect(kindOfPast(past('Invoke', 'gone'))).toBe('invoke');
    expect(kindOfPast(past('TransformPaths'))).toBe('transformPaths');
    expect(kindOfPast(past('Insert'))).toBe('transformPaths');
    expect(kindOfPast(past('Bogus'))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The Invocation Create saves
// ---------------------------------------------------------------------------

test.describe('the Invocation Create saves for an inline call', () => {
  const slots = argSlotsOfFunction('set-label', SIGNATURES['set-label'].Parameters ?? []);
  const filled = [
    { slot: slots[0], text: 'team' },
    { slot: slots[1], text: 'payments' },
  ];

  test('each argument is a declared parameter fed by a template; the values go on the ChangeOrder', () => {
    const body = inlineInvocationBody({ slug: 'payments-2026-10-20', toolchainType: 'Kubernetes/YAML', functionName: 'set-label', args: filled });
    expect(body.FunctionInvocations).toEqual([
      {
        FunctionName: 'set-label',
        Arguments: [
          { ParameterName: 'label-key', Value: '{{ .Params.label_key }}', Evaluator: 'template' },
          { ParameterName: 'label-value', Value: '{{ .Params.label_value }}', Evaluator: 'template' },
        ],
      },
    ]);
    expect(body.Parameters?.map((parameter) => [parameter.ParameterName, parameter.DataType, parameter.Required])).toEqual([
      ['label_key', 'string', true],
      ['label_value', 'string', true],
    ]);
    expect(inlineParameters(filled)).toEqual({ label_key: 'team', label_value: 'payments' });
  });

  test('an int argument is declared an int, so the server coerces its value', () => {
    const [replicas] = argSlotsOfFunction('set-replicas', SIGNATURES['set-replicas'].Parameters ?? []);
    expect(inlineParameters([{ slot: replicas, text: '4' }])).toEqual({ replicas: 4 });
  });

  test('a saved Invocation is the same call only when every field the server tells them apart by is', () => {
    const body = inlineInvocationBody({ slug: 'payments-2026-10-20', toolchainType: 'Kubernetes/YAML', functionName: 'set-label', args: filled });
    // As the server returns it: ranges read back as zero, a description; neither is part of what it runs.
    const stored: DraftSavedInvocation = {
      invocationId: 'inv-saved',
      slug: 'anything',
      spaceId: 'space-base',
      spaceSlug: 'payments-base',
      toolchainType: 'Kubernetes/YAML',
      calls: [{ FunctionName: 'set-label', Arguments: [...(body.FunctionInvocations[0].Arguments ?? [])] }],
      parameters: (body.Parameters ?? []).map((parameter) => ({ ...parameter, Min: 0, Max: 0, Description: 'x' })),
    };
    expect(sameInvocationShape(stored, body)).toBe(true);
    const call = stored.calls[0];
    const differs: DraftSavedInvocation[] = [
      { ...stored, calls: [{ ...call, Arguments: [...(call.Arguments ?? [])].reverse() }] },
      { ...stored, calls: [{ ...call, WhereResource: "ResourceType = 'apps/v1/Deployment'" }] },
      { ...stored, calls: [{ ...call, Clearance: [{ Key: 'team', Operator: 'In', Values: ['a'] }] }] },
      { ...stored, calls: [{ ...call, Guards: { team: 'a' } }] },
      { ...stored, bridgeWorkerId: 'worker-1' },
      { ...stored, toolchainType: 'AppConfig/Properties' },
      { ...stored, parameters: [...stored.parameters].reverse() },
    ];
    for (const saved of differs) expect(sameInvocationShape(saved, body)).toBe(false);
    const other = inlineInvocationBody({ slug: 'payments-2026-10-20', toolchainType: 'Kubernetes/YAML', functionName: 'set-label', args: filled.slice(0, 1) });
    expect(sameInvocationShape(stored, other)).toBe(false);
  });

  test("a value the function takes empty is sent empty, not asked for; the declared parameter keeps the function's checks", () => {
    const slotsOf = argSlotsOfFunction('set-container-resources', SIGNATURES['set-container-resources'].Parameters ?? []);
    const memory = slotsOf.find((slot) => slot.name === 'memory');
    expect(memory?.emptyAllowed).toBe(true);
    expect(slotsOf.find((slot) => slot.name === 'container-name')?.emptyAllowed).toBe(false);
    const args = [
      { slot: slotsOf[0], text: 'api' },
      { slot: slotsOf[1], text: 'all' },
      { slot: slotsOf[2], text: '' },
      { slot: slotsOf[3], text: '2' },
    ];
    expect(inlineParameters(args)).toEqual({ container_name: 'api', operation: 'all', memory: '', limit_factor: 2 });
    const body = inlineInvocationBody({ slug: 's', toolchainType: 'Kubernetes/YAML', functionName: 'set-container-resources', args });
    expect(body.Parameters?.find((parameter) => parameter.ParameterName === 'memory')?.Regexp).toBe(SIGNATURES['set-container-resources'].Parameters?.[2].Regexp);
    expect(body.Parameters?.find((parameter) => parameter.ParameterName === 'limit_factor')).toMatchObject({ Min: 0, Max: 10 });
  });

  test("an int out of the function's range is said before the dry run; its refusal is read back onto the argument", () => {
    const [, , , factor] = argSlotsOfFunction('set-container-resources', SIGNATURES['set-container-resources'].Parameters ?? []);
    expect(functionValueProblem(factor, '10')).toBeUndefined();
    expect(functionValueProblem(factor, '11')).toMatchObject({ code: 'range', message: draftCopy.invoke.values.between(0, 10) });
    expect(rangeRefusalOf('Function invocations failed\nDetails:\n argument replicas value -1 is out of range [0,]')).toEqual({ name: 'replicas', message: draftCopy.invoke.values.atLeast(0) });
    expect(rangeRefusalOf('something else')).toBeUndefined();
    expect(functionErrorText('Function invocations failed\nDetails:\n no container x')).toBe('no container x');
  });

  test('a Unit selection by slug reads back as the slugs', () => {
    expect(whereOfSlugs(['payments-api'])).toBe("Slug = 'payments-api'");
    expect(slugsOfWhere(whereOfSlugs(['payments-api', 'payments-worker']))).toEqual(['payments-api', 'payments-worker']);
    expect(slugsOfWhere("Labels.app = 'payments-api'")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Kinds in the URL and the decisions
// ---------------------------------------------------------------------------

const VARIANTS: DraftVariant[] = ['dev', 'prod-eu', 'prod-ap'].map((name) => ({ spaceId: `space-${name}`, slug: `payments-${name}`, name, stage: undefined, region: undefined }));
const MAIN_LINE: DraftWorkflow = { workflowId: 'wf-main', slug: 'main-line', name: 'main-line', stageNames: ['dev', 'prod'], stages: [], spec: {} };
const past = (slug: string, updateType: string, extra: Record<string, unknown> = {}): DraftPastChangeOrder => ({
  changeOrderId: slug,
  slug,
  description: '',
  updateType,
  workflowId: 'wf-main',
  inScopeSpaceIds: VARIANTS.map((variant) => variant.spaceId),
  adoptedEndTagId: undefined,
  state: 'Released',
  createdAt: undefined,
  author: { name: 'Charlie' } as DraftPastChangeOrder['author'],
  changeOrder: { Slug: slug, UpdateType: updateType, ...extra },
});
const HOTFIX_IMAGE = past('payments-hotfix-2026-09-22', 'Invoke', { InvocationID: 'inv-image', Parameters: { container_name: 'api', image: 'ghcr.io/acme/payments-api:1.14.1' } });
const RELEASE = past('payments-2026-10-09', 'UpgradeUnit');

function decide(search: string, overrides: Partial<ResolveDraftDecisionsInput> = {}) {
  return resolveDraftDecisions({
    address: parseDraftAddress(new URLSearchParams(search)),
    componentSlug: 'payments',
    baseSpaceSlug: 'payments-base',
    pastChangeOrders: [HOTFIX_IMAGE, RELEASE],
    variants: VARIANTS,
    workflows: [MAIN_LINE],
    policy: { allowedWorkflowIds: ['wf-main'], required: true },
    today: '2026-10-20',
    ...overrides,
  });
}

test.describe('the kind of change', () => {
  test("opens on the newest ChangeOrder's kind, re-aimed from it", () => {
    const decisions = decide('space=payments-base');
    expect(decisions.kind.value).toBe('invoke');
    expect(decisions.template).toMatchObject({ kind: 'changeOrder', changeOrder: { slug: HOTFIX_IMAGE.slug } });
  });

  test("each kind re-aims its own newest ChangeOrder, or the policy; last time is the ChangeOrder re-aimed", () => {
    const base = decide('space=payments-base&kind=base');
    expect(base.kind).toMatchObject({ value: 'baseChanges', last: 'baseChanges', differsFromLast: false });
    expect(base.template).toMatchObject({ kind: 'changeOrder', changeOrder: { slug: RELEASE.slug } });
    const invoke = decide('space=payments-base&kind=invoke');
    expect(invoke.kind).toMatchObject({ value: 'invoke', last: 'invoke', differsFromLast: false });
    expect(invoke.kindTemplates).toMatchObject({ baseChanges: { slug: RELEASE.slug }, invoke: { slug: HOTFIX_IMAGE.slug }, transformPaths: undefined });
    // From the policy there is no last time to differ from.
    const fresh = decide('space=payments-base&kind=invoke', { pastChangeOrders: [RELEASE] });
    expect(fresh.template).toEqual({ kind: 'policy' });
    expect(fresh.kind).toMatchObject({ value: 'invoke', last: undefined, differsFromLast: false });
    // A ChangeOrder named by the URL and another kind: that is the change from last time.
    const named = decide(`space=payments-base&from=${RELEASE.slug}&kind=invoke`);
    expect(named.kind).toMatchObject({ value: 'invoke', last: 'baseChanges', differsFromLast: true });
  });

  test('a word that names no kind is said, with the way back to the default', () => {
    const decisions = decide('space=payments-base&kind=rule');
    expect(decisions.kind.value).toBe('invoke');
    expect(decisions.problems.find((problem) => problem.code === 'kind-unknown')?.fix?.patch).toEqual({ kind: null });
  });

  test("switching kind re-aims the kind's own ChangeOrder and keeps what was typed for every kind", () => {
    const search = 'space=payments-base&from=payments-2026-10-09&kind=value&fn=set-label&p.label-key=team&p.label-value=payments&where=Slug%20%3D%20%27x%27&name=mine&wf=main-line&end=release&update=MergeUnits&container=worker&tag=1.15.1';
    const before = new URLSearchParams(search);
    const decisions = decide(search);
    const toBase = applyDraftAddressPatch(before, kindSwitchPatch({ next: 'baseChanges', address: parseDraftAddress(before), decisions }));
    const typed = Object.fromEntries(toBase);
    expect(typed.from).toBeUndefined();
    expect(typed).toMatchObject({ kind: 'base', fn: 'set-label', 'p.label-key': 'team', container: 'worker', tag: '1.15.1', end: 'release', update: 'MergeUnits', name: 'mine' });
    // Back again: Invoke's fields were never gone.
    const back = applyDraftAddressPatch(toBase, kindSwitchPatch({ next: 'invoke', address: parseDraftAddress(toBase), decisions: decide(toBase.toString()) }));
    expect(parseDraftAddress(back)).toMatchObject({ kind: 'invoke', fn: 'set-label', params: { 'label-key': 'team', 'label-value': 'payments' } });
    // Starting over clears every kind's fields.
    expect(Object.fromEntries(applyDraftAddressPatch(before, { ...KIND_FIELDS_CLEARED, kind: null }))).toEqual({ space: 'payments-base', name: 'mine', wf: 'main-line' });
  });

  test("a kind whose template names no workflow keeps the reader's, when it can govern the kind", () => {
    const gated: DraftWorkflow = { ...MAIN_LINE, workflowId: 'wf-gated', slug: 'gated', stages: [{ Name: 'dev', Prerequisites: [{ Type: 'Approval' }] }] as DraftWorkflow['stages'] };
    const decisions = decide('space=payments-base&kind=base');
    // Transform paths has no template here, and the workflow can govern it.
    expect(kindSwitchPatch({ next: 'transformPaths', address: parseDraftAddress(new URLSearchParams('space=payments-base&kind=base')), decisions })).toEqual({ kind: 'transform', from: null, wf: 'main-line' });
    // Without a past Invoke ChangeOrder, Invoke starts from the policy too.
    const noInvoke = decide('space=payments-base&kind=base', { pastChangeOrders: [RELEASE] });
    expect(kindSwitchPatch({ next: 'invoke', address: {}, decisions: noInvoke })).toEqual({ kind: 'invoke', from: null, wf: 'main-line' });
    // Invoke has a template of its own: its workflow is the template's.
    expect(kindSwitchPatch({ next: 'invoke', address: {}, decisions })).toEqual({ kind: 'invoke', from: null });
    const onGated = decide('space=payments-base&kind=base&wf=gated', { workflows: [MAIN_LINE, gated], policy: { allowedWorkflowIds: [], required: true } });
    expect(kindSwitchPatch({ next: 'transformPaths', address: {}, decisions: onGated })).toEqual({ kind: 'transform', from: null });
  });

  test('argument values ride in the URL as p.<name>, and a parameter the draft does not own survives', () => {
    const next = applyDraftAddressPatch(new URLSearchParams('space=s&utm=1&p.old=1'), { params: { 'label-key': 'team' } });
    expect(next.toString()).toBe('utm=1&space=s&p.old=1&p.label-key=team');
    expect(parseDraftAddress(next).params).toEqual({ old: '1', 'label-key': 'team' });
    // One value at a time: two writes in a row keep both, and null removes one.
    const both = applyDraftAddressPatch(next, { params: { 'label-value': 'payments' } });
    expect(parseDraftAddress(both).params).toEqual({ old: '1', 'label-key': 'team', 'label-value': 'payments' });
    expect(parseDraftAddress(applyDraftAddressPatch(both, { params: { old: null } })).params).toEqual({ 'label-key': 'team', 'label-value': 'payments' });
    expect(applyDraftAddressPatch(both, { params: null }).toString()).toBe('utm=1&space=s');
    expect(parseDraftAddress(new URLSearchParams('tag=&where=')).tag).toBe('');
  });

  test('an Invoke request carries the Invocation, its values and the selection, and no end', () => {
    const decisions = decide('space=payments-base&kind=value&wf=main-line');
    const request = draftCreateRequest({ decisions, endTagId: 'tag-end', invoke: { invocationId: 'inv-scale', parameters: { count: 4 }, whereUnit: "Slug = 'payments-api'" } });
    expect(request).toMatchObject({ UpdateType: 'Invoke', InvocationID: 'inv-scale', Parameters: { count: 4 }, WhereUnit: "Slug = 'payments-api'" });
    expect(request?.EndTagID).toBeUndefined();
    // No whole call: nothing to ask about.
    expect(draftCreateRequest({ decisions, endTagId: null, invoke: undefined })).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// An Invoke draft's decisions
// ---------------------------------------------------------------------------

const LAST_IMAGE: DraftInvokeLast = { invocation: SET_IMAGE_TAG, parameters: { container_name: 'api', image: 'ghcr.io/acme/payments-api:1.14.1' }, whereUnit: '' };

test.describe('an Invoke draft on the image function, its default', () => {
  test('starts from the first app container, runs where the base runs it, and waits for a tag', () => {
    const invoke = resolveInvokeDraft(invokeInput());
    expect(invoke.source.value).toEqual({ kind: 'function', name: 'set-container-image' });
    expect(invoke.container.value).toBe('api');
    expect(invoke.where.value).toBe("Slug = 'payments-api'");
    expect(invoke.problems.map((problem) => problem.code)).toEqual(['tag-empty']);
    expect(invoke.problems[0].blockerLabel).toBe(draftCopy.invoke.problems.tagEmpty);
    expect(invoke.previewRequest).toBeUndefined();
  });

  test('a typed tag makes the call: the dry run runs it inline, and Create saves it under the name', () => {
    const invoke = resolveInvokeDraft(invokeInput({ address: { tag: '1.15.1', container: 'worker' } }));
    expect(invoke.problems).toEqual([]);
    expect(invoke.image).toBe('ghcr.io/acme/payments-worker:1.15.1');
    expect(invoke.previewRequest).toEqual({
      ToolchainType: 'Kubernetes/YAML',
      FunctionInvocations: [
        {
          FunctionName: 'set-container-image',
          Arguments: [
            { ParameterName: 'container-name', Value: 'worker' },
            { ParameterName: 'container-image', Value: 'ghcr.io/acme/payments-worker:1.15.1' },
          ],
        },
      ],
    });
    expect(invoke.save?.Slug).toBe('payments-2026-10-20');
    expect(invoke.parameters).toEqual({ container_name: 'worker', container_image: 'ghcr.io/acme/payments-worker:1.15.1' });
    expect(invoke.invocationId).toBeUndefined();
    expect(invoke.suggestion).toBe('worker 1.15.1');
  });

  test("re-aimed: last time's Invocation, container and tag; the copied tag blocks Create but still previews", () => {
    const invoke = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE }));
    expect(invoke.source).toMatchObject({ value: { kind: 'invocation' }, differsFromLast: false });
    expect(invoke.tag).toMatchObject({ value: '1.14.1', last: '1.14.1' });
    expect(invoke.problems.map((problem) => [problem.code, problem.blocks])).toEqual([['tag-copied', true]]);
    expect(invoke.previewRequest?.ParameterizedInvocations).toEqual([
      { InvocationID: 'inv-image', Parameters: { container_name: 'api', image: 'ghcr.io/acme/payments-api:1.14.1' } },
    ]);
    // A saved Invocation picked: Create saves nothing.
    expect(invoke.save).toBeUndefined();
    expect(invoke.invocationId).toBe('inv-image');
    const typed = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE, address: { tag: '1.15.1' } }));
    expect(typed.problems).toEqual([]);
    expect(typed.tag).toMatchObject({ differsFromLast: true, copied: false });
  });

  test("last time's tag is last time's container's: picking another container starts with no tag", () => {
    const invoke = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE, address: { container: 'worker' } }));
    expect(invoke.tag).toMatchObject({ value: '', last: undefined, copied: false });
    expect(invoke.problems.map((problem) => problem.code)).toEqual(['tag-empty']);
    expect(invoke.image).toBeUndefined();
  });

  test('the warnings beside the tag: copied (and a downgrade from where the variants are), and the base, at most two', () => {
    const words = draftCopy.invoke.warnings;
    const tags = new Map([['api', '1.14.2']]);
    const copied = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE }));
    expect(imageFromOf(copied, tags)).toEqual({ fromTag: '1.14.2', baseTag: '1.15.0', bump: 'downgrade' });
    const both = imageWarningsOf(copied, tags);
    expect(both.map((warning) => [warning.kind, warning.label, warning.code])).toEqual([
      ['tag', `${words.copied} · ${words.downgrade}`, undefined],
      ['base', words.baseIsOn, '1.15.0'],
    ]);
    expect(both[0].short).toEqual({ label: `${words.copiedShort} · ${words.downgrade}` });
    expect(both[0].tip).toBe(`${words.copiedTip('api')} ${words.downgradeTip('1.14.1', '1.14.2')}`);
    expect(both[1].short).toEqual({ label: words.baseIsOnShort, code: '1.15.0' });
    // A minor move for the variants that is a patch of the base's tag is not the patch it looks like.
    const typed = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE, address: { tag: '1.15.1' } }));
    expect(imageFromOf(typed, tags).bump).toBe('minor');
    expect(imageWarningsOf(typed, tags)).toEqual([
      { kind: 'base', label: words.notAPatch, short: { label: words.notAPatchShort }, code: '1.15.0', tip: words.notAPatchTip('1.14.2', '1.15.1', 'minor', '1.15.0') },
    ]);
    // A downgrade without last time's tag: its own chip.
    const lower = imageWarningsOf(resolveInvokeDraft(invokeInput({ address: { tag: '1.14.1' } })), tags);
    expect(lower.map((warning) => warning.label)).toEqual([words.downgrade, words.baseIsOn]);
    // The base's own tag typed, an empty tag, a tag no registry takes, another function: nothing to say.
    expect(imageWarningsOf(resolveInvokeDraft(invokeInput({ address: { tag: '1.15.0' } })), tags)).toEqual([]);
    expect(imageWarningsOf(resolveInvokeDraft(invokeInput()), tags)).toEqual([]);
    expect(imageWarningsOf(resolveInvokeDraft(invokeInput({ address: { tag: '-bad' } })), tags)).toEqual([]);
    expect(imageWarningsOf(resolveInvokeDraft(invokeInput({ address: { fn: 'set-label' } })), tags)).toEqual([]);
  });

  test("the tag suggests the next patch, minor and major of the variants' tag and the base's, then the tags in use, each once", () => {
    const words = draftCopy.invoke.suggest;
    const invoke = resolveInvokeDraft(invokeInput());
    const tags = new Map([['api', '1.14.2']]);
    const inScope = new Map([['api', new Map([['1.14.2', 5], ['1.15.0', 2], ['1.14.1', 1]])]]);
    expect(tagSuggestionsOf(invoke, tags, inScope).map((suggestion) => [suggestion.tag, suggestion.group, suggestion.hint])).toEqual([
      ['1.14.3', 'variants', words.patch],
      ['1.15.0', 'variants', words.minor],
      ['2.0.0', 'variants', words.major],
      ['1.15.1', 'base', words.patch],
      ['1.16.0', 'base', words.minor],
      ['1.14.2', 'inUse', words.inVariants(5)],
      ['1.14.1', 'inUse', words.inVariants(1)],
    ]);
    expect(tagSuggestionsOf(invoke, tags, inScope)[0].after).toBe('1.14.2');
    // Every variant on one tag, and the base on it too: only the next ones.
    const same = new Map([['api', new Map([['1.15.0', 8]])]]);
    expect(tagSuggestionsOf(invoke, new Map([['api', '1.15.0']]), same).map((suggestion) => suggestion.tag)).toEqual(['1.15.1', '1.16.0', '2.0.0']);
    // Another function suggests nothing.
    expect(tagSuggestionsOf(resolveInvokeDraft(invokeInput({ address: { fn: 'set-label' } })), tags, inScope)).toEqual([]);
  });

  test('the next tags keep a v prefix, and a tag that is not a plain version has none', () => {
    expect(nextTagsOf('v1.30.1')).toEqual({ patch: 'v1.30.2', minor: 'v1.31.0', major: 'v2.0.0' });
    expect(nextTagsOf('1.15.1-rc.2')).toBeUndefined();
    expect(nextTagsOf('latest')).toBeUndefined();
    expect(nextTagsOf(undefined)).toBeUndefined();
  });

  test("a whole image reference of the container's repository pasted in is taken for its tag", () => {
    expect(tagOfPasted('ghcr.io/acme/payments-api:1.16.0', 'ghcr.io/acme/payments-api')).toBe('1.16.0');
    expect(tagOfPasted('ghcr.io/acme/other:1.16.0', 'ghcr.io/acme/payments-api')).toBe('ghcr.io/acme/other:1.16.0');
    expect(tagOfPasted('1.16.0', 'ghcr.io/acme/payments-api')).toBe('1.16.0');
  });

  test('a container the base does not run, or a tag no registry takes, is said on the row', () => {
    expect(resolveInvokeDraft(invokeInput({ address: { container: 'sidecar', tag: '1' } })).problems.map((problem) => problem.code)).toEqual(['container-unknown']);
    expect(resolveInvokeDraft(invokeInput({ address: { tag: '-bad' } })).problems.map((problem) => problem.code)).toEqual(['tag-format']);
  });

  test('offers every saved Invocation, last time first, and the image function first among the functions, as the default', () => {
    const invoke = resolveInvokeDraft(invokeInput({ last: LAST_IMAGE }));
    expect(invoke.mode).toBe('image');
    expect(invoke.invocationOptions.map((invocation) => invocation.slug)).toEqual(['set-image-tag', 'scale']);
    expect(invoke.functionOptions).toEqual(['set-container-image', 'set-label', 'set-replicas', 'set-container-resources']);
    expect(invoke.defaultFunction).toBe('set-container-image');
  });

  test('re-aimed, an Invoke ChangeOrder opens on what it ran; without one, on the image function', () => {
    const scaled: DraftInvokeLast = { invocation: SCALE, parameters: { count: 3 }, whereUnit: "Slug = 'payments-api'" };
    const again = resolveInvokeDraft(invokeInput({ last: scaled }));
    expect(again.mode).toBe('value');
    expect(again.source.value).toMatchObject({ kind: 'invocation', invocation: { slug: 'scale' } });
    expect(again.args.map((arg) => arg.text)).toEqual(['3']);
    expect(resolveInvokeDraft(invokeInput()).source.value).toEqual({ kind: 'function', name: 'set-container-image' });
    // A link written for the image tag kind opens the image function, whatever last time ran.
    const linked = resolveInvokeDraft(invokeInput({ last: scaled, address: { kind: 'image' } }));
    expect(linked.mode).toBe('image');
    expect(linked.source).toMatchObject({ value: { kind: 'function', name: 'set-container-image' }, differsFromLast: true });
    // Its way back goes to last time's, and the URL then names the kind as Invoke.
    expect(linked.sourceBack).toEqual({ fn: null, inv: null, img: null, params: null, kind: 'invoke' });
    // And img, as such a link wrote the source.
    expect(resolveInvokeDraft(invokeInput({ last: scaled, address: { img: 'platform/set-image-tag' } })).source.value).toMatchObject({ kind: 'invocation', invocation: { slug: 'set-image-tag' } });
  });

  test('another function and back: its rows go and come again, with the tag still typed', () => {
    const start = new URLSearchParams('space=payments-base&kind=invoke&container=worker&tag=1.15.1');
    const image = resolveInvokeDraft(invokeInput({ address: parseDraftAddress(start) }));
    expect(image.mode).toBe('image');
    const toLabel = applyDraftAddressPatch(start, sourcePatch({ kind: 'function', name: 'set-label' }));
    const label = resolveInvokeDraft(invokeInput({ address: parseDraftAddress(toLabel) }));
    expect(label.mode).toBe('value');
    expect(label.args.map((arg) => arg.slot.label)).toEqual(['key', 'value']);
    expect(label.tag.value).toBe('');
    // The image function is the default: picking it again writes nothing of its own.
    const back = applyDraftAddressPatch(toLabel, label.sourceBack);
    const again = resolveInvokeDraft(invokeInput({ address: parseDraftAddress(back) }));
    expect(again.mode).toBe('image');
    expect(again.container.value).toBe('worker');
    expect(again.tag.value).toBe('1.15.1');
    expect(again.image).toBe('ghcr.io/acme/payments-worker:1.15.1');
  });

  test('a toolchain without the image function starts on set-label', () => {
    const functions = new Map([...FUNCTIONS].filter(([name]) => name !== 'set-container-image'));
    const invoke = resolveInvokeDraft(invokeInput({ functions }));
    expect(invoke.defaultFunction).toBe('set-label');
    expect(invoke.mode).toBe('value');
    expect(invoke.functionOptions[0]).toBe('set-label');
  });
});

test.describe('the function slot', () => {
  const saved = (slug: string, createdAt: string, fn = 'set-label'): DraftSavedInvocation => ({
    invocationId: `inv-${slug}`,
    slug,
    spaceId: 'space-base',
    spaceSlug: 'payments-base',
    toolchainType: 'Kubernetes/YAML',
    calls: [{ FunctionName: fn, Arguments: [] }],
    parameters: [],
    createdAt,
  });
  const many = [
    saved('labels-a', '2026-09-01T10:00:00Z'),
    saved('labels-b', '2026-10-01T10:00:00Z'),
    saved('scale-up', '2026-10-15T10:00:00Z', 'set-replicas'),
    saved('labels-c', '2026-08-01T10:00:00Z'),
    saved('env-debug', '2026-10-10T10:00:00Z', 'set-env-var'),
  ];

  test('lists the 3 most recent saved Invocations before a search: last time\'s first, then the newest', () => {
    const fresh = resolveInvokeDraft(invokeInput({ invocations: many }));
    expect(fresh.recentInvocations.map((invocation) => invocation.slug)).toEqual(['scale-up', 'env-debug', 'labels-b']);
    // Every one is still there for the search.
    expect(fresh.invocationOptions).toHaveLength(5);
    const last: DraftInvokeLast = { invocation: many[3], parameters: {}, whereUnit: '' };
    expect(resolveInvokeDraft(invokeInput({ invocations: many, last })).recentInvocations.map((invocation) => invocation.slug)).toEqual(['labels-c', 'scale-up', 'env-debug']);
  });

  test('ranks the Invocations that ran on this base first, then those saved in it, then any other Space', () => {
    const elsewhere = (slug: string, createdAt: string): DraftSavedInvocation => ({
      ...saved(slug, createdAt),
      invocationId: `inv-${slug}`,
      spaceId: 'space-platform',
      spaceSlug: 'platform',
    });
    const all = [...many, elsewhere('platform-labels', '2026-10-20T10:00:00Z'), elsewhere('platform-old', '2026-07-01T10:00:00Z')];
    // labels-a ran most recently here, then platform-old; neither is among the newest saved.
    const ranHere = ['inv-labels-a', 'inv-platform-old', 'inv-labels-a'];
    expect(rankInvocations(all, undefined, ranHere, 'space-base').map((invocation) => invocation.slug)).toEqual([
      'labels-a',
      'platform-old',
      'scale-up',
      'env-debug',
      'labels-b',
      'labels-c',
      'platform-labels',
    ]);
    // Last time's leads, even ahead of a more recent run here.
    expect(rankInvocations(all, 'inv-labels-c', ranHere, 'space-base').map((invocation) => invocation.slug).slice(0, 3)).toEqual([
      'labels-c',
      'labels-a',
      'platform-old',
    ]);
    // Fewer than 3 ran here: the base's newest fill the short list, then other Spaces'.
    const draft = resolveInvokeDraft(invokeInput({ invocations: all, ranHere: ['inv-platform-old'] }));
    expect(draft.recentInvocations.map((invocation) => invocation.slug)).toEqual(['platform-old', 'scale-up', 'env-debug']);
    const onlyElsewhere = resolveInvokeDraft(invokeInput({ invocations: all.filter((invocation) => invocation.spaceId !== 'space-base') }));
    expect(onlyElsewhere.recentInvocations.map((invocation) => invocation.slug)).toEqual(['platform-labels', 'platform-old']);
  });

  test('the search finds a saved Invocation by its slug, its Space or a function it runs', () => {
    expect(many.filter((invocation) => invocationMatches(invocation, 'labels')).map((invocation) => invocation.slug)).toEqual(['labels-a', 'labels-b', 'labels-c']);
    expect(many.filter((invocation) => invocationMatches(invocation, 'replicas')).map((invocation) => invocation.slug)).toEqual(['scale-up']);
    expect(many.filter((invocation) => invocationMatches(invocation, 'payments-base/env')).map((invocation) => invocation.slug)).toEqual(['env-debug']);
    expect(many.filter((invocation) => invocationMatches(invocation, '  ')).length).toBe(5);
  });
});

test.describe('an Invoke draft on another function', () => {
  test("starts with set-label on the base's workloads, and a key and a value to type", () => {
    const invoke = resolveInvokeDraft(invokeInput({ address: { fn: 'set-label' } }));
    expect(invoke.mode).toBe('value');
    expect(invoke.functionName).toBe('set-label');
    expect(invoke.args.map((arg) => arg.slot.label)).toEqual(['key', 'value']);
    expect(invoke.picksResources).toBe(true);
    // The workloads, not every resource; listed first.
    expect(invoke.where.value).toBe("Slug IN ('payments-api', 'payments-worker')");
    expect(invoke.whereDefault).toBe(invoke.where.value);
    expect(invoke.resources.map((option) => option.unitSlug)).toEqual(['payments-api', 'payments-worker', 'payments-config']);
    expect(invoke.problems.map((problem) => [problem.code, problem.blockerLabel])).toEqual([
      ['arg-empty', draftCopy.invoke.problems.argEmpty('key')],
      ['arg-empty', draftCopy.invoke.problems.argEmpty('value')],
    ]);
  });

  test('offers the common functions, and searches the other mutating ones, never a validating one', () => {
    const invoke = resolveInvokeDraft(invokeInput({ address: { fn: 'set-label' } }));
    expect(invoke.functionOptions).toEqual(['set-container-image', 'set-label', 'set-replicas', 'set-container-resources']);
    expect(invoke.moreFunctions).toEqual([]);
    expect(invoke.invocationOptions.map((invocation) => invocation.slug)).toEqual(['scale', 'set-image-tag']);
  });

  test("a function that names its container runs where the base runs it, and has no Resources picker", () => {
    const invoke = resolveInvokeDraft(invokeInput({ address: { fn: 'set-container-resources', params: { operation: 'all', memory: '1Gi', 'limit-factor': '2' } } }));
    expect(invoke.picksResources).toBe(false);
    expect(invoke.args.find((arg) => arg.slot.sense === 'container')?.text).toBe('api');
    expect(invoke.where.value).toBe("Slug = 'payments-api'");
    expect(invoke.problems).toEqual([]);
  });

  test('a picked Invocation takes its declared parameters, coerced, and saves nothing', () => {
    const invoke = resolveInvokeDraft(invokeInput({ address: { inv: 'payments-base/scale', params: { count: '4' } } }));
    expect(invoke.parameters).toEqual({ count: 4 });
    expect(invoke.invocationId).toBe('inv-scale');
    expect(invoke.save).toBeUndefined();
    const refused = resolveInvokeDraft(invokeInput({ address: { inv: 'payments-base/scale', params: { count: 'four' } } }));
    expect(refused.problems.map((problem) => problem.code)).toEqual(['arg-refused']);
    expect(refused.previewRequest).toBeUndefined();
  });

  test('a saved Invocation that runs exactly the call typed is adopted, whatever its name, and previewed as itself', () => {
    const address = { fn: 'set-label', params: { 'label-key': 'team', 'label-value': 'payments' } };
    const first = resolveInvokeDraft(invokeInput({ address }));
    expect(first.save?.Slug).toBe('payments-2026-10-20');
    expect(first.adopted).toBeUndefined();
    expect(first.request).toMatchObject({ invocationId: undefined, parameters: { label_key: 'team', label_value: 'payments' } });
    const saved: DraftSavedInvocation = {
      invocationId: 'inv-left',
      slug: 'payments-2026-10-01',
      spaceId: 'space-base',
      spaceSlug: 'payments-base',
      toolchainType: 'Kubernetes/YAML',
      calls: first.save?.FunctionInvocations ?? [],
      parameters: first.save?.Parameters ?? [],
    };
    const again = resolveInvokeDraft(invokeInput({ address, invocations: [SET_IMAGE_TAG, SCALE, saved] }));
    expect(again.adopted?.invocationId).toBe('inv-left');
    expect(again.save).toBeUndefined();
    expect(again.invocationId).toBe('inv-left');
    expect(again.previewRequest).toEqual({ ToolchainType: 'Kubernetes/YAML', ParameterizedInvocations: [{ InvocationID: 'inv-left', Parameters: { label_key: 'team', label_value: 'payments' } }] });
    // The slot still shows the function: the call is the same, only what Create does differs.
    expect(again.source.value).toEqual({ kind: 'function', name: 'set-label' });
  });

  test("one of the draft's name that runs something else is said on the name, and no request is made of it", () => {
    const address = { fn: 'set-label', params: { 'label-key': 'team', 'label-value': 'payments' } };
    const other: DraftSavedInvocation = { invocationId: 'inv-other', slug: 'payments-2026-10-20', spaceId: 'space-base', spaceSlug: 'payments-base', toolchainType: 'Kubernetes/YAML', calls: [{ FunctionName: 'set-annotation', Arguments: [] }], parameters: [] };
    const taken = resolveInvokeDraft(invokeInput({ address, invocations: [other] }));
    expect(taken.problems.map((problem) => [problem.row, problem.code])).toEqual([['name', 'invocation-name-taken']]);
    expect(taken.save).toBeUndefined();
    expect(taken.request).toBeUndefined();
  });

  test('holding a saved Invocation runs it from now on: the typed values move to its parameters', () => {
    const address = { fn: 'set-label', params: { 'label-key': 'team', 'label-value': 'payments' } };
    const invoke = resolveInvokeDraft(invokeInput({ address }));
    const saved: DraftSavedInvocation = { invocationId: 'inv-new', slug: 'payments-2026-10-20', spaceId: 'space-base', spaceSlug: 'payments-base', toolchainType: 'Kubernetes/YAML', calls: invoke.save?.FunctionInvocations ?? [], parameters: invoke.save?.Parameters ?? [] };
    const pin = pinPatch('value', saved, invoke.args);
    const next = parseDraftAddress(applyDraftAddressPatch(new URLSearchParams('space=payments-base&kind=value&fn=set-label&p.label-key=team&p.label-value=payments'), pin));
    expect(next).toMatchObject({ inv: 'payments-base/payments-2026-10-20', params: { label_key: 'team', label_value: 'payments' } });
    expect(next.fn).toBeUndefined();
    // Renamed after: the draft still runs that Invocation, and saves nothing.
    const renamed = resolveInvokeDraft(invokeInput({ address: next, invocations: [saved], name: 'payments-2026-10-20-b' }));
    expect(renamed.save).toBeUndefined();
    expect(renamed.invocationId).toBe('inv-new');
    expect(pinPatch('image', SET_IMAGE_TAG, [])).toEqual({ inv: 'platform/set-image-tag', fn: null, img: null });
  });

  test('a function or an Invocation that names nothing is said, with the way back to the default', () => {
    const fn = resolveInvokeDraft(invokeInput({ address: { fn: 'set-colour' } }));
    expect(fn.problems[0]).toMatchObject({ code: 'function-unknown', fix: { label: draftCopy.invoke.fixes.useFunction('set-container-image'), patch: { fn: null, inv: null, params: null } } });
    const inv = resolveInvokeDraft(invokeInput({ address: { inv: 'platform/gone' } }));
    expect(inv.problems[0]).toMatchObject({ code: 'invocation-unknown' });
  });
});

// ---------------------------------------------------------------------------
// The function dry run, classified
// ---------------------------------------------------------------------------

const imageDiff = (container: string, from: string, to: string): ConfigDiff => ({
  Resources: [
    {
      Resource: { ResourceName: `payments/payments-${container}`, ResourceNameWithoutScope: `payments-${container}`, ResourceType: 'apps/v1/Deployment' },
      ChangeType: 'Update',
      Changes: [
        {
          Path: `spec.template.spec.containers.?name=${container};@0.image`,
          DisplayPath: `spec.template.spec.containers.?name=${container}.image`,
          ChangeType: 'Update',
          FromValue: from,
          ToValue: to,
        },
      ],
    },
  ],
});

/** Four variants with a worker, prod-ap without one; each holds payments-api too. */
function workerFixture() {
  const spaces = ['dev', 'prod-eu', 'prod-us', 'prod-ap'];
  const nameBySpaceId = new Map(spaces.map((space) => [space, space]));
  const units = spaces.flatMap((space) => [
    { unitId: `${space}-api`, slug: 'payments-api', spaceId: space, upstreamUnitId: 'base-api', data: API },
    ...(space === 'prod-ap' ? [] : [{ unitId: `${space}-worker`, slug: 'payments-worker', spaceId: space, upstreamUnitId: 'base-worker', data: WORKER }]),
  ]);
  const results: FunctionInvocationsResponse[] = spaces
    .filter((space) => space !== 'prod-ap')
    .map((space) => ({
      UnitID: `${space}-worker`,
      SpaceID: space,
      ConfigData: WORKER.replace('payments-worker:1.15.0', 'payments-worker:1.15.1'),
      Diff: imageDiff('worker', 'ghcr.io/acme/payments-worker:1.15.0', 'ghcr.io/acme/payments-worker:1.15.1'),
      Success: true,
    }));
  return { spaces, nameBySpaceId, units, results };
}

test.describe('the function dry run, classified the detail view’s way', () => {
  test("a variant the call changes nothing in is an outlier, 'nothing to change here', never undetermined", () => {
    const { spaces, nameBySpaceId, units, results } = workerFixture();
    const preview = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results });
    expect(preview.totals).toMatchObject({ variants: 4, same: 3, differs: 0, nothing: 1, unknown: 0, adds: 0 });
    // Neutral, and as precise as the data: it has no payments-worker.
    expect(preview.outliers.map((outlier) => [outlier.name, outlier.text])).toEqual([['prod-ap', draftCopy.outlier.lacks('payments-worker')]]);
    expect(preview.stages[0].outcome.groups.map((group) => [group.kind, group.spaceIds])).toEqual([
      ['nothing', ['prod-ap']],
      ['same', ['dev', 'prod-eu', 'prod-us']],
    ]);
    expect(preview.undeterminedSpaceIds).toEqual([]);
    // The Units the selection does not reach are unchanged, and in no diff.
    expect([...preview.diffsBySpaceId.keys()].sort()).toEqual(['dev', 'prod-eu', 'prod-us']);
  });

  test('"At the source" groups the variants by the change they take, the largest group first, in scope order', () => {
    const { spaces, nameBySpaceId, units, results } = workerFixture();
    const preview = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results });
    // A variant the call changes nothing in has nothing at the source.
    expect(preview.sourceGroups.map((group) => [group.names, group.groups.map((unit) => unit.resourceName)])).toEqual([[['dev', 'prod-eu', 'prod-us'], ['payments-worker']]]);
    expect(preview.sourceDiffs).toHaveLength(1);
    // Along the path: a scope listed prod first still reads dev first.
    const pathed = assembleInvokePreview({
      stages: [
        { stageId: 'dev', spaceIds: ['dev'] },
        { stageId: 'prod', spaceIds: ['prod-ap', 'prod-eu', 'prod-us'] },
      ],
      inScopeSpaceIds: ['prod-ap', 'prod-eu', 'prod-us', 'dev'],
      nameBySpaceId,
      units,
      results,
    });
    expect(pathed.sourceGroups[0].names).toEqual(['dev', 'prod-eu', 'prod-us']);
  });

  test("a variant that changes, without a resource the others change, says so; an error is undetermined", () => {
    const { spaces, nameBySpaceId, units, results } = workerFixture();
    const apiChange: FunctionInvocationsResponse[] = spaces.map((space) => ({
      UnitID: `${space}-api`,
      SpaceID: space,
      ConfigData: API,
      Diff: imageDiff('api', 'a:1', 'a:2'),
    }));
    const withError = [...results, ...apiChange.slice(0, 3), { UnitID: 'prod-ap-api', SpaceID: 'prod-ap', Error: { Message: 'boom', Status: 500 } }];
    const errored = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: withError as FunctionInvocationsResponse[] });
    expect(errored.undeterminedSpaceIds).toEqual(['prod-ap']);
    const lacks = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: [...results, ...apiChange] });
    expect(lacks.outliers.map((outlier) => [outlier.name, outlier.text])).toEqual([['prod-ap', draftCopy.outlier.lacks('payments-worker')]]);
  });

  test('a Unit the function writes nothing to comes back without configuration, and is unchanged, not unknown', () => {
    const { spaces, nameBySpaceId, units, results } = workerFixture();
    const untouched: FunctionInvocationsResponse[] = spaces.map((space) => ({ UnitID: `${space}-api`, SpaceID: space, Success: true, HasNewMutations: false, Diff: { Resources: [] } }));
    const preview = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: [...results, ...untouched] });
    expect(preview.undeterminedSpaceIds).toEqual([]);
    expect(preview.totals).toMatchObject({ same: 3, differs: 0, nothing: 1, unknown: 0 });
    const nothing = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: untouched });
    expect(nothing.nothingChanges).toBe(true);
  });

  test('a run that could not say anything anywhere is told apart from one that changes nothing', () => {
    const { spaces, nameBySpaceId, units } = workerFixture();
    const errors = spaces.map((space) => ({ UnitID: `${space}-api`, SpaceID: space, Error: { Message: 'boom', Status: 500 } })) as FunctionInvocationsResponse[];
    const preview = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: errors });
    expect(preview.noneEstablished).toBe(true);
    expect(preview.nothingChanges).toBe(false);
  });

  test("variants with nothing to change are a group of their own, never a 'Differs' of no fields", () => {
    const outcome: ChangeOrderOutcome = {
      groups: [
        { kind: 'differs', spaceIds: ['a', 'b'], labels: ['a', 'b'], representativeSpaceId: 'a' },
        { kind: 'same', spaceIds: ['c'], labels: ['c'], representativeSpaceId: 'c' },
      ],
      variantCount: 3,
      tooFewToCompare: false,
      partial: false,
    };
    expect(withNothingHere(outcome, new Set(['a'])).groups.map((group) => [group.kind, group.spaceIds, group.representativeSpaceId])).toEqual([
      ['differs', ['b'], 'b'],
      ['nothing', ['a'], 'a'],
      ['same', ['c'], 'c'],
    ]);
    expect(withNothingHere(outcome, new Set())).toBe(outcome);
  });

  test('a call that changes nothing anywhere has no count', () => {
    const { spaces, nameBySpaceId, units } = workerFixture();
    const same: FunctionInvocationsResponse[] = spaces.map((space) => ({ UnitID: `${space}-api`, SpaceID: space, ConfigData: API, Diff: { Resources: [] } }));
    const preview = assembleInvokePreview({ stages: [{ stageId: 'all', spaceIds: spaces }], inScopeSpaceIds: spaces, nameBySpaceId, units, results: same });
    expect(preview.nothingChanges).toBe(true);
    expect(preview.totals).toBeUndefined();
    expect(preview.outliers).toEqual([]);
  });

  test('an Invoke outcome never says "Adds resources": an Invoke promotion clones nothing', () => {
    const outcome: ChangeOrderOutcome = {
      groups: [
        { kind: 'differs', spaceIds: ['a'], labels: ['a'], representativeSpaceId: 'a' },
        { kind: 'adds', spaceIds: ['b'], labels: ['b'], representativeSpaceId: 'b' },
        { kind: 'same', spaceIds: ['c'], labels: ['c'], representativeSpaceId: 'c' },
      ],
      variantCount: 3,
      tooFewToCompare: false,
      partial: false,
    };
    expect(withoutAdds(outcome).groups.map((group) => [group.kind, group.spaceIds])).toEqual([
      ['differs', ['a', 'b']],
      ['same', ['c']],
    ]);
  });
});

// ---------------------------------------------------------------------------
// A Transform paths draft
// ---------------------------------------------------------------------------

const FACTS: DraftFanOutUnit = { unitId: 'unit-telemetry', slug: 'telemetry', spaceId: 'space-facts', spaceSlug: 'platform-facts', headRevisionNum: 5 };
const fanOutLink = (variant: string, overrides: Partial<DraftFanOutLink> = {}): DraftFanOutLink => ({
  linkId: `link-${variant}`,
  slug: `otel-${variant}`,
  spaceId: `space-${variant}`,
  fromUnitId: `config-${variant}`,
  toUnitId: FACTS.unitId,
  toSpaceId: FACTS.spaceId,
  updateType: 'TransformPaths',
  autoUpdate: false,
  lastMergedRevisionNum: 3,
  upstreamPaths: [{ Name: 'endpoint', Path: 'data.otlpEndpoint' }],
  upstreamGetters: undefined,
  ...overrides,
});
const LINKS = VARIANTS.map((variant) => fanOutLink(variant.name));
const SCOPE = VARIANTS.map((variant) => variant.spaceId);
const revision = (revisionNum: number, tagIds: string[] = []): DraftFanOutRevision => ({
  revisionId: `rev-${revisionNum}`,
  unitId: FACTS.unitId,
  revisionNum,
  description: `change ${revisionNum}`,
  createdAt: undefined,
  tagIds,
});
const CLOSED = { slug: 'facts-q4', spaceId: FACTS.spaceId, spaceSlug: FACTS.spaceSlug, endTagId: 'tag-q4', description: '' };

function fanOutInput(search: string, overrides: Partial<ResolveFanOutInput> = {}): ResolveFanOutInput {
  return {
    address: parseDraftAddress(new URLSearchParams(search)),
    last: undefined,
    links: LINKS,
    scopeIds: SCOPE,
    variants: VARIANTS,
    units: new Map([[FACTS.unitId, FACTS]]),
    revisions: [revision(4, ['tag-q4']), revision(5)],
    changeSets: [CLOSED],
    ...overrides,
  };
}

test.describe('a Transform paths draft', () => {
  test("follows the server's Links: of its type, from a variant in scope, into a Space outside it", () => {
    const own = fanOutLink('dev', { linkId: 'own', slug: 'a-own', toSpaceId: 'space-dev' });
    const inside = fanOutLink('dev', { linkId: 'inside', slug: 'a-inside', toSpaceId: 'space-prod-eu' });
    const upsert = fanOutLink('dev', { linkId: 'upsert', slug: 'a-upsert', updateType: 'Upsert' });
    const away = fanOutLink('elsewhere');
    const followed = fanOutLinksOf([...LINKS, own, inside, upsert, away], 'TransformPaths', SCOPE);
    expect(followed.map((link) => link.slug)).toEqual(['otel-dev', 'otel-prod-ap', 'otel-prod-eu']);
    expect(fanOutLinksOf([upsert], 'Upsert', SCOPE)).toHaveLength(1);
  });

  test('is offered where some type follows a Link, unknown while read, and not where none does', () => {
    const available = fanOutAvailability(LINKS, SCOPE);
    expect(available).toEqual({ TransformPaths: 'available', Upsert: 'unavailable', Insert: 'unavailable' });
    expect(fanOutOffered(available)).toBe('available');
    expect(fanOutOffered(fanOutAvailability(undefined, SCOPE))).toBe('unknown');
    expect(fanOutOffered(fanOutAvailability(LINKS, ['space-elsewhere']))).toBe('unavailable');
    expect(fanOutOffered(fanOutAvailability([], SCOPE))).toBe('unavailable');
  });

  test('takes the type whose Links reach the scope, offers only those, and keeps last time where it still reaches', () => {
    const fanOut = resolveFanOutDraft(fanOutInput('kind=transform'));
    expect(fanOut.type).toEqual({ value: 'TransformPaths', last: undefined, differsFromLast: false });
    expect(fanOut.types).toEqual(['TransformPaths']);
    const both = [...LINKS, fanOutLink('dev', { linkId: 'up', slug: 'up', updateType: 'Upsert' })];
    const fromUpsert = resolveFanOutDraft(fanOutInput('kind=transform', { links: both, last: past('facts-sync', 'Upsert') }));
    expect(fromUpsert.type).toEqual({ value: 'Upsert', last: 'Upsert', differsFromLast: false });
    expect(fromUpsert.types).toEqual(['TransformPaths', 'Upsert']);
    const picked = resolveFanOutDraft(fanOutInput('kind=transform&via=TransformPaths', { links: both, last: past('facts-sync', 'Upsert') }));
    expect(picked.type).toEqual({ value: 'TransformPaths', last: 'Upsert', differsFromLast: true });
  });

  test("carries each source's Revisions from where the variants are to the head, previewed by a resolve to it", () => {
    const links = [fanOutLink('dev', { lastMergedRevisionNum: 2 }), ...LINKS.slice(1)];
    const fanOut = resolveFanOutDraft(fanOutInput('kind=transform', { links, revisions: [revision(3), revision(4, ['tag-q4']), revision(5)] }));
    expect(fanOut.problems).toEqual([]);
    const [source] = fanOut.sources;
    expect(source).toMatchObject({ start: 2, highest: 3, end: 5, skip: undefined, paths: ['data.otlpEndpoint'] });
    expect(source.revisions.map((entry) => entry.revisionNum)).toEqual([3, 4, 5]);
    expect(fanOut.carried).toBe(3);
    expect(fanOut.sourceName).toBe('platform-facts');
    expect(fanOut.request).toEqual({ updateType: 'TransformPaths', endTagId: undefined });
    expect(fanOut.previewRequest).toEqual({
      fromUnitIds: ['config-dev', 'config-prod-ap', 'config-prod-eu'],
      linkWhere: `UpdateType = 'TransformPaths' AND ToUnitID IN ('unit-telemetry')`,
      mergeEnd: undefined,
    });
  });

  test("ends at a closed ChangeSet where named: the Revision its end Tag marks, resolved to that Tag", () => {
    const fanOut = resolveFanOutDraft(fanOutInput('kind=transform&until=facts-q4'));
    expect(fanOut.end).toEqual({ kind: 'changeSet', changeSet: CLOSED });
    expect(fanOut.sources[0]).toMatchObject({ end: 4, skip: undefined });
    expect(fanOut.sources[0].revisions.map((entry) => entry.revisionNum)).toEqual([4]);
    expect(fanOut.request).toEqual({ updateType: 'TransformPaths', endTagId: 'tag-q4' });
    expect(fanOut.previewRequest?.mergeEnd).toBe('Tag:tag-q4');
    // A ChangeSet no Revision of the source carries passes it over, and then nothing is carried.
    const unmarked = resolveFanOutDraft(fanOutInput('kind=transform&until=facts-q4', { revisions: [revision(5)] }));
    expect(unmarked.sources[0].skip).toBe('notMarked');
    expect(unmarked.problems.map((problem) => problem.code)).toEqual(['nothing-to-carry']);
    // One that is not there is said, with the way back to the latest.
    const missing = resolveFanOutDraft(fanOutInput('kind=transform&until=gone'));
    expect(missing.problems.find((problem) => problem.code === 'fan-out-end-not-found')?.fix?.patch).toEqual({ until: null });
  });

  test('says what the server refuses: an AutoUpdate Link, a variant past the end, and nothing to carry', () => {
    const automatic = resolveFanOutDraft(fanOutInput('kind=transform', { links: [fanOutLink('dev', { autoUpdate: true }), ...LINKS.slice(1)] }));
    const auto = automatic.problems.find((problem) => problem.code === 'auto-update');
    expect(auto).toMatchObject({ row: 'where', blocks: true });
    expect(auto?.fix?.patch).toEqual({ out: ['payments-dev'] });
    const ahead = resolveFanOutDraft(fanOutInput('kind=transform&until=facts-q4', { links: [fanOutLink('dev', { lastMergedRevisionNum: 5 }), ...LINKS.slice(1)] }));
    expect(ahead.problems.find((problem) => problem.code === 'past-end')?.fix?.patch).toEqual({ until: null });
    const taken = resolveFanOutDraft(fanOutInput('kind=transform', { links: LINKS.map((link) => ({ ...link, lastMergedRevisionNum: 5 })) }));
    expect(taken.sources[0].skip).toBe('alreadyTaken');
    expect(taken.problems.map((problem) => problem.code)).toEqual(['nothing-to-carry']);
  });

  test('without a Link of the type it blocks, and points at the type that has them', () => {
    const none = resolveFanOutDraft(fanOutInput('kind=transform', { links: [] }));
    expect(none.problems.map((problem) => problem.code)).toEqual(['no-shared-source']);
    expect(none.request).toBeUndefined();
    expect(none.previewRequest).toBeUndefined();
    const wrong = resolveFanOutDraft(fanOutInput('kind=transform&via=Upsert'));
    expect(wrong.types).toEqual(['TransformPaths', 'Upsert']);
    expect(wrong.problems.find((problem) => problem.code === 'no-shared-source')?.fix?.patch).toEqual({ via: null });
  });

  test('a fan-out ChangeOrder re-aims as Transform paths, and its request names the type and end and runs nothing', () => {
    expect(kindOfPast(past('facts-sync', 'TransformPaths'))).toBe('transformPaths');
    expect(kindOfPast(past('facts-sync', 'Insert'))).toBe('transformPaths');
    const decisions = decide('space=payments-base&kind=transform&wf=main-line');
    expect(decisions.kind.value).toBe('transformPaths');
    const request = draftCreateRequest({ decisions, endTagId: undefined, fanOut: { updateType: 'TransformPaths', endTagId: 'tag-q4' } });
    expect(request).toMatchObject({ UpdateType: 'TransformPaths', EndTagID: 'tag-q4', ChangeWorkflowID: 'wf-main' });
    expect(request?.InvocationID).toBeUndefined();
    expect(request?.Parameters).toBeUndefined();
    expect(draftCreateRequest({ decisions, endTagId: undefined, fanOut: undefined })).toBeUndefined();
  });

  test("the kind's fields ride in the URL beside the others' and survive a switch", () => {
    const before = new URLSearchParams('space=payments-base&kind=transform&via=Upsert&until=facts-q4&tag=1.15.1');
    const toInvoke = applyDraftAddressPatch(before, kindSwitchPatch({ next: 'invoke', address: parseDraftAddress(before), decisions: decide(before.toString()) }));
    expect(Object.fromEntries(toInvoke)).toMatchObject({ kind: 'invoke', via: 'Upsert', until: 'facts-q4', tag: '1.15.1' });
    expect(Object.fromEntries(applyDraftAddressPatch(before, { ...KIND_FIELDS_CLEARED, kind: null }))).toEqual({ space: 'payments-base' });
  });
});

test.describe('the Invoke kind', () => {
  test('is kind=invoke in the URL; the old kind=value and kind=image still open it', () => {
    expect(draftKindOfWord('invoke')).toBe('invoke');
    expect(draftKindOfWord('value')).toBe('invoke');
    expect(draftKindOfWord('image')).toBe('invoke');
    expect(DRAFT_KINDS).toEqual(['baseChanges', 'invoke', 'transformPaths']);
    expect(decide('space=payments-base&kind=image').kind.value).toBe('invoke');
    expect(draftKindOfWord('transform')).toBe('transformPaths');
    expect(draftCopy.kinds.invoke).toBe('Invoke');
  });
});
