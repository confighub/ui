// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import AddIcon from '@mui/icons-material/Add';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import DifferenceIcon from '@mui/icons-material/Difference';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderOffIcon from '@mui/icons-material/FolderOff';
import GridViewIcon from '@mui/icons-material/GridView';
import InboxIcon from '@mui/icons-material/Inbox';
import ListIcon from '@mui/icons-material/List';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import SearchIcon from '@mui/icons-material/Search';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import AppsIcon from '@mui/icons-material/Apps';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DataObjectIcon from '@mui/icons-material/DataObject';
import EngineeringIcon from '@mui/icons-material/Engineering';
import FolderCopyIcon from '@mui/icons-material/FolderCopy';
import LockIcon from '@mui/icons-material/Lock';
import PeopleIcon from '@mui/icons-material/People';
import StorageIcon from '@mui/icons-material/Storage';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import WorkspacesIcon from '@mui/icons-material/Workspaces';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Avatar,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Skeleton,
  Snackbar,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import { IMAGE_DIFF_SPECIMEN_UNITS } from '../x/apps/imageDiffSpecimen';
import { ReleaseDiffPanel } from '../x/apps/ReleaseDiffPanel';
import { ReleaseSelectors, type ReleaseOption } from '../x/apps/ReleaseSelectors';

const DRAWER_WIDTH = 216;
const APPBAR_HEIGHT = 46;

interface NavItem {
  id: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Foundations',
    items: [
      { id: 'colors', label: 'Colors' },
      { id: 'typography', label: 'Typography' },
      { id: 'shadows', label: 'Shadows' },
      { id: 'borders', label: 'Borders & Radius' },
      { id: 'spacing', label: 'Spacing' },
    ],
  },
  {
    label: 'Actions & Forms',
    items: [
      { id: 'buttons', label: 'Buttons' },
      { id: 'inputs', label: 'Form Inputs' },
      { id: 'toggles', label: 'Checkboxes & Toggles' },
      { id: 'tags', label: 'Tags & Chips' },
      { id: 'kbd', label: 'Keyboard' },
    ],
  },
  {
    label: 'Display & Feedback',
    items: [
      { id: 'badges', label: 'Status Badges' },
      { id: 'unit-status', label: 'Unit Status' },
      { id: 'gate-cards', label: 'Gate Cards' },
      { id: 'cards', label: 'Node Cards' },
      { id: 'linkchips', label: 'Link Chips' },
      { id: 'alerts', label: 'Alerts' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'loading', label: 'Loading' },
      { id: 'progress', label: 'Progress' },
      { id: 'skeletons', label: 'Skeletons' },
      { id: 'empty', label: 'Empty States' },
      { id: 'empty-states', label: 'Empty Variants' },
      { id: 'diff', label: 'Diff Indicators' },
      { id: 'tooltip', label: 'Tooltips' },
    ],
  },
  {
    label: 'Layout & Nav',
    items: [
      { id: 'topnav', label: 'Top Nav' },
      { id: 'sidebar', label: 'Left Sidebar' },
      { id: 'breadcrumb', label: 'Breadcrumb' },
      { id: 'pageheader', label: 'Page Header' },
      { id: 'toolbar', label: 'Toolbar' },
      { id: 'tabs', label: 'Tabs' },
      { id: 'accordion', label: 'Accordion' },
      { id: 'table', label: 'Data Table' },
      { id: 'modal', label: 'Modal' },
    ],
  },
  {
    label: 'Dialogs & Filters',
    items: [
      { id: 'drawer', label: 'Drawer Panel' },
      { id: 'filterbar', label: 'Filter Bar' },
      { id: 'filterchips', label: 'Filter Chips' },
      { id: 'searchinput', label: 'Search Input' },
      { id: 'creationflow', label: 'Creation Flow' },
      { id: 'actionmenu', label: 'Action Menu' },
      { id: 'confirmdialog', label: 'Confirmation' },
    ],
  },
  {
    label: 'Data Display',
    items: [
      { id: 'datagrid', label: 'Entity DataGrid' },
      { id: 'appcards', label: 'App Cards' },
      { id: 'detailpane', label: 'Detail Pane' },
      { id: 'tree', label: 'Tree / Hierarchy' },
      { id: 'statrow', label: 'Stat Row' },
      { id: 'diffview', label: 'Diff / Code View' },
    ],
  },
];

const ALL_IDS = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * The release diff, driven by fixture documents rather than by a backend.
 *
 * `ReleaseDiffPanel` is presentational — it takes resolved units as a prop and
 * issues no queries — so the whole renderer can be exercised here, including the
 * container-image rows whose interesting cases (a digest-only move, a registry
 * move, a container that did not move at all) are awkward to stage against a
 * live server.
 *
 * The fixture's diff is computed by the product's own parser, so what renders
 * here is what a real comparison of those two documents would render.
 */
/**
 * The two release selectors, which are what a reader uses to choose a
 * comparison. Fixture options, so the states that matter — the current
 * release, the working configuration, a release whose count never resolved —
 * are all reachable without publishing anything.
 */
const SELECTOR_SPECIMEN_OPTIONS: ReleaseOption[] = [
  { id: 'decl', label: 'Working config', isCurrent: false, isDeclared: true, state: 'resolved', changedFields: 7 },
  { id: 'r-12', label: 'rel-12', displayName: 'Raise the memory ceiling', isCurrent: true, isDeclared: false, stamp: '14 Sep 09:12', age: '1d ago', bundleDigest: '7c41ab9', changedFields: 14, state: 'resolved' },
  { id: 'r-11', label: 'rel-11', isCurrent: false, isDeclared: false, stamp: '13 Sep 17:20', age: '1d ago', bundleDigest: '21e8f04', changedFields: 3, state: 'resolved' },
  { id: 'r-10', label: 'rel-10', isCurrent: false, isDeclared: false, stamp: '12 Sep 16:42', age: '2d ago', bundleDigest: '9b30d55', changedFields: 5, state: 'resolved', note: 'excludes oversized units' },
  { id: 'r-09', label: 'rel-9', isCurrent: false, isDeclared: false, stamp: '11 Sep 19:08', age: '3d ago', bundleDigest: '4f1c9ab', state: 'unavailable' },
];

function ReleaseSelectorsSection() {
  // ONE END, which is how the pane arrives. The second slot's empty square is
  // the state worth looking at here, and seeding it hid the one thing this
  // specimen is for.
  const [selection, setSelection] = useState<readonly string[]>(['r-12']);
  return (
    <Box id='releaseselectors' sx={{ mb: 8 }} data-testid='design-system-release-selectors'>
      <SectionHeader
        title='Release selectors'
        desc='The first slot always holds something. The second starts empty, and while it is empty it is a square rather than a second chip — the comparison runs against the first slot\u2019s own predecessor either way, so an empty second slot is an invitation and not a hole. Filling it grows it to full size, because a release name does not fit in 36px and small has to keep meaning empty. Both endpoints stay on screen while the picker is open, because choosing a comparison means holding two things in mind. The picker lists what a release actually carries — its name, whether it is current, when it shipped, the digest of its stored bundle and how much it changed. A release whose history could not be loaded is shown and not offered.'
      />
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {[380, 575, 650].map((width) => (
          <Box key={width} data-testid={`design-system-release-selectors-at-${width}`} sx={{ width, flex: 'none' }}>
            <Typography variant='caption' sx={{ color: 'text.disabled', display: 'block', mb: 1 }}>{`${width}px`}</Typography>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <ReleaseSelectors options={SELECTOR_SPECIMEN_OPTIONS} selection={selection} onSelectionChange={setSelection} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ReleaseDiffSpecimenSection() {
  return (
    <Box id='releasediff' sx={{ mb: 8 }} data-testid='design-system-release-diff'>
      <SectionHeader
        title='Release diff — container images'
        desc='Image changes lift to the head of their unit: the repository once and dimmed, the tag diffed by token, magnitude on a meter rather than on red/green. A container that did not move is shown as context and is never counted as a change. The pane is user-resizable, so the row degrades by priority — the tag transition keeps its room and the registry falls away first.'
      />
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {[380, 575, 650].map((width) => (
          <Box key={width} data-testid={`design-system-release-diff-at-${width}`} sx={{ width, flex: 'none' }}>
            <Typography variant='caption' sx={{ color: 'text.disabled', display: 'block', mb: 1 }}>
              {`${width}px`}
            </Typography>
            {/* minWidth 0 so the panel is SIZED to the width above rather than
                merely clipped by it — a flex item's automatic minimum is its
                content, which would hide exactly the overflow worth seeing. */}
            <Box sx={{ height: 560, border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden', display: 'flex', '& > *': { flex: '1 1 0', minWidth: 0 } }}>
              <ReleaseDiffPanel
                fromLabel='rel-1'
                toLabel='rel-2'
                units={IMAGE_DIFF_SPECIMEN_UNITS}
                isLoading={false}
                emptySubtitle=''
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <Box mb={5}>
      <Typography
        variant='overline'
        sx={{ color: 'text.disabled', display: 'block', mb: 0.5 }}
      >
        ConfigHub Design System
      </Typography>
      <Typography variant='h2' sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography variant='body1' color='text.secondary' sx={{ maxWidth: 580 }}>
        {desc}
      </Typography>
    </Box>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant='caption'
      sx={{ display: 'block', mb: 2, mt: 4, color: 'text.disabled' }}
    >
      {children}
    </Typography>
  );
}

function TokenLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: '10px',
        fontFamily: 'var(--font-mono)',
        color: 'text.disabled',
        mt: 0.5,
        textAlign: 'center',
      }}
    >
      {children}
    </Typography>
  );
}

function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: 3,
        display: 'flex',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 2,
        borderRadius: 'var(--r-md)',
      }}
    >
      {children}
    </Paper>
  );
}

function KbdKey({ children }: { children: React.ReactNode }) {
  return (
    <Paper
      elevation={1}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 24,
        height: 22,
        px: 0.75,
        borderRadius: '3px',
        borderBottom: '2px solid var(--bd0)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 600,
        color: 'text.secondary',
      }}
    >
      {children}
    </Paper>
  );
}

function Chord({ keys }: { keys: string[] }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      {keys.map((k, i) => (
        <KbdKey key={i}>{k}</KbdKey>
      ))}
    </Box>
  );
}

// ── Color swatch ─────────────────────────────────────────────────────────────

function Swatch({
  bg,
  token,
  hex,
  border,
}: {
  bg: string;
  token: string;
  hex: string;
  border?: string;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 'var(--r-sm)',
          background: bg,
          border: border ?? '1px solid rgba(0,0,0,0.08)',
          flexShrink: 0,
        }}
      />
      <TokenLabel>{token}</TokenLabel>
      <TokenLabel>{hex}</TokenLabel>
    </Box>
  );
}

// ── Node card ─────────────────────────────────────────────────────────────────

function NodeCard({
  name,
  space,
  icon,
  iconBg,
  statusLabel,
  statusColor,
  upgradeCount,
}: {
  name: string;
  space: string;
  icon: string;
  iconBg: string;
  statusLabel: string;
  statusColor: 'success' | 'info' | 'warning' | 'error' | 'default';
  upgradeCount?: number;
}) {
  return (
    <Paper
      elevation={2}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 1.5,
        borderRadius: 'var(--r-md)',
        width: 320,
        cursor: 'pointer',
        '&:hover': { boxShadow: 'var(--sh-md)' },
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--bd0)',
          background: iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary' }}>
          {name}
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
          {space}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
        <Chip label={statusLabel} color={statusColor} size='small' />
        {upgradeCount !== undefined && (
          <Chip label={`↑${upgradeCount}`} color='secondary' size='small' />
        )}
      </Box>
    </Paper>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────

function ColorsSection() {
  return (
    <Box id='colors' sx={{ mb: 8 }}>
      <SectionHeader
        title='Color System'
        desc='Seven semantic color families, each with foreground, tinted background, and border alpha. Rust is the brand action color — never for status.'
      />

      <SubLabel>Brand — rust</SubLabel>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 4 }}>
        <Swatch bg='#ba3d03' token='--rust' hex='#ba3d03' />
        <Swatch bg='#8c2c00' token='--rust-dark' hex='#8c2c00' />
        <Swatch bg='rgba(186,61,3,0.055)' token='--rust-bg' hex='rgba(186,61,3,.055)' border='1px solid rgba(186,61,3,0.18)' />
      </Box>

      <SubLabel>Semantic — success · info · upgrade · warning · error</SubLabel>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 4 }}>
        <Swatch bg='#15803d' token='--green' hex='#15803d' />
        <Swatch bg='#f0fdf4' token='--green-bg' hex='#f0fdf4' border='1px solid rgba(21,128,61,0.18)' />
        <Swatch bg='#1a50c1' token='--blue' hex='#1a50c1' />
        <Swatch bg='#eff4ff' token='--blue-bg' hex='#eff4ff' border='1px solid rgba(26,80,193,0.18)' />
        <Swatch bg='#6824c4' token='--purple' hex='#6824c4' />
        <Swatch bg='#f4f0ff' token='--purple-bg' hex='#f4f0ff' border='1px solid rgba(104,36,196,0.18)' />
        <Swatch bg='#b45309' token='--amber' hex='#b45309' />
        <Swatch bg='#fffbeb' token='--amber-bg' hex='#fffbeb' border='1px solid rgba(180,83,9,0.20)' />
        <Swatch bg='#b91c1c' token='--red' hex='#b91c1c' />
        <Swatch bg='#fef2f2' token='--red-bg' hex='#fef2f2' border='1px solid rgba(185,28,28,0.18)' />
      </Box>

      <SubLabel>Neutrals — text & surface scale</SubLabel>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 4 }}>
        <Swatch bg='#111214' token='--t1' hex='#111214' />
        <Swatch bg='#505969' token='--t2' hex='#505969' />
        <Swatch bg='#8e9aaa' token='--t3' hex='#8e9aaa' />
        <Swatch bg='#bcc6d0' token='--t4' hex='#bcc6d0' />
        <Swatch bg='#ffffff' token='--surface' hex='#ffffff' border='1px solid #e6e8ec' />
        <Swatch bg='#f6f7f9' token='--bg' hex='#f6f7f9' border='1px solid #e6e8ec' />
        <Swatch bg='#e6e8ec' token='--bd0' hex='#e6e8ec' border='1px solid #d0d5dc' />
      </Box>

      <SubLabel>Semantic usage</SubLabel>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        <Chip label='● Ready' color='success' size='small' />
        <Chip label='▶▶ Applying' color='info' size='small' />
        <Chip label='↑ 3 Upgrades' color='secondary' size='small' />
        <Chip label='⚠ Gated' color='warning' size='small' />
        <Chip label='✕ Degraded' color='error' size='small' />
        <Chip label='Unknown' size='small' />
      </Box>

      <Paper
        elevation={0}
        sx={{
          bgcolor: 'var(--rust-bg)',
          border: '1px solid var(--rust-ring)',
          borderRadius: 'var(--r-md)',
          p: 2,
          display: 'flex',
          gap: 1.5,
        }}
      >
        <Typography color='primary' sx={{ fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
          Brand rule:
        </Typography>
        <Typography variant='body2' color='text.secondary'>
          Rust is the action color — CTAs, active nav, and selection rings only. Never use it for status indicators.
        </Typography>
      </Paper>
    </Box>
  );
}

function TypographySection() {
  const rows: Array<{ variant: 'h1' | 'h2' | 'h3' | 'h4' | 'body1' | 'body2' | 'subtitle1' | 'subtitle2' | 'caption' | 'overline'; label: string; spec: string; sample: string }> = [
    { variant: 'h1', label: 'h1', spec: '22px / 700', sample: 'Display Heading' },
    { variant: 'h2', label: 'h2', spec: '17px / 600', sample: 'Section Heading' },
    { variant: 'h3', label: 'h3', spec: '14px / 600', sample: 'Subsection Heading' },
    { variant: 'h4', label: 'h4', spec: '13.5px / 600', sample: 'Card Title' },
    { variant: 'body1', label: 'body1', spec: '13.5px / 400', sample: 'Body text — the default reading size for content and descriptions.' },
    { variant: 'body2', label: 'body2', spec: '12.5px / 400', sample: 'Small body — helper text, secondary content, sidebar labels.' },
    { variant: 'subtitle1', label: 'subtitle1', spec: '13px / 500', sample: 'Subtitle One — list titles, form labels' },
    { variant: 'subtitle2', label: 'subtitle2', spec: '12px / 500', sample: 'Subtitle Two — metadata, timestamps' },
    { variant: 'caption', label: 'caption', spec: '10.5px / 700 · uppercase', sample: 'CAPTION LABEL' },
    { variant: 'overline', label: 'overline', spec: '9.5px / 700 · uppercase', sample: 'OVERLINE' },
  ];

  return (
    <Box id='typography' sx={{ mb: 8 }}>
      <SectionHeader
        title='Typography Scale'
        desc='Manrope for UI text, JetBrains Mono for code and tokens. Tight letter-spacing keeps the hierarchy crisp at small sizes.'
      />
      <Box sx={{ border: '1px solid var(--bd0)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {rows.map((row, i) => (
          <Box
            key={row.label}
            sx={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 3,
              px: 3,
              py: 1.5,
              borderBottom: i < rows.length - 1 ? '1px solid var(--bd1)' : 'none',
              '&:hover': { bgcolor: 'var(--bg)' },
            }}
          >
            <Box sx={{ width: 320, flexShrink: 0 }}>
              <Typography variant={row.variant}>{row.sample}</Typography>
            </Box>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled', width: 80, flexShrink: 0 }}>
              {row.label}
            </Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
              {row.spec}
            </Typography>
          </Box>
        ))}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            px: 3,
            py: 1.5,
            '&:hover': { bgcolor: 'var(--bg)' },
          }}
        >
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '12.5px', color: 'text.secondary', width: 320, flexShrink: 0 }}>
            {'const slug = unit.Slug;'}
          </Typography>
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled', width: 80, flexShrink: 0 }}>
            mono
          </Typography>
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
            JetBrains Mono · 12.5px / 400
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}

