// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link as RouterLink } from 'react-router-dom';

import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { CopyToClipboard } from '@/components/copy-to-clipboard/CopyToClipboard';
import { OrganizationSwitcher } from '@/components/organization-switcher/OrganizationSwitcher';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { buildShareableUrl } from '@/hooks/useOrgQueryParam';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DifferenceIcon from '@mui/icons-material/Difference';
import EastIcon from '@mui/icons-material/East';
import FlashOnOutlinedIcon from '@mui/icons-material/FlashOnOutlined';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import FunctionsIcon from '@mui/icons-material/Functions';
import LinkIcon from '@mui/icons-material/Link';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PolicyIcon from '@mui/icons-material/Policy';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import SchemaIcon from '@mui/icons-material/Schema';
import SearchIcon from '@mui/icons-material/Search';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import ViewListIcon from '@mui/icons-material/ViewList';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import Tooltip from '@mui/material/Tooltip';

import { useTrail, useTrailActionsSlot } from './TrailProvider';
import { Crumb, CrumbKind, PageCrumb, crumbName, crumbsThatFit } from './trail';

/** The height of the bar. It takes the place of the first row of the page header. */
export const TRAIL_BAR_HEIGHT = 40;

/**
 * A crumb's text is the size of a small Button's, as the organization beside it and the top
 * navigation use, so the trail does not read louder than either.
 */
const CRUMB_FONT_SIZE = '11.5px';
/** The size of a crumb's icon, and of the icons on the bar's buttons. */
const ICON_SIZE = 14;
/** The size of the arrow between two crumbs. */
const ARROW_SIZE = 12;

/** The same icons as the top navigation, so a crumb's type reads at a glance. */
const KIND_ICON: Record<CrumbKind, React.ComponentType<SvgIconProps>> = {
  component: AccountTreeIcon,
  space: FolderCopyIcon,
  unit: DataObjectIcon,
  target: StorageIcon,
  trigger: FlashOnOutlinedIcon,
  link: LinkIcon,
  function: FunctionsIcon,
  release: CalendarMonthIcon,
  validation: PolicyIcon,
  changeOrder: RocketLaunchIcon,
  changeSet: DifferenceIcon,
  changeWorkflow: SchemaIcon,
  diff: CompareArrowsIcon,
  view: SearchIcon,
  resource: ViewListIcon,
  channel: ForumOutlinedIcon,
  serviceAccount: SmartToyOutlinedIcon,
};

const KIND_NAME: Record<CrumbKind, string> = {
  component: 'Component',
  space: 'Space',
  unit: 'Unit',
  target: 'Target',
  trigger: 'Trigger',
  link: 'Link',
  function: 'Function',
  release: 'Release',
  validation: 'Validation',
  changeOrder: 'ChangeOrder',
  changeSet: 'ChangeSet',
  changeWorkflow: 'ChangeWorkflow',
  diff: 'Changes',
  view: 'View',
  resource: 'Resource',
  channel: 'Channel',
  serviceAccount: 'Service account',
};

/** The widest a crumb that is not the page on screen grows, so one long name cannot fill the bar. */
const CRUMB_CAP = '28ch';

const crumbSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  flexShrink: 0,
  maxWidth: CRUMB_CAP,
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  fontSize: CRUMB_FONT_SIZE,
  lineHeight: '20px',
  textDecoration: 'none',
} as const;

/** The page on screen has no cap on its name; it gives way only to the width of the bar. */
const currentSx = { maxWidth: 'none', fontWeight: 600 } as const;

/**
 * A crumb's tooltip names its type and its full name. A list page's crumb ("Targets") already says
 * both, so it has none.
 */
const crumbTip = (crumb: PageCrumb, name: string) =>
  name === crumb.label && crumb.label.includes(KIND_NAME[crumb.kind]) ? '' : `${KIND_NAME[crumb.kind]}: ${name}`;

const nameSx = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;

/**
 * A Unit's name is `space/unit`. Unit slugs repeat between Spaces, but the Unit is what the crumb
 * is about, so a long name loses the end of its Space and keeps the Unit.
 *
 * With a `cap`, the Unit part is cut only when it alone is wider than the cap. The crumb's
 * `min-width: min-content` (see `unitCrumbSx`) then wins over the crumb's own cap, and the Space
 * part's grid track makes its narrowest width 3ch instead of its whole name.
 */
const UnitName = ({ name, cap }: { name: string; cap?: string }) => {
  const slash = name.lastIndexOf('/');
  if (slash <= 0) {
    return (
      <Box component='span' sx={{ ...nameSx, maxWidth: cap }}>
        {name}
      </Box>
    );
  }
  return (
    <Box component='span' sx={{ display: 'flex', minWidth: 0 }}>
      <Box component='span' sx={{ display: 'grid', gridTemplateColumns: 'minmax(3ch, max-content)', flex: '0 1 auto', minWidth: '3ch' }}>
        <Box component='span' sx={{ ...nameSx, minWidth: 0 }}>
          {name.slice(0, slash)}
        </Box>
      </Box>
      <Box component='span' sx={{ ...nameSx, flexShrink: 0, maxWidth: cap ?? 'calc(100% - 3ch)' }}>
        {name.slice(slash)}
      </Box>
    </Box>
  );
};

