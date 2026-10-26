// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The promote dry run a stage card shows before anyone clicks: the server's
 * answer to "what would promoting into this stage do now?", asked when the
 * stage is opened, when the ChangeOrder changes, when the window regains focus,
 * and on "Check again".
 *
 * UNFORCED, AND THAT IS THE POINT. The stage panel's other dry run
 * (`useChangeOrderChanges`) is forced past the gates so it can show a diff for
 * a stage that is not open yet; forced, it can say nothing about the gates,
 * and its plan is not the plan a promote applies. This one plans exactly what
 * Promote would send, so its gates are the server's verdict and its `Plan` is
 * what the promote carries as `ExpectedPlan`: what the card said is what gets
 * written, or nothing is (412).
 *
 * SENT WITH `authFetch`, NOT RTK. RTK hands every 403 to the app's
 * `handleForbidden`, which replaces the page with /access-denied, and a viewer
 * who may read a ChangeOrder but not promote it is refused this as a matter of
 * course. Here a 403 is an answer the card states.
 *
 * NOT COUNTED AS BUSY. `useChangeOrderActions.preview` sets `busy`, which
 * disables every action on the page; a dry run that runs on load would then
 * disable the page on load. This keeps its own state, and only hands its plan
 * to the actions hook (`adoptPlan`).
 *
 * LOAD IS BOUNDED. A dry run is a promotion planned in full, so it runs only
 * while the caller says the stage is actionable (`enabled`), only once the
 * stage panel's forced dry run has settled (`forcedDryRunSettled`, so the two
 * are not planned at once), and an answer for a stage the reader has left is
 * dropped and its request aborted. Returning to the window asks again only
 * when the answer shown is a minute old or was asked before the ChangeOrder
 * last changed, and at most once per 30s: a reader switching windows is not a
 * reason to plan a whole promotion each time.
 *
 * IT ALWAYS ENDS. A request that fails at any point — sending, reading the
 * body, a timeout — becomes an answer with status 0 ("no verdict"), so the
 * card never stays on "Checking…" and a confirm waiting on it never sticks.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { PromoteResult } from '@confighub/rtk-query';

import { authFetch } from '@/auth/session';

import {
  promoteHasNothingToDo,
  whereSpaceOf,
  type PlannedPromote,
} from '../../x/apps/change-order/useChangeOrderActions';
import { answerOf, type Send } from '../reviews/quietServerCalls';

/** A focus or visibility change asks again at most this often. */
export const STAGE_DRY_RUN_FOCUS_THROTTLE_MS = 30_000;
/** An answer older than this is asked again before a promote is confirmed. */
export const STAGE_DRY_RUN_FRESH_MS = 60_000;
/** A dry run still unanswered after this has no verdict, and says so. */
export const STAGE_DRY_RUN_TIMEOUT_MS = 30_000;

/** One answer of the dry run. */
export interface StageDryRunAnswer {
  /** The HTTP status. 0 is no answer at all: a network failure, a timeout. */
  status: number;
  /** The parsed body: a `PromoteResult` for a 2xx and a 409, the refusal otherwise. */
  body: unknown;
  /** The `PromoteResult` of a 2xx or a 409; undefined for anything else. */
  result?: PromoteResult;
  /** The selector it planned over (`whereSpaceOf`). */
  selector: string;
  /** The `refreshKey` it was asked under. */
  refreshKey: string;
  /** When it arrived, epoch ms. */
  ranAt: number;
}

export interface UseStageDryRunArgs {
  changeOrderId: string | undefined;
  /** The ChangeOrder's own Space: the one skip `summarisePromote` reads as benign. */
  baseSpaceId: string | undefined;
  /** The stage on screen. An answer for any other stage is never shown. */
  stageId: string | undefined;
  /** The Spaces the promote would write: `promotionTargets(...)`, never stage membership. */
  targetSpaceIds: readonly string[];
  /**
   * The stage is in a state where a promote could be offered (ready, a
   * propagation problem, in progress, progress unknown, failed). False while a
   * review or a failing gate holds it, once it is promoted, and for a source.
   */
  enabled: boolean;
  /** The stage panel's forced dry run has answered (`stageChangesStatus !== 'loading'`). */
  forcedDryRunSettled: boolean;
  /** Changes when the ChangeOrder does (UpdatedAt, Resolved, Released): the dry run is asked again. */
  refreshKey: string;
  /** `actions.adoptPlan`: receives each answer's plan, or `null` when an answer carries none. */
  adoptPlan: (planned: PlannedPromote | null) => void;
  /** The request sender; `authFetch` unless a caller has reason to pass another. */
  send?: Send;
}

