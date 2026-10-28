// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * An Invoke draft's decisions: what runs (a function typed inline, or an Invocation saved before),
 * with which values, on which of each variant's Units, and what that makes Create send.
 *
 * Like the other decisions, the URL holds only what was decided: what runs (`fn` or `inv`; `img`
 * from a link written for the image tag kind), the image function's container and tag
 * (`container`, `tag`), any other function's values (`p.<name>`) and Units (`where`). Everything
 * else is last time's (the Invoke ChangeOrder this draft re-aims), or the default: the image
 * function, which asks for a container and a tag rather than its arguments (`DraftInvokeMode`).
 * The image fields and the others sit side by side, so trying another function and coming back
 * finds the tag still typed.
 *
 * A CALL TYPED INLINE RUNS A SAVED INVOCATION WHEN ONE RUNS EXACTLY IT. Create saves an Invocation
 * only when none of the base's is the same call (`sameInvocationShape`); one that is, is adopted:
 * the preview runs it, and the ChangeOrder names it.
 *
 * Pure: no React, no RTK, so the browser-free specs can import it.
 */
import type { FunctionInvocationsRequest, FunctionSignature, Invocation } from '@confighub/rtk-query';

import { parseImageRef } from '../../x/apps/imageRef';
import { type BumpKind, bumpKindOf } from '../imageChange';
import { draftCopy } from './draftCopy';
import type { DraftAddress, DraftAddressPatch, DraftInvokeRequestPart } from './draftDecisions';
import {
  COMMON_VALUE_FUNCTIONS,
  DEFAULT_VALUE_FUNCTION,
  IMAGE_ARGUMENTS,
  IMAGE_FUNCTION,
  IMAGE_KIND_WORD,
  type DraftArgSlot,
  type DraftContainerOption,
  type DraftFilledArg,
  type DraftInvokeMode,
  type DraftResourceOption,
  type DraftSavedInvocation,
  argSlotsOfFunction,
  argSlotsOfInvocation,
  defaultContainer,
  defaultWhereOf,
  functionValueProblem,
  imageParametersOf,
  inlineCall,
  inlineInvocationBody,
  inlineParameters,
  invocationMode,
  invocationRef,
  isImageTag,
  parameterIdentOf,
  parameterTexts,
  sameInvocationShape,
  slugsOfWhere,
  sortResourceOptions,
  tagOfImage,
  validateInvocationParameters,
  whereOfSlugs,
} from './draftKinds';
import type { DraftDecision, DraftProblem } from './draftTypes';

/** What an Invoke draft runs. */
export type DraftInvokeSource =
  | { kind: 'function'; name: string }
  | { kind: 'invocation'; invocation: DraftSavedInvocation };

/** What the Invoke ChangeOrder this draft re-aims ran. */
export interface DraftInvokeLast {
  /** `undefined` when its Invocation could not be read: there is nothing to compare with. */
  invocation: DraftSavedInvocation | undefined;
  parameters: Record<string, unknown>;
  whereUnit: string;
}

/** Problems the row says beside the control they are about, rather than in the list under it. */
export const SAID_IN_ROW: ReadonlySet<string> = new Set(['tag-copied']);

/** The ids of the rows' controls, which a blocker focuses. */
export const INVOKE_IDS = {
  function: 'draft-invoke-function',
  container: 'draft-invoke-container',
  /** The image function's tag: the input in its Run row. */
  tag: 'draft-invoke-tag-input',
  resources: 'draft-invoke-resources',
  arg: (name: string) => `draft-invoke-arg-${name.replace(/[^A-Za-z0-9_-]/g, '_')}`,
} as const;

export interface ResolveInvokeInput {
  address: DraftAddress;
  last: DraftInvokeLast | undefined;
  /** Every saved Invocation the reader can see. */
  invocations: readonly DraftSavedInvocation[];
  /** The functions of the base's toolchain, by name. `undefined` while they are read. */
  functions: ReadonlyMap<string, FunctionSignature> | undefined;
  toolchainType: string;
  /** The base's containers and resources, from its configuration. `undefined` while it is read. */
  containers: readonly DraftContainerOption[] | undefined;
  resources: readonly DraftResourceOption[] | undefined;
  baseSpaceId: string;
  baseSpaceSlug: string;
  /** The Invocations this base's Invoke ChangeOrders ran, newest run first. */
  ranHere: readonly string[];
  /** The ChangeOrder's name: the slug Create saves an inline call's Invocation under. */
  name: string;
}

