// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// The title row of the Components drawer: the Variant name (with its Component when the graph
// holds several), one button per tag kind (Targets, GitOps, the cluster Unit), then Compare,
// Create variant and Close. Every hover card here is a light card, never a dark tooltip.

import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from 'react';

import CallSplitIcon from '@mui/icons-material/CallSplit';
import { CompareIcon } from '@/components/icons/CompareIcon';
import CloseIcon from '@mui/icons-material/Close';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeviceHubIcon from '@mui/icons-material/DeviceHub';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip, { type TooltipProps } from '@mui/material/Tooltip';
import { Link as RouterLink } from 'react-router-dom';

import { INFO_PEEK_TOOLTIP_SX } from '@/components/info-peek/InfoPeek';
import { tokens } from '@/components/theme-provider/ThemeProvider';

import { componentTheme as t } from './componentTheme';
import { chromeMenuPaperSx, menuHeadingSx, menuItemSx, roundIconButtonSx, TITLE_ROW_HEIGHT } from './paneChromeStyles';

const PEEK_SX = { ...INFO_PEEK_TOOLTIP_SX, maxWidth: 360, overflowWrap: 'anywhere' } as const;

/**
 * A light hover card with a title and an optional second line. The trigger keeps its own
 * accessible name. It shows on hover or keyboard focus, and a click on the trigger closes it: it
 * stays closed until the pointer leaves the trigger or the focus moves, so it does not stand over
 * what the click changed.
 */
export function ChromePeek({
  title,
  sub,
  placement = 'bottom',
  open,
  onOpen,
  onClose,
  children,
}: {
  title: ReactNode;
  sub?: ReactNode;
  placement?: TooltipProps['placement'];
  open?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  children: ReactElement<{ onClick?: (e: React.MouseEvent) => void; onPointerLeave?: (e: React.PointerEvent) => void; onBlur?: (e: React.FocusEvent) => void }>;
}) {
  const controlled = open !== undefined;
  const [shown, setShown] = useState(false);
  const clicked = useRef(false);
  const trigger = controlled
    ? children
    : cloneElement(children, {
        onClick: (e: React.MouseEvent) => {
          children.props.onClick?.(e);
          clicked.current = true;
          setShown(false);
        },
        onPointerLeave: (e: React.PointerEvent) => {
          children.props.onPointerLeave?.(e);
          clicked.current = false;
        },
        onBlur: (e: React.FocusEvent) => {
          children.props.onBlur?.(e);
          clicked.current = false;
        },
      });
  return (
    <Tooltip
      describeChild
      placement={placement}
      enterDelay={250}
      disableInteractive
      open={controlled ? open : shown}
      onOpen={() => {
        if (controlled) onOpen?.();
        else if (!clicked.current) setShown(true);
      }}
      onClose={() => {
        if (controlled) onClose?.();
        else setShown(false);
      }}
      slotProps={{ tooltip: { sx: PEEK_SX } }}
      title={
        <Box sx={{ p: '6px 10px', fontFamily: t.fontSans, fontSize: 12, lineHeight: 1.45, color: t.fgDefault }}>
          {title}
          {sub && <Box sx={{ color: t.fgSubtle, fontSize: 11 }}>{sub}</Box>}
        </Box>
      }
    >
      {trigger}
    </Tooltip>
  );
}

/** One line of text cut with an ellipsis; a hover on a cut text shows all of it in a light card. */
function CutText({ text, children }: { text: string; children: (ref: React.RefObject<HTMLElement | null>) => ReactElement }) {
  const ref = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const cut = () => !!ref.current && ref.current.scrollWidth > ref.current.clientWidth;
  return (
    <ChromePeek title={text} open={open} onOpen={() => setOpen(cut())} onClose={() => setOpen(false)}>
      {children(ref)}
    </ChromePeek>
  );
}