function ShadowsSection() {
  const shadows: Array<{ label: string; sublabel: string; elevation?: number; sx?: object }> = [
    { label: 'xs', sublabel: 'Tooltips, popovers', elevation: 1 },
    { label: 'sm', sublabel: 'Cards, panels (default)', elevation: 2 },
    { label: 'md', sublabel: 'Dropdowns, menus', elevation: 4 },
    { label: 'lg', sublabel: 'Modals, drawers', elevation: 8 },
    { label: 'sel', sublabel: 'Selection ring', sx: { boxShadow: 'var(--sh-sel)' } },
  ];

  return (
    <Box id='shadows' sx={{ mb: 8 }}>
      <SectionHeader
        title='Shadow Scale'
        desc='Four elevation stops plus the selection ring. Each shadow is tuned to feel light and layered, not dramatic.'
      />
      <Canvas>
        {shadows.map((s) => (
          <Box key={s.label} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
            <Paper
              elevation={s.elevation}
              sx={{
                width: 100,
                height: 80,
                borderRadius: 'var(--r-md)',
                ...(s.sx ?? {}),
              }}
            />
            <TokenLabel>--sh-{s.label}</TokenLabel>
            <TokenLabel>{s.sublabel}</TokenLabel>
          </Box>
        ))}
      </Canvas>
    </Box>
  );
}

function BordersSection() {
  return (
    <Box id='borders' sx={{ mb: 8 }}>
      <SectionHeader
        title='Borders & Radius'
        desc='Three border opacities for structural vs. subtle vs. hairline dividers. Three radius steps: tight, medium, pill.'
      />

      <SubLabel>Border scale</SubLabel>
      <Box sx={{ display: 'flex', gap: 3, mb: 4 }}>
        {(['--bd0', '--bd1', '--bd2'] as const).map((token) => (
          <Box key={token} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: 80,
                height: 48,
                borderRadius: 'var(--r-sm)',
                border: `1px solid var(${token})`,
                bgcolor: 'background.paper',
              }}
            />
            <TokenLabel>{token}</TokenLabel>
          </Box>
        ))}
      </Box>

      <SubLabel>Radius scale</SubLabel>
      <Box sx={{ display: 'flex', gap: 3 }}>
        {[
          { token: '--r-sm', label: '5px', width: 60 },
          { token: '--r-md', label: '9px', width: 80 },
          { token: '--r-pill', label: '999px', width: 100 },
        ].map((r) => (
          <Box key={r.token} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                width: r.width,
                height: 36,
                borderRadius: `var(${r.token})`,
                bgcolor: 'var(--rust-bg)',
                border: '1px solid var(--rust-ring)',
              }}
            />
            <TokenLabel>{r.token}</TokenLabel>
            <TokenLabel>{r.label}</TokenLabel>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function SpacingSection() {
  const steps = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64];

  return (
    <Box id='spacing' sx={{ mb: 8 }}>
      <SectionHeader
        title='Spacing Scale'
        desc='4px base unit. Use multiples of 4 for all spacing decisions. Common touch targets are 32px (buttons) and 40px (rows).'
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {steps.map((px) => (
          <Box key={px} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled', width: 32, flexShrink: 0, textAlign: 'right' }}>
              {px}
            </Typography>
            <Box
              sx={{
                height: 8,
                width: px,
                bgcolor: 'var(--rust-bg)',
                border: '1px solid var(--rust-ring)',
                borderRadius: '2px',
                flexShrink: 0,
              }}
            />
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
              {px}px
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ButtonsSection() {
  return (
    <Box id='buttons' sx={{ mb: 8 }}>
      <SectionHeader
        title='Buttons'
        desc='No uppercase. 32px default height. 600 weight. Primary uses rust — secondary and ghost are neutral.'
      />

      <SubLabel>Variants</SubLabel>
      <Canvas>
        <Button variant='contained'>Apply Changes</Button>
        <Button variant='outlined'>Secondary</Button>
        <Button variant='text'>Ghost</Button>
        <Button variant='contained' color='error'>Delete Space</Button>
      </Canvas>

      <SubLabel>Sizes</SubLabel>
      <Canvas>
        <Button variant='contained' size='small'>Small</Button>
        <Button variant='contained' size='medium'>Default</Button>
        <Button variant='contained' size='large'>Large</Button>
      </Canvas>

      <SubLabel>Disabled</SubLabel>
      <Canvas>
        <Button variant='contained' disabled>Apply Changes</Button>
        <Button variant='outlined' disabled>Secondary</Button>
        <Button variant='text' disabled>Ghost</Button>
      </Canvas>

      <SubLabel>With icon</SubLabel>
      <Canvas>
        <Button variant='contained' startIcon={<AddIcon />}>Add Space</Button>
        <Button variant='outlined' startIcon={<SearchIcon />}>Search</Button>
      </Canvas>

      <SubLabel>Icon buttons</SubLabel>
      <Canvas>
        <IconButton size='small'><AddIcon fontSize='small' /></IconButton>
        <IconButton size='small'><CloseIcon fontSize='small' /></IconButton>
        <IconButton size='small'><MoreHorizIcon fontSize='small' /></IconButton>
      </Canvas>
    </Box>
  );
}

function InputsSection() {
  return (
    <Box id='inputs' sx={{ mb: 8 }}>
      <SectionHeader
        title='Form Inputs'
        desc='34px height, bg-subtle fill, border-default stroke. Focus ring is rust. All forms use size="small".'
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, maxWidth: 360 }}>
        <TextField size='small' placeholder='Search spaces…' label='Default' />
        <TextField size='small' label='Focused' focused placeholder='Search spaces…' />
        <TextField
          size='small'
          label='Error'
          error
          helperText='Value is required'
          defaultValue='bad-value'
        />
        <TextField size='small' label='Disabled' disabled defaultValue='production' />
        <TextField
          size='small'
          label='With icon'
          placeholder='Search…'
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
        <TextField size='small' label='Multiline' multiline rows={3} placeholder='Describe this space…' />
      </Box>
    </Box>
  );
}

function TogglesSection() {
  const [switchOn, setSwitchOn] = useState(false);
  const [alignment, setAlignment] = useState('list');

  return (
    <Box id='toggles' sx={{ mb: 8 }}>
      <SectionHeader
        title='Checkboxes & Toggles'
        desc='Rust accent for checked/active state across all selection controls.'
      />

      <SubLabel>Checkbox states</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox size='small' />
            <Typography variant='body2' color='text.secondary'>Unchecked</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox size='small' defaultChecked />
            <Typography variant='body2' color='text.secondary'>Checked</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox size='small' indeterminate />
            <Typography variant='body2' color='text.secondary'>Indeterminate</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Checkbox size='small' disabled />
            <Typography variant='body2' color='text.disabled'>Disabled</Typography>
          </Box>
        </Box>
      </Canvas>

      <SubLabel>Switch</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch size='small' checked={switchOn} onChange={(e) => setSwitchOn(e.target.checked)} />
          <Typography variant='body2' color='text.secondary'>{switchOn ? 'On' : 'Off'}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Switch size='small' disabled />
          <Typography variant='body2' color='text.disabled'>Disabled</Typography>
        </Box>
      </Canvas>

      <SubLabel>Toggle button group</SubLabel>
      <Canvas>
        <ToggleButtonGroup
          value={alignment}
          exclusive
          onChange={(_e, v) => { if (v) setAlignment(v); }}
          size='small'
        >
          <ToggleButton value='list'><ListIcon sx={{ fontSize: 16, mr: 0.75 }} />List</ToggleButton>
          <ToggleButton value='grid'><GridViewIcon sx={{ fontSize: 16, mr: 0.75 }} />Grid</ToggleButton>
          <ToggleButton value='tree'><AccountTreeIcon sx={{ fontSize: 16, mr: 0.75 }} />Tree</ToggleButton>
        </ToggleButtonGroup>
      </Canvas>
    </Box>
  );
}

function TagsSection() {
  return (
    <Box id='tags' sx={{ mb: 8 }}>
      <SectionHeader
        title='Tags & Chips'
        desc='Pill shape by default. Each semantic color has matched bg/border/text. Use size="small" for inline metadata.'
      />

      <SubLabel>All color variants — medium</SubLabel>
      <Canvas>
        <Chip label='Default' />
        <Chip label='Primary' color='primary' />
        <Chip label='Secondary' color='secondary' />
        <Chip label='Success' color='success' />
        <Chip label='Error' color='error' />
        <Chip label='Warning' color='warning' />
        <Chip label='Info' color='info' />
      </Canvas>

      <SubLabel>Small</SubLabel>
      <Canvas>
        <Chip label='Default' size='small' />
        <Chip label='Primary' color='primary' size='small' />
        <Chip label='Secondary' color='secondary' size='small' />
        <Chip label='Success' color='success' size='small' />
        <Chip label='Error' color='error' size='small' />
        <Chip label='Warning' color='warning' size='small' />
        <Chip label='Info' color='info' size='small' />
      </Canvas>

      <SubLabel>With close / with icon</SubLabel>
      <Canvas>
        <Chip label='kubernetes' onDelete={() => undefined} />
        <Chip label='production' color='primary' onDelete={() => undefined} />
        <Chip label='↑ 14 upgrades' color='secondary' icon={<Box component='span' sx={{ ml: 0.75, fontSize: 12, lineHeight: 1 }}>↑</Box>} />
        <Chip label='Synced' color='success' icon={<Box component='span' sx={{ ml: 0.75, fontSize: 11, lineHeight: 1 }}>●</Box>} />
      </Canvas>
    </Box>
  );
}

function KeyboardSection() {
  return (
    <Box id='kbd' sx={{ mb: 8 }}>
      <SectionHeader
        title='Keyboard Shortcuts'
        desc='Monospace keys with a bottom-border bevel. Chain into chords with a flex row at 4px gap.'
      />

      <SubLabel>Individual keys</SubLabel>
      <Canvas>
        <KbdKey>⌘</KbdKey>
        <KbdKey>K</KbdKey>
        <KbdKey>⇧</KbdKey>
        <KbdKey>/</KbdKey>
        <KbdKey>Esc</KbdKey>
        <KbdKey>↵</KbdKey>
        <KbdKey>Tab</KbdKey>
      </Canvas>

      <SubLabel>Chord combos</SubLabel>
      <Canvas>
        <Chord keys={['⌘', 'K']} />
        <Chord keys={['⌘', '⇧', 'P']} />
        <Chord keys={['⌘', '/']} />
        <Chord keys={['⌘', 'S']} />
      </Canvas>
    </Box>
  );
}

function BadgesSection() {
  const badges: Array<{ label: string; color: 'success' | 'info' | 'secondary' | 'warning' | 'error' | 'default' }> = [
    { label: '● Ready', color: 'success' },
    { label: '▶▶ Applying', color: 'info' },
    { label: '↑ 3 Upgrades', color: 'secondary' },
    { label: '⚠ Gated', color: 'warning' },
    { label: '✕ Degraded', color: 'error' },
    { label: '? Unknown', color: 'default' },
  ];

  return (
    <Box id='badges' sx={{ mb: 8 }}>
      <SectionHeader
        title='Status Badges'
        desc='Semantic color chips used throughout the app for unit and space status. Always pair the dot/icon with a label.'
      />

      <SubLabel>Medium</SubLabel>
      <Canvas>
        {badges.map((b) => <Chip key={b.label} label={b.label} color={b.color} />)}
      </Canvas>

      <SubLabel>Small</SubLabel>
      <Canvas>
        {badges.map((b) => <Chip key={b.label} label={b.label} color={b.color} size='small' />)}
      </Canvas>
    </Box>
  );
}

function CardsSection() {
  return (
    <Box id='cards' sx={{ mb: 8 }}>
      <SectionHeader
        title='Node Cards'
        desc='Compact unit cards used in lists and the component tree. Selected state uses the sh-sel ring.'
      />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <NodeCard
          name='payments-api'
          space='production'
          icon='⬡'
          iconBg='var(--blue-bg)'
          statusLabel='● Ready'
          statusColor='success'
          upgradeCount={3}
        />
        <NodeCard
          name='auth-service'
          space='staging'
          icon='⬡'
          iconBg='var(--blue-bg)'
          statusLabel='▶▶ Applying'
          statusColor='info'
        />
        <NodeCard
          name='infra-base'
          space='production'
          icon='◇'
          iconBg='var(--amber-bg)'
          statusLabel='⚠ Gated'
          statusColor='warning'
        />
        {/* Selected state */}
        <Paper
          elevation={2}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            p: 1.5,
            borderRadius: 'var(--r-md)',
            width: 320,
            boxShadow: 'var(--sh-sel)',
            cursor: 'pointer',
          }}
        >
          <Box sx={{ width: 36, height: 36, borderRadius: 'var(--r-sm)', border: '1px solid var(--bd0)', bgcolor: 'var(--rust-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>⬡</Box>
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'primary.main' }}>db-migrations</Typography>
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>production</Typography>
          </Box>
          <Chip label='● Ready' color='success' size='small' />
        </Paper>
        <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 0.5 }}>↑ last card shows selected state (sh-sel ring)</Typography>
      </Box>
    </Box>
  );
}

// ── Link chip ───────────────────────────────────────────────────────────────

function LinkChip({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string;
  variant?: 'default' | 'selected' | 'disabled';
}) {
  const disabled = variant === 'disabled';
  const selected = variant === 'selected';
  return (
    <Box
      component={disabled ? 'div' : 'a'}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        px: '10px',
        py: '5px',
        minWidth: 120,
        border: '1px solid',
        borderColor: selected ? 'var(--rust)' : 'var(--bd1)',
        borderRadius: 'var(--r-md)',
        background: selected ? 'var(--rust-bg)' : 'var(--surface)',
        textDecoration: 'none',
        // Flat — no boxShadow, no lift. Hover is a color change only.
        ...(disabled
          ? { opacity: 0.6 }
          : {
              cursor: 'pointer',
              transition: 'border-color 0.12s, background 0.12s',
              '&:hover': { borderColor: 'var(--rust)', background: 'var(--rust-bg)' },
            }),
      }}
    >
      <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--t3)' }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--t1)' }}>
        {value}
      </Typography>
    </Box>
  );
}

function LinkChipsSection() {
  return (
    <Box id='linkchips' sx={{ mb: 8 }}>
      <SectionHeader
        title='Link Chips'
        desc='Flat two-line chips that point elsewhere — relationship links, revision cards, cross-space references. No shadow, no lift: depth is a 1px hairline border and hover is a color change only. Use these inside a panel; use an elevated Node Card when the card is the content itself.'
      />

      <SubLabel>Clickable (default) · selected · disabled</SubLabel>
      <Canvas>
        <LinkChip label='Head' value='r42' />
        <LinkChip label='Live' value='r40' variant='selected' />
        <LinkChip label='Last Released' value='r0' variant='disabled' />
      </Canvas>

      <SubLabel>Relationship chips (space slug + unit slug)</SubLabel>
      <Canvas>
        <LinkChip label='Upstream' value='payments-api' />
        <LinkChip label='Downstream' value='payments-api' />
      </Canvas>

      <Typography variant='caption' color='text.disabled' sx={{ display: 'block', mt: 2 }}>
        Canonical: UnitDetailsPane.tsx (chipSx) · RevisionsGrid.tsx (RevisionCell)
      </Typography>
    </Box>
  );
}

function AlertsSection() {
  return (
    <Box id='alerts' sx={{ mb: 8 }}>
      <SectionHeader
        title='Alerts'
        desc='Left-border treatment with semantic bg/text. Use for inline feedback — not toasts.'
      />

      <SubLabel>Standard</SubLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
        <Alert severity='success'>Space synced successfully — all 14 units are in ready state.</Alert>
        <Alert severity='info'>Apply in progress — changes will take effect within 2–5 minutes.</Alert>
        <Alert severity='warning'>3 units are gated — manual approval required before applying.</Alert>
        <Alert severity='error'>Apply failed — function executor returned a non-zero exit code.</Alert>
      </Box>

      <SubLabel>Outlined</SubLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Alert variant='outlined' severity='success'>Deploy complete — production space is now up to date.</Alert>
        <Alert variant='outlined' severity='info'>Upgrade available — 14 units can be promoted to v2.3.</Alert>
        <Alert variant='outlined' severity='warning'>Deprecated API in use — update before the next release.</Alert>
        <Alert variant='outlined' severity='error'>Authentication failed — check your identity provider configuration.</Alert>
      </Box>
    </Box>
  );
}

function LoadingSection() {
  return (
    <Box id='loading' sx={{ mb: 8 }}>
      <SectionHeader
        title='Loading States'
        desc='Spinner for point loads, skeleton for layout-preserving loads, progress bar for determinate progress.'
      />

      <SubLabel>Spinner</SubLabel>
      <Canvas>
        <CircularProgress size={20} color='primary' />
        <CircularProgress size={28} color='primary' />
        <CircularProgress size={40} color='primary' />
      </Canvas>

      <SubLabel>Linear progress</SubLabel>
      <Box sx={{ mb: 3 }}>
        <LinearProgress color='primary' sx={{ borderRadius: 'var(--r-pill)', height: 4 }} />
      </Box>

      <SubLabel>Skeleton</SubLabel>
      <Paper elevation={1} sx={{ p: 2, borderRadius: 'var(--r-md)', width: 300 }}>
        <Skeleton variant='rectangular' height={20} sx={{ borderRadius: 1, mb: 1 }} />
        <Skeleton variant='text' width='80%' />
        <Skeleton variant='text' width='60%' />
        <Skeleton variant='text' width='70%' />
        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
          <Skeleton variant='rounded' width={60} height={22} sx={{ borderRadius: 'var(--r-pill)' }} />
          <Skeleton variant='rounded' width={48} height={22} sx={{ borderRadius: 'var(--r-pill)' }} />
        </Box>
      </Paper>
    </Box>
  );
}