/** A Unit crumb that is not the page on screen is never narrower than its whole Unit part. */
const unitCrumbSx = { minWidth: 'min-content' } as const;

const Separator = () => (
  <Box component='span' aria-hidden sx={{ display: 'inline-flex', color: 'text.disabled', flexShrink: 0 }}>
    <EastIcon sx={{ fontSize: ARROW_SIZE }} />
  </Box>
);

const CrumbContent = ({ kind, name, cap }: { kind: CrumbKind; name: string; cap?: string }) => {
  const Icon = KIND_ICON[kind];
  return (
    <>
      <Icon aria-label={KIND_NAME[kind]} sx={{ fontSize: ICON_SIZE, flexShrink: 0 }} />
      {kind === 'unit' ? (
        <UnitName name={name} cap={cap} />
      ) : (
        <Box component='span' sx={nameSx}>
          {name}
        </Box>
      )}
    </>
  );
};

/** The gap between the items of the trail, in pixels. */
const GAP = 4;
/** The width of the arrow between two crumbs. */
const ARROW_WIDTH = ARROW_SIZE;
/** The room the "Earlier pages" button and its arrow take. */
const MENU_WIDTH = 24 + ARROW_WIDTH + 2 * GAP;

/**
 * The bar above each page: the organization, then the trail of pages visited in
 * this tab, then the page's header actions. `Layout` renders it, so it is on
 * each page in each state.
 *
 * Crumbs keep their full width. When the trail is longer than the bar, the
 * oldest crumbs leave it first, into the "Earlier pages" menu, so the page on
 * screen and the pages just before it are never squeezed.
 */
