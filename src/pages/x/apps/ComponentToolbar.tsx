// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The filter row of the Components drawer: the scope chips (All, Incoming, Changes, Local
 * overrides, Kept on merge, and ChangeSet while one is open) as an icon and a count, the
 * search, and one view menu that holds the view (Sheet, Code, Stacked) and the Units filter.
 *
 * It is the only chrome row that stays on screen when the drawer scrolls down, so it holds
 * the controls used while you scroll. The full name of each chip is in a light hover card and
 * in its accessible name. A dot on the view menu button shows a Units filter that is not the
 * default, so a hidden filter is not missed.
 */

import { useState, type ReactNode } from 'react';

import ClearIcon from '@mui/icons-material/Clear';
import CloseIcon from '@mui/icons-material/Close';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';

import { tokens } from '@/components/theme-provider/ThemeProvider';

import { componentTheme } from './componentTheme';
import { CONFIG_VIEW_NAME } from './configViewName';
import { ChromePeek } from './PaneChrome';
import { chromeMenuPaperSx, FILTER_ROW_HEIGHT, menuHeadingSx, menuItemSx, quietIconButtonSx } from './paneChromeStyles';

/**
 * What the pane's values are filtered to: the incoming upgrade, everything, or
 * what the node's ChangeSet changed (read-only, drawn as Incoming is).
 */
export type PaneFilterMode = 'incoming' | 'all' | 'changeset';

/**
 * How the pane shows each unit's configuration: the field sheet, the
 * Overview of each resource (the resource explorer's friendly view, "Stacked"), or the
 * source as written ("Code").
 */
export type PaneViewMode = 'diff' | 'overview' | 'source';

/**
 * Which units the pane lists: those a Release of their Space publishes
 * (those that are not `Unit.Unreleasable`), or every unit.
 */
export type PaneUnitScope = 'releasable' | 'all';

/** Whether the hidden units were asked for, and where their read is. */
export type HiddenUnitsState = 'off' | 'loading' | 'error' | 'ready';

/** The scopes of the field view, beyond its filter mode. `local-only` folds into Local overrides. */
export type PaneScopeFilter = 'local-overrides' | 'local-only' | 'kept-on-merge' | 'changes' | null;

export interface ComponentToolbarProps {
  /** Distinguishes this mount's testids (`${testIdPrefix}-filter-all`, etc.). */
  testIdPrefix: string;
  /** The pane's width in px: under 560 the search is an icon; from 700 the view menu names the view. */
  paneWidth: number;

  filterText: string;
  /** How many fields match the search, where the view counts them; shown in the field. */
  matchCount?: number;
  onFilterTextChange: (text: string) => void;

  viewMode: PaneViewMode;
  onViewModeChange: (mode: PaneViewMode) => void;
  /**
   * Disables the search box, showing this as its placeholder, for a view the
   * search cannot narrow. The caller supplies `''` as the filter text.
   */
  searchDisabledReason?: string;

  filterMode: PaneFilterMode;
  onFilterModeChange: (mode: PaneFilterMode) => void;
  totalUpgradableFields: number;
  /** Show "…" instead of a count while the Incoming total is still resolving. */
  isDryRunLoading?: boolean;
  hasUpgradableUnits?: boolean;
  totalAllFields: number;
  /**
   * The ChangeSet chip, shown only when the node has a ChangeSet open on a
   * unit, or one whose change is still each unit's head. Its count is the
   * fields the ChangeSet changed; `changeSetTooltip` names the ChangeSet.
   */
  hasChangeSet?: boolean;
  totalChangeSetFields?: number;
  isChangeSetLoading?: boolean;
  changeSetTooltip?: React.ReactNode;

  scopeFilter?: PaneScopeFilter;
  onScopeFilterChange: (filter: PaneScopeFilter) => void;
  totalLocalOverrides?: number;
  /** Unreleased changes plus everything staged: the Changes scope. */
  totalChanges?: number;
  /** What the Changes count is made of, for its chip's hover card ("3 unreleased · 2 staged"). */
  changesTitle?: string;
  totalCheckableM?: number;
  totalKeptOnMergeN?: number;
  totalLiveL?: number;

