// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo, useState } from 'react';

import { type DraftUnitRange, carriesNothing } from './draftChangeCards';
import { draftCopy } from './draftCopy';
import {
  type DraftAddress,
  type DraftAddressPatch,
  type DraftDecisions,
  draftCreateRequest,
  draftStageParamOf,
  outsideEveryStageProblem,
  workflowGovernsKind,
  suggestDraftDescription,
  withDescriptionSuggestion,
} from './draftDecisions';
import type { DraftSavedInvocation } from './draftKinds';
import { type DraftInvoke, INVOKE_IDS, pinPatch } from './draftInvoke';
import type { DraftProblem, DraftRow } from './draftTypes';
import { reconcileRanges } from './draftValidation';
import { type DraftCreateOutcome, useCreateDraft } from './useCreateDraft';
import { useDraftAddress } from './useDraftAddress';
import { type DraftChangeCards, useDraftChangeCards } from './useDraftChangeCards';
import { type DraftContext, useDraftContext } from './useDraftContext';
import { useDraftDecisions } from './useDraftDecisions';
import { type DraftLinkedSpacesRead, useDraftLinkedSpaces } from './useDraftLinkedSpaces';
import { type DraftPreview, useDraftPreview } from './useDraftPreview';
import { type DraftSourceDiff, useDraftSourceDiff } from './useDraftSourceDiff';
import { type DraftValidation, useDraftValidation } from './useDraftValidation';
import { type DraftInvokeRead, useDraftInvoke } from './useDraftInvoke';
import { type DraftInvokePreview, useDraftInvokePreview } from './useDraftInvokePreview';
import { useDraftInvocationCheck } from './useDraftInvocationCheck';
import { useDraftInvocations } from './useDraftInvocations';
import { type DraftFanOutRead, useDraftFanOut } from './useDraftFanOut';
import { type DraftFanOut, FAN_OUT_IDS } from './draftFanOut';

export interface ChangeOrderDraft {
  address: DraftAddress;
  /**
   * Change the draft (`null` returns a decision to its default). A `stage` may be given as a
   * node's id (`SOURCE_STAGE_ID`, `COMPLETE_STAGE_ID`): the URL is written with its word.
   */
  update: (patch: DraftAddressPatch) => void;
  context: DraftContext;
  /** `undefined` until the context has resolved. */
  decisions: DraftDecisions | undefined;
  cards: DraftChangeCards;
  /** Which variants each update type's Links reach from the base: what the update type offers. */
  links: DraftLinkedSpacesRead;
  /**
   * What each base Unit carries, as the source and the preview read it: `cards.ranges`,
   * corrected by the create dry run's `SkippedUnits` once that has answered for these decisions.
   */
  ranges: DraftUnitRange[];
  source: DraftSourceDiff;
  validation: DraftValidation;
  /** The base changes' preview, or the Invoke draft's: whichever the kind of change reads. */
  preview: DraftPreview;
  /** An Invoke draft's decisions and reads; its `invoke` is `undefined` for Base changes. */
  invoke: DraftInvokeRead;
  /** An Invoke or Transform paths kind's preview, with "At the source". Says nothing for Base changes. */
  invokePreview: DraftInvokePreview;
  /** A Transform paths kind's decisions and reads, and whether the kind is offered at all. */
  fanOut: DraftFanOutRead;
  /** Every problem, client and server, the client's first where both say the same thing. */
  problems: DraftProblem[];
  /** `problems` by the row they belong to. */
  problemsByRow: ReadonlyMap<DraftRow, DraftProblem[]>;
  /** The first problem that stops Create, for the blocker beside it ("↑ Fix the name"). */
  blocker: DraftProblem | undefined;
  /**
   * True when Create can run: nothing blocks it, the description's suggestion has landed (where
   * the URL holds none), the server's dry run passed for exactly this draft, and no Create is
   * already under way.
   */
  canCreate: boolean;
  /** Create it. Resolves with the created ChangeOrder and the path to its detail view, or the refusal. */
  create: () => Promise<DraftCreateOutcome | undefined>;
  isCreating: boolean;
  /**
   * Hold an Invocation a failed Create left saved: the draft runs it from now on, whatever its name
   * becomes. Returns what that writes to the URL, for the caller to write.
   */
  hold: (invocation: DraftSavedInvocation) => DraftAddressPatch | undefined;
  /** The saved Invocations read for this draft: what tells a past Invoke ChangeOrder's kind. Empty when not read. */
  invocations: readonly DraftSavedInvocation[];
}

