// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the change panel, the change button and the Save caption read of your change: the
 * ChangeSet with its Units, Revisions and diff (`useChangeSetDetail`, as the ChangeSet page
 * reads them), and the last save made into it in this tab. The gates are not read here: Finish
 * reads them when it is pressed (D10).
 */
import { useEffect, useState } from 'react';
import { useChangeSetDetail, type ChangeSetDetail } from '@/pages/change-sets/useChangeSetDetail';
import { useListAllChangeSetsQuery } from '@confighub/rtk-query';
import { setActiveChange, useActiveChangeRef, type ActiveChangeRef } from './activeChange';

/** How often the change is re-read by ID, so a rename or delete elsewhere is noticed. */
const FOLLOW_POLL_MS = 15_000;
import {
  CHANGE_SAVED_EVENT,
  CHANGE_SAVE_REFUSED_EVENT,
  setSeamActiveChangeSetId,
  type ChangeSaveRefusedDetail,
  type ChangeSavedDetail,
} from './changeWriteSeam';

export interface ActiveChange {
  ref: ActiveChangeRef | null;
  /** The pending change's name (D34): started on a page with no Space, made by the first save. */
  pending: string | null;
  setActive: (ref: ActiveChangeRef | null) => void;
  detail: ChangeSetDetail;
  /** The last save made in this tab, in this change. */
  lastSave?: ChangeSavedDetail;
  /** The last save the server refused while it named this change. */
  refused?: ChangeSaveRefusedDetail;
  /** The change was renamed or moved elsewhere; the new name is being taken over. */
  following: boolean;
  /** No ChangeSet has the active change's ID any more: it was deleted. */
  gone: boolean;
  idPending: boolean;
}

export function useActiveChangeSource(): ActiveChange {
  const { active: ref, pending, setActive } = useActiveChangeRef();
  // The change is named by its ID: read it by ID across Spaces, so a rename or move elsewhere
  // is followed rather than lost (a stale name would send saves with an old ID).
  const byId = useListAllChangeSetsQuery(
    { where: `ChangeSetID = '${ref?.id ?? ''}'` },
    { skip: !ref?.id, pollingInterval: FOLLOW_POLL_MS, skipPollingIfUnfocused: true, refetchOnFocus: true },
  );
  const current = byId.data?.[0]?.ChangeSet;
  const currentSpace = current?.SpaceSlug ?? byId.data?.[0]?.Space?.Slug;
  useEffect(() => {
    if (!ref?.id || !current?.Slug || !currentSpace) return;
    if (current.Slug !== ref.slug || currentSpace !== ref.space) setActiveChange({ space: currentSpace, slug: current.Slug, id: ref.id });
  }, [ref?.id, ref?.slug, ref?.space, current?.Slug, currentSpace]);
  const detail = useChangeSetDetail({ space: ref?.space, slug: ref?.slug });
  // A change set by name gains its ID once read.
  const readId = detail.changeSet?.ChangeSetID;
  const readSlug = detail.changeSet?.Slug;
  useEffect(() => {
    if (ref && !ref.id && readId && readSlug === ref.slug) setActiveChange({ ...ref, id: readId });
  }, [ref, readId, readSlug]);
  // Not found by name while the ID still answers: the rename is being followed, not a loss.
  const following = ref?.id !== undefined && current !== undefined && (current.Slug !== ref.slug || currentSpace !== ref.space);
  const gone = ref?.id !== undefined && byId.isSuccess && current === undefined;
  // The read by ID has not answered yet.
  const idPending = ref?.id !== undefined && !byId.isSuccess && !byId.isError;
  const changeSet = detail.changeSet;
  const open = changeSet?.State === 'Open' || changeSet?.State === 'New';
  // Saves name the change only while it is open and still there by its ID: never a stale ID.
  const id = open && !gone ? changeSet?.ChangeSetID : undefined;
  useEffect(() => {
    setSeamActiveChangeSetId(id);
  }, [id]);

  const [lastSave, setLastSave] = useState<ChangeSavedDetail>();
  const [refused, setRefused] = useState<ChangeSaveRefusedDetail>();
  const refetch = detail.refetch;
  useEffect(() => {
    const onSaved = (event: Event) => {
      const saved = (event as CustomEvent<ChangeSavedDetail>).detail;
      if (saved.changeSetId === undefined || saved.changeSetId !== id) return;
      setLastSave(saved);
      setRefused(undefined);
      refetch();
    };
    const onRefused = (event: Event) => setRefused((event as CustomEvent<ChangeSaveRefusedDetail>).detail);
    window.addEventListener(CHANGE_SAVED_EVENT, onSaved);
    window.addEventListener(CHANGE_SAVE_REFUSED_EVENT, onRefused);
    return () => {
      window.removeEventListener(CHANGE_SAVED_EVENT, onSaved);
      window.removeEventListener(CHANGE_SAVE_REFUSED_EVENT, onRefused);
    };
  }, [id, refetch]);

  return { ref, pending, setActive, detail, lastSave, refused, following, gone, idPending };
}