function EmptySection() {
  return (
    <Box id='empty' sx={{ mb: 8 }}>
      <SectionHeader
        title='Empty States'
        desc='Centered layout with icon, title, description, and a single CTA. Keep copy concise and action-oriented.'
      />
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 8, px: 4 }}>
          <InboxIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 2 }} />
          <Typography variant='h3' sx={{ mb: 1 }}>No apps yet</Typography>
          <Typography variant='body2' color='text.secondary' sx={{ mb: 3, maxWidth: 280 }}>
            Add your first app to start managing configuration across spaces.
          </Typography>
          <Button variant='contained' startIcon={<AddIcon />}>Add App</Button>
        </Box>
      </Paper>
    </Box>
  );
}

function TooltipSection() {
  return (
    <Box id='tooltip' sx={{ mb: 8 }}>
      <SectionHeader
        title='Tooltips'
        desc='Dark background, 400ms delay. Arrow is off by default. Use for icon-only actions and truncated labels.'
      />
      <Canvas>
        <Tooltip title='Trigger a manual sync' placement='top'>
          <Button variant='outlined' size='small'>Top</Button>
        </Tooltip>
        <Tooltip title='Delete this space permanently' placement='bottom'>
          <Button variant='outlined' size='small'>Bottom</Button>
        </Tooltip>
        <Tooltip title='Copy unit slug' placement='right'>
          <Button variant='outlined' size='small'>Right</Button>
        </Tooltip>
        <Tooltip title='More options' placement='top' arrow>
          <IconButton size='small'><MoreHorizIcon fontSize='small' /></IconButton>
        </Tooltip>
      </Canvas>
    </Box>
  );
}

function TopNavSection() {
  return (
    <Box id='topnav' sx={{ mb: 8 }}>
      <SectionHeader
        title='Top Navigation Bar'
        desc='Sticky header: breadcrumb trail (org selector → entity) left, More dropdown + user avatar right. Gains backdrop-blur + alpha bg at $isSticky=true. Optional QueryBuilder filter row below.'
      />
      <AppBar
        position='static'
        color='default'
        elevation={2}
        sx={{ borderRadius: 'var(--r-md)', border: '1px solid var(--bd0)', boxShadow: 'var(--sh-sm)' }}
      >
        <Toolbar variant='dense' sx={{ gap: 2, minHeight: 54 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Box sx={{ width: 22, height: 22, bgcolor: 'primary.main', borderRadius: '5px', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary' }}>
              ConfigHub
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
            <Button variant='text' color='primary' size='small' sx={{ fontWeight: 600 }}>Spaces</Button>
            <Button variant='text' size='small'>Deploy</Button>
            <Button variant='text' size='small'>Workers</Button>
            <Button variant='text' size='small'>Settings</Button>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <IconButton size='small'>
              <NotificationsNoneIcon fontSize='small' />
            </IconButton>
            <Avatar sx={{ width: 28, height: 28, bgcolor: 'var(--purple-bg)', color: 'var(--purple)', border: '1px solid var(--purple-bd)', fontSize: 11, fontWeight: 700 }}>
              CE
            </Avatar>
          </Box>
        </Toolbar>
      </AppBar>
    </Box>
  );
}

function BreadcrumbSection() {
  return (
    <Box id='breadcrumb' sx={{ mb: 8 }}>
      <SectionHeader
        title='Breadcrumb'
        desc='Two systems: sticky Header breadcrumb (org selector → entity) and per-unit BreadCrumb component (space › group › slug). Ancestors use secondary.main; current page is text.primary/500.'
      />
      <Paper elevation={1} sx={{ px: 2, py: 1.25, borderRadius: 'var(--r-sm)', display: 'inline-block' }}>
        <Breadcrumbs aria-label='breadcrumb'>
          <Link underline='hover' sx={{ fontSize: 12.5, color: 'text.disabled', cursor: 'pointer' }}>Spaces</Link>
          <Link underline='hover' sx={{ fontSize: 12.5, color: 'text.disabled', cursor: 'pointer' }}>production</Link>
          <Link underline='hover' sx={{ fontSize: 12.5, color: 'text.disabled', cursor: 'pointer' }}>payments-api</Link>
          <Typography sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary' }}>Kubernetes</Typography>
        </Breadcrumbs>
      </Paper>
    </Box>
  );
}

// ── Sidebar demo helpers ──────────────────────────────────────────────────────

interface SidebarNavDemoItemProps {
  icon: React.ReactNode;
  text: string;
  active?: boolean;
  collapsed?: boolean;
}

function SidebarNavDemoItem({ icon, text, active, collapsed }: SidebarNavDemoItemProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        minHeight: 40,
        px: 2.5,
        mx: collapsed ? 1.5 : 1,
        mb: 0.5,
        borderRadius: collapsed ? '50%' : '8px',
        cursor: 'pointer',
        justifyContent: collapsed ? 'center' : 'initial',
        bgcolor: active ? 'rgba(255,255,255,0.15)' : 'transparent',
        '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
        transition: 'background-color 150ms',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minWidth: 20 }}>
        {icon}
      </Box>
      {!collapsed && (
        <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 500, color: 'white', whiteSpace: 'nowrap' }}>
          {text}
        </Typography>
      )}
    </Box>
  );
}

interface SidebarShellDemoProps {
  collapsed?: boolean;
}

function SidebarShellDemo({ collapsed }: SidebarShellDemoProps) {
  const navItems = [
    { icon: <DataObjectIcon sx={{ fontSize: 20, color: 'white' }} />, text: 'Units' },
    { icon: <FolderCopyIcon sx={{ fontSize: 20, color: 'white' }} />, text: 'Spaces' },
    { icon: <StorageIcon sx={{ fontSize: 20, color: 'white' }} />, text: 'Targets' },
    { icon: <EngineeringIcon sx={{ fontSize: 20, color: 'white' }} />, text: 'Workers' },
    { icon: <WorkspacesIcon sx={{ fontSize: 20, color: 'white' }} />, text: 'Tools' },
  ];
  const ACTIVE_IDX = 1;

  return (
    <Box
      sx={{
        width: collapsed ? 65 : 220,
        bgcolor: 'primary.main',
        borderRadius: 'var(--r-md)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        height: 360,
        flexShrink: 0,
      }}
    >
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minHeight: 56, px: 2.5, justifyContent: collapsed ? 'center' : 'initial' }}>
          <Box sx={{ width: 34, height: 34, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Typography sx={{ color: 'white', fontWeight: 800, fontSize: 13, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>CH</Typography>
          </Box>
          {!collapsed && <Typography sx={{ color: 'white', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>ConfigHub</Typography>}
        </Box>
        {navItems.map((item, i) => (
          <SidebarNavDemoItem key={item.text} icon={item.icon} text={item.text} active={i === ACTIVE_IDX} collapsed={collapsed} />
        ))}
      </Box>
      <Box sx={{ pb: 1 }}>
        <Box sx={{ px: 2, py: 0.5 }}>
          <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)' }} />
        </Box>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            mx: 1, minHeight: 40, borderRadius: '8px', cursor: 'pointer', gap: 1,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
          }}
        >
          {collapsed
            ? <ArrowForwardIosIcon sx={{ color: 'white', fontSize: 14 }} />
            : (
              <>
                <ArrowBackIosNewIcon sx={{ color: 'white', fontSize: 14 }} />
                <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Collapse</Typography>
              </>
            )
          }
        </Box>
      </Box>
    </Box>
  );
}

// ── Navigation & Chrome Sections ──────────────────────────────────────────────

function SidebarSection() {
  return (
    <Box id='sidebar' sx={{ mb: 8 }}>
      <SectionHeader
        title='Left Sidebar'
        desc='220px expanded rail, 65px icon-only collapsed. Primary background. Active item: rgba(255,255,255,0.15). Hover: rgba(255,255,255,0.10). Collapse chevron in footer.'
      />
      <SubLabel>Expanded (220px) vs Collapsed (65px)</SubLabel>
      <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <SidebarShellDemo collapsed={false} />
          <TokenLabel>isNavOpen=true · DRAWER_WIDTH=220px</TokenLabel>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
          <SidebarShellDemo collapsed={true} />
          <TokenLabel>isNavOpen=false · COLLAPSED_DRAWER_WIDTH=65px</TokenLabel>
        </Box>
      </Box>
      <SubLabel>Nav item states (light-mode reference)</SubLabel>
      <Canvas>
        {[
          { state: 'Default', bg: 'transparent', fw: 500, color: 'text.secondary', border: '1px solid var(--bd0)' },
          { state: 'Hover', bg: 'rgba(0,0,0,0.04)', fw: 500, color: 'text.secondary', border: '1px solid var(--bd0)' },
          { state: 'Active', bg: 'var(--rust-bg)', fw: 600, color: 'var(--rust)', border: '1px solid var(--rust-ring)' },
          { state: 'Disabled', bg: 'transparent', fw: 400, color: 'text.disabled', border: '1px solid var(--bd1)' },
        ].map(({ state, bg, fw, color, border }) => (
          <Box key={state} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 0.75, borderRadius: '8px', bgcolor: bg, width: 148, border }}>
              <FolderCopyIcon sx={{ fontSize: 18, color }} />
              <Typography sx={{ fontSize: 13, fontWeight: fw, color }}>Spaces</Typography>
            </Box>
            <TokenLabel>{state}</TokenLabel>
          </Box>
        ))}
      </Canvas>
    </Box>
  );
}

function PageHeaderSection() {
  return (
    <Box id='pageheader' sx={{ mb: 8 }}>
      <SectionHeader
        title='Page Header'
        desc='Entity title bar with optional back navigation, status chip, description, and action buttons. Used at the top of every space and unit page.'
      />
      <SubLabel>List page — title + description + primary CTA</SubLabel>
      <Paper elevation={1} sx={{ p: 3, borderRadius: 'var(--r-md)' }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant='h2' sx={{ mb: 0.5 }}>Spaces</Typography>
            <Typography variant='body2' color='text.secondary'>Manage configuration spaces and the units deployed within them.</Typography>
          </Box>
          <Button variant='contained' startIcon={<AddIcon />} size='small' sx={{ flexShrink: 0, mt: 0.5 }}>Add Space</Button>
        </Box>
      </Paper>
      <SubLabel>Detail page — back + title + status + actions</SubLabel>
      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 'var(--r-md)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton size='small' sx={{ color: 'text.secondary', flexShrink: 0 }}>
            <ArrowBackIcon fontSize='small' />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography variant='h2'>payments-api</Typography>
              <Chip label='Ready' color='success' size='small' />
            </Box>
            <Typography variant='body2' color='text.disabled' sx={{ mt: 0.25, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              production · Kubernetes · Updated 2m ago
            </Typography>
          </Box>
          <Stack direction='row' spacing={1} sx={{ flexShrink: 0 }}>
            <Button variant='outlined' size='small'>Edit</Button>
            <Button variant='contained' size='small'>Apply</Button>
            <IconButton size='small'><MoreHorizIcon fontSize='small' /></IconButton>
          </Stack>
        </Box>
      </Paper>
      <SubLabel>Detail page — gated + upgrade count + disabled Apply</SubLabel>
      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 'var(--r-md)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <IconButton size='small' sx={{ color: 'text.secondary', flexShrink: 0 }}>
            <ArrowBackIcon fontSize='small' />
          </IconButton>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
              <Typography variant='h2'>infra-base</Typography>
              <Chip label='Gated' color='warning' size='small' />
              <Chip label='3 upgrades' color='secondary' size='small' />
            </Box>
            <Typography variant='body2' color='text.disabled' sx={{ mt: 0.25, fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
              production · OpenTofu · Updated 1h ago
            </Typography>
          </Box>
          <Stack direction='row' spacing={1} sx={{ flexShrink: 0 }}>
            <Button variant='outlined' size='small'>Edit</Button>
            <Tooltip title='Apply is blocked — 1 gate is failing'>
              <span>
                <Button variant='contained' size='small' disabled>Apply</Button>
              </span>
            </Tooltip>
            <IconButton size='small'><MoreHorizIcon fontSize='small' /></IconButton>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}

function ToolbarSection() {
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'tree'>('list');

  return (
    <Box id='toolbar' sx={{ mb: 8 }}>
      <SectionHeader
        title='Toolbar / Command Bar'
        desc='Filter and action row above data tables. Bulk-action mode activates when rows are selected, replacing the filter row with rust-accented selection controls.'
      />
      <SubLabel>Default — search + active filter chips + view toggle</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--bd0)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderBottom: '1px solid var(--bd0)', flexWrap: 'wrap' }}>
          <TextField
            size='small'
            placeholder='Search units...'
            InputProps={{ startAdornment: <InputAdornment position='start'><SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment> }}
            sx={{ width: 200 }}
          />
          <Chip label='Status: Ready' size='small' onDelete={() => undefined} />
          <Chip label='Space: production' size='small' onDelete={() => undefined} />
          <Button variant='text' size='small' startIcon={<FilterListIcon sx={{ fontSize: 14 }} />} sx={{ color: 'text.secondary', minWidth: 'auto', flexShrink: 0 }}>
            Filters
          </Button>
          <Box sx={{ flex: 1 }} />
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_e, v: 'list' | 'grid' | 'tree') => { if (v) setViewMode(v); }}
            size='small'
          >
            <ToggleButton value='list' aria-label='List view'>
              <Tooltip title='List view'><ListIcon sx={{ fontSize: 16 }} /></Tooltip>
            </ToggleButton>
            <ToggleButton value='grid' aria-label='Grid view'>
              <Tooltip title='Grid view'><GridViewIcon sx={{ fontSize: 16 }} /></Tooltip>
            </ToggleButton>
            <ToggleButton value='tree' aria-label='Tree view'>
              <Tooltip title='Tree view'><AccountTreeIcon sx={{ fontSize: 16 }} /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant='body2' color='text.disabled' sx={{ fontStyle: 'italic', fontSize: '11.5px' }}>
            Default state — no rows selected · active view: {viewMode}
          </Typography>
        </Box>
      </Paper>
      <SubLabel>Selection active — bulk action mode (rust accent)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--bd0)' }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.25,
            borderBottom: '1px solid var(--bd0)', bgcolor: 'var(--rust-bg)',
            borderTop: '2px solid var(--rust-ring)', flexWrap: 'wrap',
          }}
        >
          <Checkbox size='small' indeterminate sx={{ p: 0.25, color: 'var(--rust)' }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--rust)', flexShrink: 0 }}>4 of 47 selected</Typography>
          <Box sx={{ flex: 1 }} />
          <Button variant='outlined' size='small' startIcon={<AddIcon sx={{ fontSize: 14 }} />}>Apply</Button>
          <Button variant='outlined' size='small' color='error' startIcon={<DeleteOutlineIcon sx={{ fontSize: 14 }} />}>Delete</Button>
          <IconButton size='small'><MoreHorizIcon fontSize='small' /></IconButton>
          <Divider orientation='vertical' flexItem sx={{ mx: 0.5 }} />
          <IconButton size='small' sx={{ color: 'text.secondary' }}><CloseIcon fontSize='small' /></IconButton>
        </Box>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant='body2' color='text.disabled' sx={{ fontStyle: 'italic', fontSize: '11.5px' }}>
            Bulk selection active — filter bar replaced by action bar · rust accent strip
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

function TabsSection() {
  const [tab, setTab] = useState(0);

  const tabDefs = [
    { label: 'Overview' },
    { label: 'Config' },
    { label: 'Links' },
    { label: 'Revisions', count: 14 },
    { label: 'Mutations' },
    { label: 'Events' },
  ];

  const tabContent = [
    'Overview: unit summary, current status, and last actuation result.',
    'Config: rendered configuration YAML as applied to the target.',
    'Links: upstream and downstream dependency edges to other units.',
    'Revisions: 14 historical revisions with diff and audit trail.',
    'Mutations: per-target configuration overrides and merge rules.',
    'Events: chronological apply, destroy, and refresh history.',
  ];

  return (
    <Box id='tabs' sx={{ mb: 8 }}>
      <SectionHeader
        title='Tabs'
        desc='MUI Tabs at 45px height. Rust bottom indicator (2px). Active label is 600 weight. Badge counts rendered as a small Chip inside the Tab label.'
      />
      <SubLabel>Unit detail tabs (interactive)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--bd0)' }}>
        <Box sx={{ borderBottom: '1px solid var(--bd0)' }}>
          <Tabs
            value={tab}
            onChange={(_e, v: number) => setTab(v)}
            sx={{
              minHeight: 45,
              '& .MuiTab-root': { minHeight: 45, py: 0, px: 2, fontSize: 13, textTransform: 'none', fontWeight: 500 },
              '& .Mui-selected': { fontWeight: 600 },
            }}
          >
            {tabDefs.map((t) => (
              <Tab
                key={t.label}
                label={
                  t.count !== undefined ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      {t.label}
                      <Chip label={t.count} size='small' sx={{ height: 18, fontSize: '10px', pointerEvents: 'none' }} />
                    </Box>
                  ) : t.label
                }
              />
            ))}
          </Tabs>
        </Box>
        <Box sx={{ p: 3 }}>
          <Typography variant='body2' color='text.secondary'>{tabContent[tab]}</Typography>
        </Box>
      </Paper>
      <SubLabel>Individual tab states (static reference)</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>Config</Typography>
          </Box>
          <TokenLabel>Default 500</TokenLabel>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ px: 2, py: 1, borderBottom: '2px solid var(--rust)' }}>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--rust)' }}>Config</Typography>
          </Box>
          <TokenLabel>Active --rust 600</TokenLabel>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ px: 2, py: 1 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 400, color: 'text.disabled' }}>Disabled</Typography>
          </Box>
          <TokenLabel>Disabled --t4</TokenLabel>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>Revisions</Typography>
            <Chip label='14' size='small' sx={{ height: 18, fontSize: '10px' }} />
          </Box>
          <TokenLabel>With count badge</TokenLabel>
        </Box>
      </Canvas>
    </Box>
  );
}

