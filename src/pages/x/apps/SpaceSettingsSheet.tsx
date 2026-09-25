// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * SpaceSettingsSheet (design-mockups/variant-settings/BUILD-PLAN.md)
 *
 * The cog-triggered Space settings surface for the component right-hand pane.
 * Renders ABSOLUTELY POSITIONED over the pane's content area (see the wrapper
 * Box in `ComponentSidePane.tsx` that hosts both this sheet and `PaneContent`)
 * so the value treeview underneath — and its own staged edits, which live in
 * `ComponentValuesSection`, not here — stays mounted while this is open.
 *
 * === One model, no exceptions ===
 * Variant rename and user-authored Labels share ONE staged draft
 * (`draftLabels`, a full `Space.Labels` replacement — see `effectiveLabels`
 * below) because they are the same backend field; the release target stages
 * independently since it is a different field. All of it commits through a
 * single Save action, one `patchSpace` call. Delete
 * (`space-settings/DeleteRow.tsx`) is a danger action outside the staged
 * model by design — it has its own typed-confirmation gate and fires
 * immediately, never batched with anything else.
 *
 * === Release target ===
 * Spike 2 proved `WHERE TargetID = previousSpace.ReleaseTargetID` renders the
 * literal SQL `target_id = NULL` when the Space has no release target yet —
 * matches ZERO rows (three-valued SQL logic) in EITHER direction: setting
 * from unset touches no unit, INCLUDING units with no target of their own.
 * Changing or clearing an ALREADY-SET release target is the opposite: a
 * retroactive bulk repoint of every unit on the OLD target, no per-unit
 * validation, no per-item result. `space-settings/ReleaseTargetRow.tsx` is
 * one always-editable picker (OCI-filtered, with "None" standing in for
 * clear) that shows a single compact consequence line only when a staged
 * pick would actually move units — `releaseTargetAffectedUnitCount` below is
 * that line's only data dependency.
 *
 * === Unit targets — removed ===
 * An earlier version of this sheet also had a per-unit "Unit targets" row
 * (`bulkPatchUnits` fanned across every unit in the Space, with 207
 * partial-failure handling and a persistent failure strip). Cut from the
 * feature entirely in review ("Get rid of the units target section
 * completely.") — nothing in this sheet writes to more than one entity per
 * Save any more, so Save is a single `patchSpace` call and nothing here
 * needs to inspect a 207 response.
 *
 * === No footer of its own — removed in favor of the pane's ONE footer ===
 * This sheet used to render its own Save/Discard strip, stacked visually
 * below the pane's own BottomBar (Upgrade/Release/Discard) — two footers at
 * once. Cut in review ("Replace the upgrade footer with the save button. as
 * a footer. style them the same."): `ComponentSidePane.tsx`'s BottomBar now
 * shows this sheet's Save/Discard INSTEAD of the upgrade actions while the
 * sheet is open, using the exact same Button styling. This sheet exposes
 * `save`/`discardOrClose` via `ref` (see `SpaceSettingsSheetHandle`) and its
 * live footer state via `onFooterStateChange`, so the buttons living in the
 * pane still act on THIS sheet's own local drafts — never on the treeview's
 * staged edits, which are a completely separate state tree the pane's old
 * Discard already acted on and continues to. The two can never be confused
 * because only one Discard button ever exists in the DOM at a time (the
 * BottomBar renders one branch or the other, never both).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import {
  useGetSpaceQuery,
  useListAllUnitsQuery,
  usePatchSpaceMutation,
  type ExtendedTargetRead,
  type TargetRead,
} from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

import { LABEL_VARIANT } from './componentData';
import { componentTheme } from './componentTheme';
import { DeleteRow } from './space-settings/DeleteRow';
import { LabelsRow } from './space-settings/LabelsRow';
import { ReleaseTargetRow, type ReleaseTargetOption } from './space-settings/ReleaseTargetRow';
import { ShowMoreSection } from './space-settings/ShowMoreSection';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Whether a Target can be used as a Space's ReleaseTargetID. Mirrors
 * `Target.FindConfigType(ToolchainAny, ProviderOCI)` on the backend: match
 * either the Target's own top-level ProviderType or any entry in its
 * ConfigTypes list — a Target need not have OCI as its PRIMARY provider to be
 * a valid release target.
 */
const isOciCapable = (target: TargetRead): boolean =>
  target.ProviderType === 'OCI' || (target.ConfigTypes ?? []).some((ct) => ct.ProviderType === 'OCI');

/** Shallow string-map equality, order-independent — used to detect a dirty Labels/Annotations draft. */
const mapsEqual = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => a[k] === b[k]);
};

