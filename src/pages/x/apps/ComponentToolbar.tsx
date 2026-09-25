// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The search + view-toggle + Incoming/All row `ComponentSidePane` draws.
 *
 * User's ruling, verbatim: "They need to be closer. Same style footer
 * buttons, same filtering to only show the differences (bring in the
 * incoming/all toggles)... We need it to work way more like a small change to
 * the regular view than a whole new view and system." — and on scope: "bring
 * over everything... you should be able to use the exact same component just
 * with some flags."
 *
 * The optional scope-filter row (Local overrides / Local only) is omitted
 * entirely — not merely hidden — when the caller cannot compute local-override
 * state at all: pass `scopeFilter`/`onScopeFilterChange` together, or neither.
 * Rollout mode cannot yet (see the "Local overrides cannot be determined for
 * this stage" note it renders instead — a U12 dependency), so it omits both.
 *
 * `showSearch` and `showViewToggle` default to TRUE, so the component graph's
 * own pane gets today's toolbar without passing anything and cannot be changed
 * by accident. Rollout mode turns both off (user request) while keeping the
 * Incoming/All toggle, which is why these are two independent flags rather
 * than one "compact" mode: the row's three controls were asked about
 * separately and answered differently.
 */

import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ClearIcon from '@mui/icons-material/Clear';
import CodeIcon from '@mui/icons-material/Code';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';

import { componentTheme } from './componentTheme';

export interface ComponentToolbarProps {
  /** Distinguishes this mount's testids (`${testIdPrefix}-filter-all`, etc.) so auto and rollout mode never collide. */
  testIdPrefix: string;

  filterText: string;
  onFilterTextChange: (text: string) => void;

  viewMode: 'diff' | 'source';
  onViewModeChange: (mode: 'diff' | 'source') => void;
  /** False hides the search box entirely. The caller then has no filter text to supply — pass `''`. */
  showSearch?: boolean;
  /** False hides the Tree/Source buttons, fixing the caller to whatever `viewMode` it passes. */
  showViewToggle?: boolean;

  filterMode: 'incoming' | 'all';
  onFilterModeChange: (mode: 'incoming' | 'all') => void;
  totalUpgradableFields: number;
  /** Show "…" instead of a count while the Incoming total is still resolving. Omit where there is no such state. */
  isDryRunLoading?: boolean;
  hasUpgradableUnits?: boolean;
  totalAllFields: number;
  allFieldsPartial: boolean;

  /**
   * The scope-filter row (Local overrides / Local only). Provide both or
   * neither — a caller that cannot compute local-override state at all must
   * not render a row of always-zero chips that looks like a real answer.
   */
  scopeFilter?: 'local-overrides' | 'local-only' | 'kept-on-merge' | null;
  onScopeFilterChange?: (filter: 'local-overrides' | 'local-only' | 'kept-on-merge' | null) => void;
  totalLocalOverrides?: number;
  totalLocalOnly?: number;

  /**
   * The "Kept on merge N of M" chip — L2's protection audit. A THIRD, optional
   * member of the scope row: omitted whenever `totalCheckableM` is 0 or
   * `hasProtectionData` is false, same "never a fabricated answer" rule the
   * other two chips already follow, just per-chip instead of per-row (a caller
   * with local-override data but no protection data yet still gets the first
   * two chips). `hasProtectionData` stands in for "the protection lookup has
   * actually returned" — the caller owns what `MutationSources` looks like,
   * this component only needs to know whether it may trust the counts yet.
   */
  totalCheckableM?: number;
  totalKeptOnMergeN?: number;
  /** Every live-diverged path, arrays included — the tooltip's "M of L" denominator. */
  totalLiveL?: number;
  hasProtectionData?: boolean;
}

export function ComponentToolbar({
  testIdPrefix,
  filterText,
  onFilterTextChange,
  viewMode,
  onViewModeChange,
  showSearch = true,
  showViewToggle = true,
  filterMode,
  onFilterModeChange,
  totalUpgradableFields,
  isDryRunLoading = false,
  hasUpgradableUnits = false,
  totalAllFields,
  allFieldsPartial,
  scopeFilter,
  onScopeFilterChange,
  totalLocalOverrides,
  totalLocalOnly,
  totalCheckableM,
  totalKeptOnMergeN,
  totalLiveL,
  hasProtectionData = false,
}: ComponentToolbarProps) {
  const showScopeRow = onScopeFilterChange !== undefined && filterMode === 'all';

  return (
    <>
      {/*
        The whole row goes when both of its controls are off — not an empty
        bordered strip. A 30px band with a border and nothing in it reads as a
        control that failed to load.
      */}
      {(showSearch || showViewToggle) && (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 1,
          py: 0.5,
          borderBottom: `1px solid ${componentTheme.borderDefault}`,
        }}
      >
        {showSearch && (
        <TextField
          size='small'
          placeholder='Search...'
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          data-testid={`${testIdPrefix}-search`}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position='start'>
                  <SearchIcon fontSize='small' />
                </InputAdornment>
              ),
              endAdornment: filterText ? (
                <InputAdornment position='end'>
                  <IconButton size='small' onClick={() => onFilterTextChange('')} sx={{ p: 0.25 }}>
                    <ClearIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ flex: 1, '& .MuiInputBase-root': { height: 30 } }}
        />
        )}
        {showViewToggle && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '2px', ml: 0.5, flexShrink: 0 }}>
          {([
            { mode: 'diff', label: 'Tree view', Icon: AccountTreeOutlinedIcon },
            { mode: 'source', label: 'Source view', Icon: CodeIcon },
          ] as const).map(({ mode, label, Icon }) => {
            const active = viewMode === mode;
            return (
              <Tooltip key={mode} title={label} placement='top'>
                <IconButton
                  size='small'
                  aria-label={label}
                  aria-pressed={active}
                  onClick={() => onViewModeChange(mode)}
                  data-testid={`${testIdPrefix}-view-${mode === 'diff' ? 'tree' : 'source'}`}
                  sx={{
                    width: 26,
                    height: 26,
                    borderRadius: '6px',
                    color: active ? componentTheme.accent : componentTheme.fgSubtle,
                    background: active ? componentTheme.accentMuted : 'transparent',
                    border: `1px solid ${active ? componentTheme.accent : 'transparent'}`,
                    transition: 'all .12s',
                    '&:hover': {
                      background: active ? componentTheme.accentMuted : componentTheme.bgInset,
                      color: active ? componentTheme.accent : componentTheme.fgDefault,
                    },
                  }}
                >
                  <Icon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            );
          })}
        </Box>
        )}
      </Box>
      )}

      {viewMode === 'diff' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', px: 2, py: 0.75, borderBottom: `1px solid ${componentTheme.borderSubtle}`, background: componentTheme.bgSubtle }}>
          <Box sx={{
            display: 'inline-flex',
            alignItems: 'stretch',
            padding: '2px',
            gap: '2px',
            background: componentTheme.bgInset,
            border: `1px solid ${componentTheme.borderMuted}`,
            borderRadius: '9px',
          }}>
            {(() => {
              const active = filterMode === 'incoming';
              const dormant = totalUpgradableFields === 0 && !isDryRunLoading;
              const dotColor = active && !dormant ? componentTheme.upgrade : componentTheme.fgSubtle;
              const activeColor = componentTheme.upgrade;
              return (
                <Box
                  component="button"
                  aria-pressed={active}
                  data-testid={`${testIdPrefix}-filter-incoming`}
                  onClick={() => onFilterModeChange('incoming')}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: 11, fontWeight: 600,
                    color: active ? activeColor : componentTheme.fgMuted,
                    padding: '3px 11px', borderRadius: '7px',
                    border: `1px solid ${active ? componentTheme.borderDefault : 'transparent'}`,
                    background: active ? componentTheme.bgDefault : 'transparent',
                    boxShadow: active ? componentTheme.shadowSm : 'none',
                    cursor: dormant ? 'default' : 'pointer',
                    opacity: dormant ? 0.45 : 1,
                    fontFamily: componentTheme.fontSans, lineHeight: '18px',
                    transition: 'all .12s', whiteSpace: 'nowrap',
                  }}
                >
                  <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                  Incoming
                  <Box component="span" data-testid={`${testIdPrefix}-incoming-count`} sx={{ fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700, color: active ? activeColor : componentTheme.fgSubtle }}>
                    {isDryRunLoading && hasUpgradableUnits ? '…' : totalUpgradableFields}
                  </Box>
                </Box>
              );
            })()}

            {(() => {
              const active = filterMode === 'all';
              return (
                <Box
                  component="button"
                  data-testid={`${testIdPrefix}-filter-all`}
                  aria-pressed={active}
                  onClick={() => onFilterModeChange('all')}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: 11, fontWeight: 600,
                    color: active ? componentTheme.accent : componentTheme.fgMuted,
                    padding: '3px 11px', borderRadius: '7px',
                    border: `1px solid ${active ? componentTheme.borderDefault : 'transparent'}`,
                    background: active ? componentTheme.bgDefault : 'transparent',
                    boxShadow: active ? componentTheme.shadowSm : 'none',
                    cursor: 'pointer',
                    fontFamily: componentTheme.fontSans, lineHeight: '18px',
                    transition: 'all .12s', whiteSpace: 'nowrap',
                  }}
                >
                  <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', background: componentTheme.fgSubtle, flexShrink: 0 }} />
                  All
                  <Tooltip
                    title={allFieldsPartial
                      ? 'At least this many fields. Some components aren’t loaded yet — open them, or choose “Render anyway”, to include their fields.'
                      : ''}
                  >
                    <Box component="span" sx={{ fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700, color: active ? componentTheme.accent : componentTheme.fgSubtle }}>
                      {totalAllFields}{allFieldsPartial ? '+' : ''}
                    </Box>
                  </Tooltip>
                </Box>
              );
            })()}
          </Box>
        </Box>
      )}

      {showScopeRow && (
        <Box
          role="group"
          aria-label="Scope filters"
          sx={{
            display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
            px: '10px', py: '7px',
            borderTop: `1px dashed ${componentTheme.borderMuted}`,
            borderBottom: `1px solid ${componentTheme.borderSubtle}`,
            background: componentTheme.bgDefault,
          }}
        >
          <Box component="span" sx={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
            color: componentTheme.fgSubtle, mr: '2px', fontFamily: componentTheme.fontSans,
          }}>
            Scope
          </Box>

          {(() => {
            const active = scopeFilter === 'local-overrides';
            return (
              <Box
                component="button"
                aria-pressed={active}
                data-testid={`${testIdPrefix}-scope-local-overrides`}
                onClick={() => onScopeFilterChange?.(active ? null : 'local-overrides')}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: 11, fontWeight: 600, lineHeight: '18px',
                  padding: '1px 10px', borderRadius: '10px',
                  border: `1px solid ${active ? componentTheme.variation : componentTheme.borderMuted}`,
                  background: active ? componentTheme.variationMuted : 'transparent',
                  color: active ? componentTheme.variationEmphasis : componentTheme.fgSubtle,
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: componentTheme.fontSans,
                  transition: 'all .12s',
                  '&:hover': { borderColor: !active ? componentTheme.variation : undefined },
                }}
              >
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: componentTheme.variation, flexShrink: 0 }} />
                Local overrides
                <Box component="span" data-testid={`${testIdPrefix}-local-overrides-count`} sx={{
                  fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700,
                  background: active ? componentTheme.attentionMuted : componentTheme.bgInset,
                  color: 'inherit', borderRadius: '999px', padding: '0 6px', minWidth: 16, textAlign: 'center',
                }}>
                  {totalLocalOverrides ?? 0}
                </Box>
              </Box>
            );
          })()}

          {(() => {
            const active = scopeFilter === 'local-only';
            return (
              <Box
                component="button"
                aria-pressed={active}
                data-testid={`${testIdPrefix}-scope-local-only`}
                onClick={() => onScopeFilterChange?.(active ? null : 'local-only')}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  fontSize: 11, fontWeight: 600, lineHeight: '18px',
                  padding: '1px 10px', borderRadius: '10px',
                  border: `1px solid ${active ? componentTheme.accent : componentTheme.borderMuted}`,
                  background: active ? componentTheme.accentMuted : 'transparent',
                  color: active ? componentTheme.accent : componentTheme.fgSubtle,
                  cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: componentTheme.fontSans,
                  transition: 'all .12s',
                  '&:hover': { borderColor: !active ? componentTheme.accent : undefined },
                }}
              >
                <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: componentTheme.accent, flexShrink: 0 }} />
                Local only
                <Box component="span" data-testid={`${testIdPrefix}-local-only-count`} sx={{
                  fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700,
                  background: active ? componentTheme.accentMuted : componentTheme.bgInset,
                  color: 'inherit', borderRadius: '999px', padding: '0 6px', minWidth: 16, textAlign: 'center',
                }}>
                  {totalLocalOnly ?? 0}
                </Box>
              </Box>
            );
          })()}

          {/* Kept on merge chip — L2. A button: clicking filters and flattens
              to the checkable, currently-kept paths, exactly as the Incoming
              filter already does — the bulk-reverse surface ("Stop keeping N
              keys") lives in that flattened view's own footer, not on this
              chip. Two render gates, both required: totalCheckableM > 0
              (nothing to say if no checkable local override exists), and
              hasProtectionData (never a fabricated "0 of M" while the fetch
              is in flight). */}
          {(totalCheckableM ?? 0) > 0 && hasProtectionData && (() => {
            const M = totalCheckableM ?? 0;
            const N = totalKeptOnMergeN ?? 0;
            const L = totalLiveL ?? M;
            const risk = N !== M;
            const active = scopeFilter === 'kept-on-merge';
            // The obvious tooltip denominator would be the neighbouring "Local
            // overrides" chip's count, but that reads the dry-run-tainted
            // `variationEntry.fieldDiffs` while L/M/N here read the untainted
            // `liveFieldDiffs` — the two can (and on some fixtures, do)
            // disagree, so borrowing that number would print nonsense like
            // "1 of 0 local overrides can be checked". L (every live-diverged
            // path, arrays included) and M (the checkable subset) come from
            // the SAME source, so "M of L" can never invert.
            const tooltipText = L > M
              ? `A merge from upstream will keep ${N} of these ${M} values and overwrite the rest. `
                + `${M} of ${L} local overrides can be checked. Values inside lists are not checked yet.`
              : `A merge from upstream will keep ${N} of these ${M} values and overwrite the rest.`;
            return (
              <Tooltip title={tooltipText} placement='top'>
                <Box
                  component="button"
                  aria-pressed={active}
                  data-testid={`${testIdPrefix}-kept-on-merge-chip`}
                  data-risk={risk ? 'true' : 'false'}
                  onClick={() => onScopeFilterChange?.(active ? null : 'kept-on-merge')}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                    fontSize: 11, fontWeight: 600, lineHeight: '18px',
                    padding: '1px 10px', borderRadius: '10px',
                    border: `1px solid ${active ? componentTheme.accent : risk ? '#e0c9a2' : componentTheme.borderMuted}`,
                    background: active ? componentTheme.accentMuted : 'transparent',
                    color: active ? componentTheme.accent : risk ? componentTheme.attention : componentTheme.fgSubtle,
                    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: componentTheme.fontSans,
                    transition: 'all .12s',
                    '&:hover': { borderColor: !active ? (risk ? componentTheme.attention : componentTheme.accent) : undefined },
                  }}
                >
                  <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', background: active ? componentTheme.accent : risk ? componentTheme.attention : componentTheme.fgSubtle, flexShrink: 0 }} />
                  Kept on merge
                  <Box component="span" data-testid={`${testIdPrefix}-kept-on-merge-count`} sx={{
                    fontFamily: componentTheme.fontMono, fontSize: 10, fontWeight: 700,
                    background: active ? componentTheme.accentMuted : risk ? componentTheme.attentionMuted : componentTheme.bgInset,
                    color: 'inherit', borderRadius: '999px', padding: '0 6px', minWidth: 16, textAlign: 'center',
                  }}>
                    {N} of {M}
                  </Box>
                </Box>
              </Tooltip>
            );
          })()}
        </Box>
      )}
    </>
  );
}