function AccordionSection() {
  return (
    <Box id='accordion' sx={{ mb: 8 }}>
      <SectionHeader
        title='Accordion / Detail Pane'
        desc='Used in the right-hand detail pane. No shadow, no border-radius — lives inside a panel.'
      />
      <Box sx={{ border: '1px solid var(--bd0)', borderRadius: 'var(--r-sm)', overflow: 'hidden' }}>
        <Accordion defaultExpanded disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}>
            Source Configuration
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pt: 0.5, pb: 1.5 }}>
            <Typography variant='body2' color='text.secondary'>
              Defines where this unit's configuration originates. Can be a Git repository, a ConfigHub space, or a function output.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}>
            Target Spaces
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pt: 0.5, pb: 1.5 }}>
            <Typography variant='body2' color='text.secondary'>
              Spaces this unit will be deployed to when Apply is triggered.
            </Typography>
          </AccordionDetails>
        </Accordion>
        <Accordion disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ fontSize: 16 }} />}>
            Mutation Rules
          </AccordionSummary>
          <AccordionDetails sx={{ px: 2, pt: 0.5, pb: 1.5 }}>
            <Typography variant='body2' color='text.secondary'>
              Per-target overrides applied after the base config is resolved.
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Box>
    </Box>
  );
}

function TableSection() {
  const rows = [
    { name: 'payments-api', space: 'production', status: 'Ready', statusColor: 'success' as const, toolchain: 'Kubernetes', target: 'aws-us-east-1', updated: '2m ago', selected: true },
    { name: 'auth-service', space: 'production', status: 'Applying', statusColor: 'info' as const, toolchain: 'Kubernetes', target: 'aws-us-east-1', updated: '5m ago', selected: false },
    { name: 'infra-base', space: 'production', status: 'Gated', statusColor: 'warning' as const, toolchain: 'OpenTofu', target: 'aws-us-east-1', updated: '1h ago', selected: false },
    { name: 'data-pipeline', space: 'staging', status: 'Degraded', statusColor: 'error' as const, toolchain: 'Kubernetes', target: 'gcp-us-central1', updated: '23m ago', selected: false },
    { name: 'api-gateway', space: 'production', status: 'Ready', statusColor: 'success' as const, toolchain: 'Kubernetes', target: 'aws-us-east-1', updated: '4h ago', selected: false },
  ];

  // Shared cell border style — near-invisible horizontal divider, no vertical lines
  const rowBorderSx = { borderColor: 'rgba(0,0,0,0.045)' } as const;

  return (
    <Box id='table' sx={{ mb: 8 }}>
      <SectionHeader
        title='Data Table'
        desc='Horizontal dividers only at rgba(0,0,0,0.045) — structure implied by alignment, not drawn. Headers: 10.5px uppercase, --t3. Slug column in JetBrains Mono. Selected row: 3px rust inset shadow + rust-bg tint. No zebra striping.'
      />

      <SubLabel>Rules</SubLabel>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          mb: 3,
          p: 2,
          bgcolor: 'var(--bg)',
          border: '1px solid var(--bd1)',
          borderRadius: 'var(--r-sm)',
        }}
      >
        {[
          'No vertical column borders — ever.',
          'Header bottom: 1px solid --bd0 (not 2px).',
          'Row divider: borderColor rgba(0,0,0,0.045) — barely present.',
          'No zebra / alternating background on rows.',
          'Hover: bgcolor rgba(0,0,0,0.018) — the lightest perceptible shift.',
          'Selected: boxShadow inset 3px 0 0 var(--rust) + bgcolor var(--rust-bg).',
          'Name / Slug column: font-family var(--font-mono), 12px, weight 500.',
          'Timestamp column: font-family var(--font-mono), 11px, color text.disabled.',
        ].map((rule) => (
          <Box key={rule} sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box
              sx={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                bgcolor: 'var(--rust)',
                flexShrink: 0,
                mt: 0.5,
              }}
            />
            <Typography sx={{ fontSize: '12px', color: 'text.secondary', lineHeight: 1.5 }}>
              {rule}
            </Typography>
          </Box>
        ))}
      </Box>

      <SubLabel>Live example — row 1 selected</SubLabel>
      <Paper
        elevation={1}
        sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--bd0)' }}
      >
        <Table size='small'>
          <TableHead>
            <TableRow>
              {/* Checkbox col */}
              <TableCell
                padding='checkbox'
                sx={{ borderBottom: '1px solid var(--bd0)', width: 40, pl: 1.5 }}
              >
                <Checkbox size='small' indeterminate sx={{ p: 0.5 }} />
              </TableCell>
              {['Slug', 'Space', 'Target', 'Status', 'Toolchain', 'Updated'].map((h) => (
                <TableCell
                  key={h}
                  sx={{
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'text.disabled',
                    borderBottom: '1px solid var(--bd0)',
                    py: 1,
                    pr: h === 'Updated' ? 2 : undefined,
                  }}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.name}
                sx={{
                  ...(row.selected
                    ? {
                        bgcolor: 'var(--rust-bg)',
                        boxShadow: 'inset 3px 0 0 var(--rust)',
                      }
                    : {
                        '&:hover': { bgcolor: 'rgba(0,0,0,0.018)' },
                      }),
                  cursor: 'pointer',
                }}
              >
                <TableCell padding='checkbox' sx={{ ...rowBorderSx, pl: 1.5 }}>
                  <Checkbox size='small' checked={row.selected} sx={{ p: 0.5 }} />
                </TableCell>
                <TableCell
                  sx={{
                    ...rowBorderSx,
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'text.primary',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {row.name}
                </TableCell>
                <TableCell sx={{ ...rowBorderSx, fontSize: 12, color: 'text.secondary' }}>
                  {row.space}
                </TableCell>
                <TableCell sx={{ ...rowBorderSx, fontSize: 12, color: 'text.secondary' }}>
                  {row.target}
                </TableCell>
                <TableCell sx={rowBorderSx}>
                  <Chip label={row.status} color={row.statusColor} size='small' />
                </TableCell>
                <TableCell sx={{ ...rowBorderSx, fontSize: 12, color: 'text.secondary' }}>
                  {row.toolchain}
                </TableCell>
                <TableCell
                  sx={{
                    ...rowBorderSx,
                    fontSize: 11,
                    color: 'text.disabled',
                    fontFamily: 'var(--font-mono)',
                    pr: 2,
                  }}
                >
                  {row.updated}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <SubLabel>Token reference</SubLabel>
      <Box
        sx={{
          border: '1px solid var(--bd0)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
        }}
      >
        {[
          { label: 'Row divider', value: 'rgba(0,0,0,0.045)', note: 'TableCell borderColor' },
          { label: 'Header divider', value: '--bd0  (#e6e8ec)', note: 'TableHead bottom, 1px' },
          { label: 'Row hover', value: 'rgba(0,0,0,0.018)', note: 'TableRow :hover bgcolor' },
          { label: 'Selected bg', value: '--rust-bg  rgba(186,61,3,0.055)', note: 'TableRow bgcolor' },
          { label: 'Selected accent', value: '--rust  #ba3d03', note: 'boxShadow inset 3px 0 0' },
          { label: 'Slug font', value: '--font-mono  JetBrains Mono', note: '12px / 500 / -0.01em' },
          { label: 'Timestamp font', value: '--font-mono  JetBrains Mono', note: '11px / text.disabled' },
        ].map((row, i, arr) => (
          <Box
            key={row.label}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 3,
              px: 3,
              py: 1.25,
              borderBottom: i < arr.length - 1 ? '1px solid var(--bd1)' : 'none',
              '&:hover': { bgcolor: 'var(--bg)' },
            }}
          >
            <Typography
              sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.primary', width: 140, flexShrink: 0 }}
            >
              {row.label}
            </Typography>
            <Typography
              sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--rust)', flex: 1 }}
            >
              {row.value}
            </Typography>
            <Typography sx={{ fontSize: '11.5px', color: 'text.disabled' }}>
              {row.note}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ModalSection() {
  return (
    <Box id='modal' sx={{ mb: 8 }}>
      <SectionHeader
        title='Modal / Dialog'
        desc='9px border-radius, lg shadow, backdrop blur. Title 15/600. Footer actions right-aligned, destructive on the right.'
      />
      <Box sx={{ position: 'relative', height: 280 }}>
        <Dialog
          open={true}
          disablePortal
          disableScrollLock
          disableAutoFocus
          hideBackdrop
          sx={{ position: 'absolute' }}
          PaperProps={{ sx: { position: 'absolute', top: 0, left: 0, m: 0, maxWidth: 460, width: '100%' } }}
        >
          <DialogTitle>Delete Space</DialogTitle>
          <DialogContent>
            <Typography variant='body2' color='text.secondary'>
              Are you sure you want to delete the <strong>production</strong> space? All units, configuration, and history will be permanently removed. This action cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button variant='outlined'>Cancel</Button>
            <Button variant='contained' color='error'>Delete Space</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}

// ── Unit Status Section ────────────────────────────────────────────────────────

function UnitStatusSection() {
  const unitStatuses: Array<{
    status: string;
    color: 'success' | 'error' | 'info' | 'default';
    token: string;
    desc: string;
  }> = [
    { status: 'Ready', color: 'success', token: '--green', desc: 'Configuration applied, cluster in sync' },
    { status: 'Degraded', color: 'error', token: '--red', desc: 'Last apply failed or partially failed' },
    { status: 'Progressing', color: 'info', token: '--blue', desc: 'Apply or import currently running' },
    { status: 'NotLive', color: 'default', token: '--t4', desc: 'Unit exists but has never been applied' },
    { status: 'Detached', color: 'default', token: '--t4', desc: 'Unit removed from active space tracking' },
    { status: 'Unknown', color: 'default', token: '--t4', desc: 'Status not yet reported by the worker' },
  ];

  const syncStatuses: Array<{
    status: string;
    color: 'success' | 'warning' | 'info' | 'default';
    token: string;
  }> = [
    { status: 'Synced', color: 'success', token: '--green' },
    { status: 'OutOfSync', color: 'warning', token: '--amber' },
    { status: 'Progressing', color: 'info', token: '--blue' },
    { status: 'NotLive', color: 'default', token: '--t4' },
  ];

  const inContextRows: Array<{
    slug: string;
    space: string;
    status: string;
    statusColor: 'success' | 'error' | 'info' | 'default';
    syncStatus: string;
    syncColor: 'success' | 'warning' | 'info' | 'default';
  }> = [
    { slug: 'payments-api', space: 'production', status: 'Ready', statusColor: 'success', syncStatus: 'Synced', syncColor: 'success' },
    { slug: 'auth-service', space: 'staging', status: 'Progressing', statusColor: 'info', syncStatus: 'Progressing', syncColor: 'info' },
    { slug: 'infra-base', space: 'production', status: 'Degraded', statusColor: 'error', syncStatus: 'OutOfSync', syncColor: 'warning' },
    { slug: 'archive-worker', space: 'dev', status: 'NotLive', statusColor: 'default', syncStatus: 'NotLive', syncColor: 'default' },
  ];

  return (
    <Box id='unit-status' sx={{ mb: 8 }}>
      <SectionHeader
        title='Unit Status Badges'
        desc='Six UnitStatus variants mapped to semantic color tokens via getUnitStatusColor(). Rust is never used for status — only for actions. SyncStatus has its own four-variant mapping.'
      />

      <SubLabel>UnitStatus — all variants</SubLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
        {unitStatuses.map((s) => (
          <Box
            key={s.status}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: 1,
              border: '1px solid var(--bd0)',
              borderRadius: 'var(--r-sm)',
              '&:hover': { bgcolor: 'var(--bg)' },
            }}
          >
            <Chip
              label={s.status}
              color={s.color}
              size='small'
              sx={{ minWidth: 88, justifyContent: 'center' }}
            />
            <Typography
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                color: 'text.disabled',
                width: 48,
                flexShrink: 0,
              }}
            >
              {s.color}
            </Typography>
            <Typography
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                color: 'text.disabled',
                width: 52,
                flexShrink: 0,
              }}
            >
              {s.token}
            </Typography>
            <Typography variant='body2' color='text.secondary'>
              {s.desc}
            </Typography>
          </Box>
        ))}
      </Box>

      <SubLabel>SyncStatus variants</SubLabel>
      <Canvas>
        {syncStatuses.map((s) => (
          <Box
            key={s.status}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}
          >
            <Chip label={s.status} color={s.color} size='small' />
            <TokenLabel>{s.token}</TokenLabel>
          </Box>
        ))}
      </Canvas>

      <SubLabel>In context — unit list row (UnitStatus + SyncStatus pair)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {inContextRows.map((row, i) => (
          <Box
            key={row.slug}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: 1,
              borderBottom: i < inContextRows.length - 1 ? '1px solid var(--bd1)' : 'none',
              '&:hover': { bgcolor: 'background.default' },
            }}
          >
            <Typography
              sx={{
                fontSize: 12.5,
                fontWeight: 500,
                color: 'text.primary',
                width: 140,
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {row.slug}
            </Typography>
            <Typography
              sx={{ fontSize: 12, color: 'text.disabled', width: 80, flexShrink: 0 }}
            >
              {row.space}
            </Typography>
            <Chip
              label={row.status}
              color={row.statusColor}
              size='small'
              sx={{ minWidth: 88 }}
            />
            <Chip
              label={row.syncStatus}
              color={row.syncColor}
              size='small'
              sx={{ minWidth: 96 }}
            />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// ── Validation Cards Section ───────────────────────────────────────────────────

interface StaticGate {
  name: string;
  displayName: string;
  passed: boolean;
  isWarning: boolean;
  description?: string;
  event?: string;
}

function GateItem({
  gate,
  expandKey,
  expandedKey,
  onToggle,
}: {
  gate: StaticGate;
  expandKey: string;
  expandedKey: string | null;
  onToggle: (key: string | null) => void;
}) {
  const isExpanded = expandedKey === expandKey;

  return (
    <Box sx={{ borderRadius: '4px', mb: 0.5, overflow: 'hidden', '&:last-child': { mb: 0 } }}>
      <Box
        onClick={() => onToggle(isExpanded ? null : expandKey)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: '4px 6px',
          cursor: 'pointer',
          '&:hover': { bgcolor: 'background.default' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.75, flex: 1, minWidth: 0 }}>
          <Box sx={{ pt: 0.25, flexShrink: 0 }}>
            {gate.passed ? (
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 14 }} />
            ) : gate.isWarning ? (
              <WarningAmberIcon sx={{ color: 'warning.main', fontSize: 14 }} />
            ) : (
              <ErrorOutlineIcon sx={{ color: 'error.main', fontSize: 14 }} />
            )}
          </Box>
          <Typography
            sx={{
              fontSize: '0.8rem',
              fontWeight: 500,
              color: 'text.secondary',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {gate.displayName}
          </Typography>
        </Box>
        <Box sx={{ color: 'text.secondary', flexShrink: 0 }}>
          {isExpanded ? (
            <ExpandLessIcon sx={{ fontSize: 16 }} />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 16 }} />
          )}
        </Box>
      </Box>

      <Collapse in={isExpanded} timeout='auto' unmountOnExit>
        <Box sx={{ px: 1, pb: 1, pt: 0.5 }}>
          {gate.description && (
            <Typography
              variant='body2'
              sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 0.75 }}
            >
              {gate.description}
            </Typography>
          )}
          <Stack direction='row' spacing={0.5} flexWrap='wrap' sx={{ gap: 0.5 }}>
            {gate.event && (
              <Chip
                label={gate.event}
                color='warning'
                size='small'
                sx={{ height: 16, fontSize: '0.55rem' }}
              />
            )}
            <Chip
              label={gate.isWarning ? 'Warn' : 'Blocking'}
              color='primary'
              size='small'
              sx={{ height: 16, fontSize: '0.55rem' }}
            />
            <Chip
              label='Validating'
              color='info'
              size='small'
              sx={{ height: 16, fontSize: '0.55rem' }}
            />
          </Stack>
        </Box>
      </Collapse>
    </Box>
  );
}

function GateCardsSection() {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const passingGates: StaticGate[] = [
    {
      name: 'gate-a',
      displayName: 'Semver Guard',
      passed: true,
      isWarning: false,
      description: 'Validates semantic versioning on all image tags before apply.',
      event: 'PreApply',
    },
    {
      name: 'gate-b',
      displayName: 'Require Review',
      passed: true,
      isWarning: false,
      description: 'Requires at least one team approval before changes go live.',
      event: 'PreApply',
    },
  ];

  const blockingGates: StaticGate[] = [
    {
      name: 'gate-c',
      displayName: 'Holiday Lock',
      passed: false,
      isWarning: false,
      description: 'Blocks all applies during scheduled maintenance and change-freeze windows.',
      event: 'PreApply',
    },
    {
      name: 'gate-d',
      displayName: 'Semver Guard',
      passed: true,
      isWarning: false,
      description: 'Validates semantic versioning on all image tags before apply.',
      event: 'PreApply',
    },
  ];

  const warningGates: StaticGate[] = [
    {
      name: 'gate-e',
      displayName: 'Budget Alert',
      passed: false,
      isWarning: true,
      description: 'Warns when the estimated monthly cost delta exceeds the configured threshold.',
    },
  ];

  return (
    <Box id='gate-cards' sx={{ mb: 8 }}>
      <SectionHeader
        title='Validation Cards'
        desc='Hover card showing pre-validation error results for a unit. Each row is expandable to reveal description and trigger attributes. The summary badge reflects the worst-case state: blocking, warning, or all passed.'
      />

      <SubLabel>Three states — All Passed · 1 Blocking · Warnings only</SubLabel>
      <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* All Passed */}
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 'var(--r-md)', width: 280, flexShrink: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant='subtitle2' sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Validation Errors
            </Typography>
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'success.main',
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                letterSpacing: '0.03em',
              }}
            >
              All Passed
            </Typography>
          </Box>
          {passingGates.map((gate) => (
            <GateItem
              key={gate.name}
              gate={gate}
              expandKey={`passed-${gate.name}`}
              expandedKey={expandedKey}
              onToggle={setExpandedKey}
            />
          ))}
          <TokenLabel>All gates passed — no blockers</TokenLabel>
        </Paper>

        {/* Blocking */}
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 'var(--r-md)', width: 280, flexShrink: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant='subtitle2' sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Validation Errors
            </Typography>
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'error.main',
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                letterSpacing: '0.03em',
              }}
            >
              1 Blocking
            </Typography>
          </Box>
          {blockingGates.map((gate) => (
            <GateItem
              key={gate.name}
              gate={gate}
              expandKey={`blocking-${gate.name}`}
              expandedKey={expandedKey}
              onToggle={setExpandedKey}
            />
          ))}
          <TokenLabel>1 gate blocked — apply prevented</TokenLabel>
        </Paper>

        {/* Warnings */}
        <Paper elevation={2} sx={{ p: 1.5, borderRadius: 'var(--r-md)', width: 280, flexShrink: 0 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant='subtitle2' sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
              Validation Warnings
            </Typography>
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                color: 'warning.main',
                px: 0.75,
                py: 0.25,
                borderRadius: '4px',
                letterSpacing: '0.03em',
              }}
            >
              1 Warning
            </Typography>
          </Box>
          {warningGates.map((gate) => (
            <GateItem
              key={gate.name}
              gate={gate}
              expandKey={`warning-${gate.name}`}
              expandedKey={expandedKey}
              onToggle={setExpandedKey}
            />
          ))}
          <TokenLabel>Warn-mode gate — apply proceeds with notice</TokenLabel>
        </Paper>
      </Box>

      <SubLabel>Summary badge variants</SubLabel>
      <Canvas>
        {[
          { label: 'All Passed', color: 'success.main' },
          { label: '2 Blocking', color: 'error.main' },
          { label: '1 Warning', color: 'warning.main' },
        ].map((b) => (
          <Box
            key={b.label}
            sx={{
              fontSize: '0.625rem',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              color: b.color,
              px: 0.75,
              py: 0.25,
              borderRadius: '4px',
              letterSpacing: '0.03em',
              border: '1px solid currentColor',
              opacity: 0.9,
            }}
          >
            {b.label}
          </Box>
        ))}
      </Canvas>
      <TokenLabel>GateSummaryBadge — 0.625rem / 600 weight</TokenLabel>
    </Box>
  );
}