/**
 * Builds a `patchSpace` map body from `current` -> `next`. `patchSpace` sends
 * `application/merge-patch+json` (RFC 7396): a key simply absent from the
 * patch body means "leave it alone," not "delete it." A key present in
 * `current` but missing from `next` (the user deleted it in the UI) must
 * therefore be explicitly re-sent with a JSON `null` so the backend actually
 * drops it, instead of silently keeping the old value and having it
 * reappear on the next refetch.
 */
const toMergePatchMap = (current: Record<string, string>, next: Record<string, string>): Record<string, string | null> => {
  const patch: Record<string, string | null> = { ...next };
  for (const key of Object.keys(current)) {
    if (!(key in next)) patch[key] = null;
  }
  return patch;
};

// ============================================================================
// TYPES
// ============================================================================

/** This sheet's live footer state, reported up so `ComponentSidePane`'s BottomBar can render Save/Discard correctly without owning any of the staging logic itself. */
export interface SpaceSettingsFooterState {
  isDirty: boolean;
  dirtyCount: number;
  isSaving: boolean;
  saveError: string | null;
}

/** Imperative actions the pane's BottomBar buttons invoke — see the file header's "No footer of its own" note. */
export interface SpaceSettingsSheetHandle {
  save: () => void;
  /** Discards staged drafts if dirty (staying open); closes the sheet if not — the same two-click semantics the sheet's own footer used to have. */
  discardOrClose: () => void;
}

