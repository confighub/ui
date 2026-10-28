// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { memo, type Ref } from 'react';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Skeleton from '@mui/material/Skeleton';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';

import { VISUALLY_HIDDEN_SX } from '@/utility/visually-hidden';

import { componentTheme } from '../../x/apps/componentTheme';
import { OutcomeBar } from '../components/OutcomeBar';
import { OUTCOME_META, outcomeSegments, type OutcomeBarSegment } from '../components/outcomeMeta';
import { changeOrderAction, changeOrderFontMono, changeOrderInk, changeOrderShape, changeOrderStatus, changeOrderSurface, changeOrderType } from '../changeOrdersTokens';
import { CouldNotEstablish, RetryButton as CouldNotEstablishRetry } from './CouldNotEstablish';
import { draftCopy } from './draftCopy';
import { BARE_BUTTON, DRAFT_TRANSITION, FOCUS_RING } from './draftLook';
import { blockerRepeatsPreview, dryRunSentence } from './draftPageModel';
import type { DraftProblem } from './draftTypes';
import { DRAFT_SCOPE_STAGE_ID, type DraftPreview } from './useDraftPreview';

const copy = draftCopy.page.side;

export interface CreateButtonProps {
  canCreate: boolean;
  isCreating: boolean;
  onCreate: () => void;
  /** The id of what says why Create cannot run, when something does. */
  describedBy?: string;
}

/** The Create button: the detail view's Promote purple, at the theme's standard 32px height as the page's one primary action. */
export function CreateButton({ canCreate, isCreating, onCreate, describedBy }: CreateButtonProps) {
  const disabled = !canCreate || isCreating;
  return (
    <Box component="span" sx={{ display: 'inline-flex', cursor: disabled ? 'not-allowed' : undefined }}>
      <Button
        variant="contained"
        disabled={disabled}
        onClick={onCreate}
        aria-describedby={describedBy}
        data-testid="draft-create"
        sx={{
          backgroundColor: componentTheme.promote,
          '&:hover': { backgroundColor: componentTheme.promoteEmphasis },
          '&.Mui-disabled': { backgroundColor: componentTheme.upgradeSkeleton, color: changeOrderInk.subtle },
          '&:focus-visible': FOCUS_RING,
          transition: DRAFT_TRANSITION,
          '&:active': { transform: 'scale(.98)' },
          '@media (prefers-reduced-motion: reduce)': { '&:active': { transform: 'none' } },
        }}
      >
        {isCreating ? copy.creating : copy.create}
      </Button>
    </Box>
  );
}

/** Blockers that are the server failing to answer, where asking again can help. */
const RETRYABLE_BLOCKERS: ReadonlySet<string> = new Set(['dry-run-failed', 'read-failed']);

export interface BlockerProps {
  blocker: DraftProblem;
  /** Its id: Create is described by it, and a refused create focuses it. */
  id: string;
  onFocus: () => void;
  /** Ask the server again, for a problem that is its failing to answer. */
  onRetry?: () => void;
  /**
   * The same "Could not establish" is already said beside it, with its retry (the dry run
   * failed for the same reason): the blocker is kept for Create's description, out of sight.
   */
  alreadySaid?: boolean;
}

/**
 * Why Create cannot run. "↑ Fix the name" takes the keyboard to what fixes it; a problem with no
 * place of its own on the card (the create itself failed) is said in plain words, with nowhere
 * to go.
 */
