// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { type KeyboardEvent, useRef, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import { alpha, keyframes, styled } from '@mui/material/styles';

import { isDirty } from '../model/reducer';
import type { Layout, TabState } from '../model/types';
import { useExplorerContext } from '../state/context';
import { tabLabel, useTabActions } from '../state/useExplorer';
import { TAB_PANEL_ID, tabElementId } from './ids';
import { MoreViewsButton } from './MoreViewsButton';
import { NameCard } from './NameCard';
import { DraftDot, TempDot } from './SaveActions';
import { TabMenu } from './TabMenu';
import { useSaveFlow } from './useSaveFlow';

/**
 * The tab strip is the list of views: "All units", the viewer's pinned
 * views, temporary views, and any view being visited or changed. A changed
 * view's name turns italic with a dot; a temporary view has a dashed mark.
 * One click opens a tab; renaming takes a double-click or the tab menu, so a
 * shared view is never renamed by accident.
 */

const LAYOUT_ICON: Record<Layout, typeof TableChartOutlinedIcon> = {
  table: TableChartOutlinedIcon,
  board: ViewKanbanOutlinedIcon,
  matrix: GridViewOutlinedIcon,
};

const underlineIn = keyframes`
  from { transform: scaleX(0.2); opacity: 0; }
  to { transform: none; opacity: 1; }
`;

const Strip = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-end',
  height: 40,
  borderBottom: `1px solid ${theme.palette.divider}`,
  minWidth: 0,
  position: 'relative',
}));

const Scroller = styled(Box)({
  display: 'flex',
  alignItems: 'flex-end',
  overflowX: 'auto',
  minWidth: 0,
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
});

const TabRoot = styled(Box, { shouldForwardProp: (p) => p !== '$active' && p !== '$italic' && p !== '$pipe' })<{
  $active: boolean;
  $italic: boolean;
  /** A thin separator on the right: between two tabs that are both not selected. */
  $pipe: boolean;
}>(({ theme, $active, $italic, $pipe }) => ({
  ...($pipe && {
    '&::before': {
      content: '""',
      position: 'absolute',
      right: -1,
      top: 11,
      width: 1,
      height: 14,
      backgroundColor: theme.palette.divider,
    },
  }),
  position: 'relative',
  height: 36,
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  padding: theme.spacing(0, 1.5),
  marginBottom: -1,
  flexShrink: 0,
  maxWidth: 300,
  border: '1px solid transparent',
  borderBottom: 'none',
  borderTopLeftRadius: theme.shape.borderRadius,
  borderTopRightRadius: theme.shape.borderRadius,
  cursor: 'pointer',
  userSelect: 'none',
  color: $active ? theme.palette.text.primary : theme.palette.text.secondary,
  fontSize: 13,
  fontWeight: 600,
  transition: theme.transitions.create(['background-color', 'color'], { duration: 150 }),
  '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.04), color: theme.palette.text.primary },
  '& .vx-tab-label': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    paddingRight: 2,
    fontStyle: $italic ? 'italic' : 'normal',
  },
  '& .vx-tab-hover': { opacity: 0, transition: theme.transitions.create('opacity', { duration: 150 }) },
  '&:hover .vx-tab-hover': { opacity: 1 },
  ...($active && {
    backgroundColor: theme.palette.background.paper,
    borderColor: theme.palette.divider,
    zIndex: 1,
    '&:hover': { backgroundColor: theme.palette.background.paper },
    '& .vx-tab-hover': { opacity: 1 },
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 10,
      right: 10,
      top: -1,
      height: 2,
      borderRadius: '0 0 2px 2px',
      backgroundColor: theme.palette.primary.main,
      animation: `${underlineIn} 300ms ${theme.transitions.easing.easeOut}`,
    },
  }),
}));