  /** The Units filter: only the units a Release publishes, or all of them, and whether hidden units are among them. */
  unitScope?: PaneUnitScope;
  onUnitScopeChange: (scope: PaneUnitScope) => void;
  includeHiddenUnits?: boolean;
  onIncludeHiddenUnitsChange?: (include: boolean) => void;
  hiddenUnitsState?: HiddenUnitsState;
  /** Why the hidden units could not be read. */
  hiddenUnitsError?: string;

  /** Shown at the start of the row, such as the Variant's name while the title row is scrolled away. */
  leading?: ReactNode;
  /** Shown at the right end of the row, such as Close while the title row is scrolled away. */
  trailing?: ReactNode;
}

const NARROW_MAX_PX = 559;
const VIEW_LABEL_MIN_PX = 701;

function svgIcon(children: ReactNode, viewBox = '0 0 16 16', props: Record<string, unknown> = {}) {
  return (
    <svg viewBox={viewBox} width={12} height={12} fill='none' stroke='currentColor' strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round' aria-hidden {...props}>
      {children}
    </svg>
  );
}

const SCOPE_ICONS = {
  all: svgIcon(<path d='M3 4h10M3 8h10M3 12h6' />),
  // The Incoming fields are the Stale fields (both are the fields upstream has changed), so the
  // chip has the Stale up arrow, as the field and the part bar do; Changes has the Unreleased
  // double chevron, as its fields do.
  incoming: svgIcon(<path d='M8 12V4M4 8l4-4 4 4' />, '0 0 16 16', { strokeWidth: 2.2 }),
  changes: svgIcon(<><path d='M3 4.5l4 3.5-4 3.5' /><path d='M9 4.5l4 3.5-4 3.5' /></>, '0 0 16 16', { strokeWidth: 2.2 }),
  local: svgIcon(<path d='M8 2.5l5.5 5.5L8 13.5 2.5 8z' fill='currentColor' stroke='none' />),
  kept: svgIcon(<><rect x='3' y='7' width='10' height='7' rx='1.5' /><path d='M5.5 7V5a2.5 2.5 0 0 1 5 0v2' /></>, '0 0 16 16', { strokeWidth: 1.5 }),
  changeset: svgIcon(<><circle cx='8' cy='3.5' r='1.8' /><path d='M8 5.5v7M5 9.5l3 3 3-3' /></>, '0 0 16 16', { strokeWidth: 1.6 }),
} as const;

const SheetIcon = () => (
  <svg viewBox='0 0 24 24' width={15} height={15} fill='currentColor' aria-hidden>
    <path d='M3 5h18v2H3zm0 6h18v2H3zm0 6h18v2H3z' />
  </svg>
);

const VIEWS: { mode: PaneViewMode; label: string; testId: string; icon: ReactNode }[] = [
  { mode: 'diff', label: 'Sheet', testId: 'view-fields', icon: <SheetIcon /> },
  { mode: 'source', label: 'Code', testId: 'source', icon: <CodeIcon sx={{ fontSize: 15 }} /> },
  { mode: 'overview', label: 'Stacked', testId: 'overview', icon: <ViewAgendaOutlinedIcon sx={{ fontSize: 15 }} /> },
];

const UNIT_SCOPE_CHOICES: { scope: PaneUnitScope; label: string }[] = [
  { scope: 'releasable', label: 'Releasable' },
  { scope: 'all', label: 'All units' },
];