/** The Run row's inputs, with what each holds. */
export interface DraftArgValue {
  slot: DraftArgSlot;
  text: string;
  /** Last time's text, where last time ran the same thing. */
  last: string | undefined;
  /** The problem said under it, if any. */
  problem: DraftProblem | undefined;
}

/** The image tag, with what tells it apart from last time's. */
export interface DraftTagDecision extends DraftDecision<string> {
  /** It is last time's tag for last time's container: last time's change, made again. */
  copied: boolean;
}

export interface DraftInvoke {
  /** How the rows ask for the call: a container and a tag for the image function, else its arguments. */
  mode: DraftInvokeMode;
  source: DraftDecision<DraftInvokeSource>;
  /** Every saved Invocation the slot's search finds, in `rankInvocations` order. */
  invocationOptions: DraftSavedInvocation[];
  /** The few the slot lists without a search: the first `RECENT_INVOCATIONS` of `invocationOptions`. */
  recentInvocations: DraftSavedInvocation[];
  /** The image function first, where the toolchain has it, then the common ones. */
  functionOptions: string[];
  /** What runs when nothing else is said: the image function, where the toolchain has it. */
  defaultFunction: string;
  /** What going back to last time's source writes (the default's, without a last time): `sourceDefaultPatch`. */
  sourceBack: DraftAddressPatch;
  /** Functions beyond `functionOptions`, for the slot's search. */
  moreFunctions: string[];
  /** Each offered function's description, from its signature. */
  functionDescriptions: ReadonlyMap<string, string>;
  /** A saved Invocation that runs exactly the call typed inline: what the ChangeOrder names instead of a new one. */
  adopted: DraftSavedInvocation | undefined;
  /** The function's inputs, in order. Empty in image mode, whose container and tag are its own. */
  args: DraftArgValue[];
  /** The image function's container: its name, and what the base says of it. */
  container: DraftDecision<string | undefined>;
  containerOption: DraftContainerOption | undefined;
  containers: readonly DraftContainerOption[];
  tag: DraftTagDecision;
  /** The full image the tag makes: `ghcr.io/acme/payments-api:1.15.1`. */
  image: string | undefined;
  /** The Unit selection: `''` for every Unit of each Space. */
  where: DraftDecision<string>;
  /** What the selection is when the URL says nothing: the URL keeps only a different one. */
  whereDefault: string;
  /** Whether the row offers the Resources picker: not for a function that names its container. */
  picksResources: boolean;
  /** The base's Units the selection names, where it is a list of them. */
  selectedSlugs: string[] | undefined;
  /** The base's Units, workloads first. */
  resources: readonly DraftResourceOption[];
  /** The function dry run's body: the same call the ChangeOrder runs. `undefined` while it cannot be made. */
  previewRequest: FunctionInvocationsRequest | undefined;
  /** Create's first write, for an inline call no saved Invocation runs yet. */
  save: Invocation | undefined;
  /** The Invocation Create runs: the one picked, or the one adopted. */
  invocationId: string | undefined;
  /** The values the ChangeOrder gives it. */
  parameters: Record<string, unknown> | undefined;
  /**
   * What the create request takes from this draft; `undefined` until there is an Invocation to
   * name or one to save: never a request the server would refuse for having neither.
   */
  request: DraftInvokeRequestPart | undefined;
  /** What the rail's source node calls it: the Invocation's slug, or the function's name. */
  sourceName: string;
  /** The function name the row's slot shows. */
  functionName: string;
  /** For the description's suggestion: `api 1.15.1`, `team=payments`. */
  suggestion: string | undefined;
  problems: DraftProblem[];
}

const isRef = (text: string) => text.includes('/');

/** How the rows ask for a source's call. */
export const sourceMode = (source: DraftInvokeSource): DraftInvokeMode =>
  source.kind === 'function' ? (source.name === IMAGE_FUNCTION ? 'image' : 'value') : invocationMode(source.invocation);

/**
 * What picking a source writes: the source, and no other function's values. The image fields
 * stay, so the image function picked again finds its tag.
 */