/** The order the blocker is picked in: the first of these, as the summary card reads, that holds one. */
export const DRAFT_ROW_ORDER: readonly DraftRow[] = [
  'template',
  'what',
  'howMuch',
  'where',
  'path',
  'name',
  'description',
  'same',
  'create',
];

/**
 * The whole data layer of the "create a ChangeOrder" draft, wired in the order its parts depend
 * on each other: the URL; the base Space and its policy; the decisions; the waiting changes and
 * where they end; the change at the source; the server's dry run of the create; the preview of
 * what each variant would take; and Create.
 *
 * Each part is its own hook and can be used alone; this one only passes each the others' answers.
 */
export function useChangeOrderDraft(): ChangeOrderDraft {
  const { address, update: updateAddress } = useDraftAddress();
  const context = useDraftContext(address.space);
  const baseSpaceId = context.baseSpace?.spaceId;
  const links = useDraftLinkedSpaces(baseSpaceId);
  // Invocations a failed Create saved and the draft holds, until the list has them too.
  const [held, setHeld] = useState<readonly DraftSavedInvocation[]>([]);
  const bounding = useDraftDecisions(address, context, links.linkedSpaces);
  const invokes = bounding?.kind.value === 'invoke';
  const invocationsRead = useDraftInvocations(invokes, held);
  // Previewed by a run of its own (a function, or the Links' resolve) rather than the base's upgrade.
  const runs = bounding !== undefined && bounding.kind.value !== 'baseChanges';
  const fans = bounding?.kind.value === 'transformPaths';
  const variantSpaceIds = useMemo(
    () => context.variants.map((variant) => variant.spaceId),
    [context.variants],
  );

  const cards = useDraftChangeCards({
    baseSpaceId,
    variantSpaceIds,
    inScopeSpaceIds: bounding?.scope.value ?? [],
    end: bounding?.end.value,
    updateType: bounding?.updateType.value ?? 'UpgradeUnit',
    skip: bounding === undefined,
  });
  const endPending = cards.end.status === 'loading';
  const endNotFound =
    cards.end.status === 'notFound'
      ? draftCopy.problems.endNotFound(cards.end.slug)
      : undefined;
  // Known before any diff is asked for: the change at the source cannot be bounded.
  const sourceUndetermined = cards.status === 'undetermined' ? cards.reason : endNotFound;
  const mergeUnits = bounding?.updateType.value === 'MergeUnits';
  // No start (no variant in scope to take it from) and no end: nothing to preview either.
  const unbounded =
    cards.status === 'undetermined' && !mergeUnits ? cards.reason : endNotFound;
  // The change as the Revisions bound it, for the description's suggestion: the request waits
  // for it. As an UpgradeUnit change would bound it, so a MergeUnits draft is described by the
  // same waiting changes.
  // Everything below is worked out from the ranges: when their reads failed, so does it.
  const cardsUpstream = useMemo(
    () => ({ failed: cards.status === 'failed', retry: cards.retry }),
    [cards.status, cards.retry],
  );
  const bounded = useDraftSourceDiff({
    baseSpaceId,
    ranges: cards.boundingRanges,
    pending: endPending,
    // An Invoke draft reads nothing of the base's waiting changes.
    undetermined: runs ? draftCopy.couldNotEstablish : unbounded,
    upstream: cardsUpstream,
  });
  const invokeRead = useDraftInvoke({
    address,
    decisions: bounding,
    baseSpace: context.baseSpace,
    baseUnits: cards.baseUnits,
    invocationsRead,
    pastChangeOrders: context.pastChangeOrders,
  });
  const invoke = invokeRead.invoke;

  // While the change cannot be bounded (MergeUnits, say) the description keeps the last
  // suggestion this base had, rather than losing it to an empty one.
  const fanOutRead = useDraftFanOut({ address, decisions: bounding, variants: context.variants });
  const fanOut = fanOutRead.fanOut;
  let freshSuggestion: string | undefined;
  if (invokes) freshSuggestion = invoke?.suggestion;
  else if (fans) freshSuggestion = fanOutSuggestion(fanOut);
  else freshSuggestion = suggestDraftDescription(bounded.imageChanges);
  const [keptSuggestion, setKeptSuggestion] = useState<
    { baseSpaceId: string; text: string } | undefined
  >(undefined);
  if (
    freshSuggestion !== undefined &&
    baseSpaceId !== undefined &&
    (keptSuggestion === undefined ||
      keptSuggestion.text !== freshSuggestion ||
      keptSuggestion.baseSpaceId !== baseSpaceId)
  ) {
    setKeptSuggestion({ baseSpaceId, text: freshSuggestion });
  }
  const suggestion =
    freshSuggestion ??
    (!runs && bounded.status === 'undetermined' && keptSuggestion?.baseSpaceId === baseSpaceId
      ? keptSuggestion?.text
      : undefined);
  const suggestionPending = address.desc === undefined && !runs && bounded.status === 'loading';
  const decisions = useMemo(
    () =>
      bounding === undefined
        ? undefined
        : withDescriptionSuggestion(bounding, address, suggestion),
    [bounding, address, suggestion],
  );

  const endTagId = cards.end.status === 'resolved' ? cards.end.endTagId : undefined;
  const invokePart = invoke?.request;
  const request = useMemo(
    () =>
      decisions === undefined || suggestionPending
        ? undefined
        : draftCreateRequest({ decisions, endTagId, invoke: invokePart, fanOut: fanOut?.request }),
    [decisions, suggestionPending, endTagId, invokePart, fanOut?.request],
  );
  // An inline call has no Invocation to name yet, so the create dry run cannot be asked about it:
  // the dry run of the Invocation's save and the function dry run of the call stand in, and
  // Create dry-runs the ChangeOrder once the Invocation is saved, before creating it.
  const savesFirst = invokes && invoke?.save !== undefined;
  const invocationCheck = useDraftInvocationCheck({ spaceId: baseSpaceId, save: invokes ? invoke?.save : undefined, baseSpaceSlug: context.baseSpace?.slug ?? '' });
  const unitOrder = useMemo(
    () => cards.baseUnits.map((unit) => unit.unitId),
    [cards.baseUnits],
  );
  // A name the client refuses is not sent: one dry run per settled draft the server could pass.
  const nameRefused = useMemo(
    () =>
      (decisions?.problems ?? []).some((problem) => problem.row === 'name' && problem.blocks),
    [decisions],
  );
  const validation = useDraftValidation({
    baseSpaceId,
    request: savesFirst ? undefined : request,
    unitOrder,
    basis: cards.basis,
    nameRefused,
    upstream: cardsUpstream,
  });

  // Once the server has said which Units it passes over, that is what the source and the preview read.
  const reconciliation = useMemo(
    () =>
      validation.answered ? reconcileRanges(cards.ranges, validation.skippedUnits) : undefined,
    [validation.answered, validation.skippedUnits, cards.ranges],
  );
  const ranges = reconciliation?.ranges ?? cards.ranges;
  const source = useDraftSourceDiff({
    baseSpaceId,
    ranges,
    pending: endPending,
    undetermined: runs ? draftCopy.couldNotEstablish : sourceUndetermined,
    upstream: cardsUpstream,
  });
  const sourceRetry = source.retry;
  const previewUpstream = useMemo(
    () => ({ failed: cards.status === 'failed', retry: sourceRetry }),
    [cards.status, sourceRetry],
  );

  const basePreview = useDraftPreview({
    baseSpaceId,
    inScopeSpaceIds: decisions?.scope.value ?? [],
    variants: context.variants,
    workflow: decisions?.workflow.value,
    updateType: decisions?.updateType.value ?? 'UpgradeUnit',
    ranges,
    variantUnits: cards.variantUnits,
    foreignSpaceIds: cards.foreignSpaceIds,
    basis: cards.basis,
    endTagId,
    carriedResourceKeys: source.carriedResourceKeys,
    sourceStatus: source.status,
    upstream: previewUpstream,
    unavailableReason: unbounded,
    skip: decisions === undefined || runs,
  });
  const argIds = useMemo(() => new Map((invoke?.args ?? []).map((arg) => [arg.slot.name, INVOKE_IDS.arg(arg.slot.name)])), [invoke?.args]);
  const invokePreview = useDraftInvokePreview({
    baseSpaceId,
    inScopeSpaceIds: decisions?.scope.value ?? [],
    variants: context.variants,
    workflow: decisions?.workflow.value,
    variantUnits: cards.variantUnits,
    whereUnit: invokes ? (invoke?.where.value ?? '') : '',
    request: invokes ? invoke?.previewRequest : undefined,
    resolve: fans ? fanOut?.previewRequest : undefined,
    skip: !runs,
    idleText: fans && fanOut !== undefined && fanOut.followed.length === 0 ? draftCopy.fanOut.problems.noSharedSourceBlocker : draftCopy.invoke.nothingYet,
    argIds,
  });
  const preview: DraftPreview = runs ? invokePreview : basePreview;

  const stageNames = useMemo(
    () =>
      decisions?.workflow.value.kind === 'workflow'
        ? decisions.workflow.value.workflow.stageNames
        : [],
    [decisions],
  );
  const update = useCallback(
    (patch: DraftAddressPatch) => {
      const stage = patch.stage;
      updateAddress(
        typeof stage === 'string'
          ? { ...patch, stage: draftStageParamOf(stage, stageNames) }
          : patch,
      );
    },
    [updateAddress, stageNames],
  );

  const problems = useMemo(() => {
    let kindProblems: DraftProblem[] = cards.problems;
    if (invokes) kindProblems = invoke?.problems ?? [];
    else if (fans) kindProblems = fanOut?.problems ?? [];
    const client = [...(decisions?.problems ?? []), ...kindProblems];
    const workflowChoice = decisions?.workflow.value;
    if (runs && decisions !== undefined && workflowChoice?.kind === 'workflow' && !workflowGovernsKind(workflowChoice.workflow, decisions.kind.value))
      client.push({
        row: 'path',
        code: 'gated-first-stage',
        message: draftCopy.invoke.problems.gatedFirstStage(workflowChoice.workflow.slug),
        source: 'client',
        blocks: true,
        blockerLabel: draftCopy.invoke.problems.gatedBlocker(workflowChoice.workflow.slug),
      });
    if (runs && invokePreview.refusal !== undefined) client.push(invokePreview.refusal);
    if (invokes && invocationCheck.problem !== undefined && invocationCheck.problem.row !== 'create') client.push(invocationCheck.problem);
    // A call that changes nothing, or whose change nobody could read anywhere, is not created.
    if (runs && invokePreview.nothingChanges && !client.some((problem) => problem.code === 'nothing-to-carry')) client.push(nothingChangesProblem(invoke, fans));
    if (runs && invokePreview.status === 'resolved' && invokePreview.noneEstablished)
      client.push({ row: 'what', code: 'none-established', message: draftCopy.invoke.problems.noneEstablished, source: 'server', blocks: true, focusId: INVOKE_IDS.function });

    const disagreement = (code: string, message: string): DraftProblem => ({
      row: 'howMuch',
      code,
      message,
      source: 'server',
      blocks: false,
    });
    if (!runs && reconciliation !== undefined && reconciliation.passedOver.length > 0) {
      const slugs = reconciliation.passedOver.join(', ');
      client.push(
        disagreement('server-passes-over', draftCopy.problems.passedOverByServer(slugs)),
      );
    }
    if (!runs && reconciliation !== undefined && reconciliation.carried.length > 0) {
      const slugs = reconciliation.carried.join(', ');
      client.push(disagreement('server-carries', draftCopy.problems.carriedByServer(slugs)));
    }
    // Every Unit passed over by the server leaves nothing to promote. Not for MergeUnits, whose
    // start no Unit records: there the change is "Could not establish", not "Nothing waiting".
    const said = client.some((problem) => problem.code === 'nothing-to-carry');
    if (
      !runs &&
      reconciliation !== undefined &&
      !said &&
      cards.status !== 'undetermined' &&
      carriesNothing(reconciliation.ranges)
    ) {
      client.push({
        row: 'howMuch',
        code: 'nothing-to-carry',
        message: draftCopy.problems.nothingToCarry,
        source: 'server',
        blocks: false,
      });
    }
    const workflowValue = decisions?.workflow.value;
    const outside =
      decisions === undefined || workflowValue?.kind !== 'workflow'
        ? undefined
        : outsideEveryStageProblem({
            outsideSpaceIds: preview.outsideStageSpaceIds,
            variants: context.variants,
            workflow: workflowValue.workflow,
            leftOut: decisions.leftOut,
          });
    if (outside !== undefined) client.push(outside);
    // The server repeating what the client already said on a row is one problem, said once.
    const server = [...validation.problems, ...(invokes && invocationCheck.problem?.row === 'create' ? [invocationCheck.problem] : [])].filter(
      (problem) => !client.some((known) => known.row === problem.row && known.blocks),
    );
    return [...client, ...server];
  }, [
    decisions,
    invokes,
    runs,
    fans,
    invoke,
    fanOut,
    invocationCheck.problem,
    invokePreview.refusal,
    invokePreview.nothingChanges,
    invokePreview.noneEstablished,
    invokePreview.status,
    cards.problems,
    cards.status,
    reconciliation,
    validation.problems,
    preview.outsideStageSpaceIds,
    context.variants,
  ]);
  const problemsByRow = useMemo(() => {
    const byRow = new Map<DraftRow, DraftProblem[]>();
    for (const problem of problems)
      byRow.set(problem.row, [...(byRow.get(problem.row) ?? []), problem]);
    return byRow;
  }, [problems]);
  const blocker = useMemo(
    () =>
      DRAFT_ROW_ORDER.flatMap((row) => problemsByRow.get(row) ?? []).find(
        (problem) => problem.blocks,
      ),
    [problemsByRow],
  );

  const { create: createDraft, isCreating } = useCreateDraft();
  // An inline call is checked by its own dry runs, settled for exactly this call: the function's,
  // and the save of its Invocation.
  const checked = savesFirst
    ? invokePreview.settled && invokePreview.status === 'resolved' && invocationCheck.status === 'passed'
    : validation.status === 'passed' && (!runs || (invokePreview.settled && invokePreview.status === 'resolved'));
  const canCreate = blocker === undefined && request !== undefined && checked && !isCreating;
  const save = savesFirst ? invoke?.save : undefined;
  const baseSpaceSlug = context.baseSpace?.slug;
  const create = useCallback(async () => {
    if (
      !canCreate ||
      request === undefined ||
      baseSpaceId === undefined ||
      baseSpaceSlug === undefined
    ) {
      return undefined;
    }
    return createDraft({ baseSpaceId, baseSpaceSlug, request, save });
  }, [canCreate, request, baseSpaceId, baseSpaceSlug, createDraft, save]);

  const hold = useCallback(
    (invocation: DraftSavedInvocation) => {
      if (invoke === undefined) return undefined;
      setHeld((before) => [...before.filter((other) => other.invocationId !== invocation.invocationId), invocation]);
      return pinPatch(invoke.mode, invocation, invoke.args);
    },
    [invoke],
  );
  const validationRetry = validation.retry;
  const invocationCheckRetry = invocationCheck.retry;
  const retryChecks = useCallback(() => {
    validationRetry();
    invocationCheckRetry();
  }, [validationRetry, invocationCheckRetry]);

  return {
    address,
    update,
    context,
    decisions,
    cards,
    links,
    ranges,
    source,
    validation: { ...validation, retry: retryChecks },
    preview,
    invoke: invokeRead,
    invokePreview,
    fanOut: fanOutRead,
    problems,
    problemsByRow,
    blocker,
    canCreate,
    create,
    isCreating,
    hold,
    invocations: invocationsRead.invocations ?? NO_INVOCATIONS,
  };
}