export interface SpaceSettingsSheetProps {
  spaceId: string;
  slug: string;
  unitCount: number;
  /** Org-wide targets (from `useListAllTargetsQuery`). Filtered to OCI-capable ones for the release-target picker. */
  targets: ExtendedTargetRead[];
  onClose: () => void;
  /** Fired after a successful delete — wired to the PANE's own close (clears selection, collapses the pane), not this sheet's local close. */
  onDeleted: () => void;
  /**
   * Reports this sheet's live `isDirty` up to `ComponentSidePane` (and, from
   * there, up to `AppComponentView`). Verification of commits 1-3 found that
   * the footer's two-click discard protection (Discard clears + stays open;
   * a second click actually closes) only covered the FOOTER — the cog
   * toggle and the node-switch reset effect both closed (i.e. unmounted)
   * this sheet unconditionally, silently discarding a staged draft, because
   * neither of those PARENT-owned close routes had any way to know this
   * sheet was dirty (`draftVariant`/`draftReleaseTargetId` etc. were purely
   * local state). This callback is the fix: it lets the parent apply the
   * same "don't silently discard" guarantee to every close route, not just
   * the footer.
   */
  onDirtyChange?: (isDirty: boolean) => void;
  /** Reports the richer footer state (dirty count, saving, error) the pane's BottomBar needs to render Save/Discard in place of this sheet's own removed footer. */
  onFooterStateChange?: (state: SpaceSettingsFooterState) => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const SpaceSettingsSheet = forwardRef<SpaceSettingsSheetHandle, SpaceSettingsSheetProps>(function SpaceSettingsSheet(
  { spaceId, slug, unitCount, targets, onClose, onDeleted, onDirtyChange, onFooterStateChange },
  ref,
) {
  // `include: 'ReleaseTargetID'` resolves `ReleaseTarget` (the Target itself,
  // not just its ID) in the response — needed so the locked, already-set row
  // can show the target's name instead of a bare UUID.
  const { data: spaceData, isFetching: isSpaceLoading } = useGetSpaceQuery({ spaceId, include: 'ReleaseTargetID' });
  // Only `TargetID` is needed now — the enumerated per-unit list (slug,
  // applied-state) that used to render alongside the removed unit-targets
  // row is gone; this query exists solely to COUNT units currently sitting
  // on the release target, for `ReleaseTargetRow`'s consequence line.
  const { data: unitsData } = useListAllUnitsQuery(
    { where: `SpaceID = '${spaceId}'`, select: 'UnitID,TargetID' },
    { skip: !spaceId },
  );
  const [patchSpace, { isLoading: isSaving }] = usePatchSpaceMutation();

  const space = spaceData?.Space;
  const currentLabels = useMemo(() => space?.Labels ?? {}, [space?.Labels]);
  const currentAnnotations = useMemo(() => space?.Annotations ?? {}, [space?.Annotations]);
  const currentReleaseTargetId = space?.ReleaseTargetID ?? null;
  const currentReleaseTargetName = spaceData?.ReleaseTarget?.DisplayName ?? spaceData?.ReleaseTarget?.Slug ?? null;

  // ── Staged (draft) edits — null means "unstaged, follow the loaded value" ──
  const [draftLabels, setDraftLabels] = useState<Record<string, string> | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<Record<string, string> | null>(null);
  // `undefined` = unstaged (follow the loaded value). `null` = staged to
  // explicitly clear. `string` = staged to this target's ID. Replaces the
  // old `{type:'set'|'change'|'clear', targetId}` union now that the picker
  // is one always-editable control instead of two gated modes.
  const [releaseTargetDraft, setReleaseTargetDraft] = useState<string | null | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);

  const effectiveLabels = draftLabels ?? currentLabels;
  const effectiveAnnotations = draftAnnotations ?? currentAnnotations;
  const variantValue = effectiveLabels[LABEL_VARIANT] ?? '';

  const isVariantDirty = (effectiveLabels[LABEL_VARIANT] ?? '') !== (currentLabels[LABEL_VARIANT] ?? '');
  const isLabelsDirty = draftLabels !== null && !mapsEqual(draftLabels, currentLabels);
  const isAnnotationsDirty = draftAnnotations !== null && !mapsEqual(draftAnnotations, currentAnnotations);
  const isReleaseTargetDirty = releaseTargetDraft !== undefined && releaseTargetDraft !== currentReleaseTargetId;

  const dirtyFlags = [isVariantDirty, isLabelsDirty, isAnnotationsDirty, isReleaseTargetDirty];
  const isDirty = dirtyFlags.some(Boolean);
  const dirtyCount = dirtyFlags.filter(Boolean).length;

  // Report dirtiness up so the parent can guard the close routes it owns
  // (cog toggle, node switch) — see the prop's JSDoc. Effect, not inline
  // during render, so a still-mounting/about-to-unmount sheet never calls a
  // parent setState mid-render.
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  // On unmount (any route — including ones this sheet has no say over),
  // tell the parent it's no longer dirty so a stale `true` can never linger
  // past this instance's lifetime and wrongly block the NEXT node's sheet.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Org-wide targets, filtered to OCI-capable ones for the release-target
  // picker (`validateReleaseTarget`, space.go:269-293, hard-requires
  // ProviderType "OCI"). `targets` is still needed for this — it also feeds
  // other, unrelated parts of the pane (target-switching in the treeview),
  // so it stays a required prop even with the unit-targets row gone.
  const ociTargetOptions: ReleaseTargetOption[] = useMemo(
    () =>
      targets
        .flatMap((t) => (t.Target ? [t.Target] : []))
        .filter(isOciCapable)
        .map((t) => ({ targetId: t.TargetID ?? '', name: t.DisplayName ?? t.Slug ?? t.TargetID ?? '' })),
    [targets],
  );

  // Count of units currently sitting on the release target — the ONLY thing
  // `ReleaseTargetRow`'s consequence line needs. Guarded on `!= null` so a
  // null `currentReleaseTargetId` can never accidentally match a unit whose
  // own `TargetID` is also null (JS `===` would; the backend's SQL `x = NULL`
  // never matches per spike 2, and this mirrors that).
  const releaseTargetAffectedUnitCount = useMemo(
    () => (unitsData ?? []).filter((u) => u.Unit?.TargetID != null && u.Unit.TargetID === currentReleaseTargetId).length,
    [unitsData, currentReleaseTargetId],
  );

  // The release-target consequence must be re-stated at Save, not only at
  // selection (BUILD-PLAN step 14) — gated on the SAME condition
  // `ReleaseTargetRow` uses for its own inline consequence line, including
  // the unset → set case, which is safe (spike 2: `x = NULL` never matches)
  // and carries nothing to restate.
  const hasStagedRetarget = isReleaseTargetDirty && currentReleaseTargetId != null && releaseTargetAffectedUnitCount > 0;

  // useCallback (not a plain function) because both are now also read by
  // `useImperativeHandle` below — the pane's BottomBar buttons live outside
  // this component and call them via `ref`, not via a JSX onClick in scope
  // here, so they need a stable-enough identity for that hook's own deps.
  const handleDiscard = useCallback(() => {
    setDraftLabels(null);
    setDraftAnnotations(null);
    setReleaseTargetDraft(undefined);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!isDirty) return;
    setSaveError(null);

    // Space-level fields (rename + user labels + annotations + release
    // target) — one PATCH. There is only ever this one write now that the
    // unit-targets row (a separate `bulkPatchUnits` fan-out with its own 207
    // partial-failure handling) has been removed.
    const spaceBody: { Labels?: Record<string, string | null>; Annotations?: Record<string, string | null>; ReleaseTargetID?: string | null } = {};
    if (isVariantDirty || isLabelsDirty) spaceBody.Labels = toMergePatchMap(currentLabels, effectiveLabels);
    if (isAnnotationsDirty) spaceBody.Annotations = toMergePatchMap(currentAnnotations, effectiveAnnotations);
    if (isReleaseTargetDirty) {
      spaceBody.ReleaseTargetID = releaseTargetDraft ?? null;
    }
    if (Object.keys(spaceBody).length > 0) {
      try {
        await patchSpace({ spaceId, body: spaceBody }).unwrap();
      } catch (err) {
        setSaveError(getApiErrorMessage(err, 'Failed to save Space settings'));
        return;
      }
    }
    setDraftLabels(null);
    setDraftAnnotations(null);
    setReleaseTargetDraft(undefined);
  }, [
    isDirty,
    isVariantDirty,
    isLabelsDirty,
    isAnnotationsDirty,
    isReleaseTargetDirty,
    currentLabels,
    currentAnnotations,
    effectiveLabels,
    effectiveAnnotations,
    releaseTargetDraft,
    patchSpace,
    spaceId,
  ]);

