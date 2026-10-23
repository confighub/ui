// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type KeyboardEvent, useCallback, useId, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';

import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import InputBase from '@mui/material/InputBase';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { isMod } from '../keys/usePageShortcuts';
import { modKey } from '../lenses/layer';
import { Kbd } from '../lenses/parts';
import type { SavedView } from '../queries/useViews';
import {
  type Shortcut,
  useExplorerContext,
  useRegisterShortcut,
  useRegisterSlot,
} from '../state/context';
import { savedTab } from '../state/initial';
import { useTabActions } from '../state/useExplorer';
import { rememberVersions } from '../state/versions';
import { absoluteTime, shortRelative } from '../table/format';
import { matchesWordPrefixes } from './match';

/**
 * ⌘P (and "N more ▾"): every shared view, found by typing. "Pinned by you"
 * first, in strip order, then "All shared views", newest first, each with
 * where it lives and how long ago it changed. Enter opens; ⌥Enter (or the pin)
 * pins or unpins without leaving the list; Esc closes.
 */

interface Item {
  view: SavedView;
  pinned: boolean;
}

export function ViewSwitcher() {
  const [open, setOpen] = useState(false);
  // Opened synchronously, so the input exists and has focus before the next key arrives.
  const openSwitcher = useCallback(() => flushSync(() => setOpen(true)), []);
  useRegisterSlot('openSwitcher', openSwitcher);
  const shortcut = useMemo<Shortcut>(
    () => ({
      id: 'view-switcher',
      keys: `${modKey}P`,
      label: 'Open a view',
      inText: true,
      matches: (e) => isMod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'p',
      run: () => flushSync(() => setOpen((o) => !o)),
    }),
    [],
  );
  useRegisterShortcut(shortcut);
  return open ? <SwitcherDialog onClose={() => setOpen(false)} /> : null;
}

/**
 * Focus the input as it mounts, and once more on the next frame: a click on
 * "N more" ends by focusing the button it was on, just after the switcher
 * opened, so the focus comes back to the input before the next key.
 */
function focusOnMount(el: HTMLInputElement | null) {
  if (!el) return;
  el.focus();
  requestAnimationFrame(() => {
    if (el.isConnected && document.activeElement !== el) el.focus();
  });
}

function SwitcherDialog({ onClose }: { onClose: () => void }) {
  const { state, views, dispatch, versions } = useExplorerContext();
  const { openSaved } = useTabActions();
  const [query, setQuery] = useState('');
  // The highlight follows a view, not a position: pinning moves a view to the
  // other section, and the highlight moves with it.
  const [hlId, setHlId] = useState<string | null>(null);
  const listId = useId();
  const optionId = (viewId: string) => `${listId}-${viewId}`;

  // Worked out on every render: a few dozen views, and always the tabs as they are now.
  const pinnedIds = state.tabs
    .filter((t) => t.kind === 'saved' && t.pinned && t.viewId)
    .map((t) => t.viewId as string);
  const byId = new Map(views.map((v) => [v.viewId, v]));
  const pinned: Item[] = pinnedIds.flatMap((id) => {
    const v = byId.get(id);
    return v && matchesWordPrefixes(v.name, query) ? [{ view: v, pinned: true }] : [];
  });
  const others: Item[] = views
    .filter((v) => !pinnedIds.includes(v.viewId) && matchesWordPrefixes(v.name, query))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((v) => ({ view: v, pinned: false }));
  const items = [...pinned, ...others];
  const activeIndex = Math.max(
    0,
    items.findIndex((i) => i.view.viewId === hlId),
  );
  const active = items[activeIndex];

  const go = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    openSaved(item.view.viewId);
  };

  const togglePin = (item: Item | undefined) => {
    if (!item) return;
    setHlId(item.view.viewId);
    const tab = state.tabs.find((t) => t.viewId === item.view.viewId);
    if (tab) {
      dispatch({ type: item.pinned ? 'unpin' : 'pin', tabId: tab.id });
      return;
    }
    // Pinning a view that has no tab adds its tab without leaving the current one.
    const current = state.activeId;
    rememberVersions(versions.current, item.view);
    dispatch({ type: 'openTab', tab: savedTab(item.view, true) });
    dispatch({ type: 'activate', tabId: current });
  };

  const move = (delta: number) => {
    if (!items.length) return;
    const next = items[(activeIndex + delta + items.length) % items.length];
    setHlId(next.view.viewId);
    // After the highlight moves on screen, keep it in sight in the scrolling list.
    requestAnimationFrame(() =>
      document
        .getElementById(optionId(next.view.viewId))
        ?.scrollIntoView({ block: 'nearest' }),
    );
  };

  /**
   * The switcher's keys, wherever focus is inside it. They stop here, so no
   * page shortcut acts while the switcher is open; Esc goes on to the dialog,
   * which closes.
   */
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') return;
    e.stopPropagation();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      move(e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.altKey) togglePin(active);
      else go(active);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      onClose();
    }
  };

  const group = (label: string, testId: string, list: Item[]) => {
    const headingId = `${listId}-${testId}`;
    return (
      <Box role='group' aria-labelledby={headingId} data-testid={testId} sx={{ mt: 1.25 }}>
        <Typography
          id={headingId}
          variant='caption'
          component='div'
          sx={{
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'text.disabled',
            px: 1,
            pb: 0.5,
          }}
        >
          {label}
        </Typography>
        {list.map((item) => (
          <SwitcherRow
            key={item.view.viewId}
            id={optionId(item.view.viewId)}
            item={item}
            active={item === active}
            onHover={() => setHlId(item.view.viewId)}
            onOpen={() => go(item)}
            onPin={() => togglePin(item)}
          />
        ))}
      </Box>
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      // The input takes focus itself as it mounts (below), so keys typed right
      // after ⌘P or a click on "N more" land in it; the dialog's own autofocus
      // would move focus to its frame after that.
      disableAutoFocus
      data-testid='vx-switcher'
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start' } }}
      slotProps={{
        paper: {
          'aria-label': 'Open a view',
          sx: { mt: '12vh', width: 560, maxWidth: 'calc(100vw - 32px)' },
        },
      }}
    >
      <Box onKeyDown={onKeyDown}>
        <Stack
          direction='row'
          alignItems='center'
          spacing={1}
          sx={{ px: 1.75, height: 48, borderBottom: 1, borderColor: 'divider' }}
        >
          <SearchIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
          <InputBase
            inputRef={focusOnMount}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHlId(null);
            }}
            placeholder='Open a view…'
            inputProps={{
              'aria-label': 'Find a view',
              role: 'combobox',
              'aria-expanded': true,
              'aria-controls': listId,
              'aria-autocomplete': 'list',
              'aria-activedescendant': active ? optionId(active.view.viewId) : undefined,
              'data-testid': 'vx-switcher-input',
            }}
            sx={{ flex: 1, fontSize: 14 }}
          />
          <Kbd>Esc</Kbd>
        </Stack>
        <Box
          id={listId}
          role='listbox'
          aria-label='Views'
          sx={{ maxHeight: '52vh', overflow: 'auto', px: 1, pb: 1 }}
        >
          {pinned.length > 0 && group('Pinned by you', 'vx-switcher-pinned', pinned)}
          {others.length > 0 && group('All shared views', 'vx-switcher-shared', others)}
          {!items.length && (
            <Typography sx={{ fontSize: 13, color: 'text.disabled', px: 1, py: 2 }}>
              No view has a name with “{query}”.
            </Typography>
          )}
        </Box>
        <Stack
          direction='row'
          spacing={2}
          sx={{
            px: 1.75,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            color: 'text.disabled',
            fontSize: 11.5,
          }}
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> move
          </span>
          <span>
            <Kbd>Enter</Kbd> open
          </span>
          <span>
            <Kbd>⌥Enter</Kbd> pin or unpin
          </span>
        </Stack>
      </Box>
    </Dialog>
  );
}

