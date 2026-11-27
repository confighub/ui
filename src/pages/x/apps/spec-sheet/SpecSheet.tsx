// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The All fields view of an open Unit: a spec sheet in the order of the stored document. Each
// resource starts with its identity; then each part of it (Metadata, Spec, the Pod, each
// container, Volumes) is a section of blocks, and every field is drawn exactly once.
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useGetUnitBlameQuery } from '@confighub/rtk-query';
import { Box, Popover, type PopoverActions } from '@mui/material';

import { SheetSkeleton } from './SheetSkeleton';
import { SheetInspect } from './SheetInspect';
import { componentTheme } from '../componentTheme';
import type { ComponentDeployment, MergedUnit, PaneUnit } from '../componentTypes';
import { isRemovalSentinel, isYamlToolchain, treeReadsDocuments } from '../componentValues';
import { parseUnitData } from '../configParser';
import { availableWholeResourceChanges, changesScopeKeys, fieldDiffKey, fieldStates } from '../entryBuilders';
import { UpgradingIcon } from '../flow-graph/DeploymentFlowNode';
import { type SheetCard, cardPx, intoColumns, resourceCards } from './cardColumns';
import { CommonTiles } from './CommonTiles';
import { FieldActions } from './FieldActions';
import { Part } from './Part';
import { PartBar } from './PartBar';
import { ResourceHead } from './ResourceHead';
import { SheetError } from './SheetError';
import { SheetPeek } from './SheetPeek';
import { withIncomingAdditions, withStagedAdds } from './incomingAdditions';
import { defaultFieldsOf, quietDefaultsOf } from './kubeDefaults';
import { joinBlame } from './sheetOrigin';
import { type SheetOverlay, SheetOverlayContext, type UpstreamSide, isQuiet } from './sheetOverlay';
import { WIDE_MIN_PX, sheetSx } from './sheetStyles';
import { unreleasedKeysOf } from './unreleasedKeys';
import { useSearchHighlight } from './searchHighlight';
import { landInView } from './landInView';
import {
  type SheetAtom,
  type SheetPart,
  type SpecSheet as SpecSheetModel,
  atomKeyInBlock,
  atomText,
  buildSpecSheet,
  filterSpecSheet,
} from './specSheetModel';
import type { StagingState } from './staging/stagingReducer';
import { isStagedDeleteSentinel } from './staging/types';
import { useSheetPeek } from './useSheetPeek';
import { variantValues } from './variantValues';

export type SheetScope = 'all' | 'incoming' | 'changes' | 'local' | 'kept';

interface SpecSheetProps {
  unit: MergedUnit;
  filterText: string;
  /** All fields, or the fields of one scope of the scope control. */
  scope?: SheetScope;
  /** What this Unit has staged: the Changes scope holds it. */
  staging?: StagingState;
  /** A read about this Unit failed (its upgrade preview): the values stay, one line says so. */
  readError?: boolean;
  /** Tick or untick one incoming field (the Incoming scope). */
  onToggleUpgrade?: (key: string) => void;
  /** The Unit's configuration is still being read: skeleton lines, never "No configuration data". */
  dataLoading?: boolean;
  /** A ChangeSet view: nothing can be ticked or edited. */
  readOnly?: boolean;
  /** The Variants of the Component and their Units, for the Variants list of Inspect. */
  deployments?: readonly ComponentDeployment[];
  unitsByDeployment?: ReadonlyMap<string, PaneUnit[]>;
  /** Told which fields the Kept on merge scope holds, so the footer can stop keeping them. */
  onKeptKeys?: (keys: string[]) => void;
  /** Told how many fields match the search (undefined: no search, or the sheet is gone). */
  onMatchCount?: (count: number | undefined) => void;
  /** Told when the read of where each field comes from fails or recovers (the Unit header shows it). */
  onOriginError?: (failed: boolean) => void;
  /** Editing: each only stages; the commit writes. Absent: the sheet is read-only. */
  onStageEdit?: (key: string, value: string, add?: boolean) => void;
  onUnstageEdit?: (key: string) => void;
  onToggleRemove?: (key: string) => void;
  onSetProtection?: (key: string, keep: boolean, committed: boolean) => void;
  /** Whether a bare path is kept on merge now. */
  isProtected?: (path: string) => boolean;
}

