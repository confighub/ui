// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useMemo } from 'react';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

import { useListExtendedRevisionsQuery } from '@confighub/rtk-query';
import { parseUnitData } from './configParser';
import { componentTheme } from './componentTheme';
import { NO_VALUE_LABEL, isEmptyValue } from './componentValues';
import type { VariationEntry } from './componentTypes';
import { useRevisionDataMap } from '@/hooks/useUnitData';

// ============================================================================
// HELPERS
// ============================================================================

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function getValueAtPath(data: string | undefined, path: string): string | undefined {
  if (!data) return undefined;
  const map = parseUnitData(data);
  return map.get(path);
}

/** Derives a deterministic hue 0–359 from a string (username/userId). */
function nameToHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return h % 360;
}

const AUTOMATED_USER_ID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const AuthorAvatar = ({ name, userId }: { name: string; userId?: string }) => {
  const hue = nameToHue(userId ?? name);
  const initial = name.charAt(0).toUpperCase();
  return (
    <Box
      sx={{
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: `hsl(${hue}, 55%, 88%)`,
        border: `1.5px solid hsl(${hue}, 40%, 78%)`,
        color: `hsl(${hue}, 50%, 32%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        fontFamily: componentTheme.fontSans,
        flexShrink: 0,
      }}
    >
      {initial}
    </Box>
  );
};

/** Neutral inline chip — used in history timeline only */
const HistoryChip = ({ value }: { value: string }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '0px 4px',
      borderRadius: '3px',
      fontSize: 9,
      lineHeight: '16px',
      fontFamily: componentTheme.fontMono,
      background: componentTheme.bgSubtle,
      border: `1px solid ${componentTheme.borderMuted}`,
      color: componentTheme.fgDefault,
      maxWidth: 110,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      flexShrink: 1,
      minWidth: 0,
      verticalAlign: 'middle',
      ...(isEmptyValue(value) && { fontStyle: 'italic', color: componentTheme.fgSubtle }),
    }}
  >
    {isEmptyValue(value) ? NO_VALUE_LABEL : value}
  </Box>
);

/** Block-level chip for the summary column. variant='incoming' = purple (upstream only). */
const SummaryChip = ({ value, variant = 'neutral' }: { value: string; variant?: 'neutral' | 'incoming' | 'muted' }) => (
  <Box
    component="span"
    sx={{
      display: 'block',
      padding: '1px 5px',
      borderRadius: '3px',
      fontSize: 10,
      lineHeight: '18px',
      fontFamily: componentTheme.fontMono,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      ...(variant === 'incoming' && {
        background: 'rgba(124,58,237,.09)',
        border: `1px solid rgba(124,58,237,.22)`,
        color: '#5b21b6',
        fontWeight: 600,
      }),
      ...(variant === 'neutral' && {
        background: componentTheme.bgSubtle,
        border: `1px solid ${componentTheme.borderMuted}`,
        color: componentTheme.fgDefault,
      }),
      ...(variant === 'muted' && {
        background: 'transparent',
        border: `1px solid ${componentTheme.borderSubtle}`,
        color: componentTheme.fgMuted,
      }),
      ...(isEmptyValue(value) && { fontStyle: 'italic' }),
    }}
  >
    {isEmptyValue(value) ? NO_VALUE_LABEL : value}
  </Box>
);

// ============================================================================
// TYPES
// ============================================================================

export interface InspectPanelProps {
  spaceId: string;
  unitId: string;
  path: string;
  /** Current value of this field in this deployment. */
  currentValue: string;
  deploymentName?: string;
  onClose: () => void;
  /** Incoming upstream value (from an active upgrade). Purple treatment. */
  upgradeValue?: string;
  /** Which upstream deployment the change is coming from (e.g. "staging"). */
  upgradeSourceName?: string;
  /** Upstream HEAD revision number. */
  upgradeRevisionNum?: number;
  /** ISO timestamp of the upstream HEAD revision. */
  upgradeCreatedAt?: string;
  /** Description of the upstream revision. */
  upgradeDescription?: string;
  /** Variation entry — permanent env differences (used when no active upgrade). */
  variationEntry?: VariationEntry;
  /** Same field's value across other variants in this column (same unit.slug). */
  siblingVariants?: Array<{
    deploymentId: string;
    displayName: string;
    value: string | undefined;
    isCurrent: boolean;
  }>;
  /** Space ID of the upstream unit driving the upgrade — used to link to its revision. */
  upgradeSourceSpaceId?: string;
  /** Unit ID of the upstream unit driving the upgrade — used to link to its revision. */
  upgradeSourceUnitId?: string;
  /** Whether this path is currently protected (staged-toggle-aware — mirrors the
   *  row's own `effectiveKept`). Undefined/false renders the toggle as "Protect". */
  isKept?: boolean;
  /** Whether this path is eligible for protection at all — false for a path that
   *  doesn't exist downstream yet, or is array-indexed (mirrors the kebab menu's
   *  isAbsentCurrent/isArrayRow guard). The toggle is omitted entirely when false. */
  canProtect?: boolean;
  /** Stages the protect/unprotect toggle for this path. Omitted (along with
   *  `canProtect`) in read-only contexts, which hides the toggle — InspectPanel
   *  never stages anything itself, it only calls back out. */
  onToggleProtection?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export const InspectPanel = memo(({
  spaceId,
  unitId,
  path,
  currentValue,
  onClose,
  upgradeValue,
  upgradeSourceName,
  upgradeRevisionNum,
  upgradeCreatedAt,
  upgradeDescription,
  variationEntry,
  siblingVariants,
  upgradeSourceSpaceId,
  upgradeSourceUnitId,
  isKept,
  canProtect,
  onToggleProtection,
}: InspectPanelProps) => {
  const { data: revisionItems, isLoading, isError } = useListExtendedRevisionsQuery(
    { spaceId, unitId, include: 'UserID' },
    { skip: !spaceId || !unitId },
  );

  // Configuration is not on the Revision; every Revision this panel walks is fetched at once.
  const { dataFor: revisionDataFor } = useRevisionDataMap(
    (revisionItems ?? []).map((r) => r.Revision?.RevisionID),
  );

  // Build per-field history — only emit a new entry when the value changes.
  const historyEntries = useMemo(() => {
    if (!revisionItems) return [];
    const sorted = [...revisionItems].sort(
      (a, b) => (b.Revision?.RevisionNum ?? 0) - (a.Revision?.RevisionNum ?? 0),
    );

    const MAX_EVENTS = 8;
    const result: {
      revisionNum: number;
      createdAt: string;
      description: string;
      value: string | undefined;
      authorName: string;
      userId: string | undefined;
      isAutomated: boolean;
    }[] = [];

    const SENTINEL = Symbol('sentinel');
    let lastEmittedValue: string | undefined | typeof SENTINEL = SENTINEL;

    for (const item of sorted) {
      const rev = item.Revision;
      const value = getValueAtPath(revisionDataFor(rev?.RevisionID), path);

      if (value === lastEmittedValue) continue;

      const isAutomated = rev?.UserID === AUTOMATED_USER_ID;
      const user = item.User;
      const authorName = isAutomated
        ? 'Automated'
        : (user?.DisplayName ?? user?.Slug ?? rev?.UserID?.slice(0, 8) ?? '?');

      result.push({
        revisionNum: rev?.RevisionNum ?? 0,
        createdAt: rev?.CreatedAt ?? '',
        description: rev?.Description ?? '',
        value,
        authorName,
        userId: rev?.UserID,
        isAutomated,
      });

      lastEmittedValue = value;
      if (result.length >= MAX_EVENTS) break;
    }

    return result;
  }, [revisionItems, path]);

  // Variation diff for this path (env difference, used when no active upgrade)
  const variantDiff = useMemo(
    () => variationEntry?.fieldDiffs.find((d) => d.path === path),
    [variationEntry, path],
  );

  const hasUpgrade = upgradeValue !== undefined;
  // oldValue on a variationEntry diff = upstream value; newValue = downstream
  const upstreamVariationValue = variantDiff?.oldValue;
  const hasVariation = upstreamVariationValue !== undefined && upstreamVariationValue !== currentValue;

  // Right-column gating — must mirror the per-section guards below.
  const differingSiblings = siblingVariants
    ? siblingVariants.filter((sv) => !sv.isCurrent && sv.value !== currentValue)
    : [];
  const hasRightColumnContent = hasUpgrade || hasVariation || differingSiblings.length > 0;

  // Short path for header
  const pathParts = path.split('.');
  const shortPath = pathParts.length <= 2 ? path : `…${pathParts.slice(-2).join('.')}`;

  return (
    <Box
      sx={{
        borderLeft: `2px solid ${componentTheme.upgrade}`,
        background: `linear-gradient(90deg, rgba(124,58,237,.03) 0%, transparent 50%)`,
        borderTop: `1px solid rgba(124,58,237,.12)`,
        borderBottom: `1px solid rgba(124,58,237,.06)`,
        overflow: 'hidden',
        animation: 'inspectReveal .15s cubic-bezier(0.16,1,0.3,1)',
        '@keyframes inspectReveal': {
          from: { opacity: 0, transform: 'translateY(-4px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
      }}
    >
      {/* Panel header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          px: '12px',
          py: '5px',
          borderBottom: `1px solid rgba(124,58,237,.10)`,
        }}
      >
        <Box
          sx={{
            fontSize: 10,
            fontFamily: componentTheme.fontMono,
            color: '#6d28d9',
            fontWeight: 600,
            opacity: 0.8,
            mr: 'auto',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {shortPath}
        </Box>
        {/* Protect/Unprotect — same staged-toggle action as the treeview row's
            kebab item and hover tooltip (onToggleProtection is passed through
            unchanged from the row; this panel only triggers it, never stages
            anything itself). Omitted when the caller didn't wire a handler
            (read-only contexts) or when the path can't be protected
            (canProtect false — absent downstream, or array-indexed). */}
        {onToggleProtection && canProtect && (
          <Box
            component="button"
            type="button"
            data-testid="inspect-panel-protect-toggle"
            onClick={onToggleProtection}
            sx={{
              flexShrink: 0,
              fontFamily: componentTheme.fontSans,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.02em',
              lineHeight: '16px',
              padding: '1px 7px',
              borderRadius: '9px',
              border: `1px solid ${isKept ? '#6d28d9' : componentTheme.borderDefault}`,
              background: isKept ? 'rgba(124,58,237,.10)' : 'transparent',
              color: isKept ? '#6d28d9' : componentTheme.fgMuted,
              cursor: 'pointer',
              transition: 'background .1s, color .1s, border-color .1s',
              '&:hover': {
                borderColor: '#6d28d9',
                color: '#6d28d9',
              },
            }}
          >
            {isKept ? 'Unprotect' : 'Protect'}
          </Box>
        )}
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            width: 20,
            height: 20,
            color: componentTheme.fgMuted,
            '&:hover': { color: componentTheme.fgDefault },
          }}
        >
          <CloseIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Box>

      {/* Two-column body */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: hasRightColumnContent ? '1fr 185px' : '1fr',
          minHeight: 0,
        }}
      >
        {/* ── History column ── */}
        <Box
          sx={{
            px: '12px',
            py: '8px',
            borderRight: `1px solid rgba(124,58,237,.08)`,
            maxHeight: 220,
            overflowY: 'auto',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { background: 'transparent' },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(0,0,0,.12)', borderRadius: 2 },
          }}
        >
          <Box
            sx={{
              fontSize: 9,
              fontFamily: componentTheme.fontSans,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: componentTheme.fgSubtle,
              mb: '6px',
            }}
          >
            History
          </Box>

          {isLoading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px', py: 1 }}>
              <CircularProgress size={10} sx={{ color: componentTheme.fgSubtle }} />
              <Box sx={{ fontSize: 11, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted }}>
                Loading…
              </Box>
            </Box>
          )}

          {isError && (
            <Box sx={{ fontSize: 11, fontFamily: componentTheme.fontSans, color: componentTheme.danger, py: 0.5 }}>
              Failed to load history
            </Box>
          )}

          {!isLoading && !isError && historyEntries.length === 0 && (
            <Box sx={{ fontSize: 11, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, fontStyle: 'italic', py: 0.5 }}>
              No revision history
            </Box>
          )}

          {!isLoading && historyEntries.map((entry, i) => {
            const isLast = i === historyEntries.length - 1;
            return (
              <Box
                key={entry.revisionNum}
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '7px',
                  mb: isLast ? 0 : '2px',
                  animation: `inspectFadeIn .18s ${i * 35}ms cubic-bezier(0.16,1,0.3,1) both`,
                  '@keyframes inspectFadeIn': {
                    from: { opacity: 0, transform: 'translateX(-4px)' },
                    to: { opacity: 1, transform: 'translateX(0)' },
                  },
                }}
              >
                {/* Timeline dot + track */}
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0,
                    mt: '2px',
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: i === 0 ? componentTheme.fgMuted : componentTheme.borderMuted,
                      flexShrink: 0,
                    }}
                  />
                  {!isLast && (
                    <Box
                      sx={{
                        width: 1,
                        flex: 1,
                        minHeight: 8,
                        background: componentTheme.borderSubtle,
                        my: '1px',
                      }}
                    />
                  )}
                </Box>

                {/* Entry row — links to the revision viewer */}
                <Box
                  component="a"
                  href={`/units/${spaceId}/${unitId}?revisionViewer=true&revision=${entry.revisionNum}&viewMode=single&tab=2`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    pb: isLast ? 0 : '4px',
                    display: 'block',
                    textDecoration: 'none',
                    color: 'inherit',
                    borderRadius: '4px',
                    px: '4px',
                    mx: '-4px',
                    cursor: 'pointer',
                    transition: 'background .1s',
                    '&:hover': {
                      background: componentTheme.bgInset,
                      '& .rev-num': { color: componentTheme.fgDefault, textDecoration: 'underline' },
                    },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Box
                      className="rev-num"
                      sx={{
                        fontSize: 9,
                        fontFamily: componentTheme.fontMono,
                        color: componentTheme.fgSubtle,
                        flexShrink: 0,
                        transition: 'color .1s',
                      }}
                    >
                      r{entry.revisionNum}
                    </Box>

                    {!entry.isAutomated && (
                      <AuthorAvatar name={entry.authorName} userId={entry.userId} />
                    )}
                    <Box
                      sx={{
                        fontSize: 10,
                        fontFamily: componentTheme.fontSans,
                        color: componentTheme.fgMuted,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        flexShrink: 1,
                        minWidth: 0,
                      }}
                    >
                      {entry.authorName}
                    </Box>

                    {/* Value chip — neutral, no purple */}
                    <Box sx={{ flexShrink: 1, minWidth: 0, overflow: 'hidden' }}>
                      {entry.value !== undefined ? (
                        <HistoryChip value={entry.value} />
                      ) : (
                        <Box
                          component="span"
                          sx={{
                            fontSize: 9,
                            fontFamily: componentTheme.fontMono,
                            color: componentTheme.fgSubtle,
                            fontStyle: 'italic',
                          }}
                        >
                          absent
                        </Box>
                      )}
                    </Box>

                    {entry.createdAt && (
                      <Box
                        sx={{
                          fontSize: 9,
                          fontFamily: componentTheme.fontSans,
                          color: componentTheme.fgSubtle,
                          flexShrink: 0,
                          ml: 'auto',
                        }}
                      >
                        {formatRelativeTime(entry.createdAt)}
                      </Box>
                    )}
                  </Box>

                  {entry.description && (
                    <Box
                      sx={{
                        fontSize: 9,
                        fontFamily: componentTheme.fontSans,
                        color: componentTheme.fgSubtle,
                        mt: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 200,
                      }}
                    >
                      {entry.description}
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>

        {/* ── Summary column ── */}
        {hasRightColumnContent && (
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>

          {/* INCOMING section — purple, only when an upgrade is pending */}
          {hasUpgrade && (
            <Box
              sx={{
                px: '10px',
                pt: '8px',
                pb: '10px',
                background: 'rgba(124,58,237,.04)',
                borderBottom: `1px solid rgba(124,58,237,.10)`,
                animation: 'inspectFadeIn .2s cubic-bezier(0.16,1,0.3,1) both',
                '@keyframes inspectFadeIn': {
                  from: { opacity: 0, transform: 'translateX(4px)' },
                  to: { opacity: 1, transform: 'translateX(0)' },
                },
              }}
            >
              <Box
                sx={{
                  fontSize: 9,
                  fontFamily: componentTheme.fontSans,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: '#7c3aed',
                  mb: '5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {/* Small arrow-up indicator */}
                <Box component="span" sx={{ fontSize: 9, lineHeight: 1 }}>↑</Box>
                Incoming
              </Box>

              <SummaryChip value={upgradeValue ?? ''} variant="incoming" />

              {/* Source attribution */}
              <Box sx={{ mt: '5px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {upgradeSourceName && (
                  <Box
                    sx={{
                      fontSize: 10,
                      fontFamily: componentTheme.fontSans,
                      color: '#7c3aed',
                      opacity: 0.75,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      from {upgradeSourceName}
                    </Box>
                    {upgradeRevisionNum !== undefined && (
                      upgradeSourceSpaceId && upgradeSourceUnitId ? (
                        <Box
                          component="a"
                          href={`/units/${upgradeSourceSpaceId}/${upgradeSourceUnitId}?revisionViewer=true&revision=${upgradeRevisionNum}&viewMode=single&tab=2`}
                          target="_blank"
                          rel="noopener noreferrer"
                          sx={{
                            fontFamily: componentTheme.fontMono,
                            fontSize: 9,
                            color: '#7c3aed',
                            opacity: 0.6,
                            flexShrink: 0,
                            textDecoration: 'none',
                            cursor: 'pointer',
                            transition: 'opacity .1s',
                            '&:hover': {
                              opacity: 1,
                              textDecoration: 'underline',
                            },
                          }}
                        >
                          r{upgradeRevisionNum}
                        </Box>
                      ) : (
                        <Box
                          component="span"
                          sx={{
                            fontFamily: componentTheme.fontMono,
                            fontSize: 9,
                            color: '#7c3aed',
                            opacity: 0.6,
                            flexShrink: 0,
                          }}
                        >
                          r{upgradeRevisionNum}
                        </Box>
                      )
                    )}
                  </Box>
                )}
                {upgradeCreatedAt && (
                  <Box sx={{ fontSize: 9, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle }}>
                    {formatRelativeTime(upgradeCreatedAt)}
                  </Box>
                )}
                {upgradeDescription && (
                  <Box
                    sx={{
                      fontSize: 9,
                      fontFamily: componentTheme.fontSans,
                      color: componentTheme.fgMuted,
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {upgradeDescription}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* UPSTREAM section — muted, variation only (no active upgrade) */}
          {hasVariation && (
            <Box
              sx={{
                px: '10px',
                pt: '8px',
                pb: '10px',
                borderBottom: `1px solid ${componentTheme.borderSubtle}`,
              }}
            >
              <Box
                sx={{
                  fontSize: 9,
                  fontFamily: componentTheme.fontSans,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: componentTheme.fgSubtle,
                  mb: '5px',
                }}
              >
                Upstream
              </Box>
              <SummaryChip value={upstreamVariationValue ?? ''} variant="muted" />
              <Box sx={{ mt: '4px', fontSize: 9, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle, fontStyle: 'italic' }}>
                differs from local
              </Box>
            </Box>
          )}

          {/* OTHER VARIANTS section — same field across other variants in this column */}
          {differingSiblings.length > 0 && (
              <Box sx={{ px: '10px', pt: '8px', pb: '10px' }}>
                <Box
                  sx={{
                    fontSize: 9,
                    fontFamily: componentTheme.fontSans,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: componentTheme.fgSubtle,
                    mb: '6px',
                  }}
                >
                  Other variants
                </Box>
                {differingSiblings.map((sv) => {
                  return (
                    <Box key={sv.deploymentId}>
                      <Box
                        sx={{
                          fontSize: 10,
                          fontFamily: componentTheme.fontSans,
                          color: componentTheme.fgMuted,
                          fontWeight: 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mb: '4px',
                        }}
                      >
                        {sv.displayName}
                      </Box>
                      <Box sx={{ mb: '6px' }}>
                        {sv.value === undefined ? (
                          <Box
                            sx={{
                              fontSize: 9,
                              fontFamily: componentTheme.fontMono,
                              color: componentTheme.fgSubtle,
                              fontStyle: 'italic',
                            }}
                          >
                            absent
                          </Box>
                        ) : (
                          <SummaryChip value={sv.value} variant="muted" />
                        )}
                      </Box>
                    </Box>
                  );
                })}
              </Box>
          )}
        </Box>
        )}
      </Box>
    </Box>
  );
});

InspectPanel.displayName = 'InspectPanel';