export function Blocker({ blocker, id, onFocus, onRetry, alreadySaid = false }: BlockerProps) {
  const text = { fontSize: changeOrderType.size.small, fontWeight: changeOrderType.weight.semibold, whiteSpace: 'nowrap' } as const;
  if (blocker.row === 'create' && alreadySaid) {
    return (
      <Box id={id} component="span" tabIndex={-1} sx={VISUALLY_HIDDEN_SX}>
        {blocker.message}
      </Box>
    );
  }
  if (blocker.row === 'create' && blocker.detail === undefined && blocker.source === 'server' && RETRYABLE_BLOCKERS.has(blocker.code)) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
        <Box
          id={id}
          component="span"
          tabIndex={-1}
          // A dry run that did not answer: small and quiet, with its retry.
          sx={{ fontSize: 11.5, whiteSpace: 'nowrap', color: changeOrderInk.subtle, outline: 'none' }}
        >
          {blocker.message}
        </Box>
        {onRetry === undefined ? null : <CouldNotEstablishRetry onRetry={onRetry} label={draftCopy.retry(draftCopy.page.retryWhat.createDryRun)} focusAfter={id} />}
      </Box>
    );
  }
  if (blocker.row === 'create') {
    // Create itself failed: said in the error style, what failed first, then what it left behind.
    return (
      <Box
        id={id}
        role="alert"
        tabIndex={-1}
        data-testid="draft-create-failed"
        sx={{
          display: 'flex',
          gap: '6px',
          alignItems: 'flex-start',
          maxWidth: 232,
          padding: '2px 0 2px 9px',
          boxShadow: `inset ${changeOrderShape.leadingEdge}px 0 0 ${changeOrderStatus.danger}`,
          fontSize: changeOrderType.size.small,
          lineHeight: changeOrderType.lineHeight.body,
          color: changeOrderStatus.danger,
          outline: 'none',
          '&:focus-visible': FOCUS_RING,
        }}
      >
        <ErrorOutlineIcon aria-hidden sx={{ fontSize: 15, marginTop: '1px', flex: 'none' }} />
        <Box component="span" sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ display: 'block', fontWeight: changeOrderType.weight.semibold }}>
            {blocker.message}
          </Box>
          {blocker.detail === undefined ? null : (
            <Box component="span" data-testid="draft-create-failed-detail" sx={{ display: 'block', color: changeOrderInk.muted }}>
              {blocker.detail}
            </Box>
          )}
        </Box>
      </Box>
    );
  }
  return (
    <Box
      id={id}
      component="button"
      type="button"
      onClick={onFocus}
      data-testid="draft-blocker"
      sx={{
        ...BARE_BUTTON,
        ...text,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        color: changeOrderAction.ink,
        borderRadius: '4px',
        padding: '0 2px',
        '&:hover': { textDecoration: 'underline', textUnderlineOffset: '2px' },
        '&:focus-visible': FOCUS_RING,
      }}
    >
      <ArrowUpwardIcon aria-hidden sx={{ fontSize: 15 }} />
      {blocker.blockerLabel ?? draftCopy.page.blockers[blocker.row]}
    </Box>
  );
}

interface StageRow {
  stageId: string;
  name: string;
  count: number | undefined;
  segments: OutcomeBarSegment[];
}

/** "prod, 5 variants: 2 differs, 3 same change" — the bar, read out. */
function stageLabel(row: StageRow): string {
  if (row.count === undefined) return row.name;
  if (row.segments.length === 0) return copy.stageIdle(row.name, row.count);
  return `${row.name}, ${draftCopy.path.variants(row.count)}: ${row.segments.map((segment) => `${segment.count} ${OUTCOME_META[segment.kind].label.toLowerCase()}`).join(', ')}`;
}

export interface DraftSideColumnProps {
  preview: DraftPreview;
  /** The governing workflow's stages, drawn as soon as they are known, before their outcome is. */
  stageNames: readonly string[];
  selectedStage: string | undefined;
  onSelectStage: (stage: string) => void;
  /** The variants in scope on no stage of the path, by display name, for the live region. */
  outsideNames: readonly string[];
  canCreate: boolean;
  isCreating: boolean;
  blocker: DraftProblem | undefined;
  onCreate: () => void;
  onFocusBlocker: () => void;
  onRetry?: () => void;
  onRetryValidation?: () => void;
  /** The Create row: the sticky bar shows while it is out of view. */
  ctaRef: Ref<HTMLDivElement>;
}

interface StageTrackProps {
  row: StageRow;
}

/** A stage's bar: its outcomes; an empty track while there are none to show; its shape while they are read. */
function StageTrack({ row }: StageTrackProps) {
  if (row.count === undefined) return <Skeleton variant="rounded" height={8} sx={{ borderRadius: `${changeOrderShape.radius.sm}px` }} />;
  if (row.segments.length === 0) return <Box data-testid="draft-stage-track-empty" sx={{ height: 8, borderRadius: `${changeOrderShape.radius.sm}px`, background: changeOrderSurface.inset }} />;
  return <OutcomeBar segments={row.segments} height={8} />;
}

export const DRAFT_BLOCKER_ID = 'draft-blocker-side';
/** The column's heading: where focus goes when a retry redraws its button away. */
const DRY_RUN_HEADING_ID = 'draft-dry-run-heading';

/** What the live region says once the dry run has settled, or failed. */
function liveSentence(preview: DraftPreview, outsideNames: readonly string[], blocker: DraftProblem | undefined): string {
  if (preview.status === 'resolved' && preview.idle !== undefined) {
    // No count to give: say why, and what Create waits for.
    const waits = blocker === undefined ? '' : `. ${blocker.blockerLabel ?? blocker.message}`;
    return `${copy.sentenceIdle(preview.idle)}${waits}`;
  }
  if (preview.status === 'resolved' && preview.totals === undefined) return blocker === undefined ? '' : copy.sentenceIdle(blocker.message);
  if (preview.status === 'resolved') return dryRunSentence(preview, outsideNames);
  if (preview.status === 'loading') return '';
  // Failed, or nothing to establish (MergeUnits, no variant in scope, an end that names nothing):
  // said once it settles, with the reason when there is one, as the card shows it.
  return preview.reason === undefined ? copy.sentenceFailed : `${copy.sentenceFailed}. ${preview.reason}`;
}

