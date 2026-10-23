// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useCallback } from 'react';

import {
  type Column,
  type FilterRead,
  type ViewRead,
  useCreateFilterMutation,
  useCreateViewMutation,
  useDeleteFilterMutation,
  useDeleteViewMutation,
  useLazyGetFilterQuery,
  useLazyGetViewQuery,
  useLazyListAllViewsQuery,
  useLazyListFiltersQuery,
  useLazyListViewsQuery,
  usePatchFilterMutation,
  usePatchViewMutation,
} from '@confighub/rtk-query';

import { viewDefToSave } from '../model/view-codec';
import type { ViewDef } from '../model/types';
import { useSystemSpace } from './useSystemSpace';
import { slugFromDisplayName } from '../types';
import type { SavedView } from './useViews';
import { sameInstant } from './instant';

export { sameInstant };

/** What a write to an existing View needs; built from the saved View, or from the ids of one saved a moment ago. */
export interface SaveTarget {
  viewId: string;
  spaceId: string;
  filterId?: string;
  filterSpaceId?: string;
  name: string;
  slug: string;
  /** The View's saved columns, so properties such as a data path are kept. */
  columns: readonly Column[];
  /** The View's UpdatedAt when this page last read or wrote it; a different one on the server means someone else changed it. */
  updatedAt: string;
  /** The same for the View's Filter, when known. */
  filterUpdatedAt?: string;
}

/** The View was changed by someone else after it was opened here. */
export class ViewChangedError extends Error {
  constructor() {
    super('This view was changed by someone else since you opened it.');
    this.name = 'ViewChangedError';
  }
}

/** A save that failed part-way; the message says what was put back. */
export class SaveFailedError extends Error {
  /** The Filter's version after it was put back: putting it back is a write too. */
  readonly filterUpdatedAt?: string;
  constructor(message: string, filterUpdatedAt?: string) {
    super(message);
    this.name = 'SaveFailedError';
    this.filterUpdatedAt = filterUpdatedAt;
  }
}

export interface SaveOptions {
  /** Write over a change someone else made. */
  overwrite?: boolean;
}

export interface SaveResult extends SavedIds {
  /** The View's UpdatedAt after the write, as the server reads it back. */
  updatedAt: string;
  /** The Filter's UpdatedAt after the write, as the server reads it back. */
  filterUpdatedAt?: string;
}

/** What a rename leaves: the versions to compare with next time, or null to keep the old ones. */
export type RenameResult = { updatedAt: string; filterUpdatedAt?: string } | null;


export interface RemoveResult {
  /** The View is gone, but its Filter could not be removed. */
  filterLeft: boolean;
}

export function saveTargetOf(saved: SavedView): SaveTarget {
  return {
    viewId: saved.viewId,
    spaceId: saved.spaceId,
    filterId: saved.filterId,
    filterSpaceId: saved.filterSpaceId,
    name: saved.name,
    slug: saved.slug,
    columns: (saved.view.Columns ?? []).filter((c): c is Column => !!c?.Name),
    updatedAt: saved.updatedAt,
  };
}

/**
 * Writing views: a View and the Filter behind it, created, saved, renamed
 * and deleted together. The person sees one "save"; the Filter is managed
 * behind it.
 *
 * Every View gets a Filter of its own. A Filter is never created with
 * allowExists: a Filter that happened to have the same slug would be shared
 * silently, and saving one View would then change another. On a slug that is
 * taken, the slug gets `-2`, `-3`, … instead. A Filter is deleted with its
 * View only when no other View still points at it.
 */

export interface SavedIds {
  viewId: string;
  filterId: string;
  spaceId: string;
}

const MAX_SLUG_TRIES = 20;

/** A failed write as one plain sentence for a toast. */
export function saveErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    const data = (err as { data?: { message?: unknown; Error?: { Message?: unknown } } }).data;
    const message = data?.Error?.Message ?? data?.message;
    if (typeof message === 'string' && message.trim()) return message.split('\n')[0];
    const plain = (err as { message?: unknown }).message;
    if (typeof plain === 'string' && plain.trim()) return plain;
  }
  return fallback;
}

