// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * An Invoke draft's change, in the summary card's full-width row: the hero, then the full diff
 * "At the source".
 *
 * The hero is the detail view's, read-only, fed by the dry run: the image changes the call makes
 * (From image tag → To image tag, the bump, how many variants it reaches), which for most functions
 * other than the image function is the quiet "No image change." band. The image function's tag is
 * typed in its row above; until the call is whole there is no hero, since nothing has run.
 *
 * "At the source" is the detail view's for an Invoke ChangeOrder: the variants grouped by the
 * change they take, each group shown once by its representative, captioned "In dev, staging-eu, …".
 */

import { memo, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';

import { TreeDiffSection } from '../../x/apps/TreeDiffSection';
import { changeOrderInk, changeOrderShape, changeOrderType } from '../changeOrdersTokens';
import { onlyChangesHint } from '../imageChangeCopy';
import { IMAGE_CHANGES_NONE, type ImageChanges, imageChangesForSource } from '../imageChange';
import { FullDiffDisclosure, ImageChangeSummary } from '../components/ImageChangeHero';
import { UnitDiffRow } from '../components/UnitDiffRow';
import { useSharedDiffColumns } from '../useSharedDiffColumns';
import { CouldNotEstablish } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import type { DraftInvoke } from './draftInvoke';
import type { DraftInvokeSourceGroup } from './draftInvokePreview';
import type { DraftInvokePreview } from './useDraftInvokePreview';

const copy = draftCopy.invoke;

/** The image changes of the dry run's diffs: a change the page holds, not a Revision's. */
const imageChangesOfDiffs = (diffs: DraftInvokePreview['sourceDiffs']) =>
  imageChangesForSource(
    'resolved',
    diffs.flatMap((diff) => (diff.UnitID === undefined ? [] : [{ unitId: diff.UnitID, diff: diff.Diff }])),
  );

const H3_SX = {
  fontSize: changeOrderType.size.prose,
  lineHeight: changeOrderType.lineHeight.heading,
  fontWeight: changeOrderType.weight.semibold,
  margin: '0 0 8px',
} as const;

interface SourceGroupProps {
  group: DraftInvokeSourceGroup;
  preview: DraftInvokePreview;
  /** Every variant on the path takes this change: its diff is each variant's, not its representative's alone. */
  everyVariant: boolean;
  columns: ReturnType<typeof useSharedDiffColumns>;
}

/** One "At the source" diff: the variants it stands for, and their representative's resources. */
function SourceGroup({ group, preview, everyVariant, columns }: SourceGroupProps) {
  const spaceName = everyVariant ? copy.eachVariant : (preview.nameBySpaceId.get(group.representativeSpaceId) ?? '');
  return (
    <Box data-testid="draft-source-group" sx={{ marginBottom: '10px' }}>
      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '4px' }}>{copy.groupCaption(group.names)}</Box>
      {group.groups.length === 0 ? <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px 10px' }}>{copy.noFieldsDiffer}</Box> : null}
      {group.groups.map((unit) => (
        <UnitDiffRow
          key={unit.unitId}
          unitId={unit.unitId}
          spaceId={group.representativeSpaceId}
          slug={unit.resourceName}
          resourceKind={unit.resourceKind}
          spaceName={spaceName}
          changed
          diff={unit.diff}
          columns={columns.columns}
          fallback={
            <TreeDiffSection
              entry={{ unitId: unit.unitId, fieldDiffs: unit.fieldDiffs }}
              allPaths={unit.allPaths}
              keyPrefix="draft-invoke-source"
              label=""
              hideLabel
              variant="data"
              columnStyle={columns.columnStyle}
              onDividerMouseDown={columns.onDividerMouseDown}
              isDragging={columns.isDragging}
            />
          }
        />
      ))}
    </Box>
  );
}

export interface DraftInvokeSectionsProps {
  invoke: DraftInvoke | undefined;
  preview: DraftInvokePreview;
  stageNames: readonly string[];
  /** The summary card's horizontal padding, which the hero's band bleeds over. */
  bleed?: number;
}

