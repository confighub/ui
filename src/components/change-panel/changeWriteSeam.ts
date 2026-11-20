// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The one place a write joins the active change.
 *
 * Every config save (`uploadUnitData`) is made in the active change, unless the caller named
 * a ChangeSet itself, it is a dry run, or the Unit is held by another ChangeSet (the server
 * refuses that write). A free Unit joins first: the server does not open a ChangeSet on a
 * Unit from the data write's `change_set_id`, so the save sends the bulk Unit PATCH
 * `{ChangeSetID}` (only where `ChangeSetID IS NULL`), then the data with `change_set_id`.
 * Nothing asks first. A join on `change_set_id` in the server would make it one write.
 *
 * Invokes are not changed here: the server refuses an invoke that names a ChangeSet when
 * one of its Units is free, so the invoker joins the free Units first (`joinFreeUnits`)
 * and then names the change itself.
 *
 * Each save's outcome is announced on `window` for the change panel and the Save caption:
 * `CHANGE_SAVED_EVENT` with the Revision number, or `CHANGE_SAVE_REFUSED_EVENT` with the
 * server's words when a save named the active change and was refused.
 */
import { confighubApi } from '@confighub/rtk-query';
import { readPendingChange, setActiveChange } from './activeChange';

export const CHANGE_SAVED_EVENT = 'confighub:change-saved';
export const CHANGE_SAVE_REFUSED_EVENT = 'confighub:change-save-refused';

export interface ChangeSavedDetail {
  unitId: string;
  spaceId: string;
  revisionNum?: number;
  /** The ChangeSet the save was made in, or undefined when it was a free save. */
  changeSetId?: string;
  /** True when the Unit was free before the save, so it joined the change now. */
  joined: boolean;
}

export interface ChangeSaveRefusedDetail {
  unitId: string;
  spaceId: string;
  message: string;
}

let activeChangeSetId: string | undefined;
/** The ChangeSet each Unit's last save was sent in, for the save's announcement. */
const sentFor = new Map<string, string | undefined>();
/** What each Unit read last said its ChangeSetID is: '' for free. */
const unitChangeSet = new Map<string, string>();

/** Set by the panel when the active change resolves to an open ChangeSet. */
export function setSeamActiveChangeSetId(id: string | undefined): void {
  activeChangeSetId = id;
}

export function noteUnitChangeSet(unitId: string | undefined, changeSetId: string | undefined): void {
  if (unitId) unitChangeSet.set(unitId, changeSetId ?? '');
}

/** The id this Unit's write should carry, or undefined to send none. */
function idFor(unitId: string | undefined): string | undefined {
  if (activeChangeSetId === undefined) return undefined;
  const current = unitId === undefined ? undefined : unitChangeSet.get(unitId);
  if (current !== undefined && current !== '' && current !== activeChangeSetId) return undefined;
  return activeChangeSetId;
}

const isDryRun = (value: unknown) => value === true || value === 'true';

type QueryFn = (arg: Record<string, unknown>) => unknown;
type Definition = { query?: QueryFn; onQueryStarted?: unknown };

type BaseQuery = (args: unknown) => Promise<{ data?: unknown; error?: unknown }> | { data?: unknown; error?: unknown };
type QueryFn2 = (arg: Record<string, unknown>, api: unknown, extraOptions: unknown, baseQuery: BaseQuery) => Promise<{ data?: unknown; error?: unknown }>;
type SaveDefinition = Definition & { queryFn?: QueryFn2 };

/** The per-Unit answer of a bulk PATCH: an `Error` for a Unit it could not change. */
function joinRefusal(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined;
  const failed = (data as { Error?: { Message?: string } }[]).find((item) => item.Error);
  return failed ? (failed.Error?.Message ?? 'The Unit could not join the ChangeSet.') : undefined;
}

