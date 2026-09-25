// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The thin, rollout-owned row above each unit's `ComponentValuesSection` (D1
 * (b), U3): slug, resource kind, and the row-level marker that replaced the
 * deleted tense header (D7, ruling 5) — never a fabricated revision label.
 *
 * NOT a revision label. `ComponentSidePane`'s own unit header prints
 * `r{upstreamRevisionNum}->r{upstreamHeadRevisionNum}`, but a ChangeOrder-driven
 * synthetic `UpgradeEntry` has no real upstream Link revision pair — the
 * adapter (`rolloutMergedUnits.ts`) fills those two fields with a sentinel
 * zero precisely so nothing reads them. This header prints NOTHING in that
 * slot rather than a made-up `r0->r0` (§10.2).
 *
 * Reuses the shared per-unit chrome (`UnitRow`, `UnitHeaderRow`, `UnitSlug`,
 * `ChevronIcon`, `TagBadge`) from `diffStyles.ts` — the same primitives
 * `ComponentSidePane` mounts its own unit rows with — so R2 ("same per-unit
 * section chrome") holds without duplicating the styling. Not collapsible
 * here (rollout has no per-unit expand state), so the row's own click-affordance
 * styling is neutralised.
 */

import DataObjectIcon from '@mui/icons-material/DataObject';
import Box from '@mui/material/Box';

import { UnitHeaderRow, UnitSlug, TagBadge, TagBadgeLink } from '../diffStyles';
import { componentTheme } from '../componentTheme';
import { rolloutCopy } from './rolloutCopy';

export interface RolloutUnitHeaderProps {
  unitId: string;
  spaceId: string;
  slug: string;
  resourceKind?: string;
  /**
   * Display name of the unit's own Space. A stage can hold several Spaces
   * (D2), so the slug alone is ambiguous — two units sharing a slug in
   * different Spaces of the same stage must not read as one row, especially
   * under a mid-sequence promote failure (§9.3) where their `written` state
   * genuinely differs.
   */
  spaceName: string;
  /** This row is a record of what a promotion already wrote (ruling 5). */
  written: boolean;
  /** This row's incoming change could not be established this round (rule 16's first-fetch-failure gap). */
  undetermined: boolean;
  /**
   * This resource is not touched by the ChangeOrder at all — determinable, and
   * determined to be zero. Restored after the pane rebuild dropped it
   * (predecessor's `RolloutChangeTree.tsx` comment: *"An untouched resource is
   * shown, not dropped. Otherwise the reader cannot tell 'nothing changes here'
   * from 'this was not considered'."*). Only meaningful in the "All" view —
   * "Incoming" filters an untouched resource out entirely, so the caller should
   * pass `false` there rather than this ever needing to suppress itself.
   */
  unchanged: boolean;
  /**
   * "differs in eu-west", or "differs from staging-us-east" when drilled into
   * one variant. Told at the exact row where the pane's canonical claim stops
   * being universal, rather than only in the matrix above — a reader scrolling
   * the tree has the matrix off screen by then.
   *
   * Absent when this resource takes the same change everywhere, and absent for
   * a stage whose matrix has not been derived: no marker, never a "same
   * everywhere" claim we cannot back up.
   */
  differsNote?: string;
  /**
   * Where the Space badge links, or `undefined` for no link at all.
   *
   * NOT built here — the destination needs the app name and Space id this
   * header does not have and should not have to re-derive. The caller already
   * has both (it is the one placing this row inside a specific stage), so it
   * builds the URL and this component only renders whichever answer it was
   * handed — `undefined` included, honestly, rather than falling back to some
   * other page this header would have to invent a reason to prefer.
   */
  spaceHref?: string;
}

export function RolloutUnitHeader({
  unitId,
  spaceId,
  slug,
  resourceKind,
  spaceName,
  written,
  undetermined,
  unchanged,
  differsNote,
  spaceHref,
}: RolloutUnitHeaderProps) {
  return (
    <UnitHeaderRow sx={{ cursor: 'default' }} data-testid={`rollout-unit-${unitId}`}>
      <DataObjectIcon sx={{ fontSize: 15, color: componentTheme.fgMuted, flexShrink: 0 }} />
      <UnitSlug
        href={`/units/${spaceId}/${unitId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {slug}
      </UnitSlug>
      {/*
        A link, not just a label, when the caller could build one — the same
        reasoning as the slug above: this row is the reader's one chance to
        jump to the variant it names, on the same interactive graph the
        "Component" fact and the "could not be established" chips already
        open, without hunting for it elsewhere.
      */}
      {spaceHref !== undefined ? (
        <TagBadgeLink
          href={spaceHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          data-testid={`rollout-unit-space-${unitId}`}
        >
          {spaceName}
        </TagBadgeLink>
      ) : (
        <TagBadge data-testid={`rollout-unit-space-${unitId}`}>{spaceName}</TagBadge>
      )}
      {resourceKind !== undefined && <TagBadge>{resourceKind}</TagBadge>}
      <Box sx={{ display: 'flex', gap: '8px', alignItems: 'center', ml: 'auto' }}>
        {differsNote !== undefined && (
          <TagBadge
            data-testid={`rollout-unit-differs-${unitId}`}
            sx={{
              color: componentTheme.accent,
              background: 'rgba(186,61,3,0.11)',
              borderColor: 'transparent',
            }}
          >
            {differsNote}
          </TagBadge>
        )}
        {undetermined && (
          <TagBadge
            data-testid={`rollout-unit-undetermined-${unitId}`}
            sx={{ color: componentTheme.attention, background: componentTheme.attentionMuted, borderColor: 'transparent' }}
          >
            {rolloutCopy.undeterminedMarker}
          </TagBadge>
        )}
        {!undetermined && written && (
          <TagBadge data-testid={`rollout-unit-written-${unitId}`}>
            {rolloutCopy.writtenMarker}
          </TagBadge>
        )}
        {!undetermined && !written && unchanged && (
          <TagBadge data-testid={`rollout-unit-unchanged-${unitId}`}>
            {rolloutCopy.unchangedMarker}
          </TagBadge>
        )}
      </Box>
    </UnitHeaderRow>
  );
}
