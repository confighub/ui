// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useRef, useState } from 'react';

import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { LabelChip } from './unit-details/LabelChip';
import { extractLabelOptions } from '@/components/query-builder/utils';
import {
  useGetTargetQuery,
  useGetUnitQuery,
  useListAllUnitsQuery,
} from '@confighub/rtk-query';
import { formatAbsolute, formatRelative } from '@/utility/date-format';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Typography from '@mui/material/Typography';

import {
  BottomBar,
  ErrorCard,
  ErrorDetail,
  GateBadge,
  PaneContainer,
  PaneContent,
  PaneHeader,
  ResizeHandle,
  TagBadge,
} from './diffStyles';
import { componentTheme } from './componentTheme';
import { AddLabelPopover } from './unit-details/AddLabelPopover';
import { AnnotationRows } from './unit-details/AnnotationRows';
import { DetailsSection } from './unit-details/DetailsSection';
import { RevisionsGrid } from './unit-details/RevisionsGrid';
import type { UnitMetaPatch } from './unit-details/types';

export type { UnitMetaPatch };

const MIN_SIZE = 250;
const MAX_PERCENT = 1;

const BackIcon = () => (
  <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' width={14} height={14}>
    <path d='M10 4L6 8l4 4' />
  </svg>
);

export interface UnitDetailsPaneProps {
  unitId: string;
  spaceId: string;
  /** Slug from the row click, lets the header render before the extended fetch resolves. */
  slug: string;
  width: number;
  defaultWidth: number;
  isResizing?: boolean;
  onWidthChange: (width: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
  layoutRef?: React.RefObject<HTMLDivElement | null>;
  /** Returns to the Component overview pane (prior mode preserved). */
  onBack: () => void;
  /** Closes the whole side pane. */
  onClose?: () => void;
  /**
   * Persist the full desired Labels/Annotations maps for the unit. Resolves true
   * on success. Implemented in AppComponentView via useUpdateUnitMutation so the
   * full Unit body + Version are sent (full-map replacement, supports deletes).
   */
  onUpdateUnitMeta: (unitId: string, spaceId: string, patch: UnitMetaPatch) => Promise<boolean>;
  /** Navigate the pane to a different unit (plain click on a relationship node). */
  onNavigate?: (unitId: string, spaceId: string, slug: string) => void;
}

/**
 * Inline unit details pane (Design A — compact / sectioned). Replaces the
 * Component overview pane in-place when a unit slug is clicked. Reuses the
 * Component view's pane chrome (PaneContainer / ResizeHandle / PaneHeader /
 * PaneContent / BottomBar) and the canonical label/annotation/chip components.
 */
export const UnitDetailsPane = memo(({
  unitId,
  spaceId,
  slug,
  width,
  defaultWidth,
  isResizing,
  onWidthChange,
  onResizeStart,
  onResizeEnd,
  layoutRef,
  onBack,
  onClose,
  onUpdateUnitMeta,
  onNavigate,
}: UnitDetailsPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartPos = useRef(0);
  const dragStartSize = useRef(0);

  // Popover anchor state for label / annotation add or edit.
  const [addPopoverAnchor, setAddPopoverAnchor] = useState<HTMLElement | null>(null);
  const [addPopoverType, setAddPopoverType] = useState<'Labels' | 'Annotations'>('Labels');
  const [editingLabel, setEditingLabel] = useState<{ key: string; value: string; focus: 'key' | 'value' } | null>(null);

  // ── Resize handling (mirrors ComponentSidePane) ──
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      dragStartPos.current = e.clientX;
      dragStartSize.current = width;
      let didMove = false;
      onResizeStart?.();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = dragStartPos.current - moveEvent.clientX;
        if (Math.abs(delta) > 3) didMove = true;
        if (!didMove) return;
        const parentSize = layoutRef?.current?.clientWidth ?? window.innerWidth;
        const maxSize = parentSize * MAX_PERCENT;
        const newSize = Math.min(Math.max(dragStartSize.current + delta, MIN_SIZE), maxSize);
        onWidthChange(newSize);
      };

      const handleMouseUp = () => {
        isDragging.current = false;
        onResizeEnd?.();
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, onWidthChange, layoutRef, onResizeStart, onResizeEnd],
  );

  const handleResizeDoubleClick = useCallback(() => {
    const parentSize = layoutRef?.current?.clientWidth ?? window.innerWidth;
    const maxSize = parentSize * MAX_PERCENT;
    const isAtMax = Math.abs(width - maxSize) < 10;
    onWidthChange(isAtMax ? defaultWidth : maxSize);
  }, [width, defaultWidth, onWidthChange, layoutRef]);