export function sourcePatch(source: DraftInvokeSource): DraftAddressPatch {
  return source.kind === 'function'
    ? { fn: source.name, inv: null, img: null, params: null }
    : { inv: invocationRef(source.invocation), fn: null, img: null, params: null };
}

/**
 * Going back to last time's source, or the default: the source's fields go, and with them a
 * `kind=image` that would hold the image function.
 */
export function sourceDefaultPatch(address: DraftAddress): DraftAddressPatch {
  return { fn: null, inv: null, img: null, params: null, ...(address.kind === IMAGE_KIND_WORD ? { kind: 'invoke' } : {}) };
}

/**
 * What holding a saved Invocation writes: the draft runs it from now on, whatever its name becomes.
 * Invoke's typed values move to the Invocation's parameter names, so nothing typed is lost.
 */
export function pinPatch(mode: DraftInvokeMode, invocation: DraftSavedInvocation, args: readonly DraftArgValue[]): DraftAddressPatch {
  if (mode === 'image') return { inv: invocationRef(invocation), fn: null, img: null };
  const params: Record<string, string | null> = {};
  for (const arg of args) {
    params[arg.slot.name] = null;
    params[parameterIdentOf(arg.slot.name)] = arg.text;
  }
  return { inv: invocationRef(invocation), fn: null, img: null, params };
}

export const sameSource = (a: DraftInvokeSource, b: DraftInvokeSource | undefined) =>
  b !== undefined && (a.kind === 'function' ? b.kind === 'function' && a.name === b.name : b.kind === 'invocation' && a.invocation.invocationId === b.invocation.invocationId);

const functionOfSource = (source: DraftInvokeSource) =>
  source.kind === 'function' ? source.name : (source.invocation.calls.map((call) => call.FunctionName ?? '').join(', ') || source.invocation.slug);

/**
 * Saved Invocations in the order the function slot lists them, in its short list and in search:
 * first those this base's ChangeOrders ran (last time's, then by the most recent run here), then
 * those saved in the base, then the rest; each of the last two by when it was saved, newest first.
 * `ranHere` is the Invocations this base's Invoke ChangeOrders ran, newest run first.
 */
export function rankInvocations(
  invocations: readonly DraftSavedInvocation[],
  lastId: string | undefined,
  ranHere: readonly string[],
  baseSpaceId: string,
): DraftSavedInvocation[] {
  const runOrder = new Map<string, number>();
  for (const invocationId of ranHere) if (!runOrder.has(invocationId)) runOrder.set(invocationId, runOrder.size);
  const group = (invocation: DraftSavedInvocation) => {
    if (invocation.invocationId === lastId) return 0;
    if (runOrder.has(invocation.invocationId)) return 1;
    return invocation.spaceId === baseSpaceId ? 2 : 3;
  };
  const saved = (invocation: DraftSavedInvocation) =>
    invocation.createdAt === undefined ? 0 : Date.parse(invocation.createdAt) || 0;
  return [...invocations].sort(
    (a, b) =>
      group(a) - group(b) ||
      (runOrder.get(a.invocationId) ?? 0) - (runOrder.get(b.invocationId) ?? 0) ||
      saved(b) - saved(a) ||
      invocationRef(a).localeCompare(invocationRef(b)),
  );
}

/** How many saved Invocations the function slot lists before a search. */
export const RECENT_INVOCATIONS = 3;

/** Whether a saved Invocation answers a search: by its slug, its Space, or a function it runs. */
export function invocationMatches(invocation: DraftSavedInvocation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [invocationRef(invocation), ...invocation.calls.map((call) => call.FunctionName ?? '')].some((text) => text.toLowerCase().includes(q));
}

/** The description an Invoke change suggests: `team=payments`, `replicas 3`. */
function valueSuggestion(args: readonly DraftArgValue[]): string | undefined {
  const parts: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.slot.sense === 'container' || arg.text === '') continue;
    const next = args[i + 1];
    if (['key', 'variable'].includes(arg.slot.label) && next?.slot.label === 'value') {
      parts.push(`${arg.text}=${next.text}`);
      i += 1;
      continue;
    }
    parts.push(arg.slot.label === 'value' ? arg.text : `${arg.slot.label} ${arg.text}`);
  }
  return parts.length === 0 ? undefined : parts.join(', ');
}

