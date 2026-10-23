// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { PaneResizeHandle } from '@/components/group-nav';
import DataObjectIcon from '@mui/icons-material/DataObject';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardDoubleArrowLeftIcon from '@mui/icons-material/KeyboardDoubleArrowLeft';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';

import { plainKey } from '../keys/usePageShortcuts';
import { LIVE_COUNT_ROW_LIMIT, liveCountsOffText } from '../model/counts';
import { fieldById } from '../model/fields';
import { lensProblem, lensesToConjuncts } from '../model/lens-compile';
import type { FieldLens, Lens } from '../model/types';
import { formatWhereText } from '../model/where/format';
import {
  RESOURCE_TYPE_KEY,
  WHERE_DATA_KEY,
  useServerMatchStatus,
} from '../queries/useServerMatchSets';
import {
  type Shortcut,
  useExplorerContext,
  useRegisterShortcut,
  useRegisterSlot,
} from '../state/context';
import { newId } from '../state/initial';
import { useResults } from '../state/results-context';
import type { ColumnPrefs } from '../state/storage';
import { useActiveTab, useWork } from '../state/useExplorer';
import { TextMode } from '../text/TextMode';
import { useTextModeToggle } from '../text/useTextModeToggle';
import { AddLensBox } from './AddLensBox';
import { GroupSection } from './GroupSection';
import { LensPopover } from './LensPopover';
import { LensRail } from './LensRail';
import { LensLine, LensRow } from './LensRow';
import { SortSection } from './SortSection';
import { inLensLayer, modKey, noun } from './layer';
import { Kbd, Section } from './parts';
import { useLensData } from './useLensData';

/**
 * The left column: what the view shows (its filters, as lenses), how it is
 * grouped and how it is sorted, edited in place on live rows.
 *
 * Width: 260 px by default, 240–440 by dragging its right edge (double-click
 * resets), folded to a 36 px rail with `\` or «. Below 1360 px of viewport it
 * starts folded, and when opened it floats over the table, so the table keeps
 * its width; one click outside closes it and still does what the click was
 * for. The width and the folded state are kept per viewer in this browser.
 *
 * In text mode the filter section becomes the WHERE editor and the column is
 * 360 px wide (the viewer's own width comes back with lenses); switching to
 * text opens a folded column.
 */

export const COLUMN_DEFAULT_WIDTH = 260;
const COLUMN_MIN = 240;
const COLUMN_MAX = 440;
const RAIL_WIDTH = 36;
const TEXT_WIDTH = 360;
const NARROW_QUERY = '(max-width:1359.95px)';

const clampWidth = (w: number) => Math.min(COLUMN_MAX, Math.max(COLUMN_MIN, Math.round(w)));

