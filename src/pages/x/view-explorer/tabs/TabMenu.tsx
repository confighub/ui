// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LinkIcon from '@mui/icons-material/Link';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import Divider from '@mui/material/Divider';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';

import type { TabState } from '../model/types';
import { useExplorerContext } from '../state/context';
import { useTabActions } from '../state/useExplorer';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { useCopyLink } from './useCopyLink';
import { useSaveFlow } from './useSaveFlow';

interface TabMenuProps {
  tab: TabState;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/** The active saved tab's menu: Rename, Pin, Duplicate, Copy link, Delete. */
export function TabMenu({ tab, anchor, onClose }: TabMenuProps) {
  const { setRenamingTabId } = useExplorerContext();
  const { setPinned, newTemp } = useTabActions();
  const { deleteView } = useSaveFlow();
  const copyLink = useCopyLink();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const item = (label: string, icon: React.ReactNode, onClick: () => void, hint?: string) => (
    <MenuItem
      onClick={() => {
        onClose();
        onClick();
      }}
    >
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={label} />
      {hint && (
        <Typography variant='body2' color='text.disabled' sx={{ ml: 2 }}>
          {hint}
        </Typography>
      )}
    </MenuItem>
  );

  return (
    <>
      {/* Mounted only while open: closing removes the modal root in the same commit. Left mounted to run its exit transition, a slow CPU can leave it in place, invisible, taking every click. */}
      {anchor && (
        <Menu
          anchorEl={anchor}
          open={!!anchor}
          onClose={onClose}
          slotProps={{ paper: { sx: { minWidth: 240 } } }}
        >
          {item(
            'Rename',
            <EditOutlinedIcon fontSize='small' />,
            () => setRenamingTabId(tab.id),
            'Double-click',
          )}
          {item(
            tab.pinned ? 'Unpin from your tabs' : 'Pin to your tabs',
            <PushPinOutlinedIcon fontSize='small' />,
            () => setPinned(tab.id, !tab.pinned),
          )}
          {item('Duplicate as temporary', <ContentCopyIcon fontSize='small' />, () =>
            newTemp(tab.work),
          )}
          {item('Copy link', <LinkIcon fontSize='small' />, () => void copyLink(tab))}
          <Divider />
          <MenuItem
            onClick={() => {
              onClose();
              setConfirmOpen(true);
            }}
            sx={{ color: 'error.main' }}
          >
            <ListItemIcon sx={{ color: 'error.main' }}>
              <DeleteOutlineIcon fontSize='small' />
            </ListItemIcon>
            <ListItemText primary='Delete view' />
          </MenuItem>
        </Menu>
      )}
      <DeleteConfirmDialog
        open={confirmOpen}
        viewName={tab.name}
        onConfirm={() => {
          setConfirmOpen(false);
          deleteView(tab.id);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