/**
 * Every decision of an Invoke draft, and what it makes Create send. Problems are said on the
 * kind's row (`what`), each blocking: nothing runs until the call is whole.
 */
export function resolveInvokeDraft(input: ResolveInvokeInput): DraftInvoke {
  const { address, last, invocations, functions, toolchainType, baseSpaceId, baseSpaceSlug, ranHere, name } = input;
  const containers = input.containers ?? [];
  const resources = sortResourceOptions(input.resources ?? []);
  const words = draftCopy.invoke.problems;
  const problems: DraftProblem[] = [];
  const problem = (code: string, message: string, extra: Partial<DraftProblem> = {}) =>
    problems.push({ row: 'what', code, message, source: 'client', blocks: true, ...extra });

  // What the slot offers: only functions that change configuration, of this toolchain; the image
  // function first.
  const ofToolchain = invocations.filter((invocation) => invocation.toolchainType === toolchainType);
  const lastId = last?.invocation?.invocationId;
  const invocationOptions = rankInvocations(ofToolchain, lastId, ranHere, baseSpaceId);
  const recentInvocations = invocationOptions.slice(0, RECENT_INVOCATIONS);
  const mutating = functions === undefined ? [] : [...functions.values()].filter((fn) => fn.Mutating === true && fn.Validating !== true && fn.FunctionName !== undefined);
  const names = new Set(mutating.map((fn) => fn.FunctionName as string));
  const offered = (fn: string) => functions === undefined || names.has(fn);
  const functionOptions = [IMAGE_FUNCTION, ...COMMON_VALUE_FUNCTIONS].filter(offered);
  const moreFunctions = [...names].filter((fn) => !functionOptions.includes(fn)).sort();
  const functionDescriptions = new Map(mutating.flatMap((fn) => (fn.Description ? [[fn.FunctionName as string, fn.Description] as const] : [])));

  // What runs: the URL's choice, else last time's, else the image function.
  const lastSource: DraftInvokeSource | undefined = last?.invocation === undefined ? undefined : { kind: 'invocation', invocation: last.invocation };
  if (last !== undefined && last.invocation === undefined) problem('last-invocation-gone', words.lastInvocationGone, { blocks: false });
  const defaultFunction = functionOptions[0] ?? (offered(DEFAULT_VALUE_FUNCTION) ? DEFAULT_VALUE_FUNCTION : ([...names].sort()[0] ?? IMAGE_FUNCTION));
  let sourceValue: DraftInvokeSource = lastSource ?? { kind: 'function', name: defaultFunction };
  let chosenRef: string | undefined;
  let chosenFunction: string | undefined;
  if (address.inv !== undefined) chosenRef = address.inv;
  else if (address.fn !== undefined) chosenFunction = address.fn;
  else if (address.img !== undefined) {
    if (isRef(address.img)) chosenRef = address.img;
    else chosenFunction = address.img;
  } else if (address.kind === IMAGE_KIND_WORD && (lastSource === undefined || sourceMode(lastSource) !== 'image')) chosenFunction = IMAGE_FUNCTION;
  const backToDefault = { label: draftCopy.invoke.fixes.useFunction(defaultFunction), patch: sourceDefaultPatch(address) };
  if (chosenRef !== undefined) {
    const named = ofToolchain.find((invocation) => invocationRef(invocation) === chosenRef);
    if (named === undefined) problem('invocation-unknown', words.invocationUnknown(chosenRef), { focusId: INVOKE_IDS.function, fix: backToDefault });
    else sourceValue = { kind: 'invocation', invocation: named };
  } else if (chosenFunction !== undefined) {
    if (!offered(chosenFunction)) problem('function-unknown', words.functionUnknown(chosenFunction), { focusId: INVOKE_IDS.function, fix: backToDefault });
    else sourceValue = { kind: 'function', name: chosenFunction };
  }
  if (functions !== undefined && names.size === 0) problem('no-functions', words.noFunctions(toolchainType), { focusId: INVOKE_IDS.function });
  const mode = sourceMode(sourceValue);
  const image = mode === 'image';
  const source = { value: sourceValue, last: lastSource, differsFromLast: lastSource !== undefined && !sameSource(sourceValue, lastSource) };
  const asLastTime = sameSource(sourceValue, lastSource);
  const lastTexts = parameterTexts(last?.parameters);

  // Its inputs.
  const signature = sourceValue.kind === 'function' ? functions?.get(sourceValue.name) : undefined;
  const slots: DraftArgSlot[] =
    sourceValue.kind === 'invocation'
      ? argSlotsOfInvocation(sourceValue.invocation)
      : signature === undefined
        ? []
        : argSlotsOfFunction(sourceValue.name, signature.Parameters ?? []);
  const functionName = sourceValue.kind === 'function' ? sourceValue.name : functionOfSource(sourceValue);

  // The image function: the container and the tag, whatever names the source gives their parameters.
  const imageNames =
    sourceValue.kind === 'invocation' ? imageParametersOf(sourceValue.invocation) : { container: IMAGE_ARGUMENTS.container, image: IMAGE_ARGUMENTS.image };
  const lastImageNames = last?.invocation === undefined ? undefined : imageParametersOf(last.invocation);
  const lastContainer = lastImageNames === undefined ? undefined : lastTexts[lastImageNames.container];
  const lastTag = lastImageNames === undefined ? undefined : tagOfImage(last?.parameters[lastImageNames.image]);
  const fallbackContainer = defaultContainer(containers)?.name;
  const containerValue = image ? (address.container ?? lastContainer ?? fallbackContainer) : undefined;
  const containerOption = containers.find((option) => option.name === containerValue);
  // Last time's tag belongs to last time's container: it is never carried onto another one.
  const lastTagHere = containerValue !== undefined && containerValue === lastContainer ? lastTag : undefined;
  const tagValue = image ? (address.tag ?? lastTagHere ?? '') : '';
  const fullImage = containerOption === undefined || tagValue === '' ? undefined : `${containerOption.repository}:${tagValue}`;
  const container = { value: containerValue, last: lastContainer, differsFromLast: lastContainer !== undefined && containerValue !== lastContainer };
  const copied = lastTagHere !== undefined && tagValue === lastTagHere;
  const tag: DraftTagDecision = { value: tagValue, last: lastTagHere, differsFromLast: lastTagHere !== undefined && tagValue !== lastTagHere, copied };
  const imageReady = !image || input.containers !== undefined;
  if (image && input.containers !== undefined) {
    if (containers.length === 0) problem('no-container', words.noContainer(baseSpaceSlug), { focusId: INVOKE_IDS.container });
    else if (containerOption === undefined && containerValue !== undefined)
      problem('container-unknown', words.containerUnknown(containerValue, baseSpaceSlug), { focusId: INVOKE_IDS.container, fix: { label: draftCopy.fixes.defaultContainer, patch: { container: null } } });
    const said = (blockerLabel: string) => ({ blockerLabel, focusId: INVOKE_IDS.tag });
    if (tagValue === '') problem('tag-empty', words.tagEmpty, said(words.tagEmpty));
    else if (!isImageTag(tagValue)) problem('tag-format', words.tagFormat, said(words.tagFormat));
    else if (copied) problem('tag-copied', words.tagCopied, said(words.tagCopied));
  }

  // Any other function: each input's text, last time's where it ran the same thing.
  const containerSlot = slots.find((slot) => slot.sense === 'container');
  const args: DraftArgValue[] =
    image
      ? []
      : slots.map((slot) => {
          const lastText = asLastTime ? lastTexts[slot.name] : undefined;
          const fallback = slot.sense === 'container' ? (fallbackContainer ?? '') : '';
          const text = address.params?.[slot.name] ?? lastText ?? fallback;
          return { slot, text, last: lastText, problem: undefined };
        });
  const emptyAllowed = new Set(args.filter((arg) => arg.slot.emptyAllowed).map((arg) => arg.slot.name));
  if (!image) {
    const declared = args.map((arg) => arg.slot.parameter);
    const supplied = Object.fromEntries(args.map((arg) => [arg.slot.name, arg.text]));
    const checked = validateInvocationParameters(declared, supplied, emptyAllowed);
    for (const unknown of checked.problems.filter((p) => p.code === 'unknown')) problem('param-unknown', unknown.message);
    for (const arg of args) {
      const found = checked.problems.find((p) => p.name === arg.slot.name) ?? functionValueProblem(arg.slot, arg.text);
      if (found === undefined) continue;
      const empty = found.code === 'required';
      const picked = arg.slot.sense !== 'text';
      const said: DraftProblem = {
        row: 'what',
        code: empty ? 'arg-empty' : 'arg-refused',
        message: empty ? (picked ? words.argPick(arg.slot.label) : words.argEmpty(arg.slot.label)) : words.argRefused(arg.slot.label, found.message),
        source: 'client',
        blocks: true,
        blockerLabel: empty ? (picked ? words.argPick(arg.slot.label) : words.argEmpty(arg.slot.label)) : words.argRefused(arg.slot.label, found.message),
        focusId: INVOKE_IDS.arg(arg.slot.name),
      };
      arg.problem = said;
      problems.push(said);
    }
  }

  // On which Units: a function that names its container runs where the base runs it; any other on
  // the base's workloads, unless the reader picks.
  const picksResources = !image && containerSlot === undefined;
  const containerText = image ? containerValue : args.find((arg) => arg.slot === containerSlot)?.text;
  const named = containers.find((option) => option.name === containerText);
  let whereDefault: string;
  if (!picksResources) whereDefault = named === undefined ? '' : whereOfSlugs(named.unitSlugs);
  else if (asLastTime && last !== undefined) whereDefault = last.whereUnit;
  else whereDefault = defaultWhereOf(resources);
  const whereValue = picksResources ? (address.where ?? whereDefault) : whereDefault;
  const where = { value: whereValue, last: asLastTime ? last?.whereUnit : undefined, differsFromLast: asLastTime && last !== undefined && whereValue !== last.whereUnit };
  const selectedSlugs = whereValue === '' ? undefined : slugsOfWhere(whereValue);

  // What the dry run runs, and what Create sends: only a whole call.
  let previewRequest: FunctionInvocationsRequest | undefined;
  let save: Invocation | undefined;
  let invocationId: string | undefined;
  let parameters: Record<string, unknown> | undefined;
  let adopted: DraftSavedInvocation | undefined;
  // A copied tag still previews (it is last time's change, seen again); it only blocks Create.
  const whole = problems.every((p) => !p.blocks || p.code === 'tag-copied') && imageReady;
  const runSaved = (invocation: DraftSavedInvocation, supplied: Record<string, string>, empty: ReadonlySet<string>) => {
    const checked = validateInvocationParameters(invocation.parameters, supplied, empty);
    if (checked.problems.length > 0) return;
    previewRequest = { ToolchainType: invocation.toolchainType, ParameterizedInvocations: [{ InvocationID: invocation.invocationId, Parameters: checked.values }] };
    invocationId = invocation.invocationId;
    parameters = checked.values;
  };
  if (whole && sourceValue.kind === 'invocation') {
    const supplied: Record<string, string> =
      image
        ? imageNames === undefined
          ? {}
          : { [imageNames.container]: containerValue ?? '', [imageNames.image]: fullImage ?? '' }
        : Object.fromEntries(args.map((arg) => [arg.slot.name, arg.text]));
    runSaved(sourceValue.invocation, supplied, emptyAllowed);
  } else if (whole && sourceValue.kind === 'function' && signature !== undefined) {
    const filled: DraftFilledArg[] =
      image
        ? slots.flatMap((slot) =>
            slot.name === IMAGE_ARGUMENTS.container ? [{ slot, text: containerValue ?? '' }] : slot.name === IMAGE_ARGUMENTS.image ? [{ slot, text: fullImage ?? '' }] : [],
          )
        : args.map((arg) => ({ slot: arg.slot, text: arg.text }));
    const body = inlineInvocationBody({ slug: name, toolchainType, functionName: sourceValue.name, args: filled });
    // Only the base's own: a ChangeOrder does not come to depend on an Invocation another Space keeps.
    adopted = rankInvocations(
      ofToolchain.filter((invocation) => invocation.spaceId === baseSpaceId && sameInvocationShape(invocation, body)),
      lastId,
      ranHere,
      baseSpaceId,
    )[0];
    if (adopted !== undefined) {
      const values = inlineParameters(filled);
      const supplied = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)]));
      const empty = new Set(Object.entries(values).flatMap(([key, value]) => (value === '' ? [key] : [])));
      runSaved(adopted, supplied, empty);
    } else {
      previewRequest = { ToolchainType: toolchainType, FunctionInvocations: [inlineCall(sourceValue.name, filled)] };
      parameters = inlineParameters(filled);
      const taken = invocations.some((invocation) => invocation.spaceId === baseSpaceId && invocation.slug === name);
      if (!taken) save = body;
      else
        problems.push({
          row: 'name',
          code: 'invocation-name-taken',
          message: words.invocationNameTaken(name, baseSpaceSlug),
          source: 'client',
          blocks: true,
        });
    }
  }
  const request: DraftInvokeRequestPart | undefined =
    parameters !== undefined && (invocationId !== undefined || save !== undefined) ? { invocationId, parameters, whereUnit: whereValue } : undefined;

  const sourceName = sourceValue.kind === 'invocation' ? sourceValue.invocation.slug : sourceValue.name;
  let suggestion: string | undefined;
  if (image) suggestion = containerValue !== undefined && tagValue !== '' && isImageTag(tagValue) ? `${containerValue} ${tagValue}` : undefined;
  else if (problems.every((p) => !p.blocks)) suggestion = valueSuggestion(args);
  return {
    mode,
    source,
    invocationOptions,
    recentInvocations,
    functionOptions,
    defaultFunction,
    sourceBack: backToDefault.patch,
    moreFunctions,
    functionDescriptions,
    adopted,
    args,
    container,
    containerOption,
    containers,
    tag,
    image: fullImage,
    where,
    whereDefault,
    picksResources,
    selectedSlugs,
    resources,
    previewRequest,
    save,
    invocationId,
    parameters,
    request,
    sourceName,
    functionName,
    suggestion,
    problems,
  };
}