const NEVER_KEPT = () => false;
const NOOP = () => undefined;

const SCOPE_EMPTY: Record<Exclude<SheetScope, 'all'>, string> = {
  incoming: 'Nothing incoming',
  kept: 'Nothing kept on merge',
  changes: 'No changes',
  local: 'No local overrides',
};

const NO_KEYS: ReadonlySet<string> = new Set();

/** Origin and Stale / Unreleased marks for the open Unit. Blame never holds the sheet back. */
function useOverlay(unit: MergedUnit) {
  const blame = useGetUnitBlameQuery({ spaceId: unit.spaceId, unitId: unit.unitId });
  const origins = useMemo(
    () => (blame.data ? joinBlame(blame.data, unit.data, unit.unitId) : undefined),
    [blame.data, unit.data, unit.unitId],
  );
  const stale = fieldStates(unit).incomingKeys;
  const unreleased = useMemo(() => unreleasedKeysOf(unit, origins), [unit, origins]);
  const overlay = useMemo<SheetOverlay>(
    () => ({ origins: blame.isError ? new Map() : origins, stale, unreleased }),
    [origins, stale, unreleased, blame.isError],
  );
  return { overlay, isError: blame.isError, refetch: blame.refetch };
}

function atomMatches(atom: SheetAtom, needle: string): boolean {
  return (
    atom.path.toLowerCase().includes(needle) || atomText(atom).toLowerCase().includes(needle)
  );
}

interface SearchResult {
  /** Block ids with no match. */
  hiddenBlocks: Set<string>;
  hiddenParts: Set<string>;
  hiddenResources: Set<string>;
  /** Part ids with a match, mounted at once so the result shows. */
  matchedParts: Set<string>;
  /** The fields with a match, in their key, value or path. */
  matchCount: number;
  any: boolean;
}

/** The width of each of the two columns, in steps of 20px; 0 while the sheet is narrower than WIDE. */
function useColumnWidth(el: HTMLElement | null): number {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const sheet = entry.contentRect.width;
      // The sheet less the columns' side padding (12px each) and their gap (20px), halved.
      setWidth(sheet < WIDE_MIN_PX ? 0 : Math.floor((sheet - 44) / 2 / 20) * 20);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return width;
}

/** Search runs on the model, not the page, so it finds parts that have not mounted yet. */
function search(sheet: SpecSheetModel, text: string): SearchResult | undefined {
  const needle = text.trim().toLowerCase();
  if (!needle) return undefined;
  const result: SearchResult = {
    hiddenBlocks: new Set(),
    hiddenParts: new Set(),
    hiddenResources: new Set(),
    matchedParts: new Set(),
    matchCount: 0,
    any: false,
  };
  for (const resource of sheet.resources) {
    const headMatches = [resource.kindAtom, resource.nameAtom, resource.apiVersionAtom].filter(
      (a) => a && atomMatches(a, needle),
    ).length;
    result.matchCount += headMatches;
    const headMatch = headMatches > 0;
    let resourceMatch = headMatch;
    for (const part of resource.parts) {
      let partMatch = false;
      for (const block of part.blocks) {
        const atomHits = block.atoms.filter((a) => atomMatches(a, needle)).length;
        result.matchCount += atomHits;
        const match = block.label.toLowerCase().includes(needle) || atomHits > 0;
        if (match) partMatch = true;
        else result.hiddenBlocks.add(block.id);
      }
      if (partMatch) result.matchedParts.add(part.id);
      else result.hiddenParts.add(part.id);
      resourceMatch ||= partMatch;
    }
    if (!resourceMatch) result.hiddenResources.add(resource.id);
    result.any ||= resourceMatch;
  }
  return result;
}

