// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Getting into and out of a change (D33): the menu on the change name (your other open changes,
 * Start a new change, Leave this change), and the list of your open changes on the no-change
 * panel, each row the click target (D36).
 */
import { useState } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Divider from '@mui/material/Divider';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ListItemButton from '@mui/material/ListItemButton';
import { changeOrderInk, changeOrderSurface, changeOrderType } from '@/pages/change-orders/changeOrdersTokens';
import { tokens } from '@/components/theme-provider/ThemeProvider';
import { formatRelative } from '@/utility/date-format';
import { leaveActiveChange, setActiveChange } from './activeChange';
import { ChangeIcon } from './ChangeIcon';
import { monoSx } from './panelStyles';
import { useMyOpenChanges, type OpenChange } from './useMyOpenChanges';

const whereSx = { fontSize: 12, color: tokens.t2, marginTop: '2px' } as const;

function where(change: OpenChange): string {
  return change.createdAt ? `In ${change.space}, started ${formatRelative(change.createdAt)}` : `In ${change.space}`;
}

/** The change name as the menu button, and its menu. */
/** `finished`: the change is closed, so leaving it does not leave anything open. */
export function ChangeMenu({ slug, activeId, onStartNew, finished = false }: { slug: string; activeId: string; onStartNew: () => void; finished?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const others = useMyOpenChanges().changes.filter((c) => c.id !== activeId);
  const close = () => setAnchor(null);
  const panelWidth = anchor?.closest('[data-testid="change-panel"]')?.clientWidth;
  const menuWidth = panelWidth ? panelWidth - 32 : 360;
  return (
    <>
      <ButtonBase
        data-testid="change-menu-button"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ display: 'inline-flex', alignItems: 'flex-start', textAlign: 'left', borderRadius: '3px', minWidth: 0 }}
      >
        <Box data-testid="change-name" sx={{ ...monoSx, fontWeight: 600, fontSize: 16, lineHeight: 1.35, color: changeOrderInk.default, overflowWrap: 'anywhere', minWidth: 0 }}>
          {slug}
        </Box>
        <ArrowDropDownIcon sx={{ fontSize: 20, color: tokens.t3, marginTop: '1px', flex: 'none' }} />
      </ButtonBase>
      <Menu
        data-testid="change-menu"
        anchorEl={anchor}
        open={anchor !== null}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        // As wide as the panel's body, so it never runs past the panel's edge.
        slotProps={{ paper: { sx: { width: menuWidth, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        {others.length > 0 ? (
          <Box sx={{ padding: '6px 10px 4px', fontSize: 12, color: tokens.t2 }}>Your other open ChangeSets</Box>
        ) : null}
        {others.map((change, i) => (
          <MenuItem
            key={change.id}
            data-testid={`change-menu-item-${i + 1}`}
            onClick={() => {
              close();
              setActiveChange({ space: change.space, slug: change.slug });
            }}
            sx={{ display: 'block', whiteSpace: 'normal' }}
          >
            <Box sx={{ ...monoSx, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere' }}>{change.slug}</Box>
            <Box sx={whereSx}>{where(change)}</Box>
          </MenuItem>
        ))}
        {others.length > 0 ? <Divider /> : null}
        <MenuItem
          data-testid="change-menu-new"
          onClick={() => {
            close();
            onStartNew();
          }}
          sx={{ color: tokens.rust, fontWeight: 600 }}
        >
          Start a new ChangeSet
        </MenuItem>
        <MenuItem
          data-testid="change-menu-leave"
          onClick={() => {
            close();
            if (finished) setActiveChange(null);
            else leaveActiveChange(slug);
          }}
          sx={{ display: 'block', whiteSpace: 'normal' }}
        >
          <Box>Leave this ChangeSet</Box>
          {finished ? null : <Box sx={whereSx}>It stays open, and you can pick it again. Saves go out as new Revisions.</Box>}
        </MenuItem>
      </Menu>
    </>
  );
}

/** "Your open changes" on the no-change panel (D33): each whole row selects its change (D36). */
export function OpenChangesList({ exclude = [] }: { exclude?: string[] }) {
  // Changes already named "On this Variant" are not listed twice (D35).
  const changes = useMyOpenChanges().changes.filter((c) => !exclude.includes(c.id));
  if (changes.length === 0) return null;
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '9px 16px',
          background: changeOrderSurface.sunk,
          borderTop: `1px solid ${tokens.bd0}`,
          borderBottom: `1px solid ${tokens.bd0}`,
          fontSize: changeOrderType.size.body,
          fontWeight: 600,
          color: changeOrderInk.default,
        }}
      >
        <span>Your open ChangeSets</span>
        <Box component="span" sx={{ fontWeight: changeOrderType.weight.regular, color: tokens.t2, fontSize: 12 }}>
          Pick one to select it
        </Box>
      </Box>
      {changes.map((change, i) => (
        <ListItemButton
          key={change.id}
          data-testid={`open-change-item-${i + 1}`}
          onClick={() => setActiveChange({ space: change.space, slug: change.slug })}
          sx={{
            alignItems: 'flex-start',
            gap: '10px',
            padding: '10px 16px',
            borderBottom: `1px solid ${tokens.bd2}`,
            '&:hover': { backgroundColor: tokens.bgHover },
            '&:hover .open-change-chevron, &.Mui-focusVisible .open-change-chevron': { color: tokens.rust },
          }}
        >
          <ChangeIcon sx={{ fontSize: 15, color: tokens.t2, marginTop: '2px' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ ...monoSx, fontWeight: 600, fontSize: 13, overflowWrap: 'anywhere' }}>{change.slug}</Box>
            <Box sx={whereSx}>{where(change)}</Box>
          </Box>
          <ChevronRightIcon
            aria-hidden
            className="open-change-chevron"
            data-testid={`open-change-pick-${i + 1}`}
            sx={{ fontSize: 18, color: tokens.t3, alignSelf: 'center', flex: 'none' }}
          />
        </ListItemButton>
      ))}
    </Box>
  );
}
