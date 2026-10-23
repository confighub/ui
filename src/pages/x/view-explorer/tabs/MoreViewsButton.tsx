// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';

import { useExplorerContext } from '../state/context';
import { savedTab } from '../state/initial';
import { NOOP_SLOTS } from '../state/slots';
import { useTabActions } from '../state/useExplorer';
import { rememberVersions } from '../state/versions';

/**
 * "N more ▾": the shared views that are not in the strip. Until the view
 * switcher (⌘P) exists, this menu opens them and pins them; once the
 * switcher registers itself, the button opens it instead.
 */
export function MoreViewsButton() {
  const { state, views, slots, dispatch, versions } = useExplorerContext();
  const { openSaved } = useTabActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const inStrip = new Set(state.tabs.map((t) => t.viewId).filter(Boolean));
  const hidden = views.filter((v) => !inStrip.has(v.viewId));

  const onOpen = (el: HTMLElement) => {
    if (slots.current.openSwitcher !== NOOP_SLOTS.openSwitcher) slots.current.openSwitcher(el);
    else setAnchor(el);
  };

  const pin = (viewId: string) => {
    const saved = views.find((v) => v.viewId === viewId);
    if (!saved) return;
    const active = state.activeId;
    // Pinning from the menu adds the tab without leaving the current one.
    rememberVersions(versions.current, saved);
    dispatch({ type: 'openTab', tab: savedTab(saved, true) });
    dispatch({ type: 'activate', tabId: active });
  };

  return (
    <>
      <Button
        size='small'
        color='inherit'
        endIcon={<ExpandMoreIcon fontSize='small' />}
        onClick={(e) => onOpen(e.currentTarget)}
        sx={{ color: 'text.secondary', fontWeight: 600, mb: 0.5, flexShrink: 0 }}
        data-testid='vx-more-views'
      >
        {hidden.length} more
      </Button>
      {/* Mounted only while open: closing removes the modal root in the same commit. Left mounted to run its exit transition, a slow CPU can leave it in place, invisible, taking every click. */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={() => setAnchor(null)}
          slotProps={{ paper: { sx: { minWidth: 300, maxHeight: 420 } } }}
        >
          <ListSubheader sx={{ lineHeight: '32px' }}>All shared views</ListSubheader>
          {hidden.length === 0 && (
            <MenuItem disabled>
              <ListItemText primary='Every view is already in your tabs.' />
            </MenuItem>
          )}
          {hidden.map((v) => (
            <MenuItem
              key={v.viewId}
              onClick={() => {
                setAnchor(null);
                openSaved(v.viewId);
              }}
            >
              <ListItemText primary={v.name} />
              <Tooltip title='Pin to your tabs'>
                <IconButton
                  size='small'
                  aria-label={`Pin ${v.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    pin(v.viewId);
                  }}
                  sx={{ ml: 1 }}
                >
                  <PushPinOutlinedIcon fontSize='small' />
                </IconButton>
              </Tooltip>
            </MenuItem>
          ))}
        </Menu>
      )}
    </>
  );
}