const TabInput = styled(InputBase)(({ theme }) => ({
  fontSize: 13,
  fontWeight: 600,
  '& input': {
    height: 22,
    padding: theme.spacing(0, 0.75),
    width: '24ch',
    border: `1px solid ${theme.palette.primary.main}`,
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.background.paper,
    boxShadow: '0 0 0 3px var(--rust-ring)',
  },
}));

/** Out of sight, still read by assistive technology. */
const HIDDEN = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

const SmallIcon = styled(IconButton)({ width: 20, height: 20, padding: 0, marginRight: -4 });

interface TabProps {
  tab: TabState;
  active: boolean;
  pipe: boolean;
}

/** Move focus along the strip with the arrow keys, Home and End (roving tabindex). */
function moveFocus(from: HTMLElement, key: string): boolean {
  const list = from.closest('[data-vx-tabstrip]');
  if (!list) return false;
  const tabs = [...list.querySelectorAll<HTMLElement>('[role="tab"]')];
  const i = tabs.indexOf(from);
  if (i === -1) return false;
  const next =
    key === 'ArrowRight' ? tabs[(i + 1) % tabs.length]
    : key === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length]
    : key === 'Home' ? tabs[0]
    : key === 'End' ? tabs[tabs.length - 1]
    : null;
  if (!next) return false;
  next.focus();
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}

const TabButton = styled('div')(({ theme }) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  height: '100%',
  minWidth: 0,
  cursor: 'pointer',
  outline: 'none',
  borderRadius: theme.shape.borderRadius,
  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
}));

/** The name offered for a temporary view with nothing in it yet: "All units copy". */
const BLANK_NAME: Record<TabState['work']['entity'], string> = {
  Unit: 'All units copy',
  Space: 'All spaces copy',
  Resource: 'All resources copy',
};

