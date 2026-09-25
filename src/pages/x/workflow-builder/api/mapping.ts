// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Between the entity the API carries and the value the builder edits.
 *
 * Two things live here rather than on the page, and both are concurrency or identity
 * concerns the editor should not have to hold:
 *
 * - The CLIENT-SIDE STAGE ID. The server identifies a Stage by its position and its
 *   Name, but a Name is the thing being typed, so it cannot also be the key React
 *   reconciles on. Ids are minted on read and stripped on write, and a save PRESERVES
 *   them by position -- remounting an editor mid-edit takes the caret with it.
 *
 * - THE VERSION, with `SpaceID`, in `WorkflowIdentity`. The page's `Workflow` is a
 *   pure editing shape and gains no field for either. Optimistic concurrency belongs
 *   to whatever talks to the server.
 *
 * ON THE VERSION, because the safe-looking change here is the dangerous one.
 *
 * The check is a SQL COMPARE-AND-SWAP, not a comparison in a handler. `UpdateEntity`
 * reads the Version off the entity the request carried and builds
 * `UPDATE ... SET version = <that + 1> WHERE version = <that>`
 * (`internal/storage/entity.go:920-929`, with the increment applied by `BaseMeta`'s
 * `BeforeAppendModel` hook). Zero rows affected is reported as a conflict
 * (`entity.go:565`). Exact equality, every entity, every path.
 *
 * Do NOT cite the `vNew < vOld` comparison in `HandleUpdateRequest`. It exists, it is
 * easy to find, and it DOES NOT RUN for this endpoint: `ChangeWorkflowController.Update`
 * calls `PluggableHandleUpdateRequest` with its own closure
 * (`internal/views/changeworkflow.go:309`) and never reaches the one carrying that
 * check. Three of us reasoned from it before anyone noticed.
 *
 * So the invariant is PRESENCE, not the value: `Version` is always emitted, never spread
 * conditionally. An omitted field arrives as Go's zero, `WHERE version = 0` matches
 * nothing, and the save is refused loudly. `...(version ? { Version: version } : {})`
 * reads as removing a field that is "always zero anyway" and is a behaviour change --
 * and on the PATCH sibling, where an absent field INHERITS the stored value under
 * RFC 7386, it would be silent data loss rather than a loud refusal.
 *
 * The second half of the invariant -- never REFRESHING the version mid-edit -- defeats
 * the compare-and-swap as well, so nothing in the stack catches it. It lives in
 * `baseVersion.ts`.
 */

import { formatRelative } from '@/utility/date-format';
import { SerializedError } from '@reduxjs/toolkit';
import type {
  ChangeWorkflow,
  ChangeWorkflowRead,
  ChangeWorkflowStage,
} from '@confighub/rtk-query';

import type { Stage, Workflow } from '../types';

/**
 * What the page does not carry: how to address this workflow, and which revision of it
 * was read.
 */
export interface WorkflowIdentity {
  changeWorkflowId: string;
  /** Writes are space-scoped (`/api/space/:space_id/change_workflow/...`); the page shows a slug. */
  spaceId: string;
  /** Sent back verbatim on update. See the note above on what a missing one does. */
  version: number;
}

/**
 * The editing shape, minus the one field this page has not settled.
 *
 * Two fields are omitted rather than invented, and for different reasons.
 *
 * `component`: a ChangeWorkflow has no component of its own --
 * `internal/views/promote_select.go:293` reads it from the ChangeOrder's Space at promote
 * time -- so what a builder previews against is a decision made above this layer, and
 * naming it here would bake in an answer that has not been given.
 *
 * `governs`: the count is not on the entity and has to be asked for separately. Carrying
 * a placeholder zero here would put a SECOND SOURCE of that number beside the real one,
 * and the two would not agree -- a caller with a real count would still find a zero
 * underneath it, and nothing would say which was meant. Omitted, so there is one source
 * or none.
 */
export type MappedWorkflow = Omit<Workflow, 'component' | 'governs'>;

export interface MappedEntity {
  workflow: MappedWorkflow;
  identity: WorkflowIdentity;
}

/** Ids are unique within one workflow, never across, so position is enough to make one. */
function mintStageId(index: number): string {
  return `s${index}`;
}

function mintCustomId(index: number): string {
  return `c${index}`;
}

/**
 * A compact duration, as the console's Age column shows it.
 *
 * Deliberately not `formatRelative`, which is prose ("4 minutes ago"). A column reads
 * better as a token, and the column is narrow.
 */
function compactAge(since: string | undefined): string {
  if (!since) return '';
  const ms = Date.now() - new Date(since).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}