// ── Progress Section ───────────────────────────────────────────────────────────

function ProgressSection() {
  const determinate = [0, 23, 57, 84, 100];

  const steps = ['Configure', 'Validate', 'Apply'];

  return (
    <Box id='progress' sx={{ mb: 8 }}>
      <SectionHeader
        title='Progress Indicators'
        desc='Indeterminate bar for unknown-length loads, determinate for step completion, circular spinner at multiple sizes, and a step tracker for multi-stage workflows.'
      />

      <SubLabel>Indeterminate — active loading (rust accent)</SubLabel>
      <Box sx={{ mb: 3 }}>
        <LinearProgress
          color='primary'
          sx={{ borderRadius: 'var(--r-pill)', height: 4 }}
        />
        <TokenLabel>LinearProgress · indeterminate · h=4</TokenLabel>
      </Box>

      <SubLabel>Determinate — 0 · 23 · 57 · 84 · 100%</SubLabel>
      <Box
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3, maxWidth: 400 }}
      >
        {determinate.map((val) => (
          <Box key={val} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                color: 'text.disabled',
                width: 32,
                textAlign: 'right',
                flexShrink: 0,
              }}
            >
              {val}%
            </Typography>
            <LinearProgress
              variant='determinate'
              value={val}
              color='primary'
              sx={{ borderRadius: 'var(--r-pill)', height: 6, flex: 1 }}
            />
          </Box>
        ))}
      </Box>

      <SubLabel>Circular spinner — sizes 16 · 20 · 24 · 32 · 40</SubLabel>
      <Canvas>
        {[16, 20, 24, 32, 40].map((size) => (
          <Box
            key={size}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
          >
            <CircularProgress size={size} color='primary' />
            <TokenLabel>{size}px</TokenLabel>
          </Box>
        ))}
      </Canvas>

      <SubLabel>Step progress — 3-stage apply workflow</SubLabel>
      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 'var(--r-md)' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[0, 1, 2].map((activeStep) => (
            <Box key={activeStep}>
              <Typography
                sx={{
                  fontSize: '10.5px',
                  fontFamily: 'var(--font-mono)',
                  color: 'text.disabled',
                  mb: 1.5,
                }}
              >
                activeStep={activeStep}
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0,
                }}
              >
                {steps.map((step, idx) => {
                  const done = idx < activeStep;
                  const active = idx === activeStep;
                  return (
                    <Box
                      key={step}
                      sx={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : undefined }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 0.5,
                          flexShrink: 0,
                        }}
                      >
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: done
                              ? 'success.main'
                              : active
                                ? 'primary.main'
                                : 'var(--bd0)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {done ? (
                            <CheckCircleIcon
                              sx={{ fontSize: 14, color: '#fff' }}
                            />
                          ) : (
                            <Typography
                              sx={{
                                fontSize: '10px',
                                fontWeight: 700,
                                color: active ? '#fff' : 'text.disabled',
                                lineHeight: 1,
                              }}
                            >
                              {idx + 1}
                            </Typography>
                          )}
                        </Box>
                        <Typography
                          sx={{
                            fontSize: '10.5px',
                            fontWeight: active ? 600 : 400,
                            color: done
                              ? 'success.main'
                              : active
                                ? 'text.primary'
                                : 'text.disabled',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {step}
                        </Typography>
                      </Box>
                      {idx < steps.length - 1 && (
                        <Box
                          sx={{
                            height: 1,
                            flex: 1,
                            bgcolor: done ? 'success.main' : 'var(--bd0)',
                            mx: 1,
                            mt: -2.5,
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>
    </Box>
  );
}

// ── Skeleton Loaders Section ───────────────────────────────────────────────────

function SkeletonsSection() {
  return (
    <Box id='skeletons' sx={{ mb: 8 }}>
      <SectionHeader
        title='Skeleton Loaders'
        desc='Preserve layout shape during data fetches. Each pattern mirrors the real component dimensions — no generic blocks. Use animation="wave" for the shimmer effect.'
      />

      <SubLabel>Unit list row skeleton (×3)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: 1,
              borderBottom: i < 2 ? '1px solid var(--bd1)' : 'none',
            }}
          >
            <Skeleton
              variant='rounded'
              width={28}
              height={28}
              sx={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton variant='text' width={`${60 + i * 12}%`} height={14} sx={{ mb: 0.5 }} />
              <Skeleton variant='text' width={`${30 + i * 8}%`} height={12} />
            </Box>
            <Skeleton
              variant='rounded'
              width={64}
              height={20}
              sx={{ borderRadius: 'var(--r-pill)', flexShrink: 0 }}
            />
            <Skeleton
              variant='rounded'
              width={72}
              height={20}
              sx={{ borderRadius: 'var(--r-pill)', flexShrink: 0 }}
            />
          </Box>
        ))}
      </Paper>

      <SubLabel>Detail pane header skeleton</SubLabel>
      <Paper
        elevation={1}
        sx={{ p: 2, borderRadius: 'var(--r-md)', display: 'flex', gap: 2, alignItems: 'flex-start' }}
      >
        <Skeleton
          variant='rounded'
          width={40}
          height={40}
          sx={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }}
        />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant='text' width='55%' height={18} sx={{ mb: 0.75 }} />
          <Skeleton variant='text' width='30%' height={13} sx={{ mb: 1 }} />
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Skeleton variant='rounded' width={72} height={22} sx={{ borderRadius: 'var(--r-pill)' }} />
            <Skeleton variant='rounded' width={88} height={22} sx={{ borderRadius: 'var(--r-pill)' }} />
          </Box>
        </Box>
      </Paper>

      <SubLabel>Stat card row skeleton (UnitStatusCards)</SubLabel>
      <Paper
        elevation={1}
        sx={{ p: 1.5, borderRadius: 'var(--r-md)', display: 'flex', gap: 2 }}
      >
        {[100, 80, 110, 90].map((w, i) => (
          <Box
            key={i}
            sx={{
              flex: 1,
              border: '1px solid var(--bd0)',
              borderRadius: '12px',
              p: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
            }}
          >
            <Skeleton variant='text' width={`${w * 0.5}%`} height={12} />
            <Skeleton variant='text' width={`${w * 0.4}%`} height={18} />
          </Box>
        ))}
      </Paper>

      <SubLabel>Table skeleton — header + 4 rows</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'flex',
            gap: 3,
            px: 2,
            py: 1.25,
            borderBottom: '2px solid var(--bd0)',
            bgcolor: 'background.default',
          }}
        >
          {[160, 80, 72, 96, 56].map((w, i) => (
            <Skeleton key={i} variant='text' width={w} height={11} />
          ))}
        </Box>
        {[0, 1, 2, 3].map((i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              gap: 3,
              px: 2,
              py: 1,
              borderBottom: i < 3 ? '1px solid var(--bd1)' : 'none',
            }}
          >
            {[140, 72, 64, 88, 48].map((w, j) => (
              <Skeleton
                key={j}
                variant='text'
                width={w + (i % 2 === 0 ? 20 : 0)}
                height={14}
              />
            ))}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// ── Inline Notifications Section ───────────────────────────────────────────────

function NotificationsSection() {
  const [openSnackbar, setOpenSnackbar] = useState<string | null>(null);

  const variants: Array<{
    severity: 'success' | 'info' | 'warning' | 'error';
    message: string;
    action: string;
  }> = [
    {
      severity: 'success',
      message: 'Space synced — all 12 units are now in ready state.',
      action: 'Show success',
    },
    {
      severity: 'info',
      message: 'Apply queued — changes will be live within 2–5 minutes.',
      action: 'Show info',
    },
    {
      severity: 'warning',
      message: '3 units gated — manual approval required before applying.',
      action: 'Show warning',
    },
    {
      severity: 'error',
      message: 'Apply failed — function executor returned exit code 1.',
      action: 'Show error',
    },
  ];

  return (
    <Box id='notifications' sx={{ mb: 8 }}>
      <SectionHeader
        title='Inline Notifications'
        desc='Global snackbar pattern from Layout.tsx. Anchored top-center with a filled Alert inside. Triggered by the global alertSlice. Click each button to preview the toast.'
      />

      <SubLabel>All severity variants (static preview)</SubLabel>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 4, maxWidth: 480 }}>
        {variants.map((v) => (
          <Alert key={v.severity} severity={v.severity} variant='filled' sx={{ width: '100%' }}>
            {v.message}
          </Alert>
        ))}
      </Box>

      <SubLabel>Live snackbar — top-center anchor</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          {variants.map((v) => (
            <Button
              key={v.severity}
              variant='outlined'
              size='small'
              color={v.severity === 'error' ? 'error' : v.severity === 'warning' ? 'warning' : 'primary'}
              onClick={() => setOpenSnackbar(v.severity)}
            >
              {v.action}
            </Button>
          ))}
        </Box>
      </Canvas>

      {variants.map((v) => (
        <Snackbar
          key={v.severity}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
          open={openSnackbar === v.severity}
          autoHideDuration={3000}
          onClose={() => setOpenSnackbar(null)}
        >
          <Alert
            onClose={() => setOpenSnackbar(null)}
            severity={v.severity}
            variant='filled'
            sx={{ width: '100%', minWidth: 320 }}
          >
            {v.message}
          </Alert>
        </Snackbar>
      ))}

      <SubLabel>Snackbar pattern (from Layout.tsx)</SubLabel>
      <Paper
        elevation={0}
        sx={{
          bgcolor: 'var(--bg)',
          border: '1px solid var(--bd0)',
          borderRadius: 'var(--r-sm)',
          p: 2,
          fontFamily: 'var(--font-mono)',
          fontSize: '11.5px',
          color: 'text.secondary',
          lineHeight: 1.7,
        }}
      >
        <Typography
          component='div'
          sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'text.secondary', lineHeight: 1.7 }}
        >
          {'<Snackbar anchorOrigin={{ vertical: "top", horizontal: "center" }} ...>'}<br />
          {'  <Alert severity={severity} variant="filled" sx={{ width: "100%" }}>'}<br />
          {'    {message}'}<br />
          {'  </Alert>'}<br />
          {'</Snackbar>'}
        </Typography>
      </Paper>
    </Box>
  );
}

// ── Empty State Variants Section ───────────────────────────────────────────────

function EmptyStateVariantsSection() {
  interface EmptyConfig {
    id: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    cta: string;
    ctaSecondary?: string;
  }

  const empties: EmptyConfig[] = [
    {
      id: 'no-units',
      icon: <InboxIcon sx={{ fontSize: 36, color: 'text.disabled' }} />,
      title: 'No units in this space',
      desc: 'Add your first unit to start managing configuration across targets.',
      cta: 'Add Unit',
    },
    {
      id: 'no-spaces',
      icon: <GridViewIcon sx={{ fontSize: 36, color: 'text.disabled' }} />,
      title: 'No spaces yet',
      desc: 'Spaces group units by environment or team. Create one to get started.',
      cta: 'Create Space',
    },
    {
      id: 'no-targets',
      icon: <FolderOffIcon sx={{ fontSize: 36, color: 'text.disabled' }} />,
      title: 'No targets configured',
      desc: 'Targets define where your configuration is deployed. Add a Kubernetes cluster or cloud account.',
      cta: 'Add Target',
    },
    {
      id: 'no-results',
      icon: <SearchIcon sx={{ fontSize: 36, color: 'text.disabled' }} />,
      title: 'No results match your filter',
      desc: 'Try adjusting your search query or removing active filters to see all units.',
      cta: 'Clear Filters',
      ctaSecondary: 'Reset View',
    },
  ];

  return (
    <Box id='empty-states' sx={{ mb: 8 }}>
      <SectionHeader
        title='Empty State Variants'
        desc='Entity-specific empty states with an icon, context-aware title, actionable description, and a primary CTA. Keep copy concise — tell users what to do, not what is missing.'
      />

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 2,
        }}
      >
        {empties.map((e) => (
          <Paper
            key={e.id}
            elevation={1}
            sx={{ borderRadius: 'var(--r-md)' }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                py: 5,
                px: 3,
              }}
            >
              <Box sx={{ mb: 2, color: 'text.disabled' }}>{e.icon}</Box>
              <Typography variant='h3' sx={{ mb: 0.75 }}>
                {e.title}
              </Typography>
              <Typography
                variant='body2'
                color='text.secondary'
                sx={{ mb: 3, maxWidth: 240 }}
              >
                {e.desc}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant='contained' size='small' startIcon={<AddIcon />}>
                  {e.cta}
                </Button>
                {e.ctaSecondary && (
                  <Button variant='outlined' size='small'>
                    {e.ctaSecondary}
                  </Button>
                )}
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>

      <SubLabel>No events — events tab</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)' }}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            py: 6,
            px: 4,
          }}
        >
          <DifferenceIcon sx={{ fontSize: 36, color: 'text.disabled', mb: 2 }} />
          <Typography variant='h3' sx={{ mb: 0.75 }}>
            No events yet
          </Typography>
          <Typography
            variant='body2'
            color='text.secondary'
            sx={{ mb: 1.5, maxWidth: 320 }}
          >
            Unit events track actuation operations — Apply, Destroy, Refresh, Import. Run an
            operation to see the history here.
          </Typography>
          <Link
            href='https://docs.confighub.com/background/entities/unit/#unit-actuation-lifecycle'
            target='_blank'
            rel='noopener noreferrer'
            underline='hover'
            sx={{ fontSize: 12.5 }}
          >
            Read about the actuation lifecycle
          </Link>
        </Box>
      </Paper>
    </Box>
  );
}

// ── Diff Indicators Section ────────────────────────────────────────────────────

function DiffSection() {
  const mutationSources: Array<{ label: string; color: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'default'; token: string }> = [
    { label: 'CreateUnit', color: 'success', token: 'SourceType origin' },
    { label: 'CloneUnit', color: 'info', token: 'SourceType clone' },
    { label: 'UpdateUnit', color: 'primary', token: 'SourceType update' },
    { label: 'MergeUnits', color: 'secondary', token: 'SourceType merge' },
    { label: 'NeedsProvides', color: 'warning', token: 'SourceType link' },
    { label: 'UpgradeUnit', color: 'info', token: 'SourceType upgrade' },
  ];

  const actionResults: Array<{ label: string; color: 'success' | 'error' | 'info' | 'default' }> = [
    { label: 'ApplyCompleted', color: 'success' },
    { label: 'ApplyFailed', color: 'error' },
    { label: 'DestroyCompleted', color: 'success' },
    { label: 'DestroyFailed', color: 'error' },
    { label: 'RefreshAndDrifted', color: 'success' },
    { label: 'RefreshAndNoDrift', color: 'info' },
    { label: 'None', color: 'default' },
  ];

  return (
    <Box id='diff' sx={{ mb: 8 }}>
      <SectionHeader
        title='Diff Indicators'
        desc='Upgrade count badges, mutation source chips (how config was authored), action result labels, and the drift/upgrade inline indicators used in the unit grid.'
      />

      <SubLabel>Upgrade count badges</SubLabel>
      <Canvas>
        {[1, 3, 7, 14].map((n) => (
          <Box
            key={n}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}
          >
            <Chip
              label={`↑ ${n} upgrade${n !== 1 ? 's' : ''}`}
              color='secondary'
              size='small'
            />
            <TokenLabel>secondary / --purple</TokenLabel>
          </Box>
        ))}
      </Canvas>

      <SubLabel>Drift delta</SubLabel>
      <Canvas>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          <Chip label='Drifted' color='warning' size='small' />
          <TokenLabel>RefreshAndDrifted</TokenLabel>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          <Chip label='No Drift' color='success' size='small' />
          <TokenLabel>RefreshAndNoDrift</TokenLabel>
        </Box>
        <Box
          sx={{
            px: 1,
            py: 0.5,
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--bd0)',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
          }}
        >
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'text.secondary' }}>
            +12 / -4
          </Typography>
          <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'text.disabled' }}>
            lines changed
          </Typography>
        </Box>
      </Canvas>

      <SubLabel>Mutation source chips — how configuration was authored</SubLabel>
      <Canvas>
        {mutationSources.map((m) => (
          <Box
            key={m.label}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}
          >
            <Chip label={m.label} color={m.color} size='small' />
            <TokenLabel>{m.token}</TokenLabel>
          </Box>
        ))}
      </Canvas>

      <SubLabel>ActionResult labels — last apply outcome</SubLabel>
      <Canvas>
        {actionResults.map((a) => (
          <Box
            key={a.label}
            sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.75 }}
          >
            <Chip label={a.label} color={a.color} size='small' />
          </Box>
        ))}
      </Canvas>

      <SubLabel>Inline path diff — mutation path row</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        {[
          { path: 'spec.template.spec.containers[0].image', from: 'nginx:1.24', to: 'nginx:1.27.1', type: 'update' },
          { path: 'spec.replicas', from: '2', to: '4', type: 'scale' },
          { path: 'metadata.labels.version', from: undefined, to: 'v2.3.0', type: 'add' },
          { path: 'spec.strategy.rollingUpdate', from: '{}', to: undefined, type: 'remove' },
        ].map((row, i, arr) => (
          <Box
            key={row.path}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 2,
              py: 0.875,
              borderBottom: i < arr.length - 1 ? '1px solid var(--bd1)' : 'none',
              '&:hover': { bgcolor: 'background.default' },
            }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor:
                  row.type === 'add'
                    ? 'success.main'
                    : row.type === 'remove'
                      ? 'error.main'
                      : 'info.main',
                flexShrink: 0,
              }}
            />
            <Typography
              sx={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'text.secondary',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {row.path}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
              {row.from && (
                <Typography
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'error.main',
                    bgcolor: 'var(--red-bg)',
                    px: 0.75,
                    borderRadius: '3px',
                  }}
                >
                  -{row.from}
                </Typography>
              )}
              {row.to && (
                <Typography
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'success.main',
                    bgcolor: 'var(--green-bg)',
                    px: 0.75,
                    borderRadius: '3px',
                  }}
                >
                  +{row.to}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

