// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The comparison itself: one unit, read across the deployments in the selector
 * row.
 *
 * READ-ONLY, AND CARRYING NO ACTION. Releasing belongs to the Releases tab, and
 * nothing on this surface triggers one. Staging and editing belong to the
 * single-deployment tree, which is what the pane shows until a second
 * deployment is added: an inline edit means "this deployment's value", and in a
 * grid of five there is no such thing.
 */

import { memo, useCallback, useMemo, useState, type CSSProperties, type ReactElement } from 'react';

import Box from '@mui/material/Box';
import { keyframes } from '@mui/material/styles';

import { getApiErrorMessage } from '@/utility/error-functions';

import { componentTheme } from '../componentTheme';
import { CompareFilterStrip, type CompareFieldFilter } from './CompareFilterStrip';
import { CompareGrid, FoldChevron } from './CompareGrid';
import { COMPARE_TRACK_VARS, compareContentWidth } from './compareTracks';
import { ancestorPathsOf } from './compareTree';
import { CompareStagedFooter } from './CompareStagedFooter';
import {
  applyEditsToUnit,
  editKey,
  summariseEdits,
  type DeploymentApplyOutcome,
  type StagedCompareEdit,
} from './compareEditing';
import { CompareImageRows } from './CompareImageRows';
import { containerImageOf } from './containerImagePaths';
import {
  buildCompareResult,
  filterRows,
  type CompareColumnInput,
  type CompareLeafRow,
  type CompareRow,
} from './deploymentCompareModel';

/** One unit, read across the deployments in the selector row. */
export interface CompareUnit {
  /** The unit's slug, which is how the same unit is found in every deployment. */
  slug: string;
  columns: readonly CompareColumnInput[];
}

export interface ComponentCompareSectionProps {
  units: readonly CompareUnit[];
  /** How many deployments are being compared, for the empty state's own words. */
  deploymentCount: number;
  /**
   * Writes one unit's configuration. Absent makes the whole surface read-only,
   * which is what it was before editing existed.
   */
  onCommitStaged?: (unitId: string, spaceId: string, payload: { kind: 'patch-data'; data: string }) => Promise<boolean>;
}

/**
 * The document header, and every other row that spans rather than sits on the
 * tracks.
 *
 * TWO PARTS ON PURPOSE. The outer row is `max-content` wide so its background
 * covers the whole scrollable width — a spanning row that stopped at the
 * viewport edge would let the column rules show through it as soon as the grid
 * scrolled. The inner content is `sticky left: 0` so the Kind and the resource
 * name stay where they can be read instead of sliding away with the columns
 * they are heading.
 */
const SPANNING_ROW_SX = {
  width: '100%',
  borderTop: `1px solid ${componentTheme.borderSubtle}`,
  background: componentTheme.bgSubtle,
} as const;

const DOC_HEAD_SX = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '7px 16px',
  position: 'sticky',
  left: 0,
  width: 'min-content',
  minWidth: '100%',
  boxSizing: 'border-box',
} as const;

/**
 * The Kubernetes Kind, as a mono chip.
 *
 * A chip because a Kind and a ConfigHub deployment must never read as the same
 * kind of word on one screen: a Component's children are deployments, and
 * `Deployment` is also a Kind, and prose cannot hold both senses at once. The
 * chip is the separation.
 */
const KIND_CHIP_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 9.5,
  fontWeight: 700,
  letterSpacing: '.04em',
  color: componentTheme.fgMuted,
  background: componentTheme.bgDefault,
  border: `1px solid ${componentTheme.borderDefault}`,
  borderRadius: '3px',
  padding: '1px 5px',
  flex: 'none',
} as const;

const DOC_NAME_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 13,
  fontWeight: 600,
  color: componentTheme.fgDefault,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const DOC_COUNT_SX = {
  marginLeft: 'auto',
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  color: componentTheme.fgMuted,
  flex: 'none',
} as const;

/**
 * The unit header — one level up from `SPANNING_ROW_SX`/`DOC_HEAD_SX`, and
 * collapsible where those are not. `bgInset` rather than `bgSubtle` so the
 * nesting reads even with the border alone doing most of the work.
 */