  // ── Data fetch (RTK caches by {spaceId,unitId}) ──
  const { data: extended, isLoading, isError } = useGetUnitQuery({ spaceId, unitId });
  const unit = extended?.Unit;

  const upstreamUnitId = unit?.UpstreamUnitID;
  const upstreamSpaceId = unit?.UpstreamSpaceID;

  // Upstream unit, for its slug and its head revision number. include=UpstreamUnitID
  // on the fetch above would embed it and save this request; left as its own query so
  // that this change is a swap of the deprecated route and nothing else. Skipped when
  // there is no upstream.
  const { data: upstreamExtended } = useGetUnitQuery(
    { spaceId: upstreamSpaceId ?? '', unitId: upstreamUnitId ?? '' },
    { skip: !upstreamUnitId || !upstreamSpaceId },
  );

  // Downstream units (units whose upstream is this unit).
  const { data: downstreamUnits = [] } = useListAllUnitsQuery(
    { include: 'SpaceID', where: `UpstreamUnitID = '${unitId}'` },
    { skip: !unitId },
  );

  // Org-wide labels for autocomplete suggestions in the add modal.
  const { data: allUnitsForLabels = [] } = useListAllUnitsQuery({ select: 'Labels' });

  // Target name. include=TargetID on the fetch above would embed the Target; left as
  // its own query so that this change is a swap of the deprecated route and nothing else.
  const { data: target, isLoading: isTargetLoading } = useGetTargetQuery(
    { spaceId, targetId: unit?.TargetID ?? '' },
    { skip: !unit?.TargetID },
  );

  const labels = useMemo(() => unit?.Labels ?? {}, [unit?.Labels]);
  const annotations = useMemo(() => unit?.Annotations ?? {}, [unit?.Annotations]);
  const applyGateKeys = useMemo(() => Object.keys(unit?.ValidationErrors ?? {}), [unit?.ValidationErrors]);
  const labelAutocompleteOptions = useMemo(
    () => extractLabelOptions(allUnitsForLabels.map((u) => u.Unit)),
    [allUnitsForLabels],
  );

  const behindHead = useMemo(() => {
    const upstreamHead = upstreamExtended?.Unit?.HeadRevisionNum ?? 0;
    const mergedRev = unit?.UpstreamRevisionNum ?? 0;
    return upstreamUnitId ? Math.max(0, upstreamHead - mergedRev) : 0;
  }, [upstreamExtended?.Unit?.HeadRevisionNum, unit?.UpstreamRevisionNum, upstreamUnitId]);

  const downstreamLinks = useMemo(
    () =>
      downstreamUnits
        .map((u) => u.Unit)
        .filter((u): u is NonNullable<typeof u> & { UnitID: string; SpaceID: string; Slug: string } => !!u?.UnitID && !!u.SpaceID && !!u.Slug),
    [downstreamUnits],
  );

  const fullDetailsHref = `/units/${spaceId}/${unitId}`;
  const displayName = unit?.DisplayName || slug;

  // ── Label / Annotation mutations (full-map replacement) ──
  const persistLabels = useCallback(
    (next: Record<string, string>) => { void onUpdateUnitMeta(unitId, spaceId, { Labels: next }); },
    [onUpdateUnitMeta, unitId, spaceId],
  );
  const persistAnnotations = useCallback(
    (next: Record<string, string>) => { void onUpdateUnitMeta(unitId, spaceId, { Annotations: next }); },
    [onUpdateUnitMeta, unitId, spaceId],
  );

  const handleLabelDeleted = useCallback(
    (item: { key: string; value: string }) => {
      const next = { ...labels };
      delete next[item.key];
      persistLabels(next);
    },
    [labels, persistLabels],
  );
  const handleAnnotationDeleted = useCallback(
    (item: { key: string; value: string }) => {
      const next = { ...annotations };
      delete next[item.key];
      persistAnnotations(next);
    },
    [annotations, persistAnnotations],
  );

  const handleItemAdded = useCallback(
    (key: string, value: string) => {
      if (addPopoverType === 'Annotations') {
        persistAnnotations({ ...annotations, [key]: value });
      } else {
        const next = { ...labels };
        if (editingLabel && editingLabel.key !== key) delete next[editingLabel.key];
        next[key] = value;
        persistLabels(next);
      }
      setEditingLabel(null);
    },
    [addPopoverType, annotations, editingLabel, labels, persistAnnotations, persistLabels],
  );

