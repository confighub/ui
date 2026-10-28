// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The kinds of change a draft can make, and what an Invoke kind is made of.
 *
 * - **Base changes**: the Revisions waiting in the base, carried over UpgradeUnit or MergeUnits
 *   Links.
 * - **Invoke**: an Invoke ChangeOrder that runs one function, with the same arguments, in each
 *   variant. By default the image function, which sets one container's image tag: the draft then
 *   asks for a container and a tag rather than the function's arguments (`DraftInvokeMode`).
 * - **Transform paths**: a fan-out ChangeOrder (TransformPaths, Upsert, Insert) that carries a new
 *   state of a shared source the variants read through their Links (`draftFanOut.ts`).
 *
 * AN INVOKE CHANGEORDER RUNS A SAVED INVOCATION. The draft lets a person pick a function and type
 * its arguments; Create then saves that call as a parameterized Invocation in the base Space
 * (`inlineInvocationBody`: each argument a declared parameter, fed by a template), and creates
 * the ChangeOrder with the Invocation and the typed values as its `Parameters`. Or a person picks
 * an Invocation saved before, and Create saves nothing.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type {
  FunctionArgument,
  FunctionInvocation,
  FunctionParameter,
  Invocation,
  InvocationRead,
} from '@confighub/rtk-query';

import { parseUnitDataStructured } from '../../x/apps/configParser';
import { parseImagePath, parseImageRef } from '../../x/apps/imageRef';
import { draftCopy } from './draftCopy';

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

export type DraftKind = 'baseChanges' | 'invoke' | 'transformPaths';

/** The kinds in the order the track offers them. */
export const DRAFT_KINDS: readonly DraftKind[] = ['baseChanges', 'invoke', 'transformPaths'];

/** What the URL calls each kind (`kind=invoke`): plain words. */
export const DRAFT_KIND_WORDS: Readonly<Record<DraftKind, string>> = {
  baseChanges: 'base',
  invoke: 'invoke',
  transformPaths: 'transform',
};

/**
 * Words a link written before may still use for a kind. `kind=value` was Invoke's; `kind=image`
 * was an image tag change, which Invoke makes with the image function (`IMAGE_KIND_WORD`).
 */
export const IMAGE_KIND_WORD = 'image';
const KIND_WORD_ALIASES: Readonly<Record<string, DraftKind>> = { value: 'invoke', [IMAGE_KIND_WORD]: 'invoke' };

/** The kind a URL's `kind` names; `undefined` for a word that names none. */
export function draftKindOfWord(word: string | undefined): DraftKind | undefined {
  if (word === undefined) return undefined;
  return DRAFT_KINDS.find((kind) => DRAFT_KIND_WORDS[kind] === word) ?? KIND_WORD_ALIASES[word];
}

/**
 * How an Invoke draft asks for its call: `image` for the image function (or a saved Invocation of
 * it whose container and image are its parameters), as a container and an image tag; `value` for
 * any other, as the function's arguments.
 */
export type DraftInvokeMode = 'image' | 'value';

/** The function an image tag change runs, Invoke's default, and the arguments it takes. */
export const IMAGE_FUNCTION = 'set-container-image';
export const IMAGE_ARGUMENTS = { container: 'container-name', image: 'container-image' } as const;

/** The functions Invoke offers after the image function, before any search: the ones a person sets across a fleet. */
export const COMMON_VALUE_FUNCTIONS: readonly string[] = [
  'set-label',
  'set-annotation',
  'set-env-var',
  'set-replicas',
  'set-container-resources',
];

/** The function Invoke starts with where the base's toolchain has no image function. */
export const DEFAULT_VALUE_FUNCTION = 'set-label';

// ---------------------------------------------------------------------------
// Saved Invocations
// ---------------------------------------------------------------------------

/** A saved Invocation, as the draft reads it. */
export interface DraftSavedInvocation {
  invocationId: string;
  slug: string;
  spaceId: string;
  spaceSlug: string;
  toolchainType: string;
  calls: FunctionInvocation[];
  /** Its declared parameters: what a ChangeOrder that runs it gives values for. */
  parameters: FunctionParameter[];
  /** The Bridge Worker it runs on; absent for the built-in executor. */
  bridgeWorkerId?: string;
  /** When it was saved: how recent it is, for the function slot's short list. */
  createdAt?: string;
}