/** An id the server always returns on a write; its absence is a server fault, not a user one. */
function required(id: string | undefined, what: string): string {
  if (!id) throw new Error(`The server did not return the ${what}.`);
  return id;
}

function isConflict(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 409;
}

const numbered = (base: string, n: number) => (n === 1 ? base : `${base}-${n}`);

/**
 * Try `make(slug)` with the first of `slug`, `slug-2`, `slug-3`, … that is not
 * in `taken`, and the next one if the server still says it is taken (someone
 * else saved in between). Looking first keeps the usual case to one request.
 */
async function withFreeSlug<T>(base: string, taken: ReadonlySet<string>, make: (slug: string) => Promise<T>): Promise<T> {
  let start = 1;
  while (start < MAX_SLUG_TRIES && taken.has(numbered(base, start))) start++;
  for (let n = start; n <= MAX_SLUG_TRIES; n++) {
    const slug = numbered(base, n);
    try {
      return await make(slug);
    } catch (err) {
      if (!isConflict(err) || n === MAX_SLUG_TRIES) throw err;
    }
  }
  throw new Error('No free name was found for the view.');
}

export function useSaveView() {
  const [createFilter] = useCreateFilterMutation();
  const [patchFilter] = usePatchFilterMutation();
  const [deleteFilter] = useDeleteFilterMutation();
  const [createView] = useCreateViewMutation();
  const [patchView] = usePatchViewMutation();
  const [deleteView] = useDeleteViewMutation();
  const [listViews] = useLazyListAllViewsQuery();
  const [getView] = useLazyGetViewQuery();
  const [getFilter] = useLazyGetFilterQuery();

  /** The View and its Filter as the server has them now, never from the cache. */
  const readBack = useCallback(
    (spaceId: string, viewId: string) => getView({ spaceId, viewId, include: 'FilterID' }, false).unwrap(),
    [getView],
  );
  const [listSpaceFilters] = useLazyListFiltersQuery();
  const [listSpaceViews] = useLazyListViewsQuery();

  /** The slugs starting with `base` already used by Filters and Views in a Space. */
  const takenSlugs = useCallback(
    async (spaceId: string, base: string) => {
      const where = `Slug LIKE '${base}%'`;
      const [filters, views] = await Promise.all([
        listSpaceFilters({ spaceId, where }).unwrap().catch(() => []),
        listSpaceViews({ spaceId, where }).unwrap().catch(() => []),
      ]);
      const slugs = new Set<string>();
      for (const f of filters) if (f.Filter?.Slug) slugs.add(f.Filter.Slug);
      for (const v of views) if (v.View?.Slug) slugs.add(v.View.Slug);
      return slugs;
    },
    [listSpaceFilters, listSpaceViews],
  );
  const { ensureSystemSpace } = useSystemSpace();

  /** A new View (and its own Filter) in confighub-system, for a first save or "Save as new". */
  const createNew = useCallback(
    async (def: ViewDef, name: string): Promise<SaveResult> => {
      const fields = viewDefToSave(def);
      if (!fields.ok) throw new Error(fields.error);
      const spaceId = await ensureSystemSpace();
      const base = slugFromDisplayName(name) || 'view';
      const taken = await takenSlugs(spaceId, base);
      const filter: FilterRead = await withFreeSlug(`${base}-filter`, taken, (slug) =>
        createFilter({
          spaceId,
          filter: {
            Slug: slug,
            DisplayName: `${name} Filter`,
            From: fields.filter.From,
            Where: fields.filter.Where ?? undefined,
            WhereData: fields.filter.WhereData ?? undefined,
            ResourceType: fields.filter.ResourceType ?? undefined,
          },
        }).unwrap(),
      );
      const filterId = required(filter.FilterID, 'new filter’s id');
      const annotations = Object.fromEntries(
        Object.entries(fields.annotations).filter((e): e is [string, string] => e[1] !== null),
      );
      let view: ViewRead;
      try {
        view = await withFreeSlug(base, taken, (slug) =>
          createView({
            spaceId,
            view: {
              Slug: slug,
              DisplayName: name,
              FilterID: filterId,
              Of: fields.view.Of,
              Columns: fields.view.Columns ?? undefined,
              GroupBy: fields.view.GroupBy ?? undefined,
              OrderBy: fields.view.OrderBy ?? undefined,
              OrderByDirection: fields.view.OrderByDirection ?? undefined,
              Annotations: Object.keys(annotations).length ? annotations : undefined,
            },
          }).unwrap(),
        );
      } catch (err) {
        // Do not leave a Filter nothing uses.
        await deleteFilter({ spaceId, filterId }).unwrap().catch(() => undefined);
        throw err;
      }
      const viewId = required(view.ViewID, 'new view’s id');
      const fresh = await readBack(spaceId, viewId).catch(() => null);
      return {
        viewId,
        filterId,
        spaceId,
        updatedAt: fresh?.View?.UpdatedAt ?? view.UpdatedAt ?? '',
        filterUpdatedAt: fresh?.Filter?.UpdatedAt ?? filter.UpdatedAt,
      };
    },
    [ensureSystemSpace, takenSlugs, createFilter, createView, deleteFilter, readBack],
  );

  /** A new Filter for a View, in the View's Space, with a free slug. */
  const newFilterFor = useCallback(
    async (target: SaveTarget, filter: { From: string; Where: string | null; WhereData: string | null; ResourceType: string | null }) => {
      const base = `${target.slug || slugFromDisplayName(target.name) || 'view'}-filter`;
      const taken = await takenSlugs(target.spaceId, base);
      const created = await withFreeSlug(base, taken, (slug) =>
        createFilter({
          spaceId: target.spaceId,
          filter: {
            Slug: slug,
            DisplayName: `${target.name} Filter`,
            From: filter.From,
            Where: filter.Where ?? undefined,
            WhereData: filter.WhereData ?? undefined,
            ResourceType: filter.ResourceType ?? undefined,
          },
        }).unwrap(),
      );
      return required(created.FilterID, 'new filter’s id');
    },
    [takenSlugs, createFilter],
  );

  /**
   * Write a saved View's changes over it, in the Space it lives in.
   *
   * Refused with ViewChangedError when the View on the server is not the one
   * this page last read or wrote, unless `overwrite`. A Filter another View
   * also uses (views made before each had its own) is not changed: this View
   * gets a new Filter of its own instead.
   */
  const saveExisting = useCallback(
    async (target: SaveTarget, def: ViewDef, options: SaveOptions = {}): Promise<SaveResult> => {
      const fields = viewDefToSave(def, target.columns);
      if (!fields.ok) throw new Error(fields.error);
      const current = await readBack(target.spaceId, target.viewId);
      const currentFilter = current.Filter?.FilterID && current.Filter.FilterID === target.filterId ? current.Filter : undefined;
      if (!options.overwrite) {
        if (!sameInstant(current.View?.UpdatedAt, target.updatedAt)) throw new ViewChangedError();
        // The Filter holds the view's conditions: a change to it alone is a change to the view.
        if (currentFilter && target.filterUpdatedAt && !sameInstant(currentFilter.UpdatedAt, target.filterUpdatedAt)) throw new ViewChangedError();
      }
      let filterId = target.filterId;
      if (filterId) {
        const users = await listViews({ where: `FilterID = '${filterId}'` }).unwrap();
        if (users.some((u) => u.View?.ViewID && u.View.ViewID !== target.viewId)) filterId = undefined;
      }
      const filterSpaceId = target.filterSpaceId ?? target.spaceId;
      // What the Filter said before, to put back if the View cannot be written after it.
      let before: FilterRead | undefined;
      let created = false;
      let writtenFilterAt: string | undefined;
      let writtenViewAt = '';
      if (filterId) {
        before = currentFilter ?? (await getFilter({ spaceId: filterSpaceId, filterId }, false).unwrap()).Filter;
        writtenFilterAt = (
          await patchFilter({
          spaceId: filterSpaceId,
          filterId,
          body: { From: fields.filter.From, Where: fields.filter.Where, WhereData: fields.filter.WhereData, ResourceType: fields.filter.ResourceType },
        }).unwrap()
        ).UpdatedAt;
      } else {
        filterId = await newFilterFor(target, fields.filter);
        created = true;
      }
      try {
        const written = await patchView({
          spaceId: target.spaceId,
          viewId: target.viewId,
          body: {
            FilterID: filterId,
            Of: fields.view.Of,
            Columns: fields.view.Columns,
            GroupBy: fields.view.GroupBy,
            OrderBy: fields.view.OrderBy,
            OrderByDirection: fields.view.OrderByDirection,
            Annotations: fields.annotations,
          },
        }).unwrap();
        writtenViewAt = written.UpdatedAt ?? '';
      } catch (err) {
        const reason = saveErrorMessage(err, 'The view could not be saved.');
        let restored = true;
        let putBackAt: string | undefined;
        try {
          if (created) {
            await deleteFilter({ spaceId: target.spaceId, filterId }).unwrap();
          } else if (before) {
            const back = await patchFilter({
              spaceId: filterSpaceId,
              filterId,
              body: { From: before.From, Where: before.Where ?? '', WhereData: before.WhereData ?? '', ResourceType: before.ResourceType ?? '' },
            }).unwrap();
            // Putting the Filter back is a write too: its new version is the one the next Save compares with.
            const reread = await getFilter({ spaceId: filterSpaceId, filterId }, false)
              .unwrap()
              .catch(() => null);
            putBackAt = reread?.Filter?.UpdatedAt ?? back.UpdatedAt;
          } else {
            restored = false;
          }
        } catch {
          restored = false;
        }
        if (!restored) {
          throw new SaveFailedError(`${reason} Its conditions were saved but the rest was not, and could not be put back. Save again, or Discard.`);
        }
        throw new SaveFailedError(`${reason} Nothing was changed.`, putBackAt);
      }
      // The save happened: a failed read-back only means the write's own times are kept.
      const fresh = await readBack(target.spaceId, target.viewId).catch(() => null);
      return {
        viewId: target.viewId,
        filterId,
        spaceId: target.spaceId,
        updatedAt: fresh?.View?.UpdatedAt ?? writtenViewAt,
        filterUpdatedAt: fresh ? fresh.Filter?.UpdatedAt : writtenFilterAt,
      };
    },
    [readBack, getFilter, listViews, patchFilter, patchView, newFilterFor, deleteFilter],
  );

  /**
   * Rename a View. A name is not part of what the view shows, so a rename never
   * asks about other people's changes. But it moves the versions forward only
   * when nobody else changed the view first: otherwise the next Save must
   * still ask.
   */
  const rename = useCallback(
    async (saved: SaveTarget, name: string): Promise<RenameResult> => {
      const before = await readBack(saved.spaceId, saved.viewId);
      const seen =
        sameInstant(before.View?.UpdatedAt, saved.updatedAt) &&
        (!saved.filterUpdatedAt || !before.Filter || sameInstant(before.Filter.UpdatedAt, saved.filterUpdatedAt));
      const written = await patchView({ spaceId: saved.spaceId, viewId: saved.viewId, body: { DisplayName: name } }).unwrap();
      if (!seen) return null;
      const fresh = await readBack(saved.spaceId, saved.viewId).catch(() => null);
      if (fresh?.View?.UpdatedAt) return { updatedAt: fresh.View.UpdatedAt, filterUpdatedAt: fresh.Filter?.UpdatedAt };
      // A rename does not touch the Filter: its version is unchanged.
      return written.UpdatedAt ? { updatedAt: written.UpdatedAt, filterUpdatedAt: saved.filterUpdatedAt } : null;
    },
    [readBack, patchView],
  );

  /**
   * Delete the View, then its Filter unless another View still uses it. Once
   * the View is gone the delete has happened: a Filter that could not be
   * removed is reported, not thrown.
   */
  const remove = useCallback(
    async (saved: SaveTarget): Promise<RemoveResult> => {
      await deleteView({ spaceId: saved.spaceId, viewId: saved.viewId }).unwrap();
      if (!saved.filterId) return { filterLeft: false };
      try {
        const users = await listViews({ where: `FilterID = '${saved.filterId}'` }).unwrap();
        if (users.length > 0) return { filterLeft: false };
        await deleteFilter({ spaceId: saved.filterSpaceId ?? saved.spaceId, filterId: saved.filterId }).unwrap();
        return { filterLeft: false };
      } catch {
        return { filterLeft: true };
      }
    },
    [deleteView, deleteFilter, listViews],
  );

  return { createNew, saveExisting, rename, remove } as const;
}
