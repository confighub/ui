// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A Transform paths draft's change, in the summary card's full-width row: the hero, from what the
 * variants' Links would write (the image changes among them, else the quiet band), then the full
 * diff "At the source", as the detail view draws a fan-out ChangeOrder's: each shared source from
 * where the variants are to the end, narrowed to the paths its Links read.
 */

import { memo, useMemo, useState } from 'react';

import Box from '@mui/material/Box';

import { linkedSourcePaths } from '../../x/apps/change-order/linkedSourcePaths';
import { changeOrderCopy } from '../../x/apps/change-order/changeOrderCopy';
import { changeOrderInk, changeOrderType } from '../changeOrdersTokens';
import { FullDiffDisclosure } from '../components/ImageChangeHero';
import { UnitDiffRow } from '../components/UnitDiffRow';
import { IMAGE_CHANGES_NONE, imageChangesForSource, narrowUnitDiffsToPaths } from '../imageChange';
import { onlyChangesHint } from '../imageChangeCopy';
import { useSharedDiffColumns } from '../useSharedDiffColumns';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import type { DraftFanOut } from './draftFanOut';
import { type DraftFanOutDiffItem, useGetDraftFanOutSourceDiffsQuery } from './draftFanOutApi';
import { ValueHero } from './DraftInvokeSections';
import type { DraftInvokePreview } from './useDraftInvokePreview';

const H3_SX = {
  fontSize: changeOrderType.size.prose,
  lineHeight: changeOrderType.lineHeight.heading,
  fontWeight: changeOrderType.weight.semibold,
  margin: '0 0 8px',
} as const;

/** Count the changed fields of a server diff, and the resources they are in. */
function countsOf(diffs: readonly { Diff?: { Resources?: { Changes?: { ChangeType?: string }[] | null }[] | null } }[]) {
  let changes = 0;
  let resources = 0;
  for (const unitDiff of diffs)
    for (const resource of unitDiff.Diff?.Resources ?? []) {
      const changed = (resource.Changes ?? []).filter((change) => change.ChangeType !== 'None').length;
      changes += changed;
      if (changed > 0) resources += 1;
    }
  return { changes, resources };
}

export interface DraftFanOutSectionsProps {
  fanOut: DraftFanOut | undefined;
  preview: DraftInvokePreview;
  stageNames: readonly string[];
  /** The summary card's horizontal padding, which the hero's band bleeds over. */
  bleed?: number;
}

/** The Transform paths draft's hero and "At the source". */
export const DraftFanOutSections = memo(function DraftFanOutSections({ fanOut, preview, stageNames, bleed = 20 }: DraftFanOutSectionsProps) {
  const columns = useSharedDiffColumns();
  const images = useMemo(() => {
    if (preview.status !== 'resolved' || preview.sourceDiffs.length === 0) return IMAGE_CHANGES_NONE;
    return imageChangesForSource(
      'resolved',
      preview.sourceDiffs.flatMap((diff) => (diff.UnitID === undefined ? [] : [{ unitId: diff.UnitID, diff: diff.Diff }])),
    );
  }, [preview.status, preview.sourceDiffs]);

  // Each source carrying something, from the oldest Revision a variant took to the end.
  const items = useMemo(
    (): DraftFanOutDiffItem[] =>
      (fanOut?.sources ?? []).flatMap((source) =>
        source.skip !== undefined || source.end === undefined || source.end <= source.start
          ? []
          : [{ spaceId: source.unit.spaceId, unitId: source.unit.unitId, from: String(source.start), to: String(source.end) }],
      ),
    [fanOut],
  );
  const read = useGetDraftFanOutSourceDiffsQuery({ items }, { skip: items.length === 0 });
  const pathsByUnitId = useMemo(() => new Map((fanOut?.sources ?? []).map((source) => [source.unit.unitId, source.paths])), [fanOut]);
  const diffs = useMemo(() => (read.currentData === undefined ? undefined : narrowUnitDiffsToPaths(read.currentData, pathsByUnitId)), [read.currentData, pathsByUnitId]);
  const counts = useMemo(() => countsOf(diffs ?? []), [diffs]);
  const [open, setOpen] = useState(true);
  if (fanOut === undefined || fanOut.followed.length === 0) return null;
  const paths = linkedSourcePaths(fanOut.followed.map((link) => ({ UpstreamPaths: link.upstreamPaths, UpstreamGetters: link.upstreamGetters })));
  const bySource = new Map(fanOut.sources.map((source) => [source.unit.unitId, source]));

  return (
    <Box data-testid="draft-fan-out-sections">
      <ValueHero preview={preview} images={images} stageNames={stageNames} bleed={bleed} />
      {preview.status === 'failed' ? (
        <CouldNotEstablish framed subject={draftCopy.path.atTheSource} onRetry={preview.retry} retryWhat={draftCopy.page.retryWhat.dryRun} />
      ) : null}
      {read.isError ? <CouldNotEstablish framed subject={draftCopy.path.atTheSource} onRetry={() => void read.refetch()} retryWhat={draftCopy.path.atTheSource.toLowerCase()} /> : null}
      {diffs !== undefined && counts.changes > 0 ? (
        <FullDiffDisclosure
          changeCount={counts.changes}
          unitCount={counts.resources}
          imagesOnly={false}
          hintText={images.status === 'some' ? onlyChangesHint(images.images) : undefined}
          expanded={open}
          onToggle={() => setOpen(!open)}
          idPrefix="draft"
          renderBody={() => (
            <Box component="section" role="region" aria-label={draftCopy.path.atTheSource} sx={{ marginTop: '14px' }}>
              <Box component="h3" sx={H3_SX}>
                {draftCopy.path.atTheSource}
              </Box>
              {paths === undefined ? null : (
                <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '6px' }}>{changeOrderCopy.linkedPathsCaption(paths)}</Box>
              )}
              {diffs.map((unitDiff) => {
                const source = unitDiff.UnitID === undefined ? undefined : bySource.get(unitDiff.UnitID);
                if (source === undefined) return null;
                return (
                  <Box key={source.unit.unitId} data-testid="draft-source-group" sx={{ marginBottom: '10px' }}>
                    <UnitDiffRow
                      unitId={source.unit.unitId}
                      spaceId={source.unit.spaceId}
                      slug={source.unit.slug}
                      spaceName={source.unit.spaceSlug}
                      changed={countsOf([unitDiff]).changes > 0}
                      diff={unitDiff.Diff}
                      columns={columns.columns}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        />
      ) : null}
    </Box>
  );
});