  // Report the richer footer state up so `ComponentSidePane`'s BottomBar can
  // render Save/Discard (label, disabled state, error text, unsaved count)
  // without owning any staging logic itself. Same effect-not-inline pattern
  // as the `onDirtyChange` effect above, for the same reason.
  useEffect(() => {
    onFooterStateChange?.({ isDirty, dirtyCount, isSaving, saveError });
  }, [isDirty, dirtyCount, isSaving, saveError, onFooterStateChange]);
  // On unmount, same reasoning as the `onDirtyChange` cleanup above: the
  // BottomBar already switches back to its non-sheet branch the instant
  // `isSettingsOpen` flips (this effect can't outrace that in practice), but
  // resetting here means nothing ever depends on that ordering.
  useEffect(
    () => () => onFooterStateChange?.({ isDirty: false, dirtyCount: 0, isSaving: false, saveError: null }),
    [onFooterStateChange],
  );

  // What the pane's BottomBar buttons actually call. `discardOrClose`
  // preserves the exact two-click semantics the sheet's own footer used to
  // have (discard-if-dirty, close-if-not) — moving the BUTTON's location
  // doesn't change what clicking it does. Both actions only ever touch this
  // sheet's own local draft state (`draftLabels`/`draftAnnotations`/
  // `releaseTargetDraft` above) — never the treeview's staged edits, which
  // live entirely in `ComponentValuesSection`'s own state and are wired to a
  // DIFFERENT Discard button that only exists in the DOM while this sheet is
  // CLOSED (see `ComponentSidePane.tsx`'s BottomBar branch). The two Discards
  // can never be confused because only one of them is ever rendered.
  useImperativeHandle(
    ref,
    () => ({
      save: () => {
        void handleSave();
      },
      discardOrClose: () => {
        if (isDirty) handleDiscard();
        else onClose();
      },
    }),
    [isDirty, handleSave, handleDiscard, onClose],
  );