export const SpecSheet = memo(function SpecSheet({
  unit,
  filterText,
  scope = 'all',
  staging,
  readError = false,
  dataLoading = false,
  onOriginError,
  onKeptKeys,
  onMatchCount,
  readOnly = false,
  deployments,
  unitsByDeployment,
  onToggleUpgrade,
  onStageEdit,
  onToggleRemove,
  onUnstageEdit,
  onSetProtection,
  isProtected = NEVER_KEPT,
}: SpecSheetProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [addingBlockId, setAddingBlockId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{
    anchor: HTMLElement;
    key: string;
    path: string;
    value: string;
  } | null>(null);
  const { data, toolchainType } = unit;
  const { overlay: baseOverlay, isError, refetch } = useOverlay(unit);
  useEffect(() => {
    onOriginError?.(isError);
  }, [isError, onOriginError]);
  // A sheet that closes reads nothing any more: the header does not keep its failed read, and a
  // sheet that opens again reads again (Retry included).
  const onOriginErrorRef = useRef(onOriginError);
  onOriginErrorRef.current = onOriginError;
  useEffect(() => () => onOriginErrorRef.current?.(false), []);
  const states = fieldStates(unit);
  const guardedKeys = unit.upgradeEntry?.guardedKeys;
  const guardTitles = useMemo(
    () =>
      new Map(
        (guardedKeys ?? []).map((g) => [
          g.key,
          `${g.guards.map((guard) => `guard ${guard}`).join(', ')}${g.inherited ? ' (inherited)' : ''} keeps it`,
        ]),
      ),
    [guardedKeys],
  );
  const wholeChanges = unit.upgradeEntry?.wholeResourceChanges;
  const availableWhole = useMemo(
    () => new Set(availableWholeResourceChanges(unit.upgradeEntry).map((c) => c.key)),
    [unit.upgradeEntry],
  );
  const wholeAvailability = useMemo(
    () =>
      new Map((wholeChanges ?? []).map((c) => [c.key, availableWhole.has(c.key)] as const)),
    [wholeChanges, availableWhole],
  );
  const staged = staging?.upgrades;
  const editOverlay = useMemo(
    () =>
      onStageEdit
        ? {
            editingKey,
            open: (key: string) => {
              setAddingBlockId(null);
              setEditingKey(key);
            },
            close: () => {
              setEditingKey(null);
              setAddingBlockId(null);
            },
            stage: (key: string, value: string, add?: boolean) => {
              onStageEdit(key, value, add);
              setEditingKey(null);
              setAddingBlockId(null);
            },
            unstage: (key: string) => {
              onUnstageEdit?.(key);
              setEditingKey(null);
            },
            setKeep: (key: string, keep: boolean, committed: boolean) =>
              onSetProtection?.(key, keep, committed),
            addingBlockId,
            openAdd: (blockId: string) => {
              setEditingKey(null);
              setAddingBlockId(blockId);
            },
            edits: staging?.edits ?? new Map<string, string>(),
            adds: staging?.adds ?? NO_KEYS,
            protection: staging?.protection ?? new Map<string, boolean>(),
            isKept: isProtected,
          }
        : undefined,
    [
      onStageEdit,
      onUnstageEdit,
      onSetProtection,
      editingKey,
      addingBlockId,
      staging,
      isProtected,
    ],
  );
  // One tick per change: the keys of a list element added or deleted whole are ticked as one,
  // on the element's `value` (or its last key), and the others show as plain text.
  const changeKeys = useMemo(() => {
    const byChange = new Map<string, string[]>();
    for (const key of states.incomingKeys) {
      const change = states.changeOf.get(key);
      if (change === undefined) continue;
      byChange.set(change, [...(byChange.get(change) ?? []), key]);
    }
    const membersOf = new Map<string, string[]>();
    const secondary = new Set<string>();
    for (const keys of byChange.values()) {
      if (keys.length < 2) continue;
      const primary = keys.find((k) => /(^|\.)value$/.test(k)) ?? keys[keys.length - 1];
      for (const k of keys) {
        membersOf.set(k, keys);
        if (k !== primary) secondary.add(k);
      }
    }
    return { membersOf, secondary };
  }, [states.incomingKeys, states.changeOf]);
  const toggleChange = useCallback(
    (key: string) => {
      if (!onToggleUpgrade) return;
      const on = !(staged?.has(key) ?? false);
      for (const k of changeKeys.membersOf.get(key) ?? [key]) {
        if ((staged?.has(k) ?? false) !== on) onToggleUpgrade(k);
      }
    },
    [onToggleUpgrade, staged, changeKeys],
  );
  const overlay = useMemo<SheetOverlay>(
    () =>
      scope === 'incoming' && (onToggleUpgrade || readOnly)
        ? {
            ...baseOverlay,
            incoming: {
              keys: states.incomingKeys,
              staged: staged ?? new Set(),
              whole: wholeAvailability,
              guardTitles,
              blocked: states.blockedDeleteKeys,
              guarded: states.guardedKeys,
              upstream: states.upstreamValues,
              secondary: changeKeys.secondary,
              onToggle: onToggleUpgrade ? toggleChange : NOOP,
              readOnly,
            },
          }
        : { ...baseOverlay, edit: editOverlay },
    [baseOverlay, scope, onToggleUpgrade, readOnly, states, staged, editOverlay, changeKeys, toggleChange, wholeAvailability, guardTitles],
  );
  const fullSheet = useMemo(
    () =>
      treeReadsDocuments(toolchainType)
        ? buildSpecSheet(data, { scopedWritesSupported: isYamlToolchain(toolchainType) })
        : buildSpecSheet(data, { flatValues: parseUnitData(data) }),
    [data, toolchainType],
  );
  // A scope keeps its fields in document order, with the heads of the parts that hold one.
  const scopeKeys = useMemo(() => {
    if (scope === 'incoming') return states.incomingKeys;
    if (scope === 'kept') {
      const keys = new Set<string>();
      for (const a of fullSheet.atoms) {
        const stagedKeep = staging?.protection.get(a.key);
        if (stagedKeep ?? isProtected(a.path))
          if (!/\.\d+(\.|$)/.test(a.path)) keys.add(a.key);
      }
      return keys;
    }
    if (scope === 'local') {
      const v = unit.variationEntry;
      return new Set([
        ...(v?.fieldDiffs.map(fieldDiffKey) ?? []),
        ...(v?.localOnlyKeys ?? []),
      ]);
    }
    if (scope === 'changes') return changesScopeKeys(overlay.unreleased);
    return undefined;
  }, [
    scope,
    unit.variationEntry,
    overlay.unreleased,
    staging,
    states.incomingKeys,
    fullSheet,
    isProtected,
  ]);
  useEffect(() => {
    if (scope === 'kept' && scopeKeys) onKeptKeys?.([...scopeKeys]);
  }, [scope, scopeKeys, onKeptKeys]);
  // The keys this person adds show in their block before they are written.
  const stagedAdds = staging?.adds;
  const stagedEdits = staging?.edits;
  const drawnSheet = useMemo(
    () => (stagedAdds && stagedEdits && scope !== 'incoming' ? withStagedAdds(fullSheet, stagedAdds, stagedEdits) : fullSheet),
    [fullSheet, stagedAdds, stagedEdits, scope],
  );
  const sheet = useMemo(() => {
    if (!scopeKeys) return drawnSheet;
    const base =
      scope === 'incoming'
        ? withIncomingAdditions(
            fullSheet,
            states.incomingKeys,
            wholeChanges ?? [],
            availableWhole,
            states.upstreamValues,
          )
        : drawnSheet;
    return filterSpecSheet(base, (a) => scopeKeys.has(a.key));
  }, [fullSheet, drawnSheet, scopeKeys, scope, states.incomingKeys, wholeChanges, availableWhole, states.upstreamValues]);
  const deferredFilter = useDeferredValue(filterText);
  const found = useMemo(() => search(sheet, deferredFilter), [sheet, deferredFilter]);
  const defaultFields = useMemo(() => defaultFieldsOf(sheet), [sheet]);
  // A Stale field's card says what upstream has in every scope, not only in Incoming, which
  // draws the incoming value on the line and its own card.
  const upstream = useMemo(() => {
    if (overlay.incoming) return undefined;
    const out = new Map<string, UpstreamSide>();
    for (const atom of sheet.atoms) {
      if (!overlay.stale.has(atom.key)) continue;
      const blocked = states.blockedDeleteKeys.has(atom.key);
      const held = blocked || states.guardedKeys.has(atom.key);
      const value = states.upstreamValues.get(atom.key);
      if (value === undefined && !blocked) continue;
      const removed = blocked || (value !== undefined && isRemovalSentinel(value));
      out.set(atom.key, {
        kind: held ? 'held' : removed ? 'removed' : 'incoming',
        current: atomText(atom),
        value: removed ? 'deleted upstream' : (value ?? ''),
        testKey: atom.testKey,
      });
    }
    return out;
  }, [overlay.incoming, overlay.stale, sheet.atoms, states.blockedDeleteKeys, states.guardedKeys, states.upstreamValues]);
  const sheetOverlay = useMemo<SheetOverlay>(
    () => ({ ...overlay, defaults: quietDefaultsOf(defaultFields, sheet, overlay, !!found), upstream }),
    [overlay, defaultFields, sheet, found, upstream],
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  // The callback is a new function on each render of the pane: only the count drives the effect.
  const onMatchCountRef = useRef(onMatchCount);
  onMatchCountRef.current = onMatchCount;
  const matchCount = found?.matchCount;
  useEffect(() => {
    onMatchCountRef.current?.(matchCount);
  }, [matchCount]);
  useEffect(() => () => onMatchCountRef.current?.(undefined), []);
  // Read only while Inspect is open: the field in each Variant's Unit, by resource and path.
  const inspectVariants = useMemo(() => {
    if (!inspect || !deployments || !unitsByDeployment) return undefined;
    const resource = fullSheet.resources.find((r) =>
      r.parts.some((p) => p.blocks.some((b) => b.atoms.some((a) => a.key === inspect.key))),
    );
    return variantValues(
      { kind: resource?.kind, name: resource?.name, path: inspect.path },
      unit.slug,
      unit.spaceId,
      deployments,
      unitsByDeployment,
    );
  }, [inspect, deployments, unitsByDeployment, fullSheet, unit.slug, unit.spaceId]);
  // Inspect's title: the field as the sheet labels it. A field of a list item has no such label
  // (env.3.value); then the path alone names it.
  const inspectLabel = useMemo(() => {
    if (!inspect) return undefined;
    for (const r of fullSheet.resources)
      for (const p of r.parts)
        for (const b of p.blocks) {
          const atom = b.atoms.find((a) => a.key === inspect.key);
          if (!atom) continue;
          const rel = atomKeyInBlock(atom, b);
          if (rel === '' || b.atoms.length === 1) return b.label;
          return rel.split('.').some((seg) => /^\d+$/.test(seg)) ? undefined : `${b.label} · ${rel}`;
        }
    return undefined;
  }, [inspect, fullSheet]);
  // Inspect grows when its history is read; the popover moves so it stays on screen.
  const inspectPopover = useRef<PopoverActions | null>(null);
  const updateInspectPosition = useCallback(() => inspectPopover.current?.updatePosition(), []);
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null);
  const { target: peekTarget, openOn, close: closePeek, cardEnter, cardLeave } = useSheetPeek(rootEl);
  useSearchHighlight(rootEl, deferredFilter);
  const columnWidth = useColumnWidth(rootEl);
  const twoColumns = columnWidth > 0;
  // A quiet init container folds to one line; until the origins are read, it counts as folded,
  // so the columns do not change when they are.
  const origins = overlay.origins;
  // The cards of each resource in two columns, levelled on the cards the search leaves.
  const columns = useMemo(() => {
    if (!columnWidth) return undefined;
    const folded = (p: SheetPart) =>
      p.kind === 'init' && !found?.matchedParts.has(p.id) && (!origins || isQuiet(overlay, p));
    const isHidden = (b: { id: string }) => !!found?.hiddenBlocks.has(b.id);
    const cardHidden = (c: SheetCard) =>
      !!found &&
      (found.hiddenParts.has(c.part.id) ||
        (c.split ? isHidden(c.split) : c.part.blocks.every((b) => c.omit?.has(b.id) || isHidden(b))));
    return new Map(
      sheet.resources.map((r) => {
        const cards = resourceCards(r).map((c) => ({ ...c, hidden: cardHidden(c) }));
        return [r.id, intoColumns(cards, (c) => (c.hidden ? 0 : cardPx(c, columnWidth, isHidden, folded)))] as const;
      }),
    );
    // `origins` stands for the overlay: only whether a part is quiet is read from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnWidth, sheet, found, origins]);
  // Marks the value whose card is open, so the styles can hide its block's actions meanwhile.
  const peekEl = inspect ? undefined : peekTarget?.el;
  useEffect(() => {
    if (!peekEl) return;
    peekEl.setAttribute('data-peek-open', '');
    return () => peekEl.removeAttribute('data-peek-open');
  }, [peekEl]);
  // Parts a tile or a chip asked for: they mount now, so the field can take focus.
  const [jumpParts, setJumpParts] = useState<ReadonlySet<string>>(new Set());
  const scrollToSection = useCallback((testId: string) => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!el) return;
    // It lands 12px clear of the sticky stack (the sections' scroll margin), after the chrome settles.
    landInView(el, 'start', rootRef.current);
  }, []);
  const jumpTo = useCallback(
    (atom: SheetAtom) => {
      const part = sheet.resources
        .flatMap((r) => r.parts)
        .find((p) => p.blocks.some((b) => b.atoms.includes(atom)));
      if (part)
        setJumpParts((prev) => (prev.has(part.id) ? prev : new Set(prev).add(part.id)));
      // The part mounts on the next paint; then the value scrolls into view and takes focus.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = rootRef.current?.querySelector<HTMLElement>(
            `[data-stage-key="${CSS.escape(atom.key)}"]`,
          );
          if (!el) return;
          landInView(el, 'center', rootRef.current);
          el.focus({ preventScroll: true });
          openOn(el);
        }),
      );
    },
    [sheet, openOn],
  );

  // The Unit's configuration has not been read yet: skeleton lines, never "No configuration data".
  if (dataLoading && !data) {
    return (
      <SheetSkeleton />
    );
  }

  if (scope !== 'all' && sheet.atoms.length === 0) {
    return (
      <Box
        data-testid='scope-empty'
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 2,
          py: 1.75,
          fontSize: 12.5,
          fontFamily: componentTheme.fontSans,
          color: componentTheme.fgMuted,
          bgcolor: componentTheme.bgDefault,
          opacity: 1,
        }}
      >
        <Box
          component='span'
          sx={{
            width: 24,
            height: 24,
            borderRadius: `${componentTheme.radiusSm}px`,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: componentTheme.bgInset,
            color: componentTheme.fgSubtle,
            flexShrink: 0,
            '& svg': { width: 12, height: 12 },
          }}
        >
          <UpgradingIcon />
        </Box>
        <span>{SCOPE_EMPTY[scope]}</span>
      </Box>
    );
  }

  if (sheet.atoms.length === 0 || (found && !found.any)) {
    return (
      <Box
        data-testid='field-empty'
        sx={{
          px: 2,
          py: 2,
          fontSize: 12,
          fontFamily: componentTheme.fontSans,
          color: componentTheme.fgMuted,
          fontStyle: 'italic',
        }}
      >
        {found ? `No matches for "${deferredFilter.trim()}"` : 'No configuration data'}
      </Box>
    );
  }

  return (
    <SheetOverlayContext.Provider value={sheetOverlay}>
      {(isError || readError) && <SheetError onRetry={refetch} />}
      <Box
        data-testid='field-sheet'
        className={twoColumns ? 'sheet two' : 'sheet'}
        sx={sheetSx}
        ref={(el: HTMLDivElement | null) => {
          rootRef.current = el;
          setRootEl(el);
        }}
      >
        <PartBar resources={sheet.resources} rootRef={rootRef} onSelect={scrollToSection} />
        {sheet.resources.map((resource) => {
          const cols = columns?.get(resource.id);
          return (
            <section
              key={resource.id}
              className={resource.whole ? 'res whole' : 'res'}
              data-testid={`res-${resource.id}`}
              data-hidden={found?.hiddenResources.has(resource.id) ? 'true' : undefined}
            >
              {resource.structured && <ResourceHead resource={resource} />}
              {scope === 'all' && !found && <CommonTiles resource={resource} onJump={jumpTo} />}
              {cols ? (
                <div className='cols' data-testid={`cols-${resource.id}`}>
                  {cols.map((column, i) => (
                    <div key={i} className='col'>
                      {column.map((card) => (
                        <Part
                          key={card.id}
                          part={card.part}
                          split={card.split}
                          omit={card.omit}
                          forceMount={!!found?.matchedParts.has(card.part.id) || jumpParts.has(card.part.id)}
                          hiddenBlocks={found?.hiddenBlocks}
                          hidden={card.hidden}
                          resourceKind={resource.kind}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                resource.parts.map((part) => (
                  <Part
                    key={part.id}
                    part={part}
                    forceMount={!!found?.matchedParts.has(part.id) || jumpParts.has(part.id)}
                    hiddenBlocks={found?.hiddenBlocks}
                    hidden={found?.hiddenParts.has(part.id)}
                    resourceKind={resource.kind}
                  />
                ))
              )}
            </section>
          );
        })}
      </Box>
      <SheetPeek
        target={inspect ? null : peekTarget}
        overlay={sheetOverlay}
        onCardEnter={cardEnter}
        onCardLeave={cardLeave}
        onClose={closePeek}
        actions={
          editOverlay && peekTarget ? (
            <FieldActions
              kept={staging?.protection.get(peekTarget.key) ?? isProtected(peekTarget.path)}
              keepDisabled={!onSetProtection || /\.\d+(\.|$)/.test(peekTarget.path)}
              removed={isStagedDeleteSentinel(staging?.edits.get(peekTarget.key))}
              inspectOpen={false}
              onEdit={
                // Edit does what a click on the value does, so it is offered only where the value
                // is a button (it has an editor).
                peekTarget.el.getAttribute('role') === 'button'
                  ? () => {
                      const el = peekTarget.el;
                      closePeek();
                      el.click();
                    }
                  : undefined
              }
              onToggleKeep={() => {
                const committed = isProtected(peekTarget.path);
                const now = staging?.protection.get(peekTarget.key) ?? committed;
                onSetProtection?.(peekTarget.key, !now, committed);
                // Done: the card gets out of the way of the rows under it, and the focus goes back
                // to the value, so it is not lost with the card's buttons.
                peekTarget.el.focus({ preventScroll: true });
                closePeek();
              }}
              onToggleRemove={() => {
                onToggleRemove?.(peekTarget.key);
                peekTarget.el.focus({ preventScroll: true });
                closePeek();
              }}
              onInspect={() => {
                // Inspect takes the card's place: the card closes while Inspect is open.
                setInspect({
                  anchor: peekTarget.el,
                  key: peekTarget.key,
                  path: peekTarget.path,
                  value: peekTarget.el.textContent ?? '',
                });
                closePeek();
              }}
            />
          ) : undefined
        }
      />
      <Popover
        open={!!inspect}
        action={inspectPopover}
        anchorEl={inspect?.anchor}
        onClose={() => setInspect(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusMd}px`,
              boxShadow: componentTheme.shadowMd,
            },
          },
        }}
      >
        {inspect && (
          <SheetInspect
            spaceId={unit.spaceId}
            unitId={unit.unitId}
            spaceSlug={deployments?.find((d) => d.deploymentId === unit.spaceId)?.slug ?? ''}
            unitLabel={[deployments?.find((d) => d.deploymentId === unit.spaceId)?.slug, unit.slug].filter(Boolean).join('/')}
            path={inspect.path}
            label={inspectLabel}
            fullPath={overlay.origins?.get(inspect.key)?.fullPath ?? inspect.path}
            variants={inspectVariants}
            onClose={() => setInspect(null)}
            onResize={updateInspectPosition}
          />
        )}
      </Popover>
    </SheetOverlayContext.Provider>
  );
});