interface SwitcherRowProps {
  id: string;
  item: Item;
  active: boolean;
  onHover: () => void;
  onOpen: () => void;
  onPin: () => void;
}

/**
 * One option. The option itself is the only control (click or Enter opens);
 * the pin mark is a pointer shortcut for ⌥Enter, hidden from assistive
 * technology, and pressing it never takes the focus from the input.
 */
function SwitcherRow({ id, item, active, onHover, onOpen, onPin }: SwitcherRowProps) {
  const { view, pinned } = item;
  const space = view.extended.Space?.Slug ?? 'confighub-system';
  return (
    <Stack
      id={id}
      role='option'
      aria-selected={active}
      aria-description={
        pinned ? 'Pinned. Alt+Enter unpins.' : 'Alt+Enter pins it to your tabs.'
      }
      direction='row'
      alignItems='center'
      spacing={1}
      onMouseMove={onHover}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
      data-testid='vx-switcher-item'
      data-pinned={pinned}
      sx={{
        height: 40,
        pl: 1,
        pr: 0.75,
        borderRadius: 1,
        cursor: 'pointer',
        bgcolor: active ? 'primary.light' : 'transparent',
      }}
    >
      <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>
        {view.name}
      </Typography>
      <Typography
        noWrap
        sx={{ fontSize: 12, color: 'text.disabled', ml: 'auto !important', flexShrink: 0 }}
        title={absoluteTime(view.updatedAt)}
      >
        {space} · {shortRelative(view.updatedAt)}
      </Typography>
      <Box
        component='span'
        aria-hidden
        title={pinned ? 'Unpin from your tabs  ⌥Enter' : 'Pin to your tabs  ⌥Enter'}
        data-testid='vx-switcher-pin'
        onClick={(e) => {
          e.stopPropagation();
          onPin();
        }}
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 26,
          height: 26,
          borderRadius: 1,
          color: pinned ? 'primary.main' : 'text.disabled',
          '&:hover': {
            bgcolor: 'action.hover',
            color: pinned ? 'primary.main' : 'text.secondary',
          },
        }}
      >
        {pinned ? (
          <PushPinIcon sx={{ fontSize: 15 }} />
        ) : (
          <PushPinOutlinedIcon sx={{ fontSize: 15 }} />
        )}
      </Box>
    </Stack>
  );
}