export interface ValueHeroProps {
  preview: DraftInvokePreview;
  images: ImageChanges;
  stageNames: readonly string[];
  bleed: number;
  /** Say under each bump how many variants the change reaches. */
  countVariants?: boolean;
}

/**
 * Invoke's hero: the image changes the call makes. While the dry run runs, its shape;
 * when it failed or was refused, "Could not establish", never "No image change".
 */
export function ValueHero({ preview, images, stageNames, bleed, countVariants = false }: ValueHeroProps) {
  if (preview.status === 'loading') return <Skeleton variant="rounded" height={46} sx={{ marginTop: '10px', borderRadius: `${changeOrderShape.radius.xl}px` }} />;
  if (preview.status === 'failed') return null;
  if (preview.refusal !== undefined)
    return (
      <Box sx={{ marginTop: '10px' }}>
        <CouldNotEstablish framed subject={copy.imageChange} />
      </Box>
    );
  return (
    <Box sx={images.status === 'some' ? { marginX: `-${bleed}px` } : { marginTop: '-4px' }}>
      <ImageChangeSummary
        changes={images}
        stageNames={stageNames}
        meta="bump"
        inset={images.status === 'some' ? bleed : undefined}
        variantCount={countVariants && preview.settled ? preview.diffsBySpaceId.size : undefined}
      />
    </Box>
  );
}

/** The Invoke draft's hero and "At the source". */
export const DraftInvokeSections = memo(function DraftInvokeSections({ invoke, preview, stageNames, bleed = 20 }: DraftInvokeSectionsProps) {
  const columns = useSharedDiffColumns();
  const images = useMemo(() => {
    if (preview.status !== 'resolved' || preview.sourceDiffs.length === 0) return IMAGE_CHANGES_NONE;
    return imageChangesOfDiffs(preview.sourceDiffs);
  }, [preview.status, preview.sourceDiffs]);
  const counts = useMemo(() => {
    // A change several groups show (the same label in every variant) is one change.
    const changes = new Set<string>();
    const resources = new Set<string>();
    for (const group of preview.sourceGroups)
      for (const unit of group.groups) {
        resources.add(unit.resourceIdentity ?? unit.resourceName);
        for (const field of unit.fieldDiffs) changes.add(`${unit.resourceIdentity ?? unit.resourceName}|${field.path}|${field.newValue}`);
      }
    return { changes: changes.size, resources: resources.size };
  }, [preview.sourceGroups]);
  const imagesOnly = invoke?.mode === 'image' || (images.status === 'some' && images.fieldChanges.count === 0);
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const open = override ?? !imagesOnly;
  if (invoke === undefined) return null;
  const variantsTotal = preview.totals?.variants;

  return (
    <Box data-testid="draft-invoke-sections">
      {/* Nothing has run before the call is whole: no hero, rather than "No image change". */}
      {invoke.previewRequest === undefined ? null : <ValueHero preview={preview} images={images} stageNames={stageNames} bleed={bleed} countVariants={invoke.mode === 'image'} />}
      {preview.status === 'failed' ? (
        <CouldNotEstablish framed subject={draftCopy.path.atTheSource} onRetry={preview.retry} retryWhat={draftCopy.page.retryWhat.dryRun} />
      ) : null}
      {preview.status === 'resolved' && counts.changes > 0 ? (
        <FullDiffDisclosure
          changeCount={counts.changes}
          unitCount={counts.resources}
          imagesOnly={imagesOnly}
          hintText={images.status === 'some' ? onlyChangesHint(images.images) : undefined}
          expanded={open}
          onToggle={() => setOverride(!open)}
          idPrefix="draft"
          renderBody={() => (
            <Box component="section" role="region" aria-label={draftCopy.path.atTheSource} sx={{ marginTop: '14px' }}>
              <Box component="h3" sx={H3_SX}>
                {draftCopy.path.atTheSource}
              </Box>
              {preview.sourceGroups.map((group) => (
                <SourceGroup
                  key={group.representativeSpaceId}
                  group={group}
                  preview={preview}
                  everyVariant={variantsTotal !== undefined && group.spaceIds.length === variantsTotal}
                  columns={columns}
                />
              ))}
            </Box>
          )}
        />
      ) : null}
    </Box>
  );
});