export function LensColumn() {
  const { state, dispatch, storage, slots } = useExplorerContext();
  const tab = useActiveTab();
  const work = useWork();
  const server = useServerMatchStatus(work);
  useTextModeToggle();
  const { derived, preview, setPreview } = useResults();
  const data = useLensData();
  const narrow = useMediaQuery(NARROW_QUERY, { noSsr: true });

  const [prefs, setPrefs] = useState(() => storage.readColumn());
  const [width, setWidth] = useState(() => clampWidth(prefs.width ?? COLUMN_DEFAULT_WIDTH));
  // Below 1360 px the column opens only if the viewer left it open there
  // before; that choice is kept apart from the wide layout's.
  const [floatOpen, setFloatOpen] = useState(() => prefs.narrowOpen === true);
  // Text mode opened a column the viewer had folded; folding it again clears this.
  const [forcedOpen, setForcedOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState<string | null>(null);
  // Half-typed add-box text by tab: kept across tab switches and text mode; a new tab starts empty.
  const [composerTexts, setComposerTexts] = useState<ReadonlyMap<string, string>>(new Map());
  const [resizing, setResizing] = useState(false);
  const [edit, setEdit] = useState<{ id: string; anchor: HTMLElement } | null>(null);
  const [entering, setEntering] = useState<ReadonlySet<string>>(new Set());
  const [showStored, setShowStored] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const columnRef = useRef<HTMLElement | null>(null);
  const drag = useRef({ start: width, moved: 0 });

  const textMode = state.mode === 'text';
  const tabId = tab.id;
  const setComposerText = useCallback(
    (text: string) => setComposerTexts((m) => new Map(m).set(tabId, text)),
    [tabId],
  );
  // Switching to text opens the column (React's pattern for state that follows a prop).
  const [seenMode, setSeenMode] = useState(state.mode);
  if (seenMode !== state.mode) {
    setSeenMode(state.mode);
    if (state.mode === 'text') {
      if (narrow) setFloatOpen(true);
      else setForcedOpen(true);
    } else setForcedOpen(false);
  }

  // Wide: folded only when the viewer folded it. Narrow: folded unless opened to float.
  const collapsed = narrow ? !floatOpen : prefs.collapsed === true && !forcedOpen;
  const floating = narrow && floatOpen;
  const shownWidth = textMode ? Math.max(width, TEXT_WIDTH) : width;

  const savePrefs = useCallback(
    (next: ColumnPrefs) => {
      const merged = { ...prefs, ...next };
      storage.writeColumn(merged);
      setPrefs(merged);
    },
    [prefs, storage],
  );

  /** Open the column now (synchronously, so a focus that follows finds the input). */
  const expand = useCallback(() => {
    flushSync(() => {
      if (narrow) setFloatOpen(true);
      else savePrefs({ collapsed: false, chosen: true });
    });
  }, [narrow, savePrefs]);

  const toggleCollapsed = useCallback(() => {
    setEdit(null);
    setForcedOpen(false);
    if (narrow) {
      setFloatOpen(!floatOpen);
      savePrefs({ narrowOpen: !floatOpen });
    } else savePrefs({ collapsed: !collapsed, chosen: true });
  }, [narrow, floatOpen, collapsed, savePrefs]);

  const focusAddLens = useCallback(() => {
    if (!inputRef.current) expand();
    if (!inputRef.current) return false;
    inputRef.current.focus();
    return true;
  }, [expand]);
  useRegisterSlot('focusAddLens', focusAddLens);

  const setMode = useCallback(
    (mode: 'lenses' | 'text') => dispatch({ type: 'setMode', mode }),
    [dispatch],
  );

  const onAdd = useCallback(
    (lenses: Lens[]) => {
      setEntering(new Set(lenses.map((l) => l.id)));
      dispatch({ type: 'addLenses', lenses });
    },
    [dispatch],
  );

  /** "Filter on <column>…" from the table: a new lens on that field, its editor open, no values yet. */
  const startLens = useCallback(
    ({ field }: { field: string }) => {
      const def = fieldById(work.entity, field);
      if (!def || !def.ops.length) return;
      if (collapsed) expand();
      if (state.mode === 'text') setMode('lenses');
      const lens: FieldLens = {
        id: newId('lens'),
        enabled: true,
        kind: 'field',
        field,
        op: def.ops.includes('is') ? 'is' : def.ops[0],
        values: [],
      };
      setPendingOpen(lens.id);
      onAdd([lens]);
    },
    [work.entity, collapsed, expand, state.mode, setMode, onAdd],
  );
  useRegisterSlot('startLens', startLens);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        id: 'focus-add-lens',
        keys: '/',
        label: 'Add a filter',
        matches: plainKey('/'),
        run: () => void focusAddLens(),
      },
      {
        id: 'toggle-column',
        keys: '\\',
        label: 'Fold or open the filter column',
        matches: plainKey('\\'),
        run: toggleCollapsed,
      },
    ],
    [focusAddLens, toggleCollapsed],
  );
  useRegisterShortcut(shortcuts[0]);
  useRegisterShortcut(shortcuts[1]);

  const onEye = useCallback(
    (lensId: string, e: MouseEvent) =>
      dispatch(e.altKey ? { type: 'soloLens', lensId } : { type: 'toggleLens', lensId }),
    [dispatch],
  );

  const openLens = useCallback(
    (lens: Lens, anchor: HTMLElement) => {
      if (lens.kind === 'custom') {
        setEdit(null);
        slots.current.openTextMode({ selectLensId: lens.id });
        return;
      }
      setEdit((cur) => (cur?.id === lens.id ? null : { id: lens.id, anchor }));
    },
    [slots],
  );
  const closeEdit = useCallback(() => setEdit(null), []);
  const removeLens = useCallback(
    (lensId: string) => {
      setEdit((cur) => (cur?.id === lensId ? null : cur));
      dispatch({ type: 'removeLens', lensId });
    },
    [dispatch],
  );

  const editing = edit ? work.lenses.find((l) => l.id === edit.id) : undefined;

  const panel = (
    <Box
      sx={{
        boxSizing: 'border-box',
        // Docked, the column's own box draws the edge; floating, the panel needs its own.
        width: floating ? shownWidth : '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        bgcolor: 'background.default',
        borderRight: floating ? 1 : 0,
        borderColor: 'divider',
        position: floating ? 'absolute' : 'relative',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: floating ? (t) => t.zIndex.appBar - 1 : 'auto',
        boxShadow: floating ? 8 : 'none',
      }}
      data-testid='vx-lens-panel'
      data-floating={floating}
    >
      <Stack direction='row' alignItems='center' spacing={0.75} sx={{ px: 1.25, pt: 1.25 }}>
        <ToggleButtonGroup
          exclusive
          size='small'
          value={state.mode}
          onChange={(_, m: 'lenses' | 'text' | null) => m && setMode(m)}
          aria-label='Filter editor'
          sx={{
            flex: 1,
            p: 0.25,
            gap: 0.25,
            bgcolor: 'action.hover',
            borderRadius: 1,
            '& .MuiToggleButton-root': {
              flex: 1,
              py: 0.25,
              border: 0,
              // The group's own radius would apply to the outer edges only; every option takes the theme radius.
              borderRadius: (t) => `${t.shape.borderRadius}px !important`,
              fontSize: 12.5,
              fontWeight: 700,
              textTransform: 'none',
              gap: 0.75,
              color: 'text.secondary',
            },
            '& .MuiToggleButton-root.Mui-selected, & .MuiToggleButton-root.Mui-selected:hover':
              {
                bgcolor: 'background.paper',
                color: 'text.primary',
                boxShadow: 1,
                '& svg': { color: 'primary.main' },
              },
          }}
        >
          <ToggleButton value='lenses' data-testid='vx-mode-lenses'>
            <VisibilityOutlinedIcon sx={{ fontSize: 15 }} />
            Lenses
          </ToggleButton>
          <ToggleButton value='text' data-testid='vx-mode-text'>
            <DataObjectIcon sx={{ fontSize: 15 }} />
            Text
          </ToggleButton>
        </ToggleButtonGroup>
        <Kbd title='Switch between Lenses and Text'>{modKey}E</Kbd>
        <Tooltip title='Fold  \'>
          <IconButton
            size='small'
            aria-label='Fold the filter column'
            onClick={toggleCollapsed}
            data-testid='vx-collapse'
            sx={{ width: 26, height: 26 }}
          >
            <KeyboardDoubleArrowLeftIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      {!data.liveCounts && (
        // One note for the whole column; each number it stands for shows a quiet "—".
        <Tooltip title={liveCountsOffText(work.entity)} placement='right'>
          <Stack
            direction='row'
            alignItems='center'
            spacing={0.75}
            data-testid='vx-counts-off'
            sx={{ px: 1.75, pt: 1, color: 'text.disabled' }}
          >
            <InfoOutlinedIcon sx={{ fontSize: 13 }} />
            <Typography sx={{ fontSize: 11.5, color: 'inherit' }}>
              Live counts off · over {LIVE_COUNT_ROW_LIMIT.toLocaleString('en-US')}{' '}
              {noun(work.entity, 2)}
            </Typography>
          </Stack>
        </Tooltip>
      )}
      {!textMode && (
        <Box sx={{ px: 1.25, pt: 1.25 }}>
          <AddLensBox
            tabId={tab.id}
            text={composerTexts.get(tab.id) ?? ''}
            setText={setComposerText}
            data={data}
            inputRef={inputRef}
            columnRef={columnRef}
            onAdd={onAdd}
            setPreview={setPreview}
          />
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 1.25, pb: 1.25 }}>
        {textMode ? (
          <Box sx={{ mt: 1.25 }}>
            <TextMode />
          </Box>
        ) : (
          <Section
            label='Filters'
            // During a preview the count reads "N → M of T": the note gives it the room to stay on one line.
            note={preview.length ? undefined : 'all apply together'}
            testId='vx-filters'
            right={
              <Typography
                component='span'
                sx={{ fontSize: 12, color: 'text.disabled', whiteSpace: 'nowrap' }}
                data-testid='vx-filter-count'
              >
                {preview.length ? (
                  <>
                    <b style={{ fontWeight: 800 }}>{data.result}</b> →{' '}
                    <Box component='b' sx={{ color: 'primary.main', fontWeight: 800 }}>
                      {data.shown}
                    </Box>
                  </>
                ) : (
                  <Box component='b' sx={{ color: 'text.primary', fontWeight: 800 }}>
                    {data.result}
                  </Box>
                )}{' '}
                of {data.total}
              </Typography>
            }
          >
            <Stack spacing={0.25}>
              {work.lenses.map((l) => (
                <LensRow
                  key={l.id}
                  entity={work.entity}
                  lens={l}
                  count={data.counts.perLens.get(l.id)}
                  total={data.total}
                  ref={
                    l.id === pendingOpen
                      ? (el: HTMLDivElement | null) => {
                          if (!el) return;
                          setPendingOpen(null);
                          setEdit({ id: l.id, anchor: el });
                        }
                      : undefined
                  }
                  problem={
                    // A Custom WHERE lens is the server's to judge; only an empty one is not applied.
                    l.kind === 'custom'
                      ? l.where.trim()
                        ? null
                        : 'Write a condition.'
                      : (lensProblem(work.entity, l)?.message ?? null)
                  }
                  refused={server.errors.get(l.id) ?? null}
                  countsOff={data.liveCounts ? undefined : liveCountsOffText(work.entity)}
                  selected={edit?.id === l.id}
                  entering={entering.has(l.id)}
                  onEye={(e) => onEye(l.id, e)}
                  onOpen={(anchor) => openLens(l, anchor)}
                  onRemove={() => removeLens(l.id)}
                />
              ))}
              {preview.map((p, i) => (
                <Box
                  key={p.id}
                  data-testid='vx-lens-preview'
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '28px minmax(0, 1fr) auto',
                    alignItems: 'center',
                    columnGap: 0.25,
                    py: 0.625,
                    pr: 0.75,
                    pl: 0.25,
                    borderRadius: 1,
                    border: 1,
                    borderStyle: 'dashed',
                    borderColor: 'primary.main',
                    bgcolor: 'primary.light',
                  }}
                >
                  <Box sx={{ display: 'grid', placeItems: 'center', color: 'primary.main' }}>
                    <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                  </Box>
                  <LensLine entity={work.entity} lens={p} />
                  <Box sx={{ textAlign: 'right', minWidth: 50, lineHeight: 1.2 }}>
                    {i === preview.length - 1 && (
                      <>
                        <Typography
                          sx={{
                            fontSize: 12.5,
                            fontWeight: 800,
                            color: 'primary.main',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {data.shown}
                        </Typography>
                        <Typography
                          sx={{ fontSize: 10.5, fontWeight: 600, color: 'text.disabled' }}
                        >
                          preview
                        </Typography>
                      </>
                    )}
                  </Box>
                </Box>
              ))}
            </Stack>
            {!work.lenses.length && !preview.length && (
              <Typography
                sx={{
                  fontSize: 12.5,
                  color: 'text.disabled',
                  px: 0.75,
                  py: 0.5,
                  lineHeight: 1.5,
                }}
                data-testid='vx-lens-empty'
              >
                No filters: every {noun(work.entity, 1)} shows. Type above, or click any value
                in the table.
              </Typography>
            )}
            <ServerNotes
              lenses={work.lenses}
              errors={server.errors}
              loading={server.loading}
            />
            {(work.lenses.length > 0 || work.whereData || work.resourceType) && (
              <StoredFilter open={showStored} onToggle={() => setShowStored((s) => !s)} />
            )}
          </Section>
        )}
        <GroupSection
          entity={work.entity}
          groupBy={work.groupBy}
          rows={derived.rows}
          labelKeys={data.tokenCtx.labelKeys}
        />
        <SortSection
          entity={work.entity}
          sort={work.sort}
          labelKeys={data.tokenCtx.labelKeys}
        />
      </Box>
      {!narrow && !textMode && (
        <Box
          onDoubleClick={() => {
            setWidth(COLUMN_DEFAULT_WIDTH);
            savePrefs({ width: COLUMN_DEFAULT_WIDTH });
          }}
          title='Drag to resize · double-click to reset'
          data-testid='vx-column-resize'
          sx={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: -3,
            zIndex: 2,
            display: 'flex',
          }}
        >
          <PaneResizeHandle
            onResizeStart={() => {
              drag.current = { start: width, moved: 0 };
              setResizing(true);
            }}
            onResize={(delta) => {
              drag.current.moved += delta;
              setWidth(clampWidth(drag.current.start + drag.current.moved));
            }}
            onResizeEnd={() => {
              setResizing(false);
              savePrefs({ width: clampWidth(drag.current.start + drag.current.moved) });
            }}
          />
        </Box>
      )}
      <LensPopover
        anchor={edit?.anchor ?? null}
        lens={editing}
        data={data}
        onChange={(lens) => dispatch({ type: 'updateLens', lens })}
        onRemove={removeLens}
        onClose={closeEdit}
      />
    </Box>
  );

  const rail = (
    <LensRail
      entity={work.entity}
      lenses={work.lenses}
      result={data.result}
      total={data.total}
      groupLevels={work.groupBy.length}
      onExpand={() => {
        expand();
        // Opening from the rail is the viewer's choice; below 1360 px it is kept for the next visit.
        if (narrow) savePrefs({ narrowOpen: true });
      }}
      onExpandToFilter={() => {
        expand();
        inputRef.current?.focus();
      }}
      onEye={onEye}
    />
  );

  return (
    <Box
      component='aside'
      ref={columnRef}
      aria-label='Filters and grouping'
      data-testid='vx-lens-column'
      data-collapsed={collapsed}
      sx={{
        position: 'relative',
        boxSizing: 'border-box',
        flexShrink: 0,
        width: collapsed || narrow ? RAIL_WIDTH : shownWidth,
        height: '100%',
        minHeight: 0,
        bgcolor: 'background.default',
        borderRight: 1,
        borderColor: 'divider',
        transition: resizing ? 'none' : 'width .2s ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {collapsed && rail}
      {!collapsed && !floating && panel}
      {floating && (
        <>
          {rail}
          <ClickAwayListener
            // A press outside closes it (a menu that opens under the pointer
            // ends its click on <body>, which a click listener takes for outside).
            mouseEvent='onMouseDown'
            onClickAway={(e) => {
              if (inLensLayer(e.target)) return;
              // Close, and let the press go on to do what it was for: nothing here stops it.
              setFloatOpen(false);
              savePrefs({ narrowOpen: false });
              setEdit(null);
            }}
          >
            {panel}
          </ClickAwayListener>
        </>
      )}
    </Box>
  );
}

/** The whole filter as the WHERE it saves to, for people who want to see it. */
function StoredFilter({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const work = useWork();
  const text = useMemo(() => {
    const { enabled, hidden } = lensesToConjuncts(work.entity, work.lenses);
    const lines = [formatWhereText(enabled, hidden) || 'TRUE'];
    if (work.resourceType) lines.push(`ResourceType: ${work.resourceType}`);
    if (work.whereData) lines.push(`WhereData: ${work.whereData}`);
    return lines.join('\n');
  }, [work]);
  return (
    <Box sx={{ px: 0.5, pt: 0.75 }}>
      <ButtonBase
        onClick={onToggle}
        data-testid='vx-stored-filter'
        sx={{
          fontSize: 11.5,
          color: 'text.disabled',
          gap: 0.5,
          borderRadius: 0.5,
          '&:hover': { color: 'text.primary' },
        }}
      >
        {open ? (
          <KeyboardArrowDownIcon sx={{ fontSize: 14 }} />
        ) : (
          <KeyboardArrowRightIcon sx={{ fontSize: 14 }} />
        )}
        Stored filter
      </ButtonBase>
      {open && (
        <Box
          component='pre'
          data-testid='vx-stored-filter-text'
          sx={{
            m: 0,
            mt: 0.75,
            p: 1,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            lineHeight: 1.55,
            color: 'text.secondary',
            bgcolor: 'background.paper',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </Box>
      )}
    </Box>
  );
}

const FILTER_LABEL: Record<string, string> = {
  [WHERE_DATA_KEY]: 'the config data filter (WhereData)',
  [RESOURCE_TYPE_KEY]: 'the ResourceType filter',
};

interface ServerNotesProps {
  lenses: readonly Lens[];
  errors: ReadonlyMap<string, string>;
  loading: boolean;
}

/**
 * What the server said about the conditions it answers: each refusal, with
 * its effect (the table shows no rows), and that answers are still coming.
 */
function ServerNotes({ lenses, errors, loading }: ServerNotesProps) {
  const refused = [...errors].filter(([key]) => {
    if (FILTER_LABEL[key]) return true;
    return lenses.some((l) => l.id === key && l.enabled);
  });
  if (!refused.length && !loading) return null;
  return (
    <Stack spacing={0.5} sx={{ px: 0.5, pt: 0.75 }} data-testid='vx-server-notes'>
      {refused.map(([key, message]) => (
        <Typography
          key={key}
          data-testid='vx-server-refused'
          sx={{
            fontSize: 11.5,
            lineHeight: 1.45,
            color: 'error.main',
            wordBreak: 'break-word',
          }}
        >
          <b>Server refused {FILTER_LABEL[key] ?? 'this filter'} · showing 0 rows.</b>{' '}
          {message}
        </Typography>
      ))}
      {loading && (
        <Typography
          sx={{ fontSize: 11.5, color: 'text.disabled' }}
          data-testid='vx-server-loading'
        >
          Waiting for the server’s answer…
        </Typography>
      )}
    </Stack>
  );
}
