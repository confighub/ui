// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The validation of a ChangeOrder's change in some Spaces: the ValidationErrors of
 * each Revision a Release of it would bundle there (`bundledRevisions`). Read for a
 * gate that needs them, `Validated` or `Released`, over the Spaces it is evaluated
 * on, so the page says which Units hold it rather than only that something does.
 *
 * The Revisions are read by the ChangeOrder's Tags alone, with their Unit and Space
 * (`include`), and narrowed to the Spaces here. So every stage asks the same question,
 * which is read once, no `SpaceID IN (...)` grows past the server's query limit, and no
 * name has to be looked up afterwards.
 *
 * Read again when a Revision is written (`live`): a fix in the Gates tab, or a
 * Trigger re-run that clears a gate, changes it without the ChangeOrder changing.
 */
import { useMemo } from 'react';

import { taggedRevisionWheres } from '../x/apps/change-order/taggedRevisionReads';
import { useGetTaggedRevisionsQuery } from '../x/apps/change-order/taggedRevisionsApi';
import {
  type MarkedRevision,
  type ReleaseValidation,
  bundledRevisions,
  gatesOf,
  validationOf,
} from './releaseValidation';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export function useReleaseValidation({
  releaseTagId,
  endTagId,
  spaceIds,
  enabled,
}: {
  releaseTagId: string | undefined;
  endTagId: string | undefined;
  spaceIds: readonly string[];
  enabled: boolean;
}): ReleaseValidation | undefined {
  // A ChangeOrder created before ChangeOrders had release Tags has none: its end Tag says what is released.
  const releaseTag =
    releaseTagId === undefined || releaseTagId === '' || releaseTagId === NIL_UUID
      ? undefined
      : releaseTagId;
  const wheres = useMemo(
    () => (enabled ? taggedRevisionWheres(releaseTag ?? endTagId, endTagId) : undefined),
    [enabled, releaseTag, endTagId],
  );
  const marked = useGetTaggedRevisionsQuery(
    {
      wheres: wheres ?? [],
      select:
        'RevisionID,UnitID,SpaceID,RevisionNum,Tags,ValidationErrors,ValidationTriggerIDs',
      include: 'UnitID,SpaceID',
      live: true,
    },
    { skip: wheres === undefined },
  );

  const rows = useMemo((): MarkedRevision[] | undefined => {
    if (marked.currentData === undefined) return undefined;
    return marked.currentData.flatMap((entry) => {
      const revision = entry.Revision;
      if (revision?.UnitID === undefined) return [];
      return [
        {
          unitId: revision.UnitID,
          slug: entry.Unit?.Slug ?? '',
          spaceId: revision.SpaceID ?? '',
          spaceSlug: entry.Space?.Slug ?? '',
          revisionNum: revision.RevisionNum ?? 0,
          tags: Object.keys(revision.Tags ?? {}),
          gates: gatesOf(revision.ValidationErrors),
          triggerIdByGate: revision.ValidationTriggerIDs ?? {},
        },
      ];
    });
  }, [marked.currentData]);

  const spaceKey = [...spaceIds].sort().join(',');
  return useMemo((): ReleaseValidation | undefined => {
    if (wheres === undefined || spaceKey === '') return undefined;
    if (marked.isError) return { status: 'failed' };
    if (rows === undefined) return { status: 'loading' };
    const inSpaces = new Set(spaceKey.split(','));
    return validationOf(
      bundledRevisions(
        rows.filter((row) => inSpaces.has(row.spaceId)),
        releaseTag,
        endTagId,
      ),
    );
  }, [wheres, spaceKey, marked.isError, rows, releaseTag, endTagId]);
}