// ── Data Display Sections ─────────────────────────────────────────────────────

interface DataRow {
  id: string;
  name: string;
  space: string;
  status: string;
  statusColor: 'success' | 'info' | 'warning' | 'error' | 'default';
  toolchain: string;
  updated: string;
}

interface AppCardData {
  name: string;
  owner: string;
  spaces: number;
  statusLabel: string;
  statusColor: 'success' | 'info' | 'warning' | 'error' | 'default';
  updated: string;
}

interface DiffRow {
  path: string;
  before: string;
  after: string;
}

const DATAGRID_ROWS: DataRow[] = [
  { id: '1', name: 'payments-api', space: 'production', status: 'Ready', statusColor: 'success', toolchain: 'Kubernetes/YAML', updated: '2m ago' },
  { id: '2', name: 'auth-service', space: 'staging', status: 'Applying', statusColor: 'info', toolchain: 'Kubernetes/YAML', updated: '5m ago' },
  { id: '3', name: 'infra-base', space: 'production', status: 'Gated', statusColor: 'warning', toolchain: 'OpenTofu', updated: '1h ago' },
  { id: '4', name: 'data-pipeline', space: 'dev', status: 'Degraded', statusColor: 'error', toolchain: 'Kubernetes/YAML', updated: '23m ago' },
  { id: '5', name: 'api-gateway', space: 'production', status: 'Ready', statusColor: 'success', toolchain: 'Kubernetes/YAML', updated: '4h ago' },
];

const DATAGRID_COLUMNS: GridColDef<DataRow>[] = [
  {
    field: 'name',
    headerName: 'Name / Space',
    flex: 1.5,
    valueGetter: (_: unknown, row: DataRow) => row.name,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 0.25 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}>
          {params.row.name}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
          {params.row.space}
        </Typography>
      </Box>
    ),
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    valueGetter: (_: unknown, row: DataRow) => row.status,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <Chip label={params.row.status} color={params.row.statusColor} size='small' />
      </Box>
    ),
  },
  {
    field: 'toolchain',
    headerName: 'Toolchain',
    flex: 1,
    valueGetter: (_: unknown, row: DataRow) => row.toolchain,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', gap: 0.75 }}>
        <Box
          sx={{
            width: 16,
            height: 16,
            borderRadius: 'var(--r-sm)',
            bgcolor: 'var(--blue-bg)',
            border: '1px solid var(--bd0)',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          ⎈
        </Box>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
          {params.row.toolchain}
        </Typography>
      </Box>
    ),
  },
  {
    field: 'updated',
    headerName: 'Updated',
    width: 90,
    valueGetter: (_: unknown, row: DataRow) => row.updated,
    renderCell: (params) => (
      <Box sx={{ display: 'flex', alignItems: 'center', height: '100%' }}>
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontFamily: 'var(--font-mono)' }}>
          {params.row.updated}
        </Typography>
      </Box>
    ),
  },
];

function DataGridSection() {
  return (
    <Box id='datagrid' sx={{ mb: 8 }}>
      <SectionHeader
        title='Entity DataGrid'
        desc='Full-featured unit table. Striped rows, compact 40px height, quick-filter toolbar, per-column visibility panel. Column patterns: name+space stacked, status chip, toolchain badge, mono timestamp.'
      />

      <SubLabel>Default — 5 rows</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', height: 308 }}>
        <DataGrid
          rows={DATAGRID_ROWS}
          columns={DATAGRID_COLUMNS}
          density='compact'
          disableRowSelectionOnClick
          hideFooter
          sx={{
            border: 0,
            borderRadius: 0,
            '& .MuiDataGrid-columnHeader': { bgcolor: 'background.paper' },
            '& .MuiDataGrid-columnHeaderTitle': {
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'text.disabled',
            },
            '& .MuiDataGrid-row:hover': { bgcolor: 'background.default' },
          }}
        />
      </Paper>

      <SubLabel>Loading — skeleton rows</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 0.875, borderBottom: '2px solid var(--bd0)', bgcolor: 'background.paper' }}>
          {['Name / Space', 'Status', 'Toolchain', 'Updated'].map((h) => (
            <Typography
              key={h}
              sx={{
                flex: h === 'Name / Space' ? 1.5 : h === 'Toolchain' ? 1 : undefined,
                width: h === 'Status' ? 120 : h === 'Updated' ? 90 : undefined,
                fontSize: '10px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                color: 'text.disabled',
                pr: 2,
              }}
            >
              {h}
            </Typography>
          ))}
        </Box>
        {[1, 2, 3].map((i) => (
          <Box
            key={i}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 0.875,
              borderBottom: '1px solid var(--bd1)',
              bgcolor: i % 2 === 0 ? 'rgba(0,0,0,0.015)' : 'background.paper',
            }}
          >
            <Box sx={{ flex: 1.5, pr: 2 }}>
              <Skeleton variant='text' width='55%' height={14} />
              <Skeleton variant='text' width='35%' height={11} />
            </Box>
            <Box sx={{ width: 120, pr: 2 }}>
              <Skeleton variant='rounded' width={64} height={20} sx={{ borderRadius: 'var(--r-pill)' }} />
            </Box>
            <Box sx={{ flex: 1, pr: 2, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Skeleton variant='rounded' width={16} height={16} sx={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }} />
              <Skeleton variant='text' width='60%' height={14} />
            </Box>
            <Box sx={{ width: 90 }}>
              <Skeleton variant='text' width={44} height={12} />
            </Box>
          </Box>
        ))}
      </Paper>

      <SubLabel>Empty — no matching units</SubLabel>
      <Paper
        elevation={1}
        sx={{
          borderRadius: 'var(--r-md)',
          py: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 0.75,
        }}
      >
        <Typography sx={{ fontSize: 32, color: 'text.disabled', lineHeight: 1, mb: 1 }}>⊘</Typography>
        <Typography variant='h3'>No units found</Typography>
        <Typography variant='body2' color='text.secondary' sx={{ maxWidth: 260, mb: 1.5 }}>
          No units match the current filters. Clear your search or adjust the query.
        </Typography>
        <Button size='small' variant='outlined'>Clear filters</Button>
      </Paper>

      <Box sx={{ mt: 2, px: 2, py: 1.25, bgcolor: 'background.default', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd1)' }}>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
          EntityDataGrid · StripedDataGrid · GridColDef&lt;T&gt; · valueGetter required for column sorting
        </Typography>
      </Box>
    </Box>
  );
}

function AppCardsSection() {
  const apps: AppCardData[] = [
    { name: 'payments-api', owner: 'Platform', spaces: 4, statusLabel: '● Ready', statusColor: 'success', updated: '2m ago' },
    { name: 'auth-service', owner: 'Platform', spaces: 3, statusLabel: '▶▶ Applying', statusColor: 'info', updated: '1h ago' },
    { name: 'data-pipeline', owner: 'Data', spaces: 2, statusLabel: '⚠ Gated', statusColor: 'warning', updated: 'yesterday' },
    { name: 'infra-cluster', owner: 'Infrastructure', spaces: 6, statusLabel: '● Ready', statusColor: 'success', updated: '4h ago' },
  ];

  return (
    <Box id='appcards' sx={{ mb: 8 }}>
      <SectionHeader
        title='App / Component Cards'
        desc='Cards in the component view showing grouped deployments per app. Name + owner label + space-count badge. Status chip in footer. Selected state uses the sh-sel ring.'
      />

      <SubLabel>Card grid — 2 columns</SubLabel>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5, maxWidth: 600 }}>
        {apps.map((app) => (
          <Paper
            key={app.name}
            elevation={1}
            sx={{
              p: 2,
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--bd0)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: 1.5,
              transition: 'box-shadow 0.15s',
              '&:hover': { boxShadow: 'var(--sh-md)' },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 'var(--r-sm)',
                    bgcolor: 'var(--blue-bg)',
                    border: '1px solid var(--bd0)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 13,
                    flexShrink: 0,
                  }}
                >
                  ⎈
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {app.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>
                    {app.owner}
                  </Typography>
                </Box>
              </Box>
              <Chip label={`${app.spaces} spaces`} size='small' variant='outlined' sx={{ flexShrink: 0, height: 20, fontSize: '10.5px' }} />
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Chip label={app.statusLabel} color={app.statusColor} size='small' />
              <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'var(--font-mono)' }}>
                {app.updated}
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      <SubLabel>Selected state — sh-sel ring</SubLabel>
      <Paper
        elevation={2}
        sx={{
          p: 2,
          borderRadius: 'var(--r-md)',
          maxWidth: 280,
          boxShadow: 'var(--sh-sel)',
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          cursor: 'pointer',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 28, height: 28, borderRadius: 'var(--r-sm)', bgcolor: 'var(--rust-bg)', border: '1px solid var(--rust-ring)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>⎈</Box>
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'primary.main' }}>payments-api</Typography>
            <Typography sx={{ fontSize: 10.5, color: 'text.disabled' }}>Platform</Typography>
          </Box>
          <Chip label='4 spaces' size='small' variant='outlined' sx={{ ml: 'auto', height: 20, fontSize: '10.5px' }} />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Chip label='● Ready' color='success' size='small' />
          <Typography sx={{ fontSize: 10.5, color: 'text.disabled', fontFamily: 'var(--font-mono)' }}>2m ago</Typography>
        </Box>
      </Paper>
    </Box>
  );
}

function DetailPaneSection() {
  const kvRows = [
    { label: 'Toolchain', value: 'Kubernetes/YAML', mono: false },
    { label: 'Space', value: 'production', mono: false },
    { label: 'Last updated', value: '2 min ago', mono: false },
    { label: 'Unit ID', value: 'unit-91fa3d', mono: true },
    { label: 'Source', value: 'k8s/manifests/payments.yaml', mono: true },
  ];

  return (
    <Box id='detailpane' sx={{ mb: 8 }}>
      <SectionHeader
        title='Detail Pane'
        desc='Right-side slide-in panel when a unit is selected. PaneHeader: icon + name + status chip + close. Key-value body rows at 34px density. Action footer with primary/secondary/destructive buttons.'
      />

      <SubLabel>Full layout — normal state</SubLabel>
      <Box sx={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
        <Paper elevation={2} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', width: 300, flexShrink: 0 }}>
          {/* PaneHeader */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: '1px solid var(--bd0)', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <Box sx={{ width: 22, height: 22, borderRadius: 'var(--r-sm)', bgcolor: 'var(--blue-bg)', border: '1px solid var(--bd0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>⬡</Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.primary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                payments-api
              </Typography>
              <Chip label='● Ready' color='success' size='small' />
            </Box>
            <IconButton size='small'><CloseIcon sx={{ fontSize: 16 }} /></IconButton>
          </Box>
          {/* Key-value rows */}
          <Box>
            {kvRows.map((row, idx) => (
              <Box
                key={row.label}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  px: 2,
                  py: 0.875,
                  borderBottom: idx < kvRows.length - 1 ? '1px solid var(--bd1)' : 'none',
                }}
              >
                <Typography sx={{ width: 96, flexShrink: 0, fontSize: '11.5px', color: 'text.disabled', fontWeight: 500 }}>
                  {row.label}
                </Typography>
                <Typography
                  sx={{
                    fontSize: '12px',
                    color: 'text.primary',
                    fontFamily: row.mono ? 'var(--font-mono)' : undefined,
                    fontWeight: row.mono ? 400 : 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {row.value}
                </Typography>
              </Box>
            ))}
          </Box>
          {/* Action footer */}
          <Box sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--bd0)', display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button size='small' variant='contained'>Apply</Button>
            <Button size='small' variant='outlined'>Diff</Button>
            <Button size='small' variant='text' color='error' sx={{ ml: 'auto' }}>Delete</Button>
          </Box>
        </Paper>

        {/* Annotations */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 2 }}>
          <TokenLabel>PaneHeader · 52px</TokenLabel>
          <TokenLabel>--bd0 border</TokenLabel>
          <Box sx={{ mt: 3 }}>
            <TokenLabel>Key-Value Row · 34px</TokenLabel>
            <TokenLabel>--bd1 divider</TokenLabel>
          </Box>
          <Box sx={{ mt: 10 }}>
            <TokenLabel>ActionFooter · 48px</TokenLabel>
            <TokenLabel>--bd0 border-top</TokenLabel>
          </Box>
        </Box>
      </Box>

      <SubLabel>Loading skeleton</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', width: 300 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, py: 1.5, borderBottom: '1px solid var(--bd0)', gap: 1 }}>
          <Skeleton variant='rounded' width={22} height={22} sx={{ borderRadius: 'var(--r-sm)', flexShrink: 0 }} />
          <Skeleton variant='text' width={110} height={20} />
          <Skeleton variant='rounded' width={60} height={20} sx={{ borderRadius: 'var(--r-pill)', ml: 0.5 }} />
          <Skeleton variant='circular' width={24} height={24} sx={{ ml: 'auto', flexShrink: 0 }} />
        </Box>
        {[96, 64, 72, 110, 148].map((w, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', px: 2, py: 0.875, borderBottom: '1px solid var(--bd1)' }}>
            <Skeleton variant='text' width={80} height={14} sx={{ flexShrink: 0, mr: 1.5 }} />
            <Skeleton variant='text' width={w} height={14} />
          </Box>
        ))}
      </Paper>
    </Box>
  );
}

function TreeViewSection() {
  const [expandedItems, setExpandedItems] = useState<string[]>(['owner-platform', 'owner-data', 'owner-infra']);

  const owners = [
    {
      id: 'owner-platform',
      label: 'Platform',
      apps: [
        { id: 'app-payments-api', label: 'payments-api', count: 4 },
        { id: 'app-auth-service', label: 'auth-service', count: 3 },
      ],
    },
    {
      id: 'owner-data',
      label: 'Data',
      apps: [
        { id: 'app-data-pipeline', label: 'data-pipeline', count: 2 },
        { id: 'app-analytics', label: 'analytics-svc', count: 1 },
      ],
    },
    {
      id: 'owner-infra',
      label: 'Infrastructure',
      apps: [
        { id: 'app-infra-base', label: 'infra-base', count: 6 },
        { id: 'app-api-gateway', label: 'api-gateway', count: 2 },
      ],
    },
  ];

  return (
    <Box id='tree' sx={{ mb: 8 }}>
      <SectionHeader
        title='Tree / Hierarchy View'
        desc='SimpleTreeView with two-level Owner → App structure. Dashed connector lines, PeopleIcon for owner nodes, AppsIcon for app nodes, count badge on each row.'
      />

      <SubLabel>Owner → App tree (v8 SimpleTreeView)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', width: 280 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid var(--bd0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant='body2' color='text.secondary' fontWeight={500}>
            Components
          </Typography>
          <Box component='span' sx={{ fontSize: '0.7rem', fontFamily: 'var(--font-sans)', color: 'text.disabled', bgcolor: 'rgba(0,0,0,0.06)', borderRadius: 1, px: '6px', py: '1px', lineHeight: 1.4 }}>
            8
          </Box>
        </Box>
        <Box sx={{ p: 1 }}>
          <SimpleTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={(_e: React.SyntheticEvent | null, ids: string[]) => setExpandedItems(ids)}
            slots={{ expandIcon: ChevronRightIcon, collapseIcon: ExpandMoreIcon }}
          >
            {owners.map((owner) => (
              <TreeItem
                key={owner.id}
                itemId={owner.id}
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                    <PeopleIcon sx={{ fontSize: 16, color: 'secondary.main', flexShrink: 0 }} />
                    <Typography variant='body2' fontWeight={500} noWrap sx={{ flex: 1 }}>
                      {owner.label}
                    </Typography>
                    <Box component='span' sx={{ fontSize: '0.7rem', fontFamily: 'var(--font-sans)', color: 'text.disabled', bgcolor: 'rgba(0,0,0,0.06)', borderRadius: 1, px: '6px', py: '1px', lineHeight: 1.4, flexShrink: 0 }}>
                      {owner.apps.length}
                    </Box>
                  </Box>
                }
              >
                {owner.apps.map((app) => (
                  <TreeItem
                    key={app.id}
                    itemId={app.id}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flex: 1, minWidth: 0 }}>
                        <AppsIcon sx={{ fontSize: 16, color: 'primary.main', flexShrink: 0 }} />
                        <Typography variant='body2' noWrap sx={{ flex: 1 }}>
                          {app.label}
                        </Typography>
                        <Box component='span' sx={{ fontSize: '0.7rem', fontFamily: 'var(--font-sans)', color: 'text.disabled', bgcolor: 'rgba(0,0,0,0.06)', borderRadius: 1, px: '6px', py: '1px', lineHeight: 1.4, flexShrink: 0 }}>
                          {app.count}
                        </Box>
                      </Box>
                    }
                  />
                ))}
              </TreeItem>
            ))}
          </SimpleTreeView>
        </Box>
      </Paper>

      <Box sx={{ mt: 2, px: 2, py: 1.25, bgcolor: 'background.default', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd1)' }}>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
          @mui/x-tree-view v8 · SimpleTreeView · TreeItem · expandedItems controlled state
        </Typography>
      </Box>
    </Box>
  );
}