export interface StageDryRun {
  /** A request is in flight, whether or not an earlier answer for this stage is shown meanwhile. */
  running: boolean;
  /** The latest answer for this stage, kept while a re-check runs so the card does not flicker. */
  answer?: StageDryRunAnswer;
  /** The answer would be asked again before a confirm: older than 60s, or asked under another `refreshKey`. */
  stale: boolean;
  /** Ask again now ("Check again"). Joins a request already in flight for the same stage. */
  recheck: () => Promise<StageDryRunAnswer | undefined>;
  /**
   * An answer fit to confirm on: the current one when it is a 2xx under the
   * current `refreshKey`, younger than 60s and not yet confirmed on; otherwise
   * a new one. Its plan is handed to the actions hook before this resolves.
   */
  ensureFresh: () => Promise<StageDryRunAnswer | undefined>;
  /** Nothing was written on this answer after all: `ensureFresh` may hand it out again. */
  unspend: (answer: StageDryRunAnswer) => void;
}

const ok = (status: number) => status >= 200 && status < 300;

/** The body as a `PromoteResult`, when it is an object at all; a 2xx or 409 body is one. */
function promoteResultOf(body: unknown): PromoteResult | undefined {
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as PromoteResult) : undefined;
}

/** Fresh enough not to ask again: asked under the current `refreshKey`, less than a minute ago. */
function answerIsCurrent(answer: StageDryRunAnswer | undefined, refreshKey: string, now: number): boolean {
  return answer !== undefined && answer.refreshKey === refreshKey && now - answer.ranAt < STAGE_DRY_RUN_FRESH_MS;
}

interface Inflight {
  generation: number;
  scope: string;
  refreshKey: string;
  promise: Promise<StageDryRunAnswer | undefined>;
}