/** What the variants run the container at, and what the base runs it at: what the hero moves from. */
export interface DraftImageFrom {
  /** The tag most variants in scope run now; the base's when no variant says. */
  fromTag: string | undefined;
  /** The base's own tag, when it is another. */
  baseTag: string | undefined;
  bump: BumpKind | undefined;
}

/** The hero's "from" for the image function, from the variants' current tags. */
export function imageFromOf(invoke: DraftInvoke, currentTags: ReadonlyMap<string, string>): DraftImageFrom {
  const option = invoke.containerOption;
  if (option === undefined) return { fromTag: undefined, baseTag: undefined, bump: undefined };
  const fromTag = currentTags.get(option.name) ?? option.tag;
  const tag = invoke.tag.value;
  const bump = tag !== '' && isImageTag(tag) && fromTag !== undefined && tag !== fromTag ? bumpKindOf(fromTag, tag) : undefined;
  return { fromTag, baseTag: option.tag !== fromTag ? option.tag : undefined, bump };
}

/**
 * A warning about the tag typed, said beside it in the warn tone. Never more than two, so the row
 * stays one line: what the tag is against last time's and the variants' (`tag`), and against the
 * base's (`base`). The words are the chip's; `tip` says why, in a sentence.
 */
export interface DraftImageWarning {
  kind: 'tag' | 'base';
  label: string;
  /** The chip's words where the row is short of room: "copied", "base `1.15.0`". */
  short: { label: string; code?: string };
  /** A tag the chip names after its words, set as code: "base is on `1.15.0`". */
  code?: string;
  tip: string;
}