  return (
    <Box
      data-testid='space-settings-sheet'
      sx={{
        position: 'absolute',
        inset: 0,
        // The wrapping band in ComponentSidePane.tsx isolates its own stacking
        // context (`isolation: 'isolate'`), so this only needs to outrank
        // whatever z-index values the treeview rows use inside that band.
        zIndex: 30,
        background: componentTheme.bgDefault,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 -8px 24px -18px rgba(15,17,21,.28)',
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* ── Header ── */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, padding: '12px 16px 3px' }}>
          <Typography
            sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, letterSpacing: '.13em', textTransform: 'uppercase', color: componentTheme.fgMuted, fontWeight: 700 }}
          >
            Space settings
          </Typography>
          <Typography
            sx={{
              ml: 'auto',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '999px',
              background: componentTheme.accentMuted,
              color: componentTheme.accent,
              border: `1px solid rgba(186,61,3,.28)`,
              whiteSpace: 'nowrap',
            }}
          >
            Everyone · all {unitCount} unit{unitCount === 1 ? '' : 's'}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle, padding: '0 16px 8px', lineHeight: 1.5 }}>
          {slug} · nothing is written until you press Save.
        </Typography>

        {/* ── Variant name (Space.Labels.Variant) ── */}
        <Box sx={{ padding: '8px 16px', borderTop: `1px solid ${componentTheme.borderSubtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 0.6 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 650, color: componentTheme.fgDefault }}>Variant name</Typography>
            <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 10.5, color: componentTheme.fgSubtle }}>Space.Labels.Variant</Typography>
            {isVariantDirty && (
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.6 }}>
                <Box sx={{ width: 5, height: 5, borderRadius: '50%', background: componentTheme.accent }} />
                <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: componentTheme.accent }}>Unsaved</Typography>
              </Box>
            )}
          </Box>
          <TextField
            fullWidth
            size='small'
            value={variantValue}
            disabled={isSpaceLoading}
            onChange={(e) => setDraftLabels({ ...effectiveLabels, [LABEL_VARIANT]: e.target.value })}
            data-testid='space-settings-variant-input'
            sx={{ '& .MuiInputBase-root': { height: 30, fontSize: 13 } }}
          />
        </Box>

        {/* ── Release target (Space.ReleaseTargetID) — always-editable picker ── */}
        <ReleaseTargetRow
          currentTargetId={currentReleaseTargetId}
          currentTargetName={currentReleaseTargetName}
          ociTargetOptions={ociTargetOptions}
          affectedUnitCount={releaseTargetAffectedUnitCount}
          draftTargetId={releaseTargetDraft}
          onChange={setReleaseTargetDraft}
          disabled={isSpaceLoading || isSaving}
        />

        {/* ── Labels (Space.Labels, user-authored) — commit 5 ── */}
        <LabelsRow labels={effectiveLabels} onChange={setDraftLabels} disabled={isSpaceLoading || isSaving} />

        {/* ── Show-more (commit 6) ── */}
        <ShowMoreSection
          slug={slug}
          spaceId={spaceId}
          variantLabelValue={variantValue}
          annotations={effectiveAnnotations}
          onAnnotationsChange={setDraftAnnotations}
          disabled={isSpaceLoading || isSaving}
        />

        {/* ── Delete (commit 7) — outside the staged model by design ── */}
        <DeleteRow spaceId={spaceId} slug={slug} unitCount={unitCount} onDeleted={onDeleted} />

        {/* Re-stated at Save time too (BUILD-PLAN step 14), not only at
            selection on `ReleaseTargetRow` — Save is when this actually
            happens, not when the target was picked. Lives in the scrollable
            content now, last item, rather than pinned to a footer: this
            sheet no longer has one (see file header) — Save/Discard
            themselves moved into the pane's BottomBar. */}
        {hasStagedRetarget && (
          <Box
            data-testid='space-settings-save-time-warning'
            sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', padding: '8px 12px', margin: '8px 16px 0', borderRadius: `${componentTheme.radiusSm}px`, background: componentTheme.attentionMuted, border: `1px solid rgba(159,66,0,.3)` }}
          >
            <WarningAmberIcon sx={{ fontSize: 15, color: componentTheme.attention, flexShrink: 0, mt: '1px' }} />
            <Typography sx={{ fontSize: 11.5, lineHeight: 1.5, color: componentTheme.attention }}>
              Save includes a release-target change that moves units. This moves running infrastructure the instant it
              commits — Save is when it actually happens, not when you picked the new target.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
});