export function useStageDryRun(args: UseStageDryRunArgs): StageDryRun {
  const {
    changeOrderId,
    baseSpaceId,
    stageId,
    targetSpaceIds,
    enabled,
    forcedDryRunSettled,
    refreshKey,
    adoptPlan,
    send = authFetch,
  } = args;

  const selector = whereSpaceOf(targetSpaceIds);
  const nothingToPlan = stageId === undefined || promoteHasNothingToDo(changeOrderId, baseSpaceId, targetSpaceIds);
  /** What an answer is about. One stage, its Spaces, one ChangeOrder: anything else is another question. */
  const scope = nothingToPlan ? '' : `${changeOrderId}|${stageId}|${selector}`;

  const [state, setState] = useState<{ scope: string; answer?: StageDryRunAnswer; running: boolean }>({
    scope: '',
    running: false,
  });

  /*
   * Refs for what the callbacks read when they run, not when they were made: a
   * focus event or a confirm arrives long after the render that bound it.
   */
  const live = useRef({ scope, selector, refreshKey, changeOrderId, baseSpaceId, adoptPlan, send, nothingToPlan });
  live.current = { scope, selector, refreshKey, changeOrderId, baseSpaceId, adoptPlan, send, nothingToPlan };
  const generation = useRef(0);
  const inflight = useRef<Inflight | null>(null);
  const abort = useRef<AbortController | null>(null);
  const answerRef = useRef<StageDryRunAnswer | undefined>(undefined);
  /** Answers a confirm has used: their plan is spent, whether the promote landed or was refused. */
  const spent = useRef(new WeakSet<StageDryRunAnswer>());
  const lastStartedAt = useRef(0);

  const adoptFrom = useCallback((answer: StageDryRunAnswer | undefined) => {
    const plan = answer !== undefined && ok(answer.status) ? answer.result?.Plan : undefined;
    live.current.adoptPlan(
      answer !== undefined && typeof plan === 'string' && plan.length > 0 ? { selector: answer.selector, plan } : null,
    );
  }, []);

  const run = useCallback((): Promise<StageDryRunAnswer | undefined> => {
    const now = live.current;
    if (now.nothingToPlan || now.scope === '') return Promise.resolve(undefined);
    const current = inflight.current;
    if (current !== null && current.scope === now.scope && current.refreshKey === now.refreshKey) return current.promise;

    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const timer = window.setTimeout(() => controller.abort(), STAGE_DRY_RUN_TIMEOUT_MS);
    generation.current += 1;
    const mine = generation.current;
    const { scope: askedScope, selector: askedSelector, refreshKey: askedKey } = now;
    lastStartedAt.current = Date.now();
    setState((previous) => ({
      scope: askedScope,
      running: true,
      ...(previous.scope === askedScope && previous.answer !== undefined ? { answer: previous.answer } : {}),
    }));

    const promise = answerOf(now.send, '/api/promote?dry_run=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Exactly what Promote sends, less the plan: the same selector, no Force.
      body: JSON.stringify({ ChangeOrderID: now.changeOrderId, WhereSpace: askedSelector, DryRun: true }),
      signal: controller.signal,
    })
      // `answerOf` already turns a failed request into status 0; this is the net under it, so
      // nothing below can be skipped and leave the card checking for good.
      .catch((error: unknown) => ({
        status: 0,
        body: { message: error instanceof Error ? error.message : 'The dry run failed.' },
      }))
      .then((reply): StageDryRunAnswer | undefined => {
        // The reader moved on, or a newer ask replaced this one: the answer is about something not on screen.
        if (generation.current !== mine) return undefined;
        const result = ok(reply.status) || reply.status === 409 ? promoteResultOf(reply.body) : undefined;
        const answer: StageDryRunAnswer = {
          status: reply.status,
          body: reply.body,
          ...(result !== undefined ? { result } : {}),
          selector: askedSelector,
          refreshKey: askedKey,
          ranAt: Date.now(),
        };
        answerRef.current = answer;
        setState({ scope: askedScope, answer, running: false });
        /*
         * EVERY ANSWER REPLACES THE PLAN HELD, INCLUDING ONE WITH NO PLAN. The
         * card states the latest answer, so the latest answer's plan is the one a
         * promote may carry; an older one would be refused as stale (412) for a
         * difference the reader was never shown.
         */
        adoptFrom(answer);
        return answer;
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timer);
        // Only this ask's own record: a newer ask in flight keeps its own, and its "running".
        if (inflight.current?.generation === mine) inflight.current = null;
        if (inflight.current !== null && inflight.current.scope === askedScope) return;
        setState((previous) => (previous.scope === askedScope && previous.running ? { ...previous, running: false } : previous));
      });
    inflight.current = { generation: mine, scope: askedScope, refreshKey: askedKey, promise };
    return promise;
  }, [adoptFrom]);

  // A new stage, new Spaces or a changed ChangeOrder: drop what was asked for the old one.
  useEffect(() => {
    generation.current += 1;
    abort.current?.abort();
    inflight.current = null;
    answerRef.current = undefined;
    adoptPlan(null);
  }, [scope, adoptPlan]);

  // Asked on opening the stage and whenever the ChangeOrder changes, once the forced dry run is in.
  const asking = enabled && forcedDryRunSettled && scope !== '';
  useEffect(() => {
    if (!asking) return;
    void run();
  }, [asking, scope, refreshKey, run]);

  // On returning to the window: the world may have moved while nobody was looking.
  useEffect(() => {
    if (!asking) return;
    const onReturn = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastStartedAt.current < STAGE_DRY_RUN_FOCUS_THROTTLE_MS) return;
      if (answerIsCurrent(answerRef.current, live.current.refreshKey, now)) return;
      void run();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [asking, run]);

  // An unmounted card asks nothing more.
  useEffect(
    () => () => {
      generation.current += 1;
      abort.current?.abort();
    },
    [],
  );

  const recheck = useCallback(() => run(), [run]);

  const ensureFresh = useCallback(async (): Promise<StageDryRunAnswer | undefined> => {
    const pending = inflight.current;
    let answer =
      pending !== null && pending.scope === live.current.scope && pending.refreshKey === live.current.refreshKey
        ? await pending.promise
        : answerRef.current;
    const fresh =
      answer !== undefined &&
      ok(answer.status) &&
      answer.selector === live.current.selector &&
      answer.refreshKey === live.current.refreshKey &&
      Date.now() - answer.ranAt < STAGE_DRY_RUN_FRESH_MS &&
      !spent.current.has(answer);
    if (!fresh) answer = await run();
    if (answer !== undefined) {
      spent.current.add(answer);
      // The plan sent is the plan of the answer returned, whatever was adopted meanwhile.
      adoptFrom(answer);
    }
    return answer;
  }, [run, adoptFrom]);

  const unspend = useCallback((used: StageDryRunAnswer) => {
    spent.current.delete(used);
  }, []);

  const shown = state.scope === scope && scope !== '' ? state : undefined;
  const answer = shown?.answer;
  const running = shown?.running === true;
  return {
    running,
    ...(answer !== undefined ? { answer } : {}),
    // Read at render: the page re-renders on its own poll, which is often enough for a 60s rule.
    stale: !answerIsCurrent(answer, refreshKey, Date.now()),
    recheck,
    ensureFresh,
    unspend,
  };
}