function StatRowSection() {
  const stats = [
    { label: 'Units', value: 47, color: 'var(--blue)' },
    { label: 'Spaces', value: 6, color: 'var(--purple)' },
    { label: 'Targets', value: 12, color: 'var(--green)' },
    { label: 'Workers', value: 3, color: 'var(--amber)' },
  ];

  return (
    <Box id='statrow' sx={{ mb: 8 }}>
      <SectionHeader
        title='Stat Row'
        desc='Horizontal count bar for the unit list header and dashboard. Mono number + label pairs separated by hairline dividers. Secondary variant shows status breakdown chips.'
      />

      <SubLabel>Full summary bar</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', px: 3, py: 1.75, display: 'inline-flex', alignItems: 'center' }}>
        {stats.map((stat, i) => (
          <Box key={stat.label} sx={{ display: 'flex', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', px: 2 }}>
              <Typography sx={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>
                {stat.value}
              </Typography>
              <Typography sx={{ fontSize: '9.5px', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, mt: 0.25 }}>
                {stat.label}
              </Typography>
            </Box>
            {i < stats.length - 1 && (
              <Divider orientation='vertical' flexItem sx={{ opacity: 0.5 }} />
            )}
          </Box>
        ))}
      </Paper>

      <SubLabel>With status breakdown chips</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', p: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--blue)' }}>47</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.disabled', fontWeight: 600 }}>units</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip label='38 Ready' color='success' size='small' />
          <Chip label='3 Applying' color='info' size='small' />
          <Chip label='4 Gated' color='warning' size='small' />
          <Chip label='2 Degraded' color='error' size='small' />
        </Box>
      </Paper>

      <SubLabel>Compact inline (list header)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', px: 2, py: 1, display: 'inline-flex', alignItems: 'center', gap: 1.5 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>47 units</Typography>
        <Box sx={{ width: 1, height: 12, bgcolor: 'var(--bd0)' }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>6 spaces</Typography>
        <Box sx={{ width: 1, height: 12, bgcolor: 'var(--bd0)' }} />
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: 'text.secondary' }}>12 targets</Typography>
      </Paper>
    </Box>
  );
}

function DiffViewSection() {
  const diffRows: DiffRow[] = [
    { path: 'spec.replicas', before: '2', after: '4' },
    { path: 'spec.template.spec.containers[0].image', before: 'payments-api:v1.4.2', after: 'payments-api:v1.5.0' },
    { path: 'spec.template.spec.containers[0].resources.limits.memory', before: '256Mi', after: '512Mi' },
    { path: 'spec.template.spec.containers[0].resources.requests.cpu', before: '100m', after: '200m' },
  ];

  return (
    <Box id='diffview' sx={{ mb: 8 }}>
      <SectionHeader
        title='Diff / Code View'
        desc='Three-column upgrade diff: property path | before (red-tinted) | after (green-tinted). JetBrains Mono throughout. Column widths are drag-resizable in the real component via CSS vars --col1-width / --col2-width.'
      />

      <SubLabel>Upgrade diff — 3-column layout</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', borderBottom: '2px solid var(--bd0)', bgcolor: 'background.paper' }}>
          <Box sx={{ width: '40%', px: 2, py: 0.875 }}>
            <Typography sx={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'text.disabled' }}>Property</Typography>
          </Box>
          <Box sx={{ width: '30%', px: 1.5, py: 0.875, bgcolor: 'var(--red-bg)', borderLeft: '1px solid var(--bd0)' }}>
            <Typography sx={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--red)' }}>Before</Typography>
          </Box>
          <Box sx={{ flex: 1, px: 1.5, py: 0.875, bgcolor: 'var(--green-bg)', borderLeft: '1px solid var(--bd0)' }}>
            <Typography sx={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--green)' }}>After</Typography>
          </Box>
        </Box>
        {diffRows.map((row, i) => (
          <Box
            key={row.path}
            sx={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: i < diffRows.length - 1 ? '1px solid var(--bd1)' : 'none',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.01)' },
            }}
          >
            <Box sx={{ width: '40%', px: 2, py: 0.625, display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'text.secondary', wordBreak: 'break-all' }}>
                {row.path}
              </Typography>
            </Box>
            <Box sx={{ width: '30%', px: 1.5, py: 0.625, bgcolor: 'var(--red-bg)', borderLeft: '1px solid var(--bd0)', display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--red)', wordBreak: 'break-all' }}>
                {row.before}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, px: 1.5, py: 0.625, bgcolor: 'var(--green-bg)', borderLeft: '1px solid var(--bd0)', display: 'flex', alignItems: 'center' }}>
              <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--green)', wordBreak: 'break-all' }}>
                {row.after}
              </Typography>
            </Box>
          </Box>
        ))}
      </Paper>

      <SubLabel>View-only (single revision — path + value)</SubLabel>
      <Paper elevation={1} sx={{ borderRadius: 'var(--r-md)', overflow: 'hidden', maxWidth: 500 }}>
        <Box sx={{ px: 2, py: 0.875, borderBottom: '2px solid var(--bd0)', bgcolor: 'background.default' }}>
          <Typography sx={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'text.disabled' }}>
            Configuration (current revision)
          </Typography>
        </Box>
        {[
          { path: 'spec.replicas', value: '4' },
          { path: 'spec.template.metadata.labels.app', value: 'payments-api' },
          { path: 'spec.template.spec.containers[0].image', value: 'payments-api:v1.5.0' },
          { path: 'spec.template.spec.containers[0].resources.limits.memory', value: '512Mi' },
        ].map((row, i) => (
          <Box
            key={row.path}
            sx={{
              display: 'flex',
              alignItems: 'center',
              px: 2,
              py: 0.5,
              borderBottom: i < 3 ? '1px solid var(--bd1)' : 'none',
              gap: 3,
              '&:hover': { bgcolor: 'rgba(0,0,0,0.015)' },
            }}
          >
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'text.disabled', flex: 1 }}>
              {row.path}
            </Typography>
            <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'text.primary', fontWeight: 500 }}>
              {row.value}
            </Typography>
          </Box>
        ))}
      </Paper>

      <Box sx={{ mt: 2, px: 2, py: 1.25, bgcolor: 'background.default', borderRadius: 'var(--r-sm)', border: '1px solid var(--bd1)' }}>
        <Typography sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}>
          TreeDiffSection · ReviewRow · PropertyCell · BeforeCell · AfterCell · --col1-width --col2-width CSS vars
        </Typography>
      </Box>
    </Box>
  );
}

// ── Filter chip demo helper ────────────────────────────────────────────────────

function FilterChipDemo({
  field,
  operator,
  value,
  locked = false,
}: {
  field: string;
  operator: string;
  value: string;
  locked?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 30,
        borderRadius: '8px',
        bgcolor: locked ? 'rgba(0,0,0,0.04)' : 'background.paper',
        border: `1px solid ${locked ? 'transparent' : 'var(--bd0)'}`,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
        ...(!locked && {
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
          },
        }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          height: '100%',
          px: 1.5,
          borderRight: '1px solid var(--bd0)',
          color: locked ? 'text.disabled' : 'text.secondary',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.05em',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {locked && <LockIcon sx={{ fontSize: 11 }} />}
        {field}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          px: 1,
          borderRight: '1px solid var(--bd0)',
          color: 'text.primary',
          fontSize: '13px',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {operator}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          height: '100%',
          px: 1.5,
          color: 'text.primary',
          fontSize: '13px',
          minWidth: 40,
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </Box>
      {!locked && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            width: 28,
            borderLeft: '1px solid var(--bd0)',
            color: 'text.secondary',
            cursor: 'pointer',
            flexShrink: 0,
            '&:hover': {
              bgcolor: 'rgba(185,28,28,0.08)',
              color: 'error.main',
            },
          }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </Box>
      )}
    </Box>
  );
}

// ── Dialogs & Filters sections ─────────────────────────────────────────────────

function DrawerPanelSection() {
  return (
    <Box id='drawer' sx={{ mb: 8 }}>
      <SectionHeader
        title='Drawer Panel'
        desc='Right-anchored slide-out panel. 360–600px wide. Fixed header with title + close, scrollable body with key-value rows, fixed footer with Cancel + primary action.'
      />

      <SubLabel>Anatomy — header · tab bar · scrollable body · footer</SubLabel>
      <Paper
        elevation={0}
        sx={{
          width: 380,
          height: 460,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          border: '1px solid var(--bd0)',
          boxShadow: 'var(--sh-lg)',
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            px: 2.5,
            py: 2,
            borderBottom: '1px solid var(--bd0)',
            flexShrink: 0,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
              payments-api
            </Typography>
            <Typography sx={{ fontSize: 11.5, color: 'text.disabled', mt: 0.25 }}>
              production · Kubernetes
            </Typography>
          </Box>
          <IconButton size='small' sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        <Box
          sx={{
            display: 'flex',
            borderBottom: '1px solid var(--bd0)',
            flexShrink: 0,
            bgcolor: 'var(--bg)',
          }}
        >
          {['Overview', 'Mutations', 'History'].map((tab, i) => (
            <Box
              key={tab}
              sx={{
                px: 2,
                py: 1.25,
                fontSize: 12.5,
                fontWeight: i === 0 ? 600 : 400,
                color: i === 0 ? 'var(--rust)' : 'text.secondary',
                borderBottom: i === 0 ? '2px solid var(--rust)' : '2px solid transparent',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {tab}
            </Box>
          ))}
        </Box>

        <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
          {[
            { label: 'Slug', value: 'payments-api', mono: true, green: false },
            { label: 'Space', value: 'production', mono: false, green: false },
            { label: 'Toolchain', value: 'Kubernetes', mono: false, green: false },
            { label: 'Status', value: '● Ready', mono: false, green: true },
            { label: 'Updated', value: '2m ago', mono: false, green: false },
            { label: 'Revision', value: 'rev-0041', mono: true, green: false },
          ].map((row) => (
            <Box
              key={row.label}
              sx={{
                display: 'flex',
                gap: 2,
                py: 1.25,
                borderBottom: '1px solid var(--bd1)',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Typography sx={{ fontSize: 12, color: 'text.disabled', width: 72, flexShrink: 0 }}>
                {row.label}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: row.green ? '#15803d' : 'text.primary',
                  fontFamily: row.mono ? 'var(--font-mono)' : 'inherit',
                }}
              >
                {row.value}
              </Typography>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1,
            px: 2.5,
            py: 1.75,
            borderTop: '1px solid var(--bd0)',
            flexShrink: 0,
            bgcolor: 'var(--bg)',
          }}
        >
          <Button variant='outlined' size='small'>
            Cancel
          </Button>
          <Button variant='contained' size='small'>
            Apply Changes
          </Button>
        </Box>
      </Paper>

      <SubLabel>Token guide</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 300 }}>
          {[
            { dot: 'background.paper', label: 'body — background.paper' },
            { dot: 'var(--bg)', label: 'footer · tab bar — --bg' },
            { dot: 'var(--bd0)', label: 'all structural borders — --bd0' },
            { dot: 'var(--rust)', label: 'active tab underline + text — --rust' },
          ].map((t) => (
            <Box key={t.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 14,
                  height: 14,
                  borderRadius: '3px',
                  bgcolor: t.dot,
                  border: '1px solid var(--bd0)',
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}
              >
                {t.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Canvas>
    </Box>
  );
}

function FilterBarSection() {
  return (
    <Box id='filterbar' sx={{ mb: 8 }}>
      <SectionHeader
        title='Filter Bar'
        desc='"Add filter" button always first. Active filter chips follow in order. Locked filters (from page context) precede user-editable ones. "Clear all" appears when any user filters are active.'
      />

      <SubLabel>Empty — no filters active</SubLabel>
      <Canvas>
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            height: 30,
            px: 1.25,
            borderRadius: '4px',
            cursor: 'pointer',
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <FilterListIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
            Add filter
          </Typography>
        </Box>
      </Canvas>
      <TokenLabel>height 30 · gap 8 · text.secondary</TokenLabel>

      <SubLabel>With active filters + Clear all</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, width: '100%' }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              height: 30,
              px: 1.25,
              borderRadius: '4px',
              cursor: 'pointer',
              flexShrink: 0,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <FilterListIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
              Add filter
            </Typography>
          </Box>
          <FilterChipDemo field='SPACE' operator='is' value='production' />
          <FilterChipDemo field='STATUS' operator='is' value='Ready' />
          <FilterChipDemo field='TOOLCHAIN' operator='is not' value='OpenTofu' />
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 30,
              px: 1.25,
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
              color: 'text.secondary',
              '&:hover': { bgcolor: 'rgba(185,28,28,0.08)', color: 'error.main' },
            }}
          >
            Clear all
          </Box>
        </Box>
      </Canvas>

      <SubLabel>With locked filter (from parent page context)</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <FilterChipDemo field='SPACE' operator='is' value='production' locked />
          <FilterChipDemo field='STATUS' operator='is' value='Ready' />
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              height: 30,
              px: 1.25,
              borderRadius: '4px',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <FilterListIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.secondary' }}>
              Add filter
            </Typography>
          </Box>
        </Box>
      </Canvas>
      <TokenLabel>Locked chip: no border · disabled text · lock icon · no ×</TokenLabel>
    </Box>
  );
}

function FilterChipsSection() {
  return (
    <Box id='filterchips' sx={{ mb: 8 }}>
      <SectionHeader
        title='Filter Chips'
        desc='Three-segment interactive pill: Field (uppercase label) · Operator (plain text) · Value. Remove × on far right with hover:error.main. Locked variant has no × and no hover ring.'
      />

      <SubLabel>Field type variants</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <FilterChipDemo field='SPACE' operator='is' value='production' />
          <FilterChipDemo field='STATUS' operator='is' value='Ready' />
          <FilterChipDemo field='TOOLCHAIN' operator='is' value='Kubernetes' />
          <FilterChipDemo field='LABELS' operator='has' value='env=prod' />
          <FilterChipDemo field='SLUG' operator='contains' value='api' />
          <FilterChipDemo field='UPDATED' operator='before' value='7d ago' />
        </Box>
      </Canvas>

      <SubLabel>Operator variants</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <FilterChipDemo field='STATUS' operator='is' value='Ready' />
          <FilterChipDemo field='STATUS' operator='is not' value='Degraded' />
          <FilterChipDemo field='SLUG' operator='contains' value='payments' />
          <FilterChipDemo field='SLUG' operator='starts with' value='infra' />
          <FilterChipDemo field='LABELS' operator='has key' value='region' />
        </Box>
      </Canvas>

      <SubLabel>Locked variant — non-removable context filter</SubLabel>
      <Canvas>
        <FilterChipDemo field='SPACE' operator='is' value='production' locked />
        <FilterChipDemo field='TARGET' operator='is' value='us-east-1' locked />
      </Canvas>
      <TokenLabel>No × · No hover ring · LockIcon 11px · text.disabled</TokenLabel>

      <SubLabel>Anatomy — segments</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[
            { seg: 'field', spec: '11px / 600 / uppercase · text.secondary' },
            { seg: 'operator', spec: '13px / 400 · text.primary' },
            { seg: 'value', spec: '13px / 400 · text.primary' },
            { seg: 'remove ×', spec: 'CloseIcon 14px · hover: error.main fill' },
          ].map((a) => (
            <Box key={a.seg}>
              <Typography
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--rust)', mb: 0.25 }}
              >
                {a.seg}
              </Typography>
              <Typography
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'text.disabled', maxWidth: 160 }}
              >
                {a.spec}
              </Typography>
            </Box>
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mt: 2 }}>
          {[
            { k: 'height', v: '30px' },
            { k: 'border-radius', v: '8px' },
            { k: 'hover border', v: 'primary.main' },
            { k: 'bg', v: 'background.paper' },
          ].map((t) => (
            <Box key={t.k}>
              <Typography
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled', mb: 0.25 }}
              >
                {t.k}
              </Typography>
              <Typography
                sx={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'text.disabled' }}
              >
                {t.v}
              </Typography>
            </Box>
          ))}
        </Box>
      </Canvas>
    </Box>
  );
}