const UNIT_HEAD_WRAP_SX = {
  width: '100%',
  borderTop: `1px solid ${componentTheme.borderDefault}`,
  background: componentTheme.bgInset,
} as const;

/**
 * The toggle itself. Same sticky-content trick as `DOC_HEAD_SX` (so the name
 * stays put while the pane scrolls sideways), but a real `<button>` — the
 * whole row is the hit target, exactly as a folder row's key cell is one in
 * `CompareGrid.tsx`.
 */
const UNIT_HEAD_SX = {
  // First, so it resets the <button>'s UA font without also resetting the
  // size and family the label span sets below — the shorthand wins because it
  // comes after them.
  font: 'inherit',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 16px',
  position: 'sticky',
  left: 0,
  width: 'min-content',
  minWidth: '100%',
  boxSizing: 'border-box',
  border: 0,
  background: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  '&:focus-visible': { outline: `2px solid ${componentTheme.accent}`, outlineOffset: '-2px' },
} as const;

const UNIT_NAME_SX = {
  fontFamily: componentTheme.fontMono,
  fontSize: 13,
  fontWeight: 700,
  color: componentTheme.fgDefault,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

const UNIT_COUNT_SX = {
  marginLeft: 'auto',
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  color: componentTheme.fgMuted,
  flex: 'none',
} as const;

/**
 * "not in prod, staging" — quiet, next to the unit name, not a warning. A
 * deployment simply not holding a unit is unremarkable; the note exists so a
 * reader who expected to see it here is not left wondering why it is gone,
 * not to flag a problem.
 */
const UNIT_MISSING_NOTE_SX = {
  fontFamily: componentTheme.fontSans,
  fontSize: 11,
  color: componentTheme.fgSubtle,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
} as const;

const EMPTY_SX = { padding: '22px 16px', textAlign: 'center' } as const;

/**
 * Four bars, the shipped idiom for a diff body that has nothing to show yet.
 *
 * Something has to be on screen during the wait: a pane that renders nothing for
 * twenty seconds reads as broken rather than busy, whatever the strip says.
 */
const SKELETON_ROWS = ['62%', '78%', '45%', '70%'] as const;

const shimmer = keyframes`
  0%, 100% { opacity: .55; }
  50% { opacity: 1; }
`;

const SR_ONLY: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** `dev`, `dev and edge-ap1`, `dev, edge-ap1 and staging`. */
function listDeployments(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

function ComponentCompareSectionInner({
  units,
  deploymentCount,
  onCommitStaged,
}: ComponentCompareSectionProps): ReactElement {
  const [filter, setFilter] = useState<CompareFieldFilter>('differing');
  const [stagedEdits, setStagedEdits] = useState<ReadonlyMap<string, StagedCompareEdit>>(
    () => new Map(),
  );
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);
  const [outcomes, setOutcomes] = useState<readonly DeploymentApplyOutcome[]>([]);
  /**
   * Which units are collapsed, keyed by unit slug. Lives here, not per
   * document group and not derived from `blocks`/`filter`/`stagedEdits`, so
   * it survives a column reorder, a filter flip or a variant-label change
   * untouched — none of those rebuild this state, only what it is read
   * against. Default expanded: a slug not in the set is open.
   */
  const [collapsedUnits, setCollapsedUnits] = useState<ReadonlySet<string>>(() => new Set());

  const toggleUnit = useCallback((slug: string) => {
    setCollapsedUnits((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  const stageEdit = useCallback((edit: StagedCompareEdit) => {
    setOutcomes([]);
    setStagedEdits((current) => {
      const next = new Map(current);
      const key = editKey(edit.deploymentId, edit.unitSlug, edit.identityPath);
      // Typing a value back to what it already was is not a pending change.
      if (edit.before !== undefined && edit.after === edit.before) next.delete(key);
      else next.set(key, edit);
      return next;
    });
  }, []);

  const discardAll = useCallback(() => {
    setStagedEdits(new Map());
    setOutcomes([]);
  }, []);

  const results = useMemo(
    () => units.map((unit) => ({ unit, result: buildCompareResult(unit.columns) })),
    [units],
  );

  const differingCount = results.reduce((sum, { result }) => sum + result.differingCount, 0);
  const totalCount = results.reduce((sum, { result }) => sum + result.totalCount, 0);
  const hasPositionalRows = results.some(({ result }) => result.hasPositionalRows);
  const unverifiableCount = results.reduce((sum, { result }) => sum + result.unverifiableCount, 0);

  /**
   * Deployments that hold a unit but have no configuration in it, named once
   * however many units they span. This is `empty-unit` only — a deployment
   * simply not holding a unit (`no-such-unit`) is a settled, unremarkable
   * fact, not a failure, so it lives in each unit's own `missingUnitColumns`
   * instead (read per-unit in `unitBlocks`, for the unit header's own note),
   * never here.
   *
   * Every count on this screen is a count over the deployments that ANSWERED, so
   * the ones that did not have to be named beside it. Without that, a column the
   * pane never read is indistinguishable from one that agreed.
   */
  const unansweredColumns = useMemo(
    () => [...new Set(results.flatMap(({ result }) => result.unansweredColumns))],
    [results],
  );

  /**
   * Deployments whose configuration has not arrived yet.
   *
   * While this is non-empty the pane knows nothing, and must say so in those
   * words. Every count below is zero for the ordinary reason that nothing has
   * been read — and zero rendered as a verdict is how "None of these deployments
   * holds configuration to compare" came to be asserted about data that arrived
   * two seconds later.
   */
  const loadingColumns = useMemo(
    () => [...new Set(results.flatMap(({ result }) => result.loadingColumns))],
    [results],
  );
  const isLoading = loadingColumns.length > 0;

  // Present tense, and named: a wait the reader can see the end of. Never
  // "could not be read", which is a verdict, and never a bare spinner, which
  // says nothing about what is being waited for. And never said about a
  // deployment that loaded fine and simply does not hold this unit — that is
  // `missingUnitColumns`, not this, and it is never a settled read failure.
  const unansweredNote = isLoading
    ? `reading ${listDeployments(loadingColumns)}…`
    : unansweredColumns.length
      ? `${listDeployments(unansweredColumns)} ${unansweredColumns.length === 1 ? 'holds' : 'hold'} no configuration to compare`
      : undefined;

  const blocks = useMemo(
    () =>
      results.flatMap(({ unit, result }) =>
        result.groups.map((group) => {
          // A row with a staged edit is PINNED into the list whatever the filter
          // says. Without this, staging an edit that makes a value agree with
          // the other columns deletes the row out from under the cursor that
          // just typed it.
          const pinned = new Set(
            [...stagedEdits.values()]
              .filter((edit) => edit.unitSlug === unit.slug)
              .map((edit) => edit.identityPath),
          );
          const rows: readonly CompareRow[] =
            filter === 'all'
              ? group.rows
              : (() => {
                  const kept = filterRows(group.rows);
                  if (pinned.size === 0) return kept;
                  const present = new Set(
                    kept.filter((row) => row.type === 'leaf').map((row) => row.identityPath),
                  );
                  const extra = group.rows.filter(
                    (row) => row.type === 'leaf' && pinned.has(row.identityPath) && !present.has(row.identityPath),
                  );
                  return extra.length === 0 ? kept : [...kept, ...extra];
                })();
          // Images are hoisted out of the grid, so they must not also appear in it.
          const imageRows = rows.filter(
            (row): row is CompareLeafRow => row.type === 'leaf' && containerImageOf(row) !== null,
          );
          const imagePaths = new Set(imageRows.map((row) => row.identityPath));
          const gridRows = rows.filter(
            (row) => row.type === 'folder' || !imagePaths.has(row.identityPath),
          );
          // Every ancestor of a pinned row is forced open. A pinned row inside
          // a collapsed folder cannot be seen or edited, so the pin would be
          // doing nothing — which is the failure it exists to prevent.
          const forceExpanded = new Set<string>();
          for (const row of gridRows) {
            if (row.type !== 'leaf' || !pinned.has(row.identityPath)) continue;
            for (const ancestor of ancestorPathsOf(
              gridRows.map((r) => ({ type: r.type, identityPath: r.identityPath, key: '', depth: r.depth })),
              row.identityPath,
            )) {
              forceExpanded.add(ancestor);
            }
          }
          return { key: `${unit.slug}:${group.docKey}`, unit, group, imageRows, gridRows, forceExpanded };
        }),
      )
        // Under Differing, a resource with nothing left to show is dropped
        // whole: a header over an empty body only says "0F" in a larger font.
        // Unverifiable and staged rows survive the row filter, so a resource
        // holding either one still shows.
        .filter((block) => filter === 'all' || block.imageRows.length > 0 || block.gridRows.length > 0),
    [results, filter, stagedEdits],
  );

  /**
   * `blocks`, folded one level: one entry per UNIT, each holding the document
   * groups that survived the filter above. A unit with none left (nothing
   * differs anywhere in it, under Differing) drops out entirely, same as a
   * document group already did — an empty card is not worth a collapse toggle.
   *
   * Grouped from `blocks`, not recomputed from `results`, so the two can never
   * disagree about which document groups exist for a unit.
   */
  const unitBlocks = useMemo(() => {
    const bySlug = new Map<string, typeof blocks>();
    const order: string[] = [];
    for (const block of blocks) {
      let forUnit = bySlug.get(block.unit.slug);
      if (!forUnit) {
        forUnit = [];
        bySlug.set(block.unit.slug, forUnit);
        order.push(block.unit.slug);
      }
      forUnit.push(block);
    }
    const differingBySlug = new Map(results.map(({ unit, result }) => [unit.slug, result.differingCount]));
    // PER UNIT, deliberately not flattened across every unit in the pane the
    // way the top note's `unansweredColumns` is — "not in prod" belongs to
    // the unit that is actually missing from prod, not to the whole pane.
    const missingBySlug = new Map(results.map(({ unit, result }) => [unit.slug, result.missingUnitColumns]));
    return order.map((unitSlug) => ({
      unitSlug,
      documentBlocks: bySlug.get(unitSlug) ?? [],
      // The whole unit's count, not just what is visible right now — this is
      // what stays on screen once the unit collapses, so it has to be the
      // number that does not change when the toggle does.
      differingCount: differingBySlug.get(unitSlug) ?? 0,
      missingFrom: missingBySlug.get(unitSlug) ?? [],
    }));
  }, [blocks, results]);

  // Unverifiable rows are rendered by both filters, so an empty body means
  // there is genuinely nothing to look at — including nothing unchecked.
  const shown = filter === 'all' ? totalCount : differingCount + unverifiableCount;

  // Every unit in the pane is compared across the same deployments, so the first
  // unit's columns are the slot order the footer reports in.
  const summaries = useMemo(
    () => summariseEdits([...stagedEdits.values()], units[0]?.columns ?? []),
    [stagedEdits, units],
  );
  const selected = useMemo(
    () => new Set(summaries.map((s) => s.deploymentId).filter((id) => !excluded.has(id))),
    [summaries, excluded],
  );

  /**
   * Write every selected deployment, then report each one separately.
   *
   * Sequential rather than concurrent: these are writes to production Spaces,
   * and a user reading a partial outcome is better served by an order they can
   * reason about than by saving a few hundred milliseconds.
   */
  const applyStaged = useCallback(async () => {
    if (!onCommitStaged) return;
    setApplying(true);
    const results: DeploymentApplyOutcome[] = [];
    const landed = new Set<string>();

    for (const unit of units) {
      for (const column of unit.columns) {
        if (!selected.has(column.deploymentId)) continue;
        const mine = [...stagedEdits.values()].filter(
          (edit) => edit.deploymentId === column.deploymentId && edit.unitSlug === unit.slug,
        );
        if (mine.length === 0) continue;

        if (!column.unitId) {
          results.push({
            deploymentId: column.deploymentId,
            label: column.label,
            displayName: column.displayName,
            ok: false,
            reason: 'this deployment has no unit to write to',
          });
          continue;
        }

        const merged = applyEditsToUnit(column.data, mine);
        if (!merged.ok) {
          results.push({
            deploymentId: column.deploymentId,
            label: column.label,
            displayName: column.displayName,
            ok: false,
            reason: `could not write ${merged.failedPaths.join(', ')}`,
          });
          continue;
        }

        let ok = false;
        // What went wrong belongs in the outcome, not in a swallowed catch: a
        // network drop and a refusal are different problems and the user is the
        // one who has to tell them apart.
        let thrown: string | undefined;
        try {
          ok = await onCommitStaged(column.unitId, column.deploymentId, {
            kind: 'patch-data',
            data: merged.data,
          });
        } catch (error: unknown) {
          ok = false;
          thrown = getApiErrorMessage(error);
        }
        results.push({
          deploymentId: column.deploymentId,
          label: column.label,
          displayName: column.displayName,
          ok,
          reason: ok ? undefined : (thrown ?? 'the server did not accept the write'),
        });
        if (ok) for (const edit of mine) landed.add(editKey(edit.deploymentId, edit.unitSlug, edit.identityPath));
      }
    }

    // Only what actually landed stops being staged. A refusal keeps its edits so
    // the user can see exactly what did not go, and retry it.
    setStagedEdits((current) => {
      const next = new Map(current);
      for (const key of landed) next.delete(key);
      return next;
    });
    setOutcomes(results);
    setApplying(false);
  }, [onCommitStaged, units, selected, stagedEdits]);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }} data-testid="component-compare-section">
      <CompareFilterStrip
        filter={filter}
        onFilterChange={setFilter}
        differingCount={differingCount}
        totalCount={totalCount}
        unverifiableCount={unverifiableCount}
        isLoading={isLoading}
        // The unanswered warning outranks the alignment one: it says the counts
        // beside it are incomplete, which changes how every other number reads.
        note={
          [unansweredNote, hasPositionalRows ? 'some lists align by position' : undefined]
            .filter(Boolean)
            .join(' · ') || undefined
        }
      />

      {/* The tracks are declared ONCE, here, so every document group in the pane
          inherits the same ones. Declaring them per grid would let a Deployment
          and a ConfigMap drift apart while each stayed internally consistent. */}
      <Box
        data-testid="compare-scroller"
        sx={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'auto',
          ...COMPARE_TRACK_VARS,
          '&::-webkit-scrollbar': { height: 9, width: 9 },
          '&::-webkit-scrollbar-thumb': { background: componentTheme.borderEdge, borderRadius: '999px' },
          '&::-webkit-scrollbar-track': { background: componentTheme.bgInset },
        }}
      >
        {/* One declared content width for every group in the pane: slack for the
            tracks to share below it, the scroll extent above it. */}
        <Box sx={{ minWidth: compareContentWidth(units[0]?.columns.length ?? 1) }}>
        {isLoading ? (
          <Box data-testid="compare-loading" aria-busy="true" aria-live="polite" sx={{ padding: '10px 16px' }}>
            <Box component="span" style={SR_ONLY}>
              {`Reading configuration from ${listDeployments(loadingColumns)}.`}
            </Box>
            {SKELETON_ROWS.map((width, index) => (
              <Box
                key={index}
                data-testid="compare-skeleton-row"
                sx={{
                  height: 12,
                  width,
                  marginBottom: '10px',
                  borderRadius: '3px',
                  background: componentTheme.bgInset,
                  animation: `${shimmer} 1.2s ease-in-out infinite`,
                  animationDelay: `${index * 90}ms`,
                  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
                }}
              />
            ))}
          </Box>
        ) : shown === 0 ? (
          <Box sx={EMPTY_SX} data-testid="compare-empty">
            <Box sx={{ fontSize: 13, fontWeight: 600, color: componentTheme.fgDefault }}>
              0 differences
            </Box>
            <Box sx={{ marginTop: '4px', fontSize: 12, color: componentTheme.fgMuted }}>
              {totalCount === 0
                ? 'None of these deployments holds configuration to compare.'
                : unansweredColumns.length
                  ? // Never claim agreement that covers a deployment nobody read.
                    // "All N fields agree across these 2 deployments" was being
                    // said about a deployment the pane had no configuration for.
                    // `unansweredColumns` here is only ever `empty-unit`, so say
                    // what is true of it: it holds the unit, empty.
                    `All ${totalCount} fields agree across the deployments that hold them. ${listDeployments(unansweredColumns)} ${
                      unansweredColumns.length === 1 ? 'has' : 'have'
                    } no configuration here, so ${
                      unansweredColumns.length === 1 ? 'it is' : 'they are'
                    } not covered by that.`
                  : `All ${totalCount} fields agree across these ${deploymentCount} deployments.`}
            </Box>
          </Box>
        ) : (
          unitBlocks.map(({ unitSlug, documentBlocks, differingCount: unitDifferingCount, missingFrom }) => {
            const open = !collapsedUnits.has(unitSlug);
            const contentId = `compare-unit-content-${unitSlug}`;
            return (
              <Box key={unitSlug} data-testid="compare-unit-group" data-unit-slug={unitSlug}>
                <Box sx={UNIT_HEAD_WRAP_SX}>
                  <Box
                    component="button"
                    type="button"
                    data-testid="compare-unit-header"
                    aria-expanded={open}
                    // Only while expanded — collapsed removes the content
                    // element from the DOM entirely, so pointing at its id
                    // then would name an element that does not exist.
                    aria-controls={open ? contentId : undefined}
                    onClick={() => toggleUnit(unitSlug)}
                    sx={UNIT_HEAD_SX}
                  >
                    <FoldChevron open={open} />
                    <Box component="span" title={unitSlug} sx={UNIT_NAME_SX}>
                      {unitSlug}
                    </Box>
                    {missingFrom.length > 0 ? (
                      <Box
                        component="span"
                        data-testid="compare-unit-missing-note"
                        title={`${listDeployments(missingFrom)} ${missingFrom.length === 1 ? 'does' : 'do'} not hold this unit`}
                        sx={UNIT_MISSING_NOTE_SX}
                      >
                        {`not in ${listDeployments(missingFrom)}`}
                      </Box>
                    ) : null}
                    {/* Stays on screen collapsed or not — it is what tells the
                        user what a collapsed unit is hiding. */}
                    <Box component="span" sx={UNIT_COUNT_SX}>{`${unitDifferingCount}F`}</Box>
                  </Box>
                </Box>
                {open ? (
                  <Box id={contentId}>
                    {documentBlocks.map(({ key, unit, group, imageRows, gridRows, forceExpanded }) => (
                      <Box key={key} data-testid="compare-document-group">
                        <Box sx={SPANNING_ROW_SX}>
                        <Box sx={DOC_HEAD_SX}>
                          {group.kind ? (
                            <Box component="span" sx={KIND_CHIP_SX} title={group.resourceType}>
                              {group.kind}
                            </Box>
                          ) : null}
                          <Box component="span" sx={DOC_NAME_SX}>
                            {group.kindIsAmbiguous && group.namespace
                              ? `${group.namespace}/${group.name}`
                              : (group.name ?? unit.slug)}
                          </Box>
                          <Box component="span" sx={DOC_COUNT_SX}>{`${group.differingCount}F`}</Box>
                        </Box>
                        </Box>
                        <Box sx={{ width: '100%', background: componentTheme.bgDefault }}>
                          <Box sx={{ position: 'sticky', left: 0, width: 'min-content', minWidth: '100%' }}>
                            <CompareImageRows columns={unit.columns} rows={imageRows} />
                          </Box>
                        </Box>
                        <CompareGrid
                          columns={unit.columns}
                          rows={gridRows}
                          forceExpanded={forceExpanded}
                          unitSlug={onCommitStaged ? unit.slug : undefined}
                          stagedEdits={stagedEdits}
                          onStageEdit={onCommitStaged ? stageEdit : undefined}
                          // One scope per document group, so a head drag can only
                          // land on a head from the SAME group — never a sibling
                          // group's, and never the selector row's.
                          dndScope={`grid:${key}`}
                        />
                      </Box>
                    ))}
                  </Box>
                ) : null}
              </Box>
            );
          })
        )}
        </Box>
      </Box>

      <CompareStagedFooter
        summaries={summaries}
        selected={selected}
        onToggle={(deploymentId) =>
          setExcluded((current) => {
            const next = new Set(current);
            if (next.has(deploymentId)) next.delete(deploymentId);
            else next.add(deploymentId);
            return next;
          })
        }
        onApply={() => void applyStaged()}
        onDiscard={discardAll}
        applying={applying}
        outcomes={outcomes}
      />
    </Box>
  );
}

export const ComponentCompareSection = memo(ComponentCompareSectionInner);