export function savedInvocationOf(invocation: InvocationRead | undefined): DraftSavedInvocation | undefined {
  if (invocation?.InvocationID === undefined || invocation.SpaceID === undefined) return undefined;
  return {
    invocationId: invocation.InvocationID,
    slug: invocation.Slug,
    spaceId: invocation.SpaceID,
    spaceSlug: invocation.SpaceSlug ?? '',
    toolchainType: invocation.ToolchainType,
    calls: invocation.FunctionInvocations ?? [],
    parameters: invocation.Parameters ?? [],
    bridgeWorkerId: invocation.BridgeWorkerID || undefined,
    createdAt: invocation.CreatedAt || undefined,
  };
}

/** How the URL names a saved Invocation (`inv=platform/set-image-tag`): Space and slug, never an id. */
export const invocationRef = (invocation: Pick<DraftSavedInvocation, 'spaceSlug' | 'slug'>) =>
  `${invocation.spaceSlug}/${invocation.slug}`;

const TEMPLATE_PARAM = /^\{\{\s*\.Params\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/;
const CEL_PARAM = /^params\.([A-Za-z_][A-Za-z0-9_]*)$/;

/**
 * The declared parameter an argument is exactly, when it is nothing else: `{{ .Params.image }}`
 * (template) or `params.image` (cel). An argument that only mentions a parameter
 * (`ghcr.io/x:{{ .Params.tag }}`) is not one, so the row cannot give it a whole value.
 */
export function parameterFeeding(argument: FunctionArgument | undefined): string | undefined {
  if (argument === undefined || typeof argument.Value !== 'string') return undefined;
  const value = argument.Value.trim();
  if (argument.Evaluator === 'template') return TEMPLATE_PARAM.exec(value)?.[1];
  if (argument.Evaluator === 'cel') return CEL_PARAM.exec(value)?.[1];
  return undefined;
}

/** Which declared parameter feeds each argument of an Invocation's single call. */
function fedArguments(invocation: Pick<DraftSavedInvocation, 'calls'>): Map<string, string> | undefined {
  if (invocation.calls.length !== 1) return undefined;
  const fed = new Map<string, string>();
  for (const argument of invocation.calls[0].Arguments ?? []) {
    const parameter = parameterFeeding(argument);
    if (argument.ParameterName !== undefined && parameter !== undefined) fed.set(argument.ParameterName, parameter);
  }
  return fed;
}

/** The declared parameters the image rows give values to: the container's, and the image's. */
export interface DraftImageParameters {
  container: string;
  image: string;
}

/**
 * The parameters of an Invocation the image rows can run: one call of `IMAGE_FUNCTION` whose
 * container and image are each exactly a declared parameter, and nothing else declared. One that
 * fixes the container or the image, or wants more, is given its parameters one by one instead.
 */
export function imageParametersOf(invocation: Pick<DraftSavedInvocation, 'calls' | 'parameters'>): DraftImageParameters | undefined {
  if (invocation.calls[0]?.FunctionName !== IMAGE_FUNCTION) return undefined;
  const fed = fedArguments(invocation);
  const container = fed?.get(IMAGE_ARGUMENTS.container);
  const image = fed?.get(IMAGE_ARGUMENTS.image);
  if (container === undefined || image === undefined || container === image) return undefined;
  const declared = new Set(invocation.parameters.map((parameter) => parameter.ParameterName));
  if (declared.size !== 2 || !declared.has(container) || !declared.has(image)) return undefined;
  return { container, image };
}

/** How a draft running a saved Invocation asks for its values. */
export const invocationMode = (invocation: Pick<DraftSavedInvocation, 'calls' | 'parameters'>): DraftInvokeMode =>
  imageParametersOf(invocation) === undefined ? 'value' : 'image';

/** The function names an Invocation calls, in order: what its row and the rail name it by. */
export const functionNamesOf = (invocation: Pick<DraftSavedInvocation, 'calls'>) =>
  invocation.calls.flatMap((call) => (call.FunctionName === undefined ? [] : [call.FunctionName]));

// ---------------------------------------------------------------------------
// Argument slots: what the row asks for
// ---------------------------------------------------------------------------

/** What kind of input an argument takes. */
export type DraftArgSense = 'container' | 'enum' | 'text';

/** One input of the Run row: a function's argument, or a saved Invocation's declared parameter. */
export interface DraftArgSlot {
  /** The key it has in the URL (`p.<name>`) and in the request: the argument's or the parameter's name. */
  name: string;
  /** Its short name on the row: `key`, `value`, `container`. */
  label: string;
  /** Its declaration, for validation and for the enum's options. */
  parameter: FunctionParameter;
  sense: DraftArgSense;
  /**
   * The function takes an empty value as a value ("ignored if empty"): its own pattern accepts
   * one. Such an argument is sent empty rather than asked for.
   */
  emptyAllowed: boolean;
}

/** Whether a parameter's own pattern accepts an empty string: a text value it may be given empty. */
export function takesEmpty(parameter: FunctionParameter): boolean {
  if (parameter.DataType !== undefined && parameter.DataType !== '' && parameter.DataType !== 'string') return false;
  const pattern = parameter.Regexp ? goPattern(parameter.Regexp) : undefined;
  return pattern !== undefined && pattern.test('');
}

/**
 * An argument's short name, the way the row says it: the function's own word dropped
 * (`label-key` of `set-label` is `key`), a container name a `container`.
 */
export function argLabel(parameterName: string, functionName: string | undefined): string {
  const words = parameterName.replace(/_/g, '-').split('-').filter((word) => word !== '');
  const joined = words.join('-');
  if (joined === 'container-name' || joined === 'container') return 'container';
  if (joined === 'env-var') return 'variable';
  const own = new Set((functionName ?? '').split('-'));
  if (words.length > 1 && own.has(words[0])) return words.slice(1).join('-');
  return joined;
}

function senseOf(parameter: FunctionParameter, feeds: string | undefined): DraftArgSense {
  const names = [parameter.ParameterName ?? '', feeds ?? ''].map((name) => name.replace(/_/g, '-'));
  if (names.some((name) => name === 'container-name' || name === 'container')) return 'container';
  if (parameter.DataType === 'enum' || (parameter.EnumValues ?? []).length > 0) return 'enum';
  return 'text';
}

/** A function's arguments as the row's inputs, in the signature's order. */
export function argSlotsOfFunction(functionName: string, parameters: readonly FunctionParameter[]): DraftArgSlot[] {
  return parameters.flatMap((parameter) =>
    parameter.ParameterName === undefined
      ? []
      : [{ name: parameter.ParameterName, label: argLabel(parameter.ParameterName, functionName), parameter, sense: senseOf(parameter, undefined), emptyAllowed: takesEmpty(parameter) }],
  );
}

/** A saved Invocation's declared parameters as the row's inputs, in their declared order. */
export function argSlotsOfInvocation(invocation: Pick<DraftSavedInvocation, 'calls' | 'parameters'>): DraftArgSlot[] {
  const fed = new Map<string, string>();
  for (const call of invocation.calls)
    for (const argument of call.Arguments ?? []) {
      const parameter = parameterFeeding(argument);
      if (parameter !== undefined && argument.ParameterName !== undefined && !fed.has(parameter)) fed.set(parameter, argument.ParameterName);
    }
  const functionName = invocation.calls.length === 1 ? invocation.calls[0].FunctionName : undefined;
  return invocation.parameters.flatMap((parameter) => {
    const name = parameter.ParameterName;
    if (name === undefined) return [];
    const feeds = fed.get(name);
    return [{ name, label: argLabel(feeds ?? name, functionName), parameter, sense: senseOf(parameter, feeds), emptyAllowed: takesEmpty(parameter) }];
  });
}

// ---------------------------------------------------------------------------
// Values: the server's rules, before the server is asked
// ---------------------------------------------------------------------------

const NO_NAMES: ReadonlySet<string> = new Set();

/** `strconv.ParseBool`'s spellings. */
const BOOL_TRUE = new Set(['1', 't', 'T', 'TRUE', 'true', 'True']);
const BOOL_FALSE = new Set(['0', 'f', 'F', 'FALSE', 'false', 'False']);
/** `strconv.Atoi`: an optional sign and decimal digits. */
const INT = /^[+-]?\d+$/;

/** A value as the server coerces it for its declared type, or `undefined` when it cannot. */
function coerce(text: string, dataType: string | undefined): { ok: true; value: unknown } | { ok: false } {
  if (dataType === 'int') {
    if (!INT.test(text)) return { ok: false };
    const value = Number(text);
    return Number.isSafeInteger(value) ? { ok: true, value } : { ok: false };
  }
  if (dataType === 'bool') {
    if (BOOL_TRUE.has(text)) return { ok: true, value: true };
    if (BOOL_FALSE.has(text)) return { ok: true, value: false };
    return { ok: false };
  }
  return { ok: true, value: text };
}

/** A problem with one value, on the input it is about. */
export interface DraftValueProblem {
  name: string;
  /** `required`: nothing typed yet. The rest: what was typed is refused. */
  code: 'required' | 'unknown' | 'wholeNumber' | 'trueOrFalse' | 'oneOf' | 'pattern' | 'range';
  message: string;
}

/**
 * Parameter values for a saved Invocation, as `ValidateInvocationParameters` on the server takes
 * them: an empty value is no value; every required parameter has one; no key is undeclared; an
 * int or bool coerces as Go's `Atoi` and `ParseBool` do. What passes is coerced, as the server
 * coerces it. A name in `emptyAllowed` is sent empty when it is: the server takes a present empty
 * string, which the function reads as "leave it".
 */
export function validateInvocationParameters(
  declared: readonly FunctionParameter[],
  supplied: Readonly<Record<string, string>>,
  emptyAllowed: ReadonlySet<string> = NO_NAMES,
): { values: Record<string, unknown>; problems: DraftValueProblem[] } {
  const words = draftCopy.invoke.values;
  const byName = new Map(declared.flatMap((parameter) => (parameter.ParameterName === undefined ? [] : [[parameter.ParameterName, parameter] as const])));
  const values: Record<string, unknown> = {};
  const problems: DraftValueProblem[] = [];
  for (const name of Object.keys(supplied))
    if (!byName.has(name) && supplied[name] !== '') problems.push({ name, code: 'unknown', message: words.unknown(name) });
  for (const [name, parameter] of byName) {
    const text = supplied[name] ?? '';
    if (text === '' && emptyAllowed.has(name)) {
      values[name] = '';
      continue;
    }
    if (text === '') {
      if (parameter.Required === true) problems.push({ name, code: 'required', message: words.required });
      continue;
    }
    const coerced = coerce(text, parameter.DataType);
    if (!coerced.ok) {
      const code = parameter.DataType === 'int' ? 'wholeNumber' : 'trueOrFalse';
      problems.push({ name, code, message: code === 'wholeNumber' ? words.wholeNumber : words.trueOrFalse });
      continue;
    }
    values[name] = coerced.value;
  }
  return { values, problems };
}

/** A Go regular expression in the browser's dialect: `(?P<name>` is `(?<name>`. */
function goPattern(pattern: string): RegExp | undefined {
  try {
    return new RegExp(pattern.replace(/\(\?P</g, '(?<'));
  } catch {
    return undefined;
  }
}

/**
 * What the function itself refuses of a value, beyond the server's parameter checks: an enum's
 * other values, and a declared pattern. The row says it before the dry run comes back with it.
 */
export function functionValueProblem(slot: DraftArgSlot, text: string): DraftValueProblem | undefined {
  if (text === '') return undefined;
  const words = draftCopy.invoke.values;
  const options = slot.parameter.EnumValues ?? [];
  if (options.length > 0 && !options.includes(text)) return { name: slot.name, code: 'oneOf', message: words.oneOf(options.join(', ')) };
  const pattern = slot.parameter.Regexp ? goPattern(slot.parameter.Regexp) : undefined;
  if (pattern !== undefined && !pattern.test(text)) return { name: slot.name, code: 'pattern', message: words.pattern };
  return rangeProblem(slot, text);
}

/**
 * An int outside the function's declared range. The signature as listed writes an absent bound as
 * 0, so only a bound that cannot be an absent one is checked here: a floor above 0, a ceiling above
 * the floor. The function's own refusal says the rest (`rangeRefusalOf`).
 */
function rangeProblem(slot: DraftArgSlot, text: string): DraftValueProblem | undefined {
  if (slot.parameter.DataType !== 'int' || !INT.test(text)) return undefined;
  const value = Number(text);
  const min = slot.parameter.Min ?? 0;
  const max = slot.parameter.Max ?? 0;
  const hasMax = max > min;
  if (!(min > 0 && value < min) && !(hasMax && value > max)) return undefined;
  return { name: slot.name, code: 'range', message: rangeWords(min, hasMax ? max : undefined) };
}

const rangeWords = (min: number | undefined, max: number | undefined) => {
  const words = draftCopy.invoke.values;
  if (min !== undefined && max !== undefined) return words.between(min, max);
  if (min !== undefined) return words.atLeast(min);
  return words.atMost(max ?? 0);
};

/**
 * A function's refusal of one argument's value, from the dry run's message ("argument replicas
 * value -1 is out of range [0,]"): the argument it is about, and the range in the row's words.
 */
export function rangeRefusalOf(message: string): { name: string; message: string } | undefined {
  const found = /argument (\S+) value -?\d+ is out of range \[(-?\d*),(-?\d*)\]/.exec(message);
  if (found === null) return undefined;
  const bound = (text: string) => (text === '' ? undefined : Number(text));
  const min = bound(found[2]);
  const max = bound(found[3]);
  if (min === undefined && max === undefined) return undefined;
  return { name: found[1], message: rangeWords(min, max) };
}

/** A function's error as the row says it: its own words, without the run's wrapper. */
export const functionErrorText = (message: string) =>
  message.replace(/^\s*Function invocations failed\s*/i, '').replace(/^Details:\s*/i, '').trim();

// ---------------------------------------------------------------------------
// The Invocation Create saves
// ---------------------------------------------------------------------------

/** A declared parameter's name for an argument: an identifier, as the server requires. */
export function parameterIdentOf(argumentName: string): string {
  const ident = argumentName.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(ident) ? `_${ident}` : ident;
}

/** An argument as the inline call holds it: its name, its declaration, its typed text. */
export interface DraftFilledArg {
  slot: DraftArgSlot;
  text: string;
}

/** Whether a typed argument is sent: anything typed, and an empty one the function takes empty. */
const sent = (arg: DraftFilledArg) => arg.text !== '' || arg.slot.emptyAllowed;

/**
 * The call the draft makes, as one function and its typed arguments: what the dry run runs before
 * anything is saved. Arguments left empty are not sent, as an optional argument left out, unless
 * the function takes them empty.
 */
export function inlineCall(functionName: string, args: readonly DraftFilledArg[]): FunctionInvocation {
  return {
    FunctionName: functionName,
    Arguments: args.filter(sent).map((arg) => ({ ParameterName: arg.slot.name, Value: arg.text })),
  };
}

/**
 * The parameterized Invocation Create saves for an inline call: the same function, each argument
 * a declared parameter fed by a template. The ChangeOrder then gives the typed values as its
 * `Parameters` (`inlineParameters`), so the saved Invocation and the dry run run the same call.
 * Each declared parameter keeps the function's checks (pattern, range, example), so a draft that
 * runs the saved Invocation later checks its values as this one did.
 */
export function inlineInvocationBody(input: {
  slug: string;
  toolchainType: string;
  functionName: string;
  args: readonly DraftFilledArg[];
}): Invocation {
  const filled = input.args.filter(sent);
  return {
    Slug: input.slug,
    ToolchainType: input.toolchainType,
    FunctionInvocations: [
      {
        FunctionName: input.functionName,
        Arguments: filled.map((arg) => ({
          ParameterName: arg.slot.name,
          Value: `{{ .Params.${parameterIdentOf(arg.slot.name)} }}`,
          Evaluator: 'template',
        })),
      },
    ],
    Parameters: filled.map((arg) => declaredParameterOf(arg.slot)),
  };
}

/** The parameter an inline call's argument is declared as, in the Invocation Create saves. */
function declaredParameterOf(slot: DraftArgSlot): FunctionParameter {
  const source = slot.parameter;
  const declared: FunctionParameter = { ParameterName: parameterIdentOf(slot.name), DataType: source.DataType || 'string', Required: true };
  if (source.Description) declared.Description = source.Description;
  if (source.Example) declared.Example = source.Example;
  if (source.Regexp) declared.Regexp = source.Regexp;
  if ((source.EnumValues ?? []).length > 0) declared.EnumValues = source.EnumValues;
  if (source.DataType === 'int') {
    declared.Min = source.Min;
    declared.Max = source.Max;
  }
  return declared;
}

/** The values the ChangeOrder gives the Invocation `inlineInvocationBody` makes. */
export function inlineParameters(args: readonly DraftFilledArg[]): Record<string, unknown> {
  const filled = args.filter(sent);
  const declared = filled.map((arg) => declaredParameterOf(arg.slot));
  const supplied = Object.fromEntries(filled.map((arg) => [parameterIdentOf(arg.slot.name), arg.text]));
  const empty = new Set(filled.filter((arg) => arg.text === '').map((arg) => parameterIdentOf(arg.slot.name)));
  return validateInvocationParameters(declared, supplied, empty).values;
}

/** An argument, as the server's identity of an Invocation reads it. */
const argumentText = (argument: FunctionArgument) => `${argument.ParameterName ?? ''}\u0000${String(argument.Value ?? '')}\u0000${argument.Evaluator ?? ''}`;

const isEmptyList = (value: unknown) => value === undefined || value === null || (Array.isArray(value) && value.length === 0);
const isEmptyMap = (value: unknown) => value === undefined || value === null || (typeof value === 'object' && Object.keys(value).length === 0);

/**
 * Whether a saved Invocation runs exactly what an inline call would save, field by field as the
 * server tells two Invocations apart (`ComputeInvocationHash`): the toolchain, each call's function,
 * resource filter, arguments, clearance and guards in order, the declared parameters in order, and
 * the worker it runs on. A saved one that differs in any of them runs something else, and is never
 * taken for the call typed.
 */
export function sameInvocationShape(
  saved: Pick<DraftSavedInvocation, 'calls' | 'parameters' | 'toolchainType' | 'bridgeWorkerId'>,
  wanted: Pick<Invocation, 'FunctionInvocations' | 'Parameters' | 'ToolchainType' | 'BridgeWorkerID'>,
): boolean {
  if (saved.toolchainType !== wanted.ToolchainType) return false;
  if ((saved.bridgeWorkerId ?? '') !== (wanted.BridgeWorkerID ?? '')) return false;
  const calls = wanted.FunctionInvocations ?? [];
  if (saved.calls.length !== calls.length) return false;
  for (let i = 0; i < calls.length; i += 1) {
    const a = saved.calls[i];
    const b = calls[i];
    if (a.FunctionName !== b.FunctionName) return false;
    if ((a.WhereResource ?? '') !== (b.WhereResource ?? '')) return false;
    if (!isEmptyList(a.Clearance) || !isEmptyList(b.Clearance)) {
      if (JSON.stringify(a.Clearance ?? []) !== JSON.stringify(b.Clearance ?? [])) return false;
    }
    if (!isEmptyMap(a.Guards) || !isEmptyMap(b.Guards)) {
      if (JSON.stringify(a.Guards ?? {}) !== JSON.stringify(b.Guards ?? {})) return false;
    }
    const argsA = (a.Arguments ?? []).map(argumentText);
    const argsB = (b.Arguments ?? []).map(argumentText);
    if (argsA.join('\n') !== argsB.join('\n')) return false;
  }
  const declared = (parameters: readonly FunctionParameter[]) =>
    parameters.map((parameter) => `${parameter.ParameterName}:${parameter.DataType || 'string'}:${parameter.Required === true}`).join('\n');
  return declared(saved.parameters) === declared(wanted.Parameters ?? []);
}

// ---------------------------------------------------------------------------
// What the configuration holds: containers and resources
// ---------------------------------------------------------------------------

/** Only what the configuration proves: an init container, or a native sidecar. */
export type DraftContainerRole = 'init' | 'sidecar' | null;

/** One container, in one Unit. */
export interface DraftContainerUse {
  name: string;
  role: DraftContainerRole;
  /** Registry, namespace and repository: everything left of the tag. */
  repository: string;
  tag: string | undefined;
  unitSlug: string;
  /** `Deployment/payments-api`. */
  resource: string;
}

/** `Deployment/payments-api` from a resource's type and name, without its namespace. */
export function resourceLabelOf(resourceType: string | undefined, resourceName: string | undefined): string {
  const kind = resourceType?.slice(resourceType.lastIndexOf('/') + 1) ?? '';
  const name = resourceName?.slice(resourceName.lastIndexOf('/') + 1) ?? '';
  return [kind, name].filter((part) => part !== '').join('/');
}

/** The containers a Unit's configuration runs, in document order. */
export function containerUsesOf(unitSlug: string, data: string | undefined): DraftContainerUse[] {
  if (data === undefined || data === '') return [];
  const entries = parseUnitDataStructured(data);
  const valueAt = new Map<string, unknown>();
  const keyOf = (resource: { ResourceType?: string; ResourceName?: string } | undefined, path: string) =>
    `${resource?.ResourceType ?? ''}|${resource?.ResourceName ?? ''}|${path}`;
  for (const entry of entries) valueAt.set(keyOf(entry.resource, entry.path), entry.value);
  const uses: DraftContainerUse[] = [];
  for (const entry of entries) {
    const at = parseImagePath(entry.path);
    if (at === null || typeof entry.value !== 'string') continue;
    const ref = parseImageRef(entry.value);
    const name = valueAt.get(keyOf(entry.resource, `${at.containerPrefix}.name`));
    if (ref === null || typeof name !== 'string') continue;
    const restartsAlways = valueAt.get(keyOf(entry.resource, `${at.containerPrefix}.restartPolicy`)) === 'Always';
    uses.push({
      name,
      role: at.list === 'initContainers' ? (restartsAlways ? 'sidecar' : 'init') : null,
      repository: ref.repoPath,
      tag: ref.tag ?? undefined,
      unitSlug,
      resource: resourceLabelOf(entry.resource?.ResourceType, entry.resource?.ResourceName),
    });
  }
  return uses;
}

/** A container a draft can set the image tag of: as the base runs it. */
export interface DraftContainerOption {
  name: string;
  role: DraftContainerRole;
  repository: string;
  /** The base's tag. */
  tag: string | undefined;
  /** The resources that run it, `Deployment/payments-api`. */
  resources: string[];
  /** The base's Units that hold it, which a variant's Units of the same slug clone. */
  unitSlugs: string[];
}

/** Every container the base runs, by name, in the order its Units list them. */
export function containerOptionsOf(uses: readonly DraftContainerUse[]): DraftContainerOption[] {
  const byName = new Map<string, DraftContainerOption>();
  for (const use of uses) {
    const known = byName.get(use.name);
    if (known === undefined) {
      byName.set(use.name, { name: use.name, role: use.role, repository: use.repository, tag: use.tag, resources: [use.resource], unitSlugs: [use.unitSlug] });
      continue;
    }
    if (!known.resources.includes(use.resource)) known.resources.push(use.resource);
    if (!known.unitSlugs.includes(use.unitSlug)) known.unitSlugs.push(use.unitSlug);
  }
  // By name: a sidecar or an init container is told by its pill, not by where it sits.
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** A container's default: the first one that is neither an init container nor a sidecar. */
export const defaultContainer = (options: readonly DraftContainerOption[]) => options.find((option) => option.role === null) ?? options[0];

/** One of the base's Units, as the Resources picker lists it: by what it holds. */
export interface DraftResourceOption {
  unitSlug: string;
  /** Its first resource, `Deployment/payments-api`; its slug when it holds none that is named. */
  label: string;
  /** How many more resources it holds. */
  more: number;
  /** It holds a workload (a Deployment, StatefulSet…): what a fleet-wide value is set on by default. */
  workload: boolean;
}

/** The kinds of resource that run containers: what "Invoke" acts on unless told otherwise. */
const WORKLOAD_KINDS: ReadonlySet<string> = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);

export function resourceOptionOf(unitSlug: string, data: string | undefined): DraftResourceOption {
  const seen: string[] = [];
  let workload = false;
  for (const entry of data === undefined || data === '' ? [] : parseUnitDataStructured(data)) {
    const label = resourceLabelOf(entry.resource?.ResourceType, entry.resource?.ResourceName);
    if (label !== '' && !seen.includes(label)) seen.push(label);
    const type = entry.resource?.ResourceType ?? '';
    if (WORKLOAD_KINDS.has(type.slice(type.lastIndexOf('/') + 1))) workload = true;
  }
  return { unitSlug, label: seen[0] ?? unitSlug, more: Math.max(0, seen.length - 1), workload };
}

/** The Resources picker's order: the workloads first, then by what each holds. */
export const sortResourceOptions = (options: readonly DraftResourceOption[]) =>
  [...options].sort((a, b) => Number(b.workload) - Number(a.workload) || a.label.localeCompare(b.label));

/**
 * The Units a resource-picking function runs on by default: the base's workloads, written as a
 * selection only when they are not every Unit. `''` (every Unit) when the base holds none.
 */
export function defaultWhereOf(options: readonly DraftResourceOption[]): string {
  const workloads = options.filter((option) => option.workload).map((option) => option.unitSlug);
  return workloads.length === 0 || workloads.length === options.length ? '' : whereOfSlugs(workloads);
}

// ---------------------------------------------------------------------------
// The Units a change runs on
// ---------------------------------------------------------------------------

/** A Unit where expression selecting Units by slug: `Slug = 'a'`, `Slug IN ('a', 'b')`. */
export function whereOfSlugs(slugs: readonly string[]): string {
  if (slugs.length === 1) return `Slug = '${slugs[0]}'`;
  return `Slug IN (${slugs.map((slug) => `'${slug}'`).join(', ')})`;
}

/** The slugs a `whereOfSlugs` expression selects; `undefined` for any other expression. */
export function slugsOfWhere(where: string): string[] | undefined {
  const text = where.trim();
  const one = /^Slug\s*=\s*'([^']+)'$/.exec(text);
  if (one !== null) return [one[1]];
  const many = /^Slug\s+IN\s*\(([^)]*)\)$/i.exec(text);
  if (many === null) return undefined;
  const slugs = many[1].split(',').map((part) => /^\s*'([^']+)'\s*$/.exec(part)?.[1]);
  return slugs.every((slug): slug is string => slug !== undefined) && slugs.length > 0 ? slugs : undefined;
}

// ---------------------------------------------------------------------------
// Image tags
// ---------------------------------------------------------------------------

/** An image tag the registry accepts: 1–128 of `[A-Za-z0-9_.-]`, not starting with `.` or `-`. */
export const isImageTag = (tag: string) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(tag);

/** The tag of an image reference a ChangeOrder's `Parameters` hold. */
export const tagOfImage = (image: unknown): string | undefined =>
  typeof image === 'string' ? (parseImageRef(image)?.tag ?? undefined) : undefined;

/** A ChangeOrder's `Parameters` as the row's text. */
export function parameterTexts(values: Readonly<Record<string, unknown>> | null | undefined): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const [name, value] of Object.entries(values ?? {})) texts[name] = typeof value === 'string' ? value : JSON.stringify(value);
  return texts;
}