function SearchInputSection() {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  const searchResults = [
    { name: 'payments-api', space: 'production', toolchain: 'Kubernetes' },
    { name: 'payments-worker', space: 'production', toolchain: 'Kubernetes' },
    { name: 'payments-db', space: 'staging', toolchain: 'OpenTofu' },
  ];

  const filteredResults = searchResults.filter((r) =>
    r.name.includes(query.toLowerCase()),
  );

  return (
    <Box id='searchinput' sx={{ mb: 8 }}>
      <SectionHeader
        title='Search Input'
        desc='Global filter search. bg-default fill, border-default stroke at rest, rust ring on focus. Results in an elevated Paper list anchored below. Clear × when query is present.'
      />

      <SubLabel>Default — empty</SubLabel>
      <Canvas>
        <TextField
          size='small'
          placeholder='Search units…'
          sx={{ width: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
      </Canvas>
      <TokenLabel>placeholder text.disabled · SearchIcon 16px</TokenLabel>

      <SubLabel>With value + clear ×</SubLabel>
      <Canvas>
        <TextField
          size='small'
          value='payments'
          sx={{ width: 280 }}
          onChange={() => { /* demo */ }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position='end'>
                <IconButton size='small' edge='end'>
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Canvas>
      <TokenLabel>CloseIcon 14px · end adornment · onClick: clear query</TokenLabel>

      <SubLabel>Interactive — type to see results</SubLabel>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <TextField
          size='small'
          placeholder='Search units…'
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(e.target.value.length > 0);
          }}
          onBlur={() => {
            setTimeout(() => setShowResults(false), 150);
          }}
          sx={{ width: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position='end'>
                <IconButton
                  size='small'
                  edge='end'
                  onClick={() => {
                    setQuery('');
                    setShowResults(false);
                  }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </InputAdornment>
            ) : undefined,
          }}
        />
        {showResults && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              mt: 0.5,
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--bd0)',
              zIndex: 10,
              overflow: 'hidden',
            }}
          >
            {filteredResults.length > 0 ? (
              filteredResults.map((r) => (
                <Box
                  key={r.name}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    px: 1.5,
                    py: 1,
                    borderBottom: '1px solid var(--bd1)',
                    cursor: 'pointer',
                    '&:last-child': { borderBottom: 'none' },
                    '&:hover': { bgcolor: 'var(--bg)' },
                  }}
                >
                  <SearchIcon sx={{ fontSize: 14, color: 'text.disabled', flexShrink: 0 }} />
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 500, color: 'text.primary' }}>
                      {r.name}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                      {r.space} · {r.toolchain}
                    </Typography>
                  </Box>
                </Box>
              ))
            ) : (
              <Box sx={{ px: 2, py: 2.5, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>
                  No units matching &ldquo;{query}&rdquo;
                </Typography>
              </Box>
            )}
          </Paper>
        )}
      </Box>

      <SubLabel>No results state</SubLabel>
      <Box sx={{ position: 'relative', display: 'inline-block' }}>
        <TextField
          size='small'
          value='xqz-invalid'
          sx={{ width: 280 }}
          onChange={() => { /* demo */ }}
          InputProps={{
            startAdornment: (
              <InputAdornment position='start'>
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
        />
        <Paper
          elevation={2}
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            mt: 0.5,
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--bd0)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2, py: 2.5, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 13, color: 'text.disabled' }}>
              No units matching &ldquo;xqz-invalid&rdquo;
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

function CreationFlowSection() {
  const [step, setStep] = useState(0);
  const steps = ['Identity', 'Configuration', 'Targets'];

  return (
    <Box id='creationflow' sx={{ mb: 8 }}>
      <SectionHeader
        title='Creation Flow'
        desc='Multi-step dialog for adding spaces, units, and targets. Stepper at top, form fields per step. Back/Next/Submit in the fixed footer.'
      />

      <SubLabel>Step indicator (Stepper)</SubLabel>
      <Paper
        elevation={0}
        sx={{
          border: '1px solid var(--bd0)',
          borderRadius: 'var(--r-md)',
          p: 3,
          maxWidth: 500,
        }}
      >
        <Stepper activeStep={step}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      <SubLabel>Interactive — use Back / Next to step through</SubLabel>
      <Paper
        elevation={0}
        sx={{
          border: '1px solid var(--bd0)',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          maxWidth: 500,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.75,
            borderBottom: '1px solid var(--bd0)',
            bgcolor: 'var(--bg)',
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
              Add Unit
            </Typography>
            <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
              Step {step + 1} of {steps.length}
            </Typography>
          </Box>
          <IconButton size='small'>
            <CloseIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Box>

        <Box sx={{ px: 2.5, pt: 2.5 }}>
          <Stepper activeStep={step} sx={{ mb: 2 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Box>

        <Box sx={{ px: 2.5, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {step === 0 && (
            <>
              <TextField
                size='small'
                label='Name (slug)'
                placeholder='payments-api'
                helperText='Lowercase letters, numbers, and hyphens only'
                fullWidth
              />
              <TextField size='small' label='Display Name' placeholder='Payments API' fullWidth />
              <TextField
                size='small'
                label='Description'
                placeholder='Handles payment processing for production...'
                multiline
                rows={2}
                fullWidth
              />
            </>
          )}
          {step === 1 && (
            <>
              <TextField size='small' label='Toolchain Type' defaultValue='Kubernetes' fullWidth />
              <TextField size='small' label='Source Space' defaultValue='production' fullWidth />
            </>
          )}
          {step === 2 && (
            <TextField
              size='small'
              label='Target Spaces'
              defaultValue='production, staging'
              helperText='Comma-separated list of space slugs'
              fullWidth
            />
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            px: 2.5,
            py: 1.75,
            borderTop: '1px solid var(--bd0)',
            bgcolor: 'var(--bg)',
          }}
        >
          <Button
            variant='outlined'
            size='small'
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant='outlined' size='small'>
              Cancel
            </Button>
            {step < steps.length - 1 ? (
              <Button
                variant='contained'
                size='small'
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              >
                Next
              </Button>
            ) : (
              <Button variant='contained' size='small'>
                Create Unit
              </Button>
            )}
          </Box>
        </Box>
      </Paper>

      <SubLabel>Token guide</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            'Header/footer bg: --bg · border: --bd0',
            'Body: background.paper · padding: 20px',
            'Back disabled on step 0 · Submit replaces Next on last step',
          ].map((t) => (
            <Typography
              key={t}
              sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}
            >
              {t}
            </Typography>
          ))}
        </Box>
      </Canvas>
    </Box>
  );
}

function ActionMenuSection() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const menuOpen = Boolean(anchorEl);

  return (
    <Box id='actionmenu' sx={{ mb: 8 }}>
      <SectionHeader
        title='Action Menu'
        desc='Three-dot (⋯) contextual menu. Primary actions first (Edit, Clone). Destructive actions (Delete) below a Divider in error.main. Anchored to the trigger icon.'
      />

      <SubLabel>Live example — click ⋯ to open</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant='body2' color='text.secondary'>
            payments-api
          </Typography>
          <Chip label='Ready' color='success' size='small' />
          <Tooltip title='More actions' placement='top'>
            <IconButton
              size='small'
              onClick={(e) => setAnchorEl(e.currentTarget)}
              aria-label='More actions'
            >
              <MoreHorizIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Menu
          anchorEl={anchorEl}
          open={menuOpen}
          onClose={() => setAnchorEl(null)}
          PaperProps={{
            elevation: 4,
            sx: {
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--bd0)',
              minWidth: 180,
              '& .MuiMenuItem-root': {
                fontSize: 13.5,
                py: 1,
                gap: 1.5,
              },
            },
          }}
          transformOrigin={{ horizontal: 'right', vertical: 'top' }}
          anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        >
          <MenuItem onClick={() => setAnchorEl(null)}>
            <EditIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            Edit
          </MenuItem>
          <MenuItem onClick={() => setAnchorEl(null)}>
            <ContentCopyIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
            Clone Unit
          </MenuItem>
          <Divider />
          <MenuItem onClick={() => setAnchorEl(null)} sx={{ color: 'error.main' }}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
            Delete Unit
          </MenuItem>
        </Menu>
      </Canvas>

      <SubLabel>Static open-state preview</SubLabel>
      <Paper
        elevation={4}
        sx={{
          display: 'inline-flex',
          flexDirection: 'column',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--bd0)',
          minWidth: 188,
          overflow: 'hidden',
          boxShadow: 'var(--sh-md)',
        }}
      >
        {[
          { label: 'Edit', Icon: EditIcon },
          { label: 'Clone Unit', Icon: ContentCopyIcon },
        ].map(({ label, Icon }) => (
          <Box
            key={label}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 2,
              py: 1,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'var(--bg)' },
            }}
          >
            <Icon sx={{ fontSize: 16, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: 13.5 }}>{label}</Typography>
          </Box>
        ))}
        <Divider />
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            cursor: 'pointer',
            '&:hover': { bgcolor: 'rgba(185,28,28,0.06)' },
          }}
        >
          <DeleteOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />
          <Typography sx={{ fontSize: 13.5, color: 'error.main' }}>Delete Unit</Typography>
        </Box>
      </Paper>

      <SubLabel>Token guide</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            'Paper: --sh-md · --r-md · --bd0 border · minWidth 180px',
            'Primary items: text.primary · text.secondary icon',
            'Destructive: error.main text + icon',
            'Separator: <Divider /> between action groups',
            'Hover destructive: rgba(error, 0.06) background',
          ].map((t) => (
            <Typography
              key={t}
              sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}
            >
              {t}
            </Typography>
          ))}
        </Box>
      </Canvas>
    </Box>
  );
}

function ConfirmDialogSection() {
  return (
    <Box id='confirmdialog' sx={{ mb: 8 }}>
      <SectionHeader
        title='Confirmation Dialog'
        desc='Always name the entity being destroyed. Neutral Cancel on the left. Destructive action (error.main) on the right. Include a cannot-be-undone callout for permanent deletions.'
      />

      <SubLabel>Destructive — delete space (with irreversibility callout)</SubLabel>
      <Box sx={{ position: 'relative', height: 300 }}>
        <Dialog
          open={true}
          disablePortal
          disableScrollLock
          disableAutoFocus
          hideBackdrop
          sx={{ position: 'absolute' }}
          PaperProps={{
            sx: { position: 'absolute', top: 0, left: 0, m: 0, maxWidth: 440, width: '100%' },
          }}
        >
          <DialogTitle>Delete Space</DialogTitle>
          <DialogContent>
            <Typography variant='body2' color='text.secondary'>
              Are you sure you want to delete{' '}
              <Box component='strong' sx={{ color: 'text.primary' }}>
                production
              </Box>
              ? All units, configuration history, and apply records will be permanently removed.
            </Typography>
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                p: 1.5,
                bgcolor: 'rgba(185,28,28,0.06)',
                border: '1px solid rgba(185,28,28,0.18)',
                borderRadius: 'var(--r-sm)',
              }}
            >
              <Typography sx={{ fontSize: 12, color: 'error.main' }}>
                This action cannot be undone.
              </Typography>
            </Paper>
          </DialogContent>
          <DialogActions>
            <Button variant='outlined'>Cancel</Button>
            <Button variant='contained' color='error'>
              Delete Space
            </Button>
          </DialogActions>
        </Dialog>
      </Box>

      <SubLabel>Informational — confirm apply (no irreversibility callout)</SubLabel>
      <Box sx={{ position: 'relative', height: 220 }}>
        <Dialog
          open={true}
          disablePortal
          disableScrollLock
          disableAutoFocus
          hideBackdrop
          sx={{ position: 'absolute' }}
          PaperProps={{
            sx: { position: 'absolute', top: 0, left: 0, m: 0, maxWidth: 440, width: '100%' },
          }}
        >
          <DialogTitle>Trigger Manual Apply</DialogTitle>
          <DialogContent>
            <Typography variant='body2' color='text.secondary'>
              This will apply all pending configuration changes to{' '}
              <Box component='strong' sx={{ color: 'text.primary' }}>
                production
              </Box>
              . 7 units will be updated. The apply may take 2&ndash;5 minutes.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button variant='outlined'>Cancel</Button>
            <Button variant='contained'>Apply Now</Button>
          </DialogActions>
        </Dialog>
      </Box>

      <SubLabel>Token guide</SubLabel>
      <Canvas>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            'Title: DialogTitle — 15px / 600 · text.primary',
            'Body: body2 · text.secondary · max-width 440px',
            'Entity name in body: component="strong" · text.primary',
            'Irreversible callout: rgba(error, 0.06) bg · rgba(error, 0.18) border',
            'Cancel: variant="outlined" · left side of DialogActions',
            'Confirm destructive: color="error" · right side',
          ].map((t) => (
            <Typography
              key={t}
              sx={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'text.disabled' }}
            >
              {t}
            </Typography>
          ))}
        </Box>
      </Canvas>
    </Box>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DesignSystemPage() {
  const [activeId, setActiveId] = useState<string>('colors');
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const callback: IntersectionObserverCallback = (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) setActiveId(visible[0].target.id);
    };

    observerRef.current = new IntersectionObserver(callback, {
      rootMargin: '-20% 0px -70% 0px',
      threshold: 0,
    });

    ALL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current?.observe(el);
    });

    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
      {/* Top bar */}
      <AppBar
        position='fixed'
        color='default'
        elevation={0}
        sx={{
          height: APPBAR_HEIGHT,
          borderBottom: '1px solid var(--bd0)',
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar variant='dense' sx={{ minHeight: APPBAR_HEIGHT, gap: 2 }}>
          <Box sx={{ width: 20, height: 20, bgcolor: 'primary.main', borderRadius: '4px', flexShrink: 0 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.02em', color: 'text.primary' }}>
            Design System
          </Typography>
          <Chip label='v1.0' size='small' sx={{ height: 18, fontSize: '10.5px' }} />
          <Typography sx={{ fontSize: 11, color: 'text.disabled', ml: 'auto', fontFamily: 'var(--font-mono)' }}>
            Manrope · JetBrains Mono · #ba3d03 · nav-01
          </Typography>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Drawer
        variant='permanent'
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            top: APPBAR_HEIGHT,
            height: `calc(100vh - ${APPBAR_HEIGHT}px)`,
            borderRight: '1px solid var(--bd0)',
            bgcolor: 'background.paper',
            overflowX: 'hidden',
          },
        }}
      >
        <List dense disablePadding sx={{ pt: 1 }}>
          {NAV_GROUPS.map((group) => (
            <Box key={group.label} sx={{ mb: 2 }}>
              <Typography
                sx={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.09em',
                  color: 'text.disabled',
                  px: 2.25,
                  py: 0.75,
                  display: 'block',
                }}
              >
                {group.label}
              </Typography>
              {group.items.map((item) => (
                <ListItemButton
                  key={item.id}
                  selected={activeId === item.id}
                  onClick={() => scrollTo(item.id)}
                  sx={{
                    py: 0.625,
                    px: 2.25,
                    borderRadius: 0,
                    '&.Mui-selected': {
                      bgcolor: 'var(--rust-bg)',
                      color: 'var(--rust)',
                      '&:hover': { bgcolor: 'var(--rust-bg)' },
                    },
                  }}
                >
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      fontSize: '12.5px',
                      fontWeight: activeId === item.id ? 600 : 500,
                      color: activeId === item.id ? 'var(--rust)' : 'text.secondary',
                    }}
                  />
                </ListItemButton>
              ))}
            </Box>
          ))}
        </List>
      </Drawer>

      {/* Main content */}
      <Box
        component='main'
        sx={{
          ml: `${DRAWER_WIDTH}px`,
          pt: `${APPBAR_HEIGHT}px`,
        }}
      >
        {/* Foundations */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <ColorsSection />
          <Divider sx={{ my: 6 }} />
          <TypographySection />
          <Divider sx={{ my: 6 }} />
          <ShadowsSection />
          <Divider sx={{ my: 6 }} />
          <BordersSection />
          <Divider sx={{ my: 6 }} />
          <SpacingSection />
        </Box>

        <Divider />

        {/* Actions & Forms */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <ButtonsSection />
          <Divider sx={{ my: 6 }} />
          <InputsSection />
          <Divider sx={{ my: 6 }} />
          <TogglesSection />
          <Divider sx={{ my: 6 }} />
          <TagsSection />
          <Divider sx={{ my: 6 }} />
          <KeyboardSection />
        </Box>

        <Divider />

        {/* Display & Feedback */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <BadgesSection />
          <Divider sx={{ my: 6 }} />
          <UnitStatusSection />
          <Divider sx={{ my: 6 }} />
          <GateCardsSection />
          <Divider sx={{ my: 6 }} />
          <CardsSection />
          <Divider sx={{ my: 6 }} />
          <LinkChipsSection />
          <Divider sx={{ my: 6 }} />
          <AlertsSection />
          <Divider sx={{ my: 6 }} />
          <NotificationsSection />
          <Divider sx={{ my: 6 }} />
          <LoadingSection />
          <Divider sx={{ my: 6 }} />
          <ProgressSection />
          <Divider sx={{ my: 6 }} />
          <SkeletonsSection />
          <Divider sx={{ my: 6 }} />
          <EmptySection />
          <Divider sx={{ my: 6 }} />
          <EmptyStateVariantsSection />
          <Divider sx={{ my: 6 }} />
          <DiffSection />
          <Divider sx={{ my: 6 }} />
          <TooltipSection />
        </Box>

        <Divider />

        {/* Layout & Nav */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <TopNavSection />
          <Divider sx={{ my: 6 }} />
          <SidebarSection />
          <Divider sx={{ my: 6 }} />
          <BreadcrumbSection />
          <Divider sx={{ my: 6 }} />
          <PageHeaderSection />
          <Divider sx={{ my: 6 }} />
          <ToolbarSection />
          <Divider sx={{ my: 6 }} />
          <TabsSection />
          <Divider sx={{ my: 6 }} />
          <AccordionSection />
          <Divider sx={{ my: 6 }} />
          <TableSection />
          <Divider sx={{ my: 6 }} />
          <ModalSection />
        </Box>

        <Divider />

        {/* Data Display */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <DataGridSection />
          <Divider sx={{ my: 6 }} />
          <AppCardsSection />
          <Divider sx={{ my: 6 }} />
          <DetailPaneSection />
          <Divider sx={{ my: 6 }} />
          <TreeViewSection />
          <Divider sx={{ my: 6 }} />
          <StatRowSection />
          <Divider sx={{ my: 6 }} />
          <DiffViewSection />
          <Divider sx={{ my: 6 }} />
          <ReleaseSelectorsSection />
          <Divider sx={{ my: 6 }} />
          <ReleaseDiffSpecimenSection />
        </Box>

        <Divider />

        {/* Dialogs & Filters */}
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 6, py: 7 }}>
          <DrawerPanelSection />
          <Divider sx={{ my: 6 }} />
          <FilterBarSection />
          <Divider sx={{ my: 6 }} />
          <FilterChipsSection />
          <Divider sx={{ my: 6 }} />
          <SearchInputSection />
          <Divider sx={{ my: 6 }} />
          <CreationFlowSection />
          <Divider sx={{ my: 6 }} />
          <ActionMenuSection />
          <Divider sx={{ my: 6 }} />
          <ConfirmDialogSection />
        </Box>
      </Box>
    </Box>
  );
}