const tagSx = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  height: 26,
  minWidth: 26,
  boxSizing: 'border-box',
  px: '6px',
  flexShrink: 0,
  border: `1px solid ${t.borderDefault}`,
  borderRadius: `${t.radiusMd}px`,
  background: t.bgDefault,
  color: t.fgMuted,
  fontFamily: t.fontSans,
  fontSize: 12,
  fontWeight: 500,
  lineHeight: 1,
  textDecoration: 'none',
  cursor: 'pointer',
  '& svg': { fontSize: 13, color: t.fgSubtle, flexShrink: 0 },
  '& .tag-label': { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140, pr: '2px' },
  '& .tag-count': { fontFamily: t.fontMono, fontSize: 10.5, fontWeight: 700 },
  '&:hover, &[aria-expanded="true"]': {
    borderColor: tokens.rustLine,
    background: t.accentMuted,
    color: t.accent,
    '& svg': { color: 'currentColor' },
  },
  '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
} as const;

export interface ChromeTarget {
  targetId: string;
  label: string;
  url?: string;
}

/** One button per tag kind. A kind with one item opens it in one click; a kind with more lists them. */
function TagButtons({
  targets,
  deliveryPath,
  clusterUnit,
  narrow,
}: {
  targets: readonly ChromeTarget[];
  deliveryPath?: string;
  clusterUnit?: { slug: string; path: string };
  narrow: boolean;
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  if (targets.length === 0 && !deliveryPath && !clusterUnit) return null;
  const one = targets.length === 1 ? targets[0] : undefined;
  return (
    <Box data-testid='component-side-pane-links' sx={{ display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
      {one && (
        <ChromePeek title={`Target: ${one.label}`} sub={one.url ? 'Opens in a new tab' : undefined}>
          {one.url ? (
            <Link
              href={one.url}
              target='_blank'
              rel='noopener noreferrer'
              underline='none'
              aria-label={`Open Target ${one.label} in a new tab`}
              data-testid='component-side-pane-target'
              sx={tagSx}
            >
              <StorageOutlinedIcon />
              {!narrow && <span className='tag-label'>{one.label}</span>}
            </Link>
          ) : (
            <Box component='span' tabIndex={0} aria-label={`Target: ${one.label}`} data-testid='component-side-pane-target' sx={{ ...tagSx, cursor: 'default' }}>
              <StorageOutlinedIcon />
              {!narrow && <span className='tag-label'>{one.label}</span>}
            </Box>
          )}
        </ChromePeek>
      )}
      {targets.length > 1 && (
        <>
          <ChromePeek title={`${targets.length} Targets`} sub={targets.map((x) => x.label).join(', ')}>
            <Box
              component='button'
              type='button'
              aria-haspopup='menu'
              aria-expanded={!!menuAnchor}
              aria-label={`${targets.length} Targets`}
              data-testid='component-side-pane-target'
              onClick={(e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
              sx={tagSx}
            >
              <StorageOutlinedIcon />
              <span className='tag-count'>{targets.length}</span>
            </Box>
          </ChromePeek>
          <Menu
            anchorEl={menuAnchor}
            open={!!menuAnchor}
            onClose={() => setMenuAnchor(null)}
            data-testid='component-side-pane-targets-menu'
            slotProps={{ paper: { sx: chromeMenuPaperSx }, list: { 'aria-label': 'Targets', dense: true } }}
          >
            <ListSubheader disableSticky sx={menuHeadingSx}>Targets</ListSubheader>
            {targets.map((x) =>
              x.url ? (
                <MenuItem
                  key={x.targetId}
                  component='a'
                  href={x.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={() => setMenuAnchor(null)}
                  sx={menuItemSx}
                >
                  <StorageOutlinedIcon className='mi-icon' />
                  <span className='mi-text mono'>{x.label}</span>
                  <OpenInNewIcon className='mi-ext' />
                </MenuItem>
              ) : (
                <MenuItem key={x.targetId} disableRipple sx={{ ...menuItemSx, cursor: 'default' }}>
                  <StorageOutlinedIcon className='mi-icon' />
                  <span className='mi-text mono'>{x.label}</span>
                </MenuItem>
              ),
            )}
          </Menu>
        </>
      )}
      {deliveryPath && (
        <ChromePeek title='GitOps' sub='Show what deploys this Variant'>
          <Link
            component={RouterLink}
            to={deliveryPath}
            underline='none'
            aria-label='GitOps: show what deploys this Variant'
            data-testid='component-side-pane-delivery'
            sx={tagSx}
          >
            <DeviceHubIcon />
          </Link>
        </ChromePeek>
      )}
      {clusterUnit && (
        <ChromePeek title={`Cluster Unit: ${clusterUnit.slug}`} sub='The Unit that deploys this Space'>
          <Link
            component={RouterLink}
            to={clusterUnit.path}
            underline='none'
            aria-label={`Open ${clusterUnit.slug}, the Unit that deploys this Space`}
            data-testid='component-side-pane-cluster-unit'
            sx={tagSx}
          >
            <DataObjectIcon />
          </Link>
        </ChromePeek>
      )}
    </Box>
  );
}

export interface PaneTitleRowProps {
  /** The Component, when the graph holds several. */
  componentName?: string;
  name: string;
  /** Where the name links to, when it is a link. */
  nameHref?: string;
  targets: readonly ChromeTarget[];
  deliveryPath?: string;
  clusterUnit?: { slug: string; path: string };
  /** A narrow pane shows the single Target as its icon only. */
  narrow: boolean;
  compare?: { pressed: boolean; onToggle: () => void };
  onCreateVariant?: () => void;
  onClose?: () => void;
}

const nameSx = {
  minWidth: 0,
  fontFamily: t.fontSans,
  fontSize: 15,
  fontWeight: 600,
  color: t.fgDefault,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export function PaneTitleRow({
  componentName,
  name,
  nameHref,
  targets,
  deliveryPath,
  clusterUnit,
  narrow,
  compare,
  onCreateVariant,
  onClose,
}: PaneTitleRowProps) {
  return (
    <Box
      data-testid='component-side-pane-title-row'
      sx={{
        height: TITLE_ROW_HEIGHT,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        p: '0 10px 0 16px',
        background: t.bgDefault,
        flexShrink: 0,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0, flex: '0 1 auto' }}>
        {componentName && (
          <>
            <CutText text={componentName}>
              {(ref) => (
                <Box
                  component='span'
                  ref={ref}
                  data-testid='component-side-pane-component'
                  sx={{ fontFamily: t.fontSans, fontSize: 12, fontWeight: 600, color: t.fgSubtle, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 3 auto' }}
                >
                  {componentName}
                </Box>
              )}
            </CutText>
            <Box component='span' aria-hidden sx={{ fontSize: 12, color: t.fgSubtle, flexShrink: 0 }}>
              ›
            </Box>
          </>
        )}
        <CutText text={name}>
          {(ref) =>
            nameHref ? (
              <Link
                href={nameHref}
                ref={ref as React.RefObject<HTMLAnchorElement>}
                data-testid='pane-title'
                sx={{
                  ...nameSx,
                  textDecoration: 'underline',
                  textDecorationColor: t.borderEdge,
                  textUnderlineOffset: 3,
                  '&:hover': { color: t.accent, textDecorationColor: t.accent },
                }}
              >
                {name}
              </Link>
            ) : (
              <Box component='span' ref={ref} data-testid='pane-title' sx={nameSx}>
                {name}
              </Box>
            )
          }
        </CutText>
      </Box>
      <TagButtons targets={targets} deliveryPath={deliveryPath} clusterUnit={clusterUnit} narrow={narrow} />
      <Box sx={{ flex: 1, minWidth: 4 }} />
      {compare && (
        <ChromePeek title='Compare' sub={compare.pressed ? 'Closes the compare bar' : 'Opens the compare bar'}>
          <Box
            component='button'
            type='button'
            aria-label='Compare'
            aria-pressed={compare.pressed}
            data-testid='component-compare-toggle'
            onClick={compare.onToggle}
            sx={roundIconButtonSx(compare.pressed)}
          >
            <CompareIcon />
          </Box>
        </ChromePeek>
      )}
      {onCreateVariant && (
        <ChromePeek title='Create variant'>
          <Box component='button' type='button' aria-label='Create variant' data-testid='component-create-variant' onClick={onCreateVariant} sx={roundIconButtonSx()}>
            <CallSplitIcon />
          </Box>
        </ChromePeek>
      )}
      {onClose && (
        <ChromePeek title='Close'>
          <Box component='button' type='button' aria-label='Close' data-testid='component-side-pane-close' onClick={onClose} sx={roundIconButtonSx()}>
            <CloseIcon />
          </Box>
        </ChromePeek>
      )}
    </Box>
  );
}