export const TrailBar = () => {
  const { userInfo } = useUserInfo();
  const { state, current } = useTrail();
  const { setSlot } = useTrailActionsSlot();
  const { containerRef, width } = useContainerWidth();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  // A click on a crumb changes the page, and the crumbs move under a pointer that has not moved, so
  // hover opens no tooltip until the pointer moves on the new page.
  const [armedFor, setArmedFor] = useState<string | undefined>(undefined);
  const currentKey = current?.key;
  const armed = armedFor === currentKey;
  const barRef = useRef<HTMLDivElement>(null);
  /** Where the pointer was at its last event on the bar. */
  const pointerAt = useRef('');
  // A move anywhere on the bar arms it. The browser sends `pointerover` again when the crumbs move
  // under a still pointer, so only a new position counts. A pointer that comes from the page straight
  // onto a crumb arms it with that crumb's `pointerover`, which comes before the `mouseover` that
  // opens a tooltip, so `flushSync` arms it in time. A DOM listener, because the header actions are
  // a portal into the bar, and React sends their events to `Header`, not to the bar.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const types = ['pointerover', 'pointermove', 'pointerdown'] as const;
    const onPointer = (e: PointerEvent) => {
      const at = `${e.clientX},${e.clientY}`;
      if (!armed && at !== pointerAt.current) flushSync(() => setArmedFor(currentKey));
      pointerAt.current = at;
    };
    for (const type of types) bar.addEventListener(type, onPointer);
    return () => {
      for (const type of types) bar.removeEventListener(type, onPointer);
    };
  }, [armed, currentKey]);
  const navRef = useRef<HTMLElement | null>(null);
  const orgRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  /** The width of each crumb with its arrow, by key, and of the parts beside the crumbs. */
  const [measured, setMeasured] = useState<{ crumbs: Record<string, number>; fixed: number }>({ crumbs: {}, fixed: 0 });

  const visited: Crumb[] = current ? state.crumbs.filter((c) => c.key !== current.key) : state.crumbs;
  const all: PageCrumb[] = current ? [...visited, current] : visited;

  /** A crumb's width depends on its name and on whether it is the page on screen. */
  const widthId = (crumb: PageCrumb) => `${crumb.key}\n${crumbName(state, crumb)}\n${crumb === current ? 1 : 0}`;
  const widths = all.map((c) => measured.crumbs[widthId(c)]);
  // A crumb not yet measured is drawn at its full width for one layout pass, which the effect below
  // measures before the browser paints.
  const measuring = width <= 0 || widths.some((w) => w === undefined);

  // Each render: a name that loads, or the organization's, changes a width without changing the trail.
  useLayoutEffect(() => {
    const found: Record<string, number> = {};
    for (const el of navRef.current?.querySelectorAll<HTMLElement>('[data-width-id]') ?? []) {
      found[el.dataset.widthId ?? ''] = Math.ceil(el.getBoundingClientRect().width) + ARROW_WIDTH + 2 * GAP;
    }
    const fixed = Math.ceil((orgRef.current?.getBoundingClientRect().width ?? 0) + (copyRef.current?.getBoundingClientRect().width ?? 0)) + 2 * GAP;
    setMeasured((prev) => {
      // Only a pass that draws each crumb at its full width gives widths to keep.
      const add = measuring ? Object.entries(found).filter(([id, w]) => prev.crumbs[id] !== w) : [];
      if (add.length === 0 && prev.fixed === fixed) return prev;
      return { crumbs: { ...prev.crumbs, ...Object.fromEntries(add) }, fixed };
    });
  });

  const fit = measuring ? all.length : crumbsThatFit(widths, width - measured.fixed, MENU_WIDTH);
  const shown = Math.max(0, fit - (current ? 1 : 0));
  const hidden = visited.slice(0, visited.length - shown);
  const visible = visited.slice(visited.length - shown);

  return (
    <Box
      ref={barRef}
      data-testid='trail-bar'
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        height: TRAIL_BAR_HEIGHT,
        flexShrink: 0,
        px: 2,
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        component='nav'
        aria-label='Trail'
        data-testid='trail'
        ref={(el: HTMLElement | null) => {
          navRef.current = el;
          containerRef(el);
        }}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: `${GAP}px`,
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          // One rust ring for each control of the trail, drawn inside it because the nav clips its overflow.
          '& a:focus-visible, & .MuiButtonBase-root.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '-2px' },
        }}
      >
        <Box ref={orgRef} sx={{ flexShrink: 0 }}>
          <OrganizationSwitcher currentOrganizationId={userInfo.ExternalOrganizationID || ''} />
        </Box>
        {hidden.length > 0 && (
          <>
            <Separator />
            <Tooltip title='Earlier pages'>
              <IconButton
                size='small'
                aria-label='Earlier pages'
                aria-haspopup='menu'
                data-testid='trail-earlier'
                onClick={(e) => setMenuAnchor(e.currentTarget)}
              >
                <MoreHorizIcon sx={{ fontSize: ICON_SIZE }} />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
              {hidden.map((crumb) => {
                const Icon = KIND_ICON[crumb.kind];
                return (
                  <MenuItem key={crumb.key} component={RouterLink} to={crumb.href} onClick={() => setMenuAnchor(null)} data-testid='trail-crumb'>
                    <ListItemIcon>
                      <Icon fontSize='small' aria-label={KIND_NAME[crumb.kind]} />
                    </ListItemIcon>
                    {crumbName(state, crumb)}
                  </MenuItem>
                );
              })}
            </Menu>
          </>
        )}
        {visible.map((crumb) => {
          const name = crumbName(state, crumb);
          return (
            <Box key={crumb.key} sx={{ display: 'contents' }}>
              <Separator />
              <Tooltip title={crumbTip(crumb, name)} enterDelay={600} disableHoverListener={!armed}>
                <Box
                  component={RouterLink}
                  to={crumb.href}
                  data-testid='trail-crumb'
                  data-kind={crumb.kind}
                  data-width-id={widthId(crumb)}
                  sx={{
                    ...crumbSx,
                    ...(crumb.kind === 'unit' ? unitCrumbSx : {}),
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                  }}
                >
                  <CrumbContent kind={crumb.kind} name={name} cap={CRUMB_CAP} />
                </Box>
              </Tooltip>
            </Box>
          );
        })}
        {current && (
          <>
            <Separator />
            <Tooltip title={crumbTip(current, crumbName(state, current))} enterDelay={600} disableHoverListener={!armed}>
              <Box
                aria-current='page'
                data-testid='trail-current'
                data-kind={current.kind}
                data-width-id={widthId(current)}
                // It gives way only when it alone is wider than the bar.
                sx={{ ...crumbSx, ...currentSx, ...(measuring ? {} : { flexShrink: 1, minWidth: 0 }), color: 'text.primary' }}
              >
                <CrumbContent kind={current.kind} name={crumbName(state, current)} />
              </Box>
            </Tooltip>
          </>
        )}
        {/* The copy button takes this colour; after a copy it turns to the success colour. */}
        <Box ref={copyRef} sx={{ flexShrink: 0, display: 'inline-flex', color: 'text.secondary' }}>
          <CopyToClipboard
            text={userInfo.ExternalOrganizationID ? buildShareableUrl(userInfo.ExternalOrganizationID) : ''}
            title='Copy shareable link with org context'
            sx={{ ml: 0.5, '& .MuiSvgIcon-root': { fontSize: ICON_SIZE } }}
          />
        </Box>
      </Box>
      {/* The page's header actions, which `Header` renders into this element. */}
      <Box ref={setSlot} data-testid='trail-actions' sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }} />
    </Box>
  );
};
