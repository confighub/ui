// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Reading the one workflow the builder has open.
 *
 * ADDRESSED BY ID, NEVER BY SLUG. A ChangeWorkflow's slug is unique within a SPACE, not
 * within an organisation -- the index is on `(organization_id, space_id, slug)`
 * (`20260914120003_create_change_workflows.tx.up.sql:38`). So two Spaces may each hold a
 * `payments-main-line`, and matching a slug against an org-wide list would pick whichever
 * came first and silently open a different workflow from the one that was asked for. No
 * error, nothing on screen, and only ever for someone who named two workflows the same --
 * which a per-Space constraint positively invites.
 *
 * WHY THE LIST RATHER THAN `useGetChangeWorkflowQuery`. The get endpoint is
 * `/space/:space_id/change_workflow/:change_workflow_id` and needs a Space id as well.
 * The org-wide list returns whole workflows -- Stages, Final and CustomPrerequisites are
 * all on the entity -- and is a single shared cache entry the console has usually already
 * filled, so opening a workflow from a console row costs no request at all.
 *
 * WHY IT OWNS THE IDENTITY. `Version` may not advance while a draft is unsaved, and the
 * list refetches on any ChangeWorkflow mutation because invalidation here is by entity
 * type. So the identity is latched on the edit session rather than read out of whatever
 * the cache currently holds, and a successful save advances it through `noteSaved` rather
 * than by a second read. One source: two would be one more number that could disagree
 * with itself, which is the failure this layer has spent the day removing.
 */

import { useCallback, useMemo, useState } from 'react';

import { useListAllChangeWorkflowsQuery } from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import {
  MALFORMED_RESPONSE,
  tryFromWire,
  type MappedWorkflow,
  type WorkflowIdentity,
} from './mapping';

/** Neither may deny the other; see `notFound` and `forbidden`. */
const HTTP_NOT_FOUND = 404;
const HTTP_FORBIDDEN = 403;

export interface WorkflowDetail {
  /**
   * The workflow as the builder edits it, or undefined until one is read.
   *
   * NOT reference-stable across a refetch: the list returns a fresh array and this is
   * rebuilt from it, so the object identity changes even when nothing in it did. What
   * protects an open draft is the caller seeding on the FETCHED IDENTITY rather than on
   * this object -- a refetch of the same workflow is the same identity and reseeds
   * nothing. Said explicitly because "it is stable" would be a pleasant thing to assume
   * and is not true.
   */
  workflow: MappedWorkflow | undefined;
  /** What a save needs, latched at the start of this edit. */
  identity: WorkflowIdentity | undefined;
  /** Begins the next edit session with the Version a successful save returned. */
  noteSaved: (next: WorkflowIdentity) => void;
  isLoading: boolean;
  /**
   * No workflow of that id is readable.
   *
   * Kept apart from `forbidden` and never derived from it. The two must stay
   * distinguishable to a reader without either becoming a way to learn that a workflow
   * exists in a Space they cannot see -- so a caller may say different things about them,
   * and must not say that one rules the other out.
   */
  notFound: boolean;
  /**
   * The read was refused.
   *
   * MUTUALLY EXCLUSIVE with `notFound` by construction: a 403 leaves an error set, which
   * is what `notFound`'s "read successfully and absent" branch requires to be clear. No
   * precedence is needed and none should be invented.
   *
   * It is also nearly unreachable, and a caller should know that rather than design
   * around it. `baseQueryWithReauth` answers a 403 with a permanently pending promise
   * (`confighubapi.ts:131`) and navigates to `/access-denied` or `/pending-approval`, so
   * the query never settles and this page is replaced rather than told. The flag is here
   * because a refusal must stay distinguishable from an absence if it ever does arrive --
   * not because it is the path a refused reader will take.
   */
  forbidden: boolean;
  error: FetchBaseQueryError | SerializedError | undefined;
  refetch: () => void;
}

function statusOf(error: FetchBaseQueryError | SerializedError | undefined): number | undefined {
  if (!error || !('status' in error) || typeof error.status !== 'number') return undefined;
  return error.status;
}

export function useChangeWorkflowDetail(
  changeWorkflowId: string | undefined,
): WorkflowDetail {
  /**
   * The one definition of "a workflow was asked for", written once because the
   * skip and the branches below must not be able to disagree about it. An id
   * that is present but empty names nothing, so it is not an ask -- and when the
   * skip read that as no ask while a branch read it as an ask, a request that
   * was never sent came back reported as not found.
   *
   * ⚠️ NOTHING BELOW MAY TEST `changeWorkflowId`. Test this.
   */
  const asked: string | undefined = changeWorkflowId || undefined;

  const { data, isLoading, error, refetch } = useListAllChangeWorkflowsQuery(
    {},
    { skip: asked === undefined },
  );

  /**
   * The identity this edit began with, and the session it belongs to.
   *
   * Held in state rather than derived, because deriving it from the cache is exactly what
   * must not happen: a background refetch would advance the Version, the compare-and-swap
   * would then match, and a concurrent write would be overwritten with nothing reported.
   */
  const [session, setSession] = useState<{ key: string; identity: WorkflowIdentity } | null>(
    null,
  );

  /*
   * `unreadable` rather than a throw. `data` is TYPED as an array and is not guaranteed to
   * be one: the base query parses by content type, so an intermediary answering 200 with
   * an HTML gateway or sign-in page yields a string, and `.find` on a string throws inside
   * a render -- past every error state below, leaving a blank page where a notice was
   * waiting. Being typed is not being checked.
   */
  const { found, unreadable } = useMemo(() => {
    if (asked === undefined || data === undefined) return { found: undefined, unreadable: false };
    if (!Array.isArray(data)) return { found: undefined, unreadable: true };
    const match = data.find(
      (extended) => extended?.ChangeWorkflow?.ChangeWorkflowID === asked,
    );
    if (!match?.ChangeWorkflow) return { found: undefined, unreadable: false };
    const mapped = tryFromWire(match.ChangeWorkflow);
    return { found: mapped ?? undefined, unreadable: mapped === null };
  }, [data, asked]);

  /*
   * Latch on first sight of a workflow, and on nothing after that. `key` is the id rather
   * than the Version precisely so that a Version moving underneath does not look like a
   * new session.
   */
  const isNewSession =
    found !== undefined && asked !== undefined && session?.key !== asked;
  const latched = isNewSession
    ? { key: asked, identity: found.identity }
    : session;
  if (latched !== session) setSession(latched);

  const noteSaved = useCallback(
    (next: WorkflowIdentity) => {
      // A save that succeeded is the start of the next edit, and the only thing entitled
      // to move the Version this layer will send.
      setSession((current) => (current ? { ...current, identity: next } : current));
    },
    [],
  );

  const status = statusOf(error);

  /*
   * A list that was read successfully and holds no such slug is as much a "not found" as
   * a 404 is. Both are reported the same way, because to a reader they are the same fact
   * and the difference between them is ours, not theirs.
   */
  const readButAbsent =
    asked !== undefined &&
    !isLoading &&
    error === undefined &&
    !unreadable &&
    found === undefined;

  const isMissing = status === HTTP_NOT_FOUND || readButAbsent;

  return {
    workflow: found?.workflow,
    identity: latched?.identity,
    noteSaved,
    isLoading,
    notFound: isMissing,
    forbidden: status === HTTP_FORBIDDEN,
    error: error ?? (unreadable ? MALFORMED_RESPONSE : undefined),
    refetch,
  };
}