/** Sorted so the same entity always renders its labels in the same order. */
function toLabelPairs(labels: Record<string, string> | undefined): Array<[string, string]> {
  return Object.entries(labels ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

function toPageStage(stage: ChangeWorkflowStage, index: number): Stage {
  return {
    id: mintStageId(index),
    name: stage.Name,
    where: stage.WhereSpace ?? '',
    prereqs: stage.Prerequisites ?? [],
  };
}

/**
 * What a caller reports when an answer arrived but could not be read.
 *
 * A `SerializedError` rather than a kind of its own, so it lands in the error state a
 * caller already has. To a reader "we could not read this" is one fact however it
 * happened, and a shape nobody can parse is no more actionable than a 500.
 */
export const MALFORMED_RESPONSE: SerializedError = {
  name: 'MalformedResponse',
  message: 'The server answered with something this page could not read.',
};

/**
 * `fromWire`, with a failure to read reported rather than thrown.
 *
 * The mapping is tolerant of fields that are ABSENT -- `?? []` and `?? ''` throughout --
 * and that is not the same as being tolerant of fields of the wrong shape. `?? []`
 * defends against null and undefined and passes a string or an object straight through
 * to `.map`, which throws. `toPageStage` reads `stage.Name` and throws on a null element.
 *
 * A throw during mapping happens inside a render and unwinds past every error state this
 * layer offers, because those are driven by an error VALUE. The result is a blank page
 * where a careful notice was waiting. So the boundary the data enters is where the throw
 * has to become a value.
 *
 * The exception itself is dropped rather than carried: there is nothing a caller can do
 * with a `TypeError` about `.map`, and showing it would put an implementation string in
 * front of a reader who needs to know only that the workflow could not be read.
 */
export function tryFromWire(wire: ChangeWorkflowRead): MappedEntity | null {
  try {
    return fromWire(wire);
  } catch {
    return null;
  }
}

/**
 * A workflow that exists nowhere but the draft -- never read, never written,
 * carrying nothing that would be a lie to show.
 *
 * The slug and display name are genuinely empty, not a placeholder: this is fed
 * to `useWorkflowBuilder` as `loaded`, seeding the same editable field
 * `SummaryCard`'s slug input reads and writes, and an unreseeded fresh session
 * per draft is the caller's `identityKey`'s job, not this function's -- baking a
 * uniqueness marker in here would put that marker in front of the person typing
 * it, and possibly onto the server if they saved before replacing it. See
 * `useWorkflowBuilder`'s own `identityKey` parameter for the other half of this.
 *
 * Zero Stages, deliberately: the server requires at least one to accept a
 * create (`internal/views/changeworkflow.go:88`), and the client already faults
 * this and blocks Save on it (`model.ts`'s `definitionFaults`) for the same
 * reason a real workflow emptied out would be blocked -- nothing new needed for
 * "must add a Stage before saving" to hold here too.
 */
export function emptyWorkflow(): MappedWorkflow {
  return {
    key: '',
    displayName: '',
    slug: '',
    space: '',
    labels: [],
    updated: '',
    age: '',
    stages: [],
    final: { prereqs: [] },
    custom: [],
  };
}

export function fromWire(wire: ChangeWorkflowRead): MappedEntity {
  const workflow: MappedWorkflow = {
    key: wire.ChangeWorkflowID ?? wire.Slug,
    displayName: wire.DisplayName ?? wire.Slug,
    slug: wire.Slug,
    space: wire.SpaceSlug ?? '',
    labels: toLabelPairs(wire.Labels),
    updated: formatRelative(wire.UpdatedAt),
    age: compactAge(wire.CreatedAt),
    stages: (wire.Stages ?? []).map(toPageStage),
    final: { prereqs: wire.Final?.Prerequisites ?? [] },
    custom: (wire.CustomPrerequisites ?? []).map((custom, index) => ({
      id: mintCustomId(index),
      name: custom.Name,
      expression: custom.Expression,
      description: custom.Description ?? '',
    })),
  };

  return {
    workflow,
    identity: {
      changeWorkflowId: wire.ChangeWorkflowID ?? '',
      spaceId: wire.SpaceID ?? '',
      version: wire.Version ?? 0,
    },
  };
}

/**
 * The entity to send.
 *
 * Empty optional fields are omitted rather than sent empty: the server treats an absent
 * `WhereSpace` as "every Space of the component", and an empty string means the same
 * thing, but omitting it keeps a round trip from rewriting what the author wrote.
 */
export function toWire(
  workflow: MappedWorkflow,
  identity: WorkflowIdentity,
): ChangeWorkflow {
  return {
    ChangeWorkflowID: identity.changeWorkflowId || undefined,
    SpaceID: identity.spaceId || undefined,
    Version: identity.version,
    Slug: workflow.slug,
    DisplayName: workflow.displayName || undefined,
    Labels: Object.fromEntries(workflow.labels),
    Stages: workflow.stages.map((stage) => ({
      Name: stage.name,
      WhereSpace: stage.where || undefined,
      Prerequisites: stage.prereqs.length ? stage.prereqs : undefined,
    })),
    Final: { Prerequisites: workflow.final.prereqs.length ? workflow.final.prereqs : undefined },
    CustomPrerequisites: workflow.custom.map((custom) => ({
      Name: custom.name,
      Expression: custom.expression,
      Description: custom.description || undefined,
    })),
  };
}

/**
 * The saved value, wearing the ids it already had.
 *
 * Matched BY POSITION, because that is what survives a save: the Stages were sent in
 * this order and come back in it, while every other candidate key -- the Name above
 * all -- is a field the author may have just been editing. Re-minting instead would
 * remount the open editor and move the caret, which is the one thing a save must not do.
 */
export function applySaved(sent: MappedWorkflow, saved: ChangeWorkflowRead): MappedEntity {
  const mapped = fromWire(saved);
  const keepStageId = (index: number): string => sent.stages[index]?.id ?? mintStageId(index);
  const keepCustomId = (index: number): string => sent.custom[index]?.id ?? mintCustomId(index);

  return {
    identity: mapped.identity,
    workflow: {
      ...mapped.workflow,
      stages: mapped.workflow.stages.map((stage, index) => ({ ...stage, id: keepStageId(index) })),
      custom: mapped.workflow.custom.map((custom, index) => ({
        ...custom,
        id: keepCustomId(index),
      })),
    },
  };
}