  return (
    <PaneContainer ref={containerRef} $width={width} $isResizing={isResizing}>
      <ResizeHandle onMouseDown={handleResizeStart} onDoubleClick={handleResizeDoubleClick} />

      <PaneHeader>
        <Box
          component='button'
          onClick={onBack}
          aria-label='Back to Component overview'
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 12,
            fontWeight: 500,
            fontFamily: componentTheme.fontSans,
            color: componentTheme.fgMuted,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '3px 6px',
            borderRadius: `${componentTheme.radiusSm}px`,
            flexShrink: 0,
            transition: 'background .12s, color .12s',
            '&:hover': { background: componentTheme.bgInset, color: componentTheme.fgDefault },
          }}
        >
          <BackIcon />
          Overview
        </Box>
        <Typography sx={{ color: componentTheme.borderMuted, fontSize: 16, flexShrink: 0, lineHeight: 1 }}>/</Typography>
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 600,
            fontFamily: componentTheme.fontMono,
            color: componentTheme.fgDefault,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {slug}
        </Typography>
        {onClose && (
          <IconButton
            onClick={onClose}
            size='small'
            aria-label='Close pane'
            sx={{
              width: 28,
              height: 28,
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: '50%',
              color: componentTheme.fgMuted,
              backgroundColor: componentTheme.bgSubtle,
              '&:hover': { color: componentTheme.fgDefault, backgroundColor: componentTheme.bgInset },
            }}
          >
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        )}
      </PaneHeader>

      <PaneContent sx={{ padding: 0, gap: 0 }}>
        {isError ? (
          <ErrorCard sx={{ m: 2 }}>
            <ErrorDetail>Failed to load unit details. Please try again.</ErrorDetail>
          </ErrorCard>
        ) : isLoading && !unit ? (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Skeleton variant='rounded' height={20} width='60%' />
            <Skeleton variant='rounded' height={20} width='40%' />
            <Skeleton variant='rounded' height={60} />
            <Skeleton variant='rounded' height={40} />
          </Box>
        ) : (
          <>
            {/* ── IDENTITY ── */}
            <DetailsSection title='Identity'>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr',
                  rowGap: '6px',
                  columnGap: '10px',
                  alignItems: 'center',
                }}
              >
                {/* Slug — always mono + bold so it reads distinctly from Display Name */}
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  Slug
                </Typography>
                <Typography
                  sx={{
                    fontFamily: componentTheme.fontMono,
                    fontWeight: 700,
                    fontSize: 13,
                    color: componentTheme.fgDefault,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {slug}
                </Typography>

                {/* Display Name — only shown when different from slug to avoid duplication */}
                {unit?.DisplayName && unit.DisplayName !== slug && (
                  <>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                      Display Name
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: componentTheme.fgDefault }}>{unit.DisplayName}</Typography>
                  </>
                )}

                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  UUID
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontFamily: componentTheme.fontMono,
                      fontSize: 11,
                      color: componentTheme.fgMuted,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {unitId}
                  </Typography>
                  <CopyToClipboard text={unitId} sx={{ flexShrink: 0, width: 20, height: 20 }} title='Copy UUID' />
                </Box>

                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  Space
                </Typography>
                <TagBadge sx={{ fontFamily: componentTheme.fontMono, justifySelf: 'start' }}>
                  {unit?.SpaceSlug || spaceId}
                </TagBadge>

                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  Toolchain
                </Typography>
                <TagBadge sx={{ justifySelf: 'start' }}>{unit?.ToolchainType}</TagBadge>
              </Box>
            </DetailsSection>

            {/* ── REVISIONS ── */}
            <RevisionsGrid
              spaceId={spaceId}
              unitId={unitId}
              headRevisionNum={unit?.HeadRevisionNum}
              lastReleasedRevisionNum={unit?.LastReleasedRevisionNum}
              behindHead={behindHead}
            />

            {/* ── LABELS ── */}
            {/* Rendered as a plain chip row (not a Select) so the affordance matches:
                clicking "Add" opens the modal directly — no dropdown chevron confusion. */}
            <DetailsSection title='Labels' count={Object.keys(labels).length}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' }}>
                {Object.entries(labels).map(([key, value]) => (
                  <LabelChip
                    key={key}
                    labelKey={key}
                    value={value}
                    onDelete={() => handleLabelDeleted({ key, value })}
                    onEdit={(el, focus) => {
                      setEditingLabel({ key, value, focus });
                      setAddPopoverType('Labels');
                      setAddPopoverAnchor(el);
                    }}
                  />
                ))}
                <Button
                  variant='outlined'
                  size='small'
                  startIcon={<AddIcon sx={{ fontSize: 13 }} />}
                  onClick={(e) => { setEditingLabel(null); setAddPopoverType('Labels'); setAddPopoverAnchor(e.currentTarget); }}
                  sx={{
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: 12,
                    color: componentTheme.fgMuted,
                    borderColor: componentTheme.borderDefault,
                    borderStyle: 'dashed',
                    borderRadius: '9999px',
                    px: '10px',
                    height: 24,
                    minWidth: 0,
                    '&:hover': { borderColor: componentTheme.accent, color: componentTheme.accent, backgroundColor: 'transparent' },
                  }}
                >
                  Add label
                </Button>
              </Box>
            </DetailsSection>

            {/* ── ANNOTATIONS ── */}
            <DetailsSection title='Annotations' count={Object.keys(annotations).length}>
              <AnnotationRows
                annotations={annotations}
                onAnnotationDeleted={handleAnnotationDeleted}
                onAnnotationAddClicked={(el) => { setAddPopoverType('Annotations'); setAddPopoverAnchor(el); }}
                onAnnotationEditClicked={(el, key, value) => {
                  setEditingLabel({ key, value, focus: 'value' });
                  setAddPopoverType('Annotations');
                  setAddPopoverAnchor(el);
                }}
              />
            </DetailsSection>

            {/* ── RELATIONSHIPS ── */}
            <DetailsSection title='Relationships'>
              {/* Shared chip style for relationship nodes */}
              {(() => {
                const chipSx = {
                  display: 'inline-flex',
                  flexDirection: 'column' as const,
                  alignItems: 'flex-start',
                  px: '10px',
                  py: '5px',
                  borderRadius: `${componentTheme.radiusMd}px`,
                  border: `1px solid ${componentTheme.borderMuted}`,
                  background: componentTheme.bgDefault,
                  textDecoration: 'none',
                  cursor: 'pointer',
                  transition: 'border-color 0.12s, background 0.12s',
                  '&:hover': {
                    borderColor: componentTheme.accent,
                    background: componentTheme.accentMuted,
                  },
                };

                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Upstream */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: componentTheme.fgSubtle }}>
                        Upstream
                      </Typography>
                      {upstreamUnitId && upstreamSpaceId ? (
                        <Box
                          component='a'
                          href={`/units/${upstreamSpaceId}/${upstreamUnitId}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          onClick={(e: React.MouseEvent) => {
                            if (onNavigate && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                              e.preventDefault();
                              onNavigate(upstreamUnitId, upstreamSpaceId, upstreamExtended?.Unit?.Slug || upstreamUnitId);
                            }
                          }}
                          sx={chipSx}
                        >
                          <Typography sx={{ fontSize: 10, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle, lineHeight: 1.3 }}>
                            {upstreamExtended?.Unit?.SpaceSlug || upstreamSpaceId}
                          </Typography>
                          <Typography sx={{ fontSize: 13, fontFamily: componentTheme.fontMono, fontWeight: 600, color: componentTheme.fgDefault, lineHeight: 1.4 }}>
                            {upstreamExtended?.Unit?.Slug || upstreamUnitId}
                          </Typography>
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>None (root)</Typography>
                      )}
                    </Box>

                    {/* Downstream */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: componentTheme.fgSubtle }}>
                        Downstream
                      </Typography>
                      {downstreamLinks.length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {downstreamLinks.map((d) => (
                            <Box
                              key={d.UnitID}
                              component='a'
                              href={`/units/${d.SpaceID}/${d.UnitID}`}
                              target='_blank'
                              rel='noopener noreferrer'
                              onClick={(e: React.MouseEvent) => {
                                if (onNavigate && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
                                  e.preventDefault();
                                  onNavigate(d.UnitID, d.SpaceID, d.Slug);
                                }
                              }}
                              sx={chipSx}
                            >
                              <Typography sx={{ fontSize: 10, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle, lineHeight: 1.3 }}>
                                {d.SpaceSlug || d.SpaceID}
                              </Typography>
                              <Typography sx={{ fontSize: 13, fontFamily: componentTheme.fontMono, fontWeight: 600, color: componentTheme.fgDefault, lineHeight: 1.4 }}>
                                {d.Slug}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>No downstream links</Typography>
                      )}
                    </Box>
                  </Box>
                );
              })()}
            </DetailsSection>

            {/* ── CONFIGURATION ── */}
            {/* Target: show slug when the /targets fetch resolves; while loading or when
                the slug is absent, fall back to a truncated UUID + copy button so users
                can still identify the target without seeing a raw full UUID. (FIX #2)
                Provider is always shown — "None" if the unit has no ProviderType. (FIX #6) */}
            <DetailsSection title='Configuration'>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '92px 1fr',
                  rowGap: '6px',
                  columnGap: '10px',
                  alignItems: 'center',
                }}
              >
                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  Target
                </Typography>
                {isTargetLoading ? (
                  <Skeleton variant='text' width={80} height={16} />
                ) : target?.Target?.Slug ? (
                  <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, color: componentTheme.fgDefault, wordBreak: 'break-all' }}>
                    {target.Target.Slug}
                  </Typography>
                ) : unit?.TargetID ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 11, color: componentTheme.fgMuted, wordBreak: 'break-all' }}>
                      {unit.TargetID}
                    </Typography>
                    <CopyToClipboard text={unit.TargetID} sx={{ flexShrink: 0, width: 20, height: 20 }} title='Copy Target ID' />
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>None</Typography>
                )}

                <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgSubtle, lineHeight: '20px' }}>
                  Provider
                </Typography>
                {unit?.ProviderType ? (
                  <TagBadge sx={{ justifySelf: 'start' }}>{unit.ProviderType}</TagBadge>
                ) : (
                  <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>None</Typography>
                )}
              </Box>
            </DetailsSection>

            {/* ── RELEASE GATES ── */}
            <DetailsSection title='Release Gates' count={applyGateKeys.length}>
              {applyGateKeys.length > 0 ? (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {applyGateKeys.map((key) => (
                    <GateBadge
                      key={key}
                      label={key}
                      size='small'
                      sx={{ color: componentTheme.attention, background: componentTheme.attentionMuted }}
                    />
                  ))}
                </Box>
              ) : (
                <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>No release gates</Typography>
              )}
            </DetailsSection>

            {/* ── TIMESTAMPS ── */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '10px 16px',
                borderTop: `1px solid ${componentTheme.borderSubtle}`,
                background: componentTheme.bgSubtle,
                '& > * + *': { borderLeft: `1px solid ${componentTheme.borderSubtle}`, paddingLeft: '12px' },
              }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: componentTheme.fgSubtle }}>
                  Created
                </Typography>
                <Typography sx={{ fontSize: 11, color: componentTheme.fgDefault, fontFamily: componentTheme.fontMono, lineHeight: 1.4 }}>
                  {formatAbsolute(unit?.CreatedAt) || '—'}
                </Typography>
                <Typography sx={{ fontSize: 10, color: componentTheme.fgSubtle, fontFamily: componentTheme.fontSans }}>
                  {formatRelative(unit?.CreatedAt)}
                </Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: componentTheme.fgSubtle }}>
                  Updated
                </Typography>
                <Typography sx={{ fontSize: 11, color: componentTheme.fgDefault, fontFamily: componentTheme.fontMono, lineHeight: 1.4 }}>
                  {formatAbsolute(unit?.UpdatedAt) || '—'}
                </Typography>
                <Typography sx={{ fontSize: 10, color: componentTheme.fgSubtle, fontFamily: componentTheme.fontSans }}>
                  {formatRelative(unit?.UpdatedAt)}
                </Typography>
              </Box>
            </Box>
          </>
        )}
      </PaneContent>

      <BottomBar>
        <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, mr: 'auto', fontFamily: componentTheme.fontSans }}>
          Showing key unit details
        </Typography>
        <Button
          component='a'
          href={fullDetailsHref}
          target='_blank'
          rel='noopener noreferrer'
          aria-label={`Open full details for ${displayName}`}
          variant='outlined'
          size='small'
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
        >
          Open full details
        </Button>
      </BottomBar>

      <AddLabelPopover
        key={`${addPopoverType}-${editingLabel?.key ?? 'new'}`}
        anchorEl={addPopoverAnchor}
        open={addPopoverAnchor != null}
        onClose={() => { setAddPopoverAnchor(null); setEditingLabel(null); }}
        onAdd={handleItemAdded}
        type={addPopoverType}
        labelOptions={addPopoverType === 'Labels' ? labelAutocompleteOptions : undefined}
        initialKey={editingLabel?.key}
        initialValue={editingLabel?.value}
        focusField={editingLabel?.focus}
      />
    </PaneContainer>
  );
});

UnitDetailsPane.displayName = 'UnitDetailsPane';
