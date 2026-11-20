// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Start a change in one click (D4): a ChangeSet auto-named `<user>-<mon>-<day>-<n>`, in the
 * base Space of the page's Component, or in the page's Space when it has no Component. It
 * takes the ChangeWorkflow the Component requires, and none when it requires none.
 */
import { useState } from 'react';
import {
  useCreateChangeSetMutation,
  useGetComponentQuery,
  useGetSpaceQuery,
  useListAllChangeSetsQuery,
} from '@confighub/rtk-query';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useDraftBases } from '@/pages/change-orders/draft/useDraftBases';
import { setActiveChange, setPendingChange } from './activeChange';
import { usePageSpace } from './usePageSpace';
import { useJoinUnits } from './useSelection';
import { useAppSelector } from '@/hooks/useApp';
import { selectSelectedUnits } from '@/state/slices/selectedUnits';

/** The auto-name of a new change: `<user>-<mon>-<day>-<n>` (D2). */
export function autoChangeName(person: string, now: Date, taken: readonly string[]): string {
  const who =
    person
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'change';
  const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const stem = `${who}-${month}-${now.getDate()}`;
  let n = 1;
  while (taken.includes(`${stem}-${n}`)) n += 1;
  return `${stem}-${n}`.slice(0, 63);
}

export function useChangeStart() {
  const { spaceId } = usePageSpace();
  const { userInfo } = useUserInfo();
  const space = useGetSpaceQuery({ spaceId: spaceId ?? '' }, { skip: spaceId === undefined });
  const componentId = space.data?.Space?.ComponentID;
  const component = useGetComponentQuery({ componentId: componentId ?? '' }, { skip: !componentId });
  const { bases } = useDraftBases();
  const mine = useListAllChangeSetsQuery({ where: `UserID = '${userInfo?.UserID ?? ''}'` }, { skip: !userInfo?.UserID });
  const [create] = useCreateChangeSetMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const base = componentId ? bases.find((b) => b.componentId === componentId) : undefined;
  // D4: the base Space of the page's Component, else the page's Space. A page with no Space
  // (the Units list, the ChangeSets page): the first selected Unit's Space (H11); with no
  // selection either, the change is pending until its first save (D34).
  const selected = useAppSelector(selectSelectedUnits)?.find((u) => u.Unit?.SpaceID && u.Space?.Slug);
  const firstSelected = selected ? { id: selected.Unit?.SpaceID ?? '', slug: selected.Space?.Slug ?? '' } : undefined;
  const target = base
    ? { id: base.spaceId, slug: base.spaceSlug }
    : space.data?.Space
      ? { id: space.data.Space.SpaceID ?? '', slug: space.data.Space.Slug }
      : undefined;

  const joinUnits = useJoinUnits();

  /**
   * With `on`, the change opens on those Units at once (H11, H12), as `cub variant changeset
   * open` does: in `on.space` when given (the first selected Unit's Space), and the free Units
   * of `on.unitIds` join it.
   */
  /** True when the change was made and is now the active one. */
  const start = async (
    on?: { unitIds: string[]; space?: { id: string; slug: string } },
    options: { withoutSelection?: boolean } = {},
  ): Promise<boolean> => {
    const noPageSpace = spaceId === undefined;
    const where = on?.space ?? target ?? (noPageSpace && !options.withoutSelection ? firstSelected : undefined);
    const name = () =>
      autoChangeName(
        userInfo?.DisplayName || userInfo?.Username || 'change',
        new Date(),
        (mine.data ?? []).map((entry) => entry.ChangeSet?.Slug ?? ''),
      );
    if (where === undefined && noPageSpace) {
      setError(undefined);
      setPendingChange(name());
      return true;
    }
    if (where === undefined || where.id === '') {
      setError('The Space of this page could not be read, so the ChangeSet has nowhere to start.');
      return false;
    }
    setBusy(true);
    setError(undefined);
    const c = component.data?.Component;
    const workflowId = c?.RequireChangeWorkflow ? c.AllowedChangeWorkflowIDs?.[0] : undefined;
    const slug = name();
    try {
      const made = await create({ spaceId: where.id, changeSet: { Slug: slug, ...(workflowId ? { ChangeWorkflowID: workflowId } : {}) } }).unwrap();
      if (made.ChangeSetID && on && on.unitIds.length > 0) await joinUnits.join(on.unitIds, made.ChangeSetID);
      setActiveChange({ space: where.slug, slug: made.Slug ?? slug });
      return true;
    } catch (failure) {
      setError(getApiErrorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { start, busy: busy || joinUnits.busy, error: error ?? joinUnits.error, componentSlug: component.data?.Component?.Slug, baseSlug: target?.slug,
    /** Where Start puts the change, for "It will live in" (D2): a Space and why, or the pending wording. */
    livesIn: target
      ? { space: target.slug, why: base ? `the base of ${component.data?.Component?.Slug ?? base.componentSlug}` : 'the Space of this page' }
      : spaceId === undefined && firstSelected
        ? { space: firstSelected.slug, why: 'the Space of the first selected Unit' }
        : undefined,
  };
}