/** One scope chip: an icon in the scope's hue and a count. */
function ScopeChip({
  testId,
  countTestId,
  label,
  count,
  countTitle,
  icon,
  hue,
  dormant = false,
  active,
  onClick,
}: {
  testId: string;
  countTestId?: string;
  label: string;
  count: string;
  countTitle?: ReactNode;
  icon: ReactNode;
  /** The colour of the icon; the selected chip is rust. */
  hue: string;
  dormant?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const n = Number(count);
  return (
    <ChromePeek title={label} sub={countTitle ?? (Number.isFinite(n) ? `${count} field${n === 1 ? '' : 's'}` : undefined)}>
      <Box
        component='button'
        type='button'
        aria-pressed={active}
        aria-label={`${label}, ${count}`}
        data-testid={testId}
        onClick={onClick}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          height: 24,
          boxSizing: 'border-box',
          px: '7px',
          flexShrink: 0,
          border: `1px solid ${active ? componentTheme.borderDefault : 'transparent'}`,
          borderRadius: '7px',
          background: active ? componentTheme.bgDefault : 'none',
          boxShadow: active ? componentTheme.shadowSm : 'none',
          color: active ? componentTheme.accent : componentTheme.fgMuted,
          opacity: dormant && !active ? 0.5 : 1,
          fontFamily: componentTheme.fontSans,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          '& .scope-icon': { display: 'inline-flex', color: active && hue === componentTheme.fgSubtle ? componentTheme.accent : hue },
          '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '-2px' },
        }}
      >
        <span className='scope-icon'>{icon}</span>
        {/* The selected chip names its scope; the others are an icon and a count. */}
        {active && (
          <span data-testid={`${testId}-name`} aria-hidden>
            {label}
          </span>
        )}
        <Box
          component='span'
          data-testid={countTestId}
          sx={{ fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700, color: active ? componentTheme.accent : componentTheme.fgMuted }}
        >
          {count}
        </Box>
      </Box>
    </ChromePeek>
  );
}

function SearchField({
  testId,
  value,
  onChange,
  disabledReason,
  autoFocus,
  focused,
  matchCount,
  clearable = true,
}: {
  testId: string;
  value: string;
  onChange: (text: string) => void;
  disabledReason?: string;
  autoFocus?: boolean;
  focused?: boolean;
  matchCount?: number;
  /** False where a Close search button beside the field clears it: one ×, not two. */
  clearable?: boolean;
}) {
  const counted = value.trim() !== '' && matchCount !== undefined;
  return (
    <TextField
      size='small'
      placeholder={disabledReason ?? 'Search...'}
      disabled={disabledReason !== undefined}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      data-testid={testId}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position='start'>
              <SearchIcon sx={{ fontSize: 15, color: componentTheme.fgSubtle }} />
            </InputAdornment>
          ),
          endAdornment:
            counted || (value && clearable) ? (
              <InputAdornment position='end' sx={{ gap: '4px' }}>
                {counted && (
                  <Box
                    component='span'
                    data-testid={`${testId}-count`}
                    aria-live='polite'
                    sx={{ fontFamily: componentTheme.fontSans, fontSize: 11, color: componentTheme.fgSubtle, whiteSpace: 'nowrap' }}
                  >
                    {matchCount === 1 ? '1 match' : `${matchCount} matches`}
                  </Box>
                )}
                {value && clearable && (
                  <IconButton size='small' aria-label='Clear search' onClick={() => onChange('')} sx={{ p: 0.25 }}>
                    <ClearIcon sx={{ fontSize: 15 }} />
                  </IconButton>
                )}
              </InputAdornment>
            ) : null,
        },
      }}
      sx={{
        flex: 1,
        minWidth: 0,
        '& .MuiInputBase-root': { height: 28, fontSize: 13, pl: '8px', borderRadius: `${componentTheme.radiusSm}px` },
        '& .MuiInputAdornment-positionStart': { mr: '6px' },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: focused ? componentTheme.accent : componentTheme.borderDefault },
      }}
    />
  );
}