/** The save in the active change: join the free Unit, then write the data naming the change. */
function joinThenSave(definition: SaveDefinition | undefined) {
  if (!definition?.query) return;
  const query = definition.query;
  delete definition.query;
  definition.queryFn = async (arg, api, _extra, baseQuery) => {
    const unitId = arg.unitId as string | undefined;
    const dispatch = (api as { dispatch: (action: unknown) => { unwrap: () => Promise<unknown> } }).dispatch;
    const plain = isDryRun(arg.dryRun) || arg.changeSetId !== undefined;
    // A pending change (D34) is made by its first save: in that Unit's Space.
    const pending = plain || activeChangeSetId !== undefined ? null : readPendingChange();
    if (pending !== null && unitId !== undefined && typeof arg.spaceId === 'string') {
      try {
        const made = (await dispatch(confighubApi.endpoints.createChangeSet.initiate({ spaceId: arg.spaceId, changeSet: { Slug: pending } })).unwrap()) as {
          ChangeSetID?: string;
          Slug?: string;
        };
        const space = (await dispatch(confighubApi.endpoints.getSpace.initiate({ spaceId: arg.spaceId })).unwrap()) as { Space?: { Slug?: string } };
        if (made.ChangeSetID) {
          activeChangeSetId = made.ChangeSetID;
          setActiveChange({ space: space.Space?.Slug ?? '', slug: made.Slug ?? pending });
        }
      } catch (error) {
        return { error: (error as { status?: number; data?: unknown }) ?? { status: 400, data: undefined } };
      }
    }
    const id = plain ? undefined : idFor(unitId);
    if (unitId !== undefined) sentFor.set(unitId, plain ? (arg.changeSetId as string | undefined) : id);
    if (id === undefined || unitId === undefined) return baseQuery(query(arg));
    if (unitChangeSet.get(unitId) !== id) {
      // Its own request, so the base query sends it as the merge patch a bulk PATCH is: the
      // save's request is sent as the configuration document.
      const join = dispatch(
        confighubApi.endpoints.bulkPatchUnits.initiate({
          where: `UnitID = '${unitId}' AND ChangeSetID IS NULL`,
          // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
          body: JSON.stringify({ ChangeSetID: id }),
        }),
      );
      try {
        const refused = joinRefusal(await join.unwrap());
        if (refused !== undefined) return { error: { status: 400, data: { Error: { Message: refused } } } };
      } catch (error) {
        return { error: (error as { status?: number; data?: unknown }) ?? { status: 400, data: undefined } };
      }
    }
    return baseQuery(query({ ...arg, changeSetId: id }));
  };
}

interface SaveArg {
  unitId?: string;
  spaceId?: string;
  dryRun?: boolean;
  changeSetId?: string;
}

export function applyChangeWriteSeam(): void {
  confighubApi.enhanceEndpoints({
    endpoints: {
      uploadUnitData: (definition: Definition) => {
        joinThenSave(definition);
        definition.onQueryStarted = async (
          arg: SaveArg,
          { queryFulfilled }: { queryFulfilled: Promise<{ data: { Unit?: { HeadRevisionNum?: number } } }> },
        ) => {
          if (arg.dryRun || !arg.unitId || !arg.spaceId) return;
          const before = unitChangeSet.get(arg.unitId);
          try {
            const { data } = await queryFulfilled;
            const sentId = sentFor.get(arg.unitId);
            if (sentId !== undefined) noteUnitChangeSet(arg.unitId, sentId);
            const detail: ChangeSavedDetail = {
              unitId: arg.unitId,
              spaceId: arg.spaceId,
              revisionNum: data?.Unit?.HeadRevisionNum,
              changeSetId: sentId,
              joined: sentId !== undefined && before !== sentId,
            };
            window.dispatchEvent(new CustomEvent(CHANGE_SAVED_EVENT, { detail }));
          } catch (failure) {
            const sentId = sentFor.get(arg.unitId);
            if (sentId === undefined) return;
            const error = (failure as { error?: { data?: { Error?: { Message?: string }; message?: string } } }).error;
            const message = error?.data?.Error?.Message ?? error?.data?.message ?? 'The server refused the save.';
            const detail: ChangeSaveRefusedDetail = { unitId: arg.unitId, spaceId: arg.spaceId, message };
            window.dispatchEvent(new CustomEvent(CHANGE_SAVE_REFUSED_EVENT, { detail }));
          }
        };
      },
      getUnit: (definition: Definition) => {
        definition.onQueryStarted = async (
          _arg: unknown,
          { queryFulfilled }: { queryFulfilled: Promise<{ data: { Unit?: { UnitID?: string; ChangeSetID?: string } } }> },
        ) => {
          try {
            const { data } = await queryFulfilled;
            noteUnitChangeSet(data?.Unit?.UnitID, data?.Unit?.ChangeSetID);
          } catch {
            // A failed read says nothing about the Unit's ChangeSet.
          }
        };
      },
    } as never,
  });
}