/**
 * The warnings on the tag typed, from what the page has read: last time's tag made again, a move
 * back from what the variants run, a base on another tag, and a move the base makes look smaller
 * than it is for the variants ("not a patch").
 */
export function imageWarningsOf(invoke: DraftInvoke, currentTags: ReadonlyMap<string, string>): DraftImageWarning[] {
  const tag = invoke.tag.value;
  if (invoke.mode !== 'image' || tag === '' || !isImageTag(tag)) return [];
  const words = draftCopy.invoke.warnings;
  const { fromTag, baseTag, bump } = imageFromOf(invoke, currentTags);
  const container = invoke.container.value ?? '';
  const warnings: DraftImageWarning[] = [];
  const downgrade = bump === 'downgrade' && fromTag !== undefined;
  const downgradeTip = downgrade ? words.downgradeTip(tag, fromTag) : undefined;
  if (invoke.tag.copied) {
    warnings.push({
      kind: 'tag',
      label: downgrade ? `${words.copied} · ${words.downgrade}` : words.copied,
      short: { label: downgrade ? `${words.copiedShort} · ${words.downgrade}` : words.copiedShort },
      tip: [words.copiedTip(container), downgradeTip].filter((part) => part !== undefined).join(' '),
    });
  } else if (downgrade && downgradeTip !== undefined) {
    warnings.push({ kind: 'tag', label: words.downgrade, short: { label: words.downgrade }, tip: downgradeTip });
  }
  if (baseTag !== undefined && tag !== baseTag) {
    // The base ahead of the variants: a patch of the base's tag is a larger move for them.
    const notAPatch = (bump === 'minor' || bump === 'major') && fromTag !== undefined;
    warnings.push(
      notAPatch
        ? { kind: 'base', label: words.notAPatch, short: { label: words.notAPatchShort }, code: baseTag, tip: words.notAPatchTip(fromTag, tag, bump, baseTag) }
        : { kind: 'base', label: words.baseIsOn, short: { label: words.baseIsOnShort, code: baseTag }, code: baseTag, tip: words.baseIsOnTip(baseTag, fromTag) },
    );
  }
  return warnings;
}