function Tab({ tab, active, pipe }: TabProps) {
  const { namingTabId, renamingTabId, setNamingTabId, setRenamingTabId } = useExplorerContext();
  const { goTo, closeTab, setPinned } = useTabActions();
  const { busy, commitName, cancelNaming, commitRename } = useSaveFlow();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const dirty = isDirty(tab);
  const naming = namingTabId === tab.id;
  const renaming = renamingTabId === tab.id;
  const editing = naming || renaming;
  const label = tabLabel(tab);
  const Icon = LAYOUT_ICON[tab.work.layout];
  const initialValue = naming ? (label === 'Untitled view' ? BLANK_NAME[tab.work.entity] : label) : tab.name;
  const unfiltered = !tab.work.lenses.some((l) => l.enabled) && !tab.work.whereData && !tab.work.resourceType;

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      if (naming) commitName(tab.id, e.currentTarget.value);
      else commitRename(tab.id, e.currentTarget.value);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (naming) cancelNaming();
      else setRenamingTabId(null);
    }
  };

  const title =
    tab.kind === 'temp'
      ? 'Temporary view: only you can see it. Double-click to name it.'
      : tab.kind === 'builtin'
        ? 'Every unit. A change here opens a new view.'
        : 'Double-click to rename';

  return (
    <TabRoot
      ref={rootRef}
      data-testid='vx-tab'
      data-tab-id={tab.id}
      data-tab-kind={tab.kind}
      data-dirty={dirty || undefined}
      data-active={active || undefined}
      $active={active}
      $pipe={pipe}
      $italic={dirty || tab.kind === 'temp'}
      onClick={() => !editing && goTo(tab.id)}
      onDoubleClick={() => {
        if (tab.kind === 'temp') setNamingTabId(tab.id);
        else if (tab.kind === 'saved') setRenamingTabId(tab.id);
      }}
    >
      {editing ? (
        <>
          {/* The tab stays in the tablist while its name is edited, so the panel's label never points at nothing. */}
          <Box component='span' role='tab' id={tabElementId(tab.id)} aria-selected={active} aria-controls={TAB_PANEL_ID} tabIndex={-1} sx={HIDDEN}>
            {label}
          </Box>
          <Icon sx={{ fontSize: 15, color: 'text.primary' }} />
          <TabInput
            inputRef={inputRef}
            autoFocus
            defaultValue={initialValue}
            placeholder='Name this view'
            inputProps={{ 'aria-label': naming ? 'Name for the new view' : 'New name for the view' }}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={onInputKeyDown}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              // A rename commits on blur; the first save never happens without an explicit Enter or click.
              if (renaming) commitRename(tab.id, e.currentTarget.value);
            }}
          />
        </>
      ) : (
        <TabButton
          role='tab'
          id={tabElementId(tab.id)}
          aria-selected={active}
          aria-controls={TAB_PANEL_ID}
          tabIndex={active ? 0 : -1}
          title={title}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              goTo(tab.id);
              return;
            }
            if (moveFocus(e.currentTarget, e.key)) e.preventDefault();
          }}
        >
          <Icon sx={{ fontSize: 15, color: active ? 'text.primary' : 'text.disabled' }} />
          <span className='vx-tab-label'>{label}</span>
          {dirty && <DraftDot aria-label='Unsaved changes' role='img' />}
          {tab.kind === 'temp' && <TempDot aria-label='Not saved' role='img' />}
        </TabButton>
      )}
      {tab.kind === 'saved' && !tab.pinned && !editing && (
        <Tooltip title='Pin to your tabs'>
          <SmallIcon
            className='vx-tab-hover'
            size='small'
            aria-label={`Pin ${label} to your tabs`}
            onClick={(e) => {
              e.stopPropagation();
              setPinned(tab.id, true);
            }}
          >
            <PushPinOutlinedIcon sx={{ fontSize: 13 }} />
          </SmallIcon>
        </Tooltip>
      )}
      {active && tab.kind === 'saved' && !editing && (
        <SmallIcon
          size='small'
          aria-label={`Options for ${label}`}
          aria-haspopup='menu'
          onClick={(e) => {
            e.stopPropagation();
            setMenuAnchor(e.currentTarget);
          }}
        >
          <ArrowDropDownIcon sx={{ fontSize: 18 }} />
        </SmallIcon>
      )}
      {tab.kind === 'temp' && !editing && (
        <SmallIcon
          className='vx-tab-hover'
          size='small'
          aria-label={`Close ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
        >
          <CloseIcon sx={{ fontSize: 13 }} />
        </SmallIcon>
      )}
      {naming && (
        <NameCard
          anchor={rootRef.current}
          busy={busy}
          unfilteredEntity={unfiltered ? tab.work.entity : null}
          onSave={() => commitName(tab.id, inputRef.current?.value ?? initialValue)}
        />
      )}
      {/* Mounted while the tab is saved, so its delete confirmation outlives the menu closing. */}
      {tab.kind === 'saved' && <TabMenu tab={tab} anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}
    </TabRoot>
  );
}

export function TabStrip() {
  const { state } = useExplorerContext();
  const { newTemp } = useTabActions();
  // Each tab sits beside its own Pin, Options and Close buttons, which a
  // tablist may not contain. The tablist owns the tabs by id instead, so the
  // buttons stay next to their tab without being inside the list.
  const owned = state.tabs.map((t) => tabElementId(t.id)).join(' ');
  return (
    <Strip>
      <Box role='tablist' aria-label='Views' aria-orientation='horizontal' aria-owns={owned} sx={HIDDEN} />
      <Scroller data-vx-tabstrip=''>
        {state.tabs.map((t, i) => {
          const next = state.tabs[i + 1];
          const pipe = !!next && t.id !== state.activeId && next.id !== state.activeId;
          return <Tab key={t.id} tab={t} active={t.id === state.activeId} pipe={pipe} />;
        })}
      </Scroller>
      <Tooltip title='New view  (N)'>
        <IconButton size='small' aria-label='New view' onClick={() => newTemp()} sx={{ mb: 0.5, ml: 0.5, flexShrink: 0 }}>
          <AddIcon fontSize='small' />
        </IconButton>
      </Tooltip>
      <MoreViewsButton />
    </Strip>
  );
}