/**
 * The right column: the dry run as one bar per stage (each selects its stage below), and Create.
 * The figure the eye reads is the outcome line's "N of M same"; this column keeps the stages and the
 * action, and says the settled dry run once to a screen reader.
 */
export const DraftSideColumn = memo(function DraftSideColumn({
  preview,
  stageNames,
  selectedStage,
  onSelectStage,
  outsideNames,
  canCreate,
  isCreating,
  blocker,
  onCreate,
  onFocusBlocker,
  onRetry,
  onRetryValidation,
  ctaRef,
}: DraftSideColumnProps) {
  const resolved = preview.status === 'resolved';
  // Nothing to show yet: each stage drawn with its variants and an empty track.
  const idle = resolved && preview.idle !== undefined;
  const idleCount = (name: string) => preview.sequence?.stages.find((stage) => stage.id === name)?.spaceIds.length ?? 0;
  let rows: StageRow[];
  if (idle) rows = stageNames.map((name) => ({ stageId: name, name, count: idleCount(name), segments: [] }));
  else if (resolved)
    rows = preview.stages.map((stage) => ({
        stageId: stage.stageId,
        name: stage.stageId === DRAFT_SCOPE_STAGE_ID ? draftCopy.page.scope.title.toLowerCase() : stage.stageId,
        count: stage.spaceIds.length,
        // Worst first, as the detail view orders a stage's outcomes.
        segments: outcomeSegments(stage.outcome.groups),
      }));
  else rows = stageNames.map((name) => ({ stageId: name, name, count: undefined, segments: [] }));
  const failed = preview.status === 'failed' || preview.status === 'unavailable';

  return (
    <Box
      component="aside"
      aria-label={copy.label}
      aria-busy={preview.status === 'loading'}
      // The live region inside is visually hidden, and stays inside this column only if the column is positioned.
      sx={{ position: 'relative', minWidth: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box component="h2" id={DRY_RUN_HEADING_ID} tabIndex={-1} sx={{ outline: 'none', margin: '0 0 2px', fontSize: changeOrderType.size.small, fontWeight: changeOrderType.weight.regular, color: changeOrderInk.subtle, display: 'flex', alignItems: 'center', gap: '5px' }}>
        <ScienceOutlinedIcon aria-hidden sx={{ fontSize: 14 }} />
        {copy.dryRun}
      </Box>
      <Box role="status" aria-live="polite" sx={VISUALLY_HIDDEN_SX}>
        {liveSentence(preview, outsideNames, blocker)}
      </Box>
      {failed ? (
        <Box sx={{ marginTop: '12px' }}>
          <CouldNotEstablish
            onRetry={preview.status === 'failed' ? onRetry : undefined}
            retryWhat={draftCopy.page.retryWhat.dryRun}
            focusAfterRetry={DRY_RUN_HEADING_ID}
            reason={preview.reason}
          />
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: '7px', marginTop: '12px' }} data-testid="draft-stage-bars">
          {rows.map((row) => (
            <Box
              key={row.stageId}
              component="button"
              type="button"
              aria-label={stageLabel(row)}
              aria-pressed={row.stageId === selectedStage}
              onClick={() => onSelectStage(row.stageId)}
              disabled={row.stageId === DRAFT_SCOPE_STAGE_ID}
              sx={{
                ...BARE_BUTTON,
                display: 'grid',
                gridTemplateColumns: '52px minmax(0,1fr) 32px',
                alignItems: 'center',
                gap: '8px',
                fontSize: changeOrderType.size.small,
                lineHeight: changeOrderType.lineHeight.body,
                color: changeOrderInk.muted,
                borderRadius: '3px',
                cursor: row.stageId === DRAFT_SCOPE_STAGE_ID ? 'default' : 'pointer',
                transition: DRAFT_TRANSITION,
                '&:hover:not(:disabled)': { background: changeOrderSurface.sunk },
                '&:focus-visible': FOCUS_RING,
              }}
            >
              <Box component="span" translate="no" sx={{ fontFamily: changeOrderFontMono, fontSize: changeOrderType.size.small, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.name}
              </Box>
              <StageTrack row={row} />
              <Box component="span" sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: changeOrderInk.subtle }}>
                {row.count ?? ''}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      <Box ref={ctaRef} sx={{ marginTop: '16px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
        <Box sx={{ minHeight: 16, display: 'flex', justifyContent: 'flex-end' }}>
          {blocker === undefined ? null : (
            <Blocker
              blocker={blocker}
              id={DRAFT_BLOCKER_ID}
              onFocus={onFocusBlocker}
              onRetry={onRetryValidation}
              alreadySaid={blockerRepeatsPreview(blocker, preview)}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <CreateButton canCreate={canCreate} isCreating={isCreating} onCreate={onCreate} describedBy={blocker === undefined ? undefined : DRAFT_BLOCKER_ID} />
        </Box>
      </Box>
    </Box>
  );
});