/** A tag the input suggests, with its quiet hint: "patch", "in 3 variants". */
export interface DraftTagSuggestion {
  tag: string;
  /** What the list heads it with: the next tags of the variants', of the base's, or tags in use. */
  group: 'variants' | 'base' | 'inUse';
  /** For a next tag: the tag it follows. */
  after?: string;
  hint: string;
}

const PLAIN_SEMVER = /^(v?)(\d+)\.(\d+)\.(\d+)$/;

/** The next patch, minor and major of a plain `1.2.3` or `v1.2.3` tag; none for any other. */
export function nextTagsOf(tag: string | undefined): { patch: string; minor: string; major: string } | undefined {
  const found = tag === undefined ? null : PLAIN_SEMVER.exec(tag);
  if (found === null) return undefined;
  const [, v, major, minor, patch] = found;
  return {
    patch: `${v}${major}.${minor}.${Number(patch) + 1}`,
    minor: `${v}${major}.${Number(minor) + 1}.0`,
    major: `${v}${Number(major) + 1}.0.0`,
  };
}

/**
 * What the tag input suggests, in the order it lists them: the next patch, minor and major of the
 * tag the variants run; of the base's, when the base runs another; then the tags the variants in
 * scope run, where they run more than one. Each tag once.
 */
export function tagSuggestionsOf(
  invoke: DraftInvoke,
  currentTags: ReadonlyMap<string, string>,
  tagsInScope: ReadonlyMap<string, ReadonlyMap<string, number>>,
): DraftTagSuggestion[] {
  const option = invoke.containerOption;
  if (invoke.mode !== 'image' || option === undefined) return [];
  const words = draftCopy.invoke.suggest;
  const { fromTag, baseTag } = imageFromOf(invoke, currentTags);
  const seen = new Set<string>();
  const out: DraftTagSuggestion[] = [];
  const add = (suggestion: DraftTagSuggestion) => {
    if (seen.has(suggestion.tag)) return;
    seen.add(suggestion.tag);
    out.push(suggestion);
  };
  for (const [group, from] of [['variants', fromTag], ['base', baseTag]] as const) {
    const next = nextTagsOf(from);
    if (next === undefined) continue;
    add({ tag: next.patch, group, after: from, hint: words.patch });
    add({ tag: next.minor, group, after: from, hint: words.minor });
    add({ tag: next.major, group, after: from, hint: words.major });
  }
  const inUse = [...(tagsInScope.get(option.name) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  // Every variant on one tag: there is nothing to line up.
  if (inUse.length > 1) for (const [tag, count] of inUse) add({ tag, group: 'inUse', hint: words.inVariants(count) });
  return out;
}

/** A whole image reference of this repository pasted where its tag goes is taken for its tag. */
export function tagOfPasted(text: string, repository: string): string {
  const ref = text.includes(':') || text.includes('/') ? parseImageRef(text.trim()) : null;
  return ref !== null && ref.repoPath === repository && ref.tag ? ref.tag : text;
}