const NO_INVOCATIONS: readonly DraftSavedInvocation[] = [];

/** A shared source's change described as its newest Revision describes itself. */
function fanOutSuggestion(fanOut: DraftFanOut | undefined): string | undefined {
  const newest = (fanOut?.sources ?? []).flatMap((source) => source.revisions).sort((a, b) => b.revisionNum - a.revisionNum)[0];
  return newest === undefined || newest.description === '' ? undefined : newest.description;
}

/** "Nothing changes", on what the reader changes next: the tag for an image, the end for a shared source, the call otherwise. */
function nothingChangesProblem(invoke: DraftInvoke | undefined, fans: boolean): DraftProblem {
  const words = draftCopy.invoke.problems;
  if (fans) {
    const said = draftCopy.fanOut.problems.nothingToCarry;
    return { row: 'what', code: 'nothing-changes', message: said, source: 'server', blocks: true, blockerLabel: said, focusId: FAN_OUT_IDS.end };
  }
  if (invoke?.mode === 'image' && invoke.tag.value !== '') {
    const said = words.tagUnchanged(invoke.tag.value);
    return { row: 'what', code: 'nothing-changes', message: said, source: 'server', blocks: true, blockerLabel: said, focusId: INVOKE_IDS.tag };
  }
  return { row: 'what', code: 'nothing-changes', message: words.nothingChanges, source: 'server', blocks: true, blockerLabel: words.nothingChangesBlocker, focusId: INVOKE_IDS.function };
}