export function ComponentToolbar({
  testIdPrefix,
  paneWidth,
  filterText,
  matchCount,
  onFilterTextChange,
  viewMode,
  onViewModeChange,
  searchDisabledReason,
  filterMode,
  onFilterModeChange,
  totalUpgradableFields,
  isDryRunLoading = false,
  hasUpgradableUnits = false,
  totalAllFields,
  hasChangeSet = false,
  totalChangeSetFields = 0,
  isChangeSetLoading = false,
  changeSetTooltip,
  scopeFilter,
  onScopeFilterChange,
  totalLocalOverrides,
  totalChanges = 0,
  changesTitle,
  totalKeptOnMergeN,
  unitScope = 'releasable',
  onUnitScopeChange,
  includeHiddenUnits = false,
  onIncludeHiddenUnitsChange,
  hiddenUnitsState = 'off',
  hiddenUnitsError,
  leading,
  trailing,
}: ComponentToolbarProps) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const narrow = paneWidth <= NARROW_MAX_PX;
  const scopeActive = (scope: PaneScopeFilter) => filterMode === 'all' && (scopeFilter ?? null) === scope;
  const pickScope = (scope: PaneScopeFilter) => {
    if (filterMode !== 'all') onFilterModeChange('all');
    onScopeFilterChange(scope);
  };
  const localCount = totalLocalOverrides ?? 0;
  const keptCount = totalKeptOnMergeN ?? 0;
  const view = VIEWS.find((v) => v.mode === viewMode) ?? VIEWS[0];
  const unitsLabel = UNIT_SCOPE_CHOICES.find((c) => c.scope === unitScope)?.label ?? 'Releasable';
  const unitsDefault = unitScope === 'releasable' && !includeHiddenUnits;
  // A search left in the box stays on screen in a narrow pane: the field stays open over the row.
  const searchShown = !narrow || searchOpen || filterText !== '';
  const closeMenu = () => setMenuAnchor(null);

  return (
    <>
      <Box
        data-testid={`${testIdPrefix}-filter-row`}
        sx={{
          position: 'relative',
          height: FILTER_ROW_HEIGHT,
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          p: '0 8px 0 12px',
          background: componentTheme.bgDefault,
          borderBottom: `1px solid ${componentTheme.borderDefault}`,
          flexShrink: 0,
        }}
      >
        {leading}
        {viewMode === 'diff' && (
          <Box
            data-testid='scope-control'
            role='group'
            aria-label='Fields'
            sx={{
              display: 'inline-flex',
              gap: '2px',
              p: '2px',
              flexShrink: 0,
              background: componentTheme.bgInset,
              border: `1px solid ${componentTheme.borderMuted}`,
              borderRadius: `${componentTheme.radiusMd}px`,
            }}
          >
            <ScopeChip
              testId={`${testIdPrefix}-filter-all`}
              label='All'
              count={String(totalAllFields)}
              icon={SCOPE_ICONS.all}
              hue={componentTheme.fgSubtle}
              active={scopeActive(null)}
              onClick={() => pickScope(null)}
            />
            <ScopeChip
              testId='scope-incoming'
              countTestId={`${testIdPrefix}-incoming-count`}
              label='Incoming'
              count={isDryRunLoading && hasUpgradableUnits ? '…' : String(totalUpgradableFields)}
              icon={SCOPE_ICONS.incoming}
              hue={componentTheme.upgrade}
              dormant={totalUpgradableFields === 0 && !isDryRunLoading}
              active={filterMode === 'incoming'}
              onClick={() => onFilterModeChange('incoming')}
            />
            <ScopeChip
              testId='scope-changes'
              label='Changes'
              count={String(totalChanges)}
              countTitle={changesTitle}
              icon={SCOPE_ICONS.changes}
              hue={componentTheme.variation}
              dormant={totalChanges === 0}
              active={scopeActive('changes')}
              onClick={() => pickScope('changes')}
            />
            <ScopeChip
              testId='scope-local'
              countTestId={`${testIdPrefix}-local-overrides-count`}
              label='Local overrides'
              count={String(localCount)}
              icon={SCOPE_ICONS.local}
              hue={componentTheme.fgSubtle}
              dormant={localCount === 0}
              active={scopeActive('local-overrides') || scopeActive('local-only')}
              onClick={() => pickScope('local-overrides')}
            />
            <ScopeChip
              testId='scope-kept'
              countTestId={`${testIdPrefix}-kept-on-merge-count`}
              label='Kept on merge'
              count={String(keptCount)}
              icon={SCOPE_ICONS.kept}
              hue={componentTheme.fgSubtle}
              dormant={keptCount === 0}
              active={scopeActive('kept-on-merge')}
              onClick={() => pickScope('kept-on-merge')}
            />
            {hasChangeSet && (
              <ScopeChip
                testId={`${testIdPrefix}-filter-changeset`}
                countTestId={`${testIdPrefix}-changeset-count`}
                label='ChangeSet'
                count={isChangeSetLoading ? '…' : String(totalChangeSetFields)}
                countTitle={changeSetTooltip}
                icon={SCOPE_ICONS.changeset}
                hue={componentTheme.upgrade}
                active={filterMode === 'changeset'}
                onClick={() => onFilterModeChange('changeset')}
              />
            )}
          </Box>
        )}

        {narrow ? (
          <>
            <Box sx={{ flex: 1 }} />
            <ChromePeek title='Search'>
              <Box
                component='button'
                type='button'
                aria-label='Search'
                disabled={searchDisabledReason !== undefined}
                data-testid={`${testIdPrefix}-search-open`}
                onClick={() => setSearchOpen(true)}
                sx={{ ...quietIconButtonSx, '&:disabled': { opacity: 0.4, cursor: 'default' } }}
              >
                <SearchIcon />
              </Box>
            </ChromePeek>
          </>
        ) : (
          <SearchField testId={`${testIdPrefix}-search`} value={filterText} onChange={onFilterTextChange} disabledReason={searchDisabledReason} matchCount={matchCount} />
        )}

        <ChromePeek title={`View: ${view.label}`} sub={`Units: ${unitsLabel}${includeHiddenUnits ? ', include hidden' : ''}`}>
          <Box
            component='button'
            type='button'
            aria-haspopup='menu'
            aria-expanded={!!menuAnchor}
            aria-label={`View: ${view.label}. Units: ${unitsLabel}${includeHiddenUnits ? ', include hidden' : ''}`}
            data-testid={`${testIdPrefix}-view-menu-button`}
            onClick={(e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)}
            sx={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              height: 28,
              boxSizing: 'border-box',
              p: '0 5px 0 7px',
              flexShrink: 0,
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusSm}px`,
              background: componentTheme.bgDefault,
              color: componentTheme.fgMuted,
              fontFamily: componentTheme.fontSans,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              '& .view-chevron': { color: componentTheme.fgSubtle },
              '&:hover, &[aria-expanded="true"]': { borderColor: tokens.rustLine, color: componentTheme.accent, background: componentTheme.accentMuted },
              '&:focus-visible': { outline: `2px solid ${tokens.rustFocus}`, outlineOffset: '2px' },
            }}
          >
            <Box component='span' sx={{ display: 'inline-flex' }}>
              {view.icon}
            </Box>
            {paneWidth >= VIEW_LABEL_MIN_PX && <Box component='span' sx={{ px: '2px' }}>{view.label}</Box>}
            <svg className='view-chevron' viewBox='0 0 16 16' width={13} height={13} fill='none' stroke='currentColor' strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round' aria-hidden>
              <path d='M4 6l4 4 4-4' />
            </svg>
            {!unitsDefault && (
              <Box
                component='span'
                aria-hidden
                data-testid={`${testIdPrefix}-units-filter-dot`}
                sx={{
                  position: 'absolute',
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  boxSizing: 'border-box',
                  borderRadius: '50%',
                  background: componentTheme.accent,
                  border: `1.5px solid ${componentTheme.bgDefault}`,
                }}
              />
            )}
          </Box>
        </ChromePeek>

        {trailing}

        {narrow && searchShown && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              p: '0 8px 0 12px',
              background: componentTheme.bgDefault,
            }}
          >
            <SearchField
              testId={`${testIdPrefix}-search`}
              value={filterText}
              onChange={onFilterTextChange}
              disabledReason={searchDisabledReason}
              autoFocus={searchOpen}
              focused
              matchCount={matchCount}
              clearable={false}
            />
            <ChromePeek title='Close search'>
              <Box
                component='button'
                type='button'
                aria-label='Close search'
                data-testid={`${testIdPrefix}-search-close`}
                onClick={() => {
                  onFilterTextChange('');
                  setSearchOpen(false);
                }}
                sx={quietIconButtonSx}
              >
                <CloseIcon />
              </Box>
            </ChromePeek>
          </Box>
        )}
      </Box>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        data-testid={`${testIdPrefix}-view-menu`}
        slotProps={{ paper: { sx: chromeMenuPaperSx }, list: { 'aria-label': 'View', dense: true } }}
      >
        <ListSubheader disableSticky sx={menuHeadingSx}>View</ListSubheader>
        {VIEWS.map(({ mode, label, testId, icon }) => (
          <MenuItem
            key={mode}
            role='menuitemradio'
            aria-checked={viewMode === mode}
            data-testid={testId === 'view-fields' ? testId : `${testIdPrefix}-view-${testId}`}
            // PostHog's click autocapture records this as the click's `config-view` property.
            data-ph-capture-attribute-config-view={CONFIG_VIEW_NAME[mode]}
            onClick={() => {
              onViewModeChange(mode);
              closeMenu();
            }}
            sx={menuItemSx}
          >
            <Box component='span' className='mi-icon' sx={{ display: 'inline-flex' }}>
              {icon}
            </Box>
            <span className='mi-text'>{label}</span>
            {viewMode === mode && <CheckMark />}
          </MenuItem>
        ))}
        <Divider sx={{ my: '4px !important', mx: '2px', borderColor: componentTheme.borderMuted }} />
        <ListSubheader disableSticky sx={menuHeadingSx}>Units</ListSubheader>
        {UNIT_SCOPE_CHOICES.map(({ scope, label }) => (
          <MenuItem
            key={scope}
            role='menuitemradio'
            aria-checked={unitScope === scope}
            data-testid={`${testIdPrefix}-units-${scope}`}
            onClick={() => {
              onUnitScopeChange(scope);
              closeMenu();
            }}
            sx={menuItemSx}
          >
            <span className='mi-text'>{label}</span>
            {unitScope === scope && <CheckMark />}
          </MenuItem>
        ))}
        {onIncludeHiddenUnitsChange && (
          <MenuItem
            role='menuitemcheckbox'
            aria-checked={includeHiddenUnits}
            data-testid={`${testIdPrefix}-units-include-hidden`}
            onClick={() => onIncludeHiddenUnitsChange(!includeHiddenUnits)}
            sx={{ ...menuItemSx, '&[aria-checked="true"]': {} }}
          >
            <span className='mi-text'>Include hidden</span>
            {hiddenUnitsState === 'loading' && (
              <CircularProgress size={11} thickness={6} color='inherit' aria-label='Loading hidden units' />
            )}
            <Box
              component='span'
              sx={{
                width: 14,
                height: 14,
                boxSizing: 'border-box',
                ml: 'auto',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1.5px solid ${includeHiddenUnits ? componentTheme.accent : componentTheme.borderEdge}`,
                borderRadius: '3px',
                color: componentTheme.accent,
              }}
            >
              {includeHiddenUnits && <CheckMark inline />}
            </Box>
          </MenuItem>
        )}
      </Menu>

      {hiddenUnitsState === 'error' && (
        <Box
          role='alert'
          data-testid={`${testIdPrefix}-units-hidden-error`}
          sx={{
            px: '12px',
            py: '5px',
            fontSize: 11,
            color: componentTheme.danger,
            fontFamily: componentTheme.fontSans,
            borderBottom: `1px solid ${componentTheme.borderSubtle}`,
            background: componentTheme.bgDefault,
          }}
        >
          {hiddenUnitsError ?? 'Failed to load hidden units.'}
        </Box>
      )}
    </>
  );
}

function CheckMark({ inline = false }: { inline?: boolean }) {
  return (
    <Box component='span' sx={{ display: 'inline-flex', ml: inline ? 0 : 'auto', color: componentTheme.accent }}>
      <svg viewBox='0 0 16 16' width={inline ? 10 : 14} height={inline ? 10 : 14} fill='none' stroke='currentColor' strokeWidth={1.8} strokeLinecap='round' strokeLinejoin='round' aria-hidden>
        <path d='M3.5 8.5l3 3 6-7' />
      </svg>
    </Box>
  );
}
