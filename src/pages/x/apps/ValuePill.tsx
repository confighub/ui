// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A field value as the Components view draws it: `CurrentPill`, the value with
 * its staged or incoming change shown as an inline token diff (purple for an
 * upgrade, yellow for an edit, green for an add), and `PillTooltipContent`, the
 * hover body that prints the full value.
 *
 * Moved here unchanged from `ComponentValuesSection` so that other views (the
 * ChangeOrders list) can show a change in the same language without importing
 * the whole review pane.
 */

import Box from '@mui/material/Box';

import { highlightText } from '@/components/entity-data-grid/utils/highlightText';
import { componentTheme } from './componentTheme';
import { NO_VALUE_LABEL, isEmptyValue } from './componentValues';
import type { InlineDiffSegment } from './inlineDiff';

export type RowChangeType = 'upgrade' | 'edit' | 'delete' | 'add' | 'protect';

const UP_TOK_TEXT = '#5b21b6';      // changed-char token text
const UP_TOK_BG = 'rgba(109,40,217,.12)';
const UP_TOK_BORDER = 'rgba(109,40,217,.28)';
const EDIT_TOK_TEXT = '#a16207';    // changed-char token text (yellow-700, the readable text limit)
const EDIT_TOK_BG = 'rgba(234,179,8,.16)';    // yellow-500 tint behind changed chars
const EDIT_TOK_BORDER = 'rgba(234,179,8,.5)'; // yellow-500 border around changed chars
const ADD_VAL_TEXT = '#15803d';
const VAL_MUTED = '#59636e';        // committed / blocked / unchanged-diff chars

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

export const PillTooltipContent = ({
  fullValue,
  accentColor,
  meta,
  action,
  italic,
}: {
  fullValue: string;
  accentColor?: string;
  meta?: { label: string; createdAt?: string; description?: string };
  action?: string;
  italic?: boolean;
}) => {
  const noValue = isEmptyValue(fullValue);
  return (
  <Box sx={{ minWidth: 140, maxWidth: 280 }}>
    <Box sx={{
      px: 1.5, py: 1,
      fontFamily: componentTheme.fontMono,
      fontSize: 11,
      color: accentColor ?? componentTheme.fgDefault,
      wordBreak: 'break-all',
      lineHeight: 1.4,
      borderBottom: `1px solid ${componentTheme.borderSubtle}`,
      ...((italic || noValue) && { fontStyle: 'italic' }),
    }}>
      {noValue ? NO_VALUE_LABEL : fullValue}
    </Box>
    {(meta || action) && (
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {meta && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {meta.label}
            </Box>
            {meta.createdAt && (
              <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted }}>
                {formatRelativeTime(meta.createdAt)}
              </Box>
            )}
          </Box>
        )}
        {meta?.description && (
          <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgDefault, fontStyle: 'italic', lineHeight: 1.3 }}>
            {meta.description}
          </Box>
        )}
        {action && (
          <Box sx={{ fontSize: 10, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted, mt: meta ? '2px' : 0 }}>
            {action}
          </Box>
        )}
      </Box>
    )}
  </Box>
  );
};

export const CurrentPill = ({
  value,
  filterText,
  changeType,
  previewChangeType,
  muted,
  isAbsent,
  editable,
  previewSegments,
  previewRemoved,
  oldValueForPreview,
  differsFromUpstream,
  kept,
}: {
  value: string;
  filterText: string;
  /** The resolved change type for a staged row — drives the inline-diff value
   *  treatment. undefined for a plain/unstaged row. The per-type row tint + left
   *  bar live on the ReviewRow, not the value pill (values stay flat). */
  changeType?: RowChangeType;
  /** The change type the PREVIEW (current→proposed inline diff) represents. Set
   *  even on UNSTAGED upgradable rows so the hover-revealed diff colours correctly
   *  (purple token highlight for an upgrade, green for an add, yellow for an edit).
   *  Falls back to changeType when omitted. */
  previewChangeType?: RowChangeType;
  /** BLOCKED / COMMITTED rows render their value in muted grey (#59636e) — no
   *  change is possible (blocked) or the change is already applied (committed). */
  muted?: boolean;
  /** When true, renders a muted "no value" placeholder instead of the value text. */
  isAbsent?: boolean;
  /** When true (row has an edit handler and isn't removing), hovering the value
   *  shows a dotted "click to edit inline" underline. Not set for non-editable
   *  values (context name leaves, disabled rows). */
  editable?: boolean;
  /** When provided, hovering the sibling stage control (.upgrade-pill) swaps the
   *  current text for this inline diff preview via the .pill-group :has() rule. */
  previewSegments?: InlineDiffSegment[];
  /** When true the upstream deletes this value; hovering the upgrade pill shows a red strikethrough ghost. */
  previewRemoved?: boolean;
  /**
   * The value being replaced, for a plain value CHANGE (not add/delete) in a
   * read-only diff view (e.g. the Releases tab) — rendered struck-through and
   * muted immediately before the incoming value, so both sides of the change
   * are visible without a staging control to hover. Undefined everywhere else
   * (the Upgrade/Apply tabs keep their existing hover-only preview, since
   * there the "before" value is always the row's own unstaged current text).
   */
  oldValueForPreview?: string;
  /** True when this value differs from upstream, or has an uncommitted staged
   *  edit. Opens the pill's transparent 1px reserve as a dashed stroke — no
   *  layout shift, because the border box is always drawn. Superseded by
   *  `kept`: a kept value renders solid regardless of this flag (see `kept`). */
  differsFromUpstream?: boolean;
  /**
   * True when this path is protected — "kept on merge" — either committed
   * (the current effective MutationSources protection) or freshly staged via
   * the kebab. Firms the pill's border from dashed to SOLID, in the SAME
   * `borderEdge` colour as the dashed stroke — only the style changes, not
   * the colour. Solid REPLACES dashed rather than composing with it: a kept
   * value that also differs from upstream still renders solid, never both.
   * This is also what fills the "fourth cell" — protected + matches-upstream
   * now draws a solid border where before nothing rendered, because `kept`
   * doesn't depend on `differsFromUpstream` at all.
   */
  kept?: boolean;
}) => (
  <Box
    component="span"
    className={`current-pill${previewRemoved ? ' has-remove-preview' : ''}`}
    /*
     * `data-fidelity` marks inline treatments that carry meaning VISUALLY and
     * have no semantics to bind to. There is no ARIA role for "this token
     * changed" and inventing one would be wrong — it is the presentation of a
     * value, not a widget — so the contract needs an explicit hook.
     *
     * Added unconditionally rather than behind an opt-in prop: these attributes
     * are inert, change nothing rendered and nothing announced, and gating them
     * would thread a prop through a dozen render sites for no benefit. The
     * opt-in pattern exists for `TreeDiffSection`'s `domHooks`, which also
     * switches on disclosure semantics (role, tabIndex, aria-expanded) and so
     * genuinely alters behaviour. This does not.
     *
     * The value cell needs one despite looking structural: the contract's
     * single-value-column invariant is "every leaf row carries exactly one
     * value cell sharing a left edge within its block", and without a hook
     * there is nothing to count.
     */
    data-fidelity="value-cell"
    sx={{
      display: 'inline-flex',
      // Right-align the value so it sits hard against the right column (just left of
      // the checkbox). Long/wrapped values stay right-aligned.
      alignItems: 'flex-start',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      textAlign: 'right',
      minWidth: 0,
      // Match the 20px pill so the value box doesn't inflate the dense row.
      minHeight: 20,
      boxSizing: 'border-box',
      // Flat: render the value as plain inline text (no border/background/box).
      padding: '2px 4px',
      borderRadius: '4px',
      borderWidth: '1px',
      borderStyle: 'solid',
      borderColor: 'transparent',
      background: 'transparent',
      color: componentTheme.fgDefault,
      // Value text at the mockup's 12px (slightly smaller than the 12.5px key), for density.
      fontSize: 12,
      fontFamily: componentTheme.fontMono,
      fontWeight: 500,
      // BLOCKED / COMMITTED: muted grey value (no change possible / already applied).
      ...(muted && { color: VAL_MUTED }),
      // Border resolution: KEPT (protected) wins outright — solid, same edge
      // colour as the dashed stroke, never composed with dashed. Otherwise,
      // differs-from-upstream (or an uncommitted staged edit) opens the
      // always-reserved 1px border as a dashed stroke. Neither → transparent.
      ...(kept && { borderStyle: 'solid', borderColor: componentTheme.borderEdge }),
      ...(!kept && differsFromUpstream && { borderStyle: 'dashed', borderColor: componentTheme.borderEdge }),
      // border-style is NOT included here: CSS cannot interpolate it, so animating
      // it would snap mid-fade instead of transitioning.
      transition: 'border-color .12s, box-shadow .12s, background .12s, transform .18s cubic-bezier(0.34,1.56,0.64,1)',
      // Editable values signal "click to edit inline" with a subtle dotted underline
      // on hover (standard inline-edit convention). Whichever value-text element is
      // VISIBLE gets the underline: `.current-text` on an UNSTAGED row, or
      // `.current-preview` (the persistent current→proposed inline diff) on a STAGED
      // row — because the `.pill-staged` reveal hides `.current-text` and shows
      // `.current-preview`, so a staged row would otherwise show NO edit affordance.
      // `.current-text` is gated `:not(.is-absent)` so the "no value" placeholder is
      // never underlined; `.current-preview` only renders on a row that has a
      // proposed value, so it needs no absent guard. No background tint: the dotted
      // underline is the sole, lighter affordance.
      ...(editable && {
        '&:hover .current-text:not(.is-absent), &:hover .current-preview': {
          textDecoration: 'underline dotted',
          textDecorationColor: 'rgba(15,17,21,.28)',
          textDecorationThickness: '1px',
          textUnderlineOffset: '2px',
          cursor: 'text',
        },
      }),
    }}
  >
    <Box
      className={`current-text${(isAbsent || isEmptyValue(value)) ? ' is-absent' : ''}`}
      data-fidelity={isAbsent || isEmptyValue(value) ? 'value-absent' : undefined}
      sx={{
        lineHeight: 1.35,
        overflowWrap: 'break-word',
        minWidth: 0,
        wordBreak: 'break-word',
        ...((isAbsent || isEmptyValue(value)) && { color: componentTheme.fgSubtle, fontStyle: 'italic', fontSize: 11, opacity: 0.85 }),
      }}
    >
      {isAbsent || isEmptyValue(value) ? NO_VALUE_LABEL : (filterText ? highlightText(value, filterText) : value)}
    </Box>
    {oldValueForPreview !== undefined && (
      <>
        <Box
          component="span"
          className="current-old-preview"
          data-fidelity="value-superseded"
          sx={{
            display: 'none',
            lineHeight: 1.35,
            textDecoration: 'line-through',
            color: componentTheme.fgSubtle,
            ...(isEmptyValue(oldValueForPreview) && { fontStyle: 'italic' }),
          }}
        >
          {isEmptyValue(oldValueForPreview) ? NO_VALUE_LABEL : oldValueForPreview}
        </Box>
        <Box
          component="span"
          className="current-old-preview"
          aria-hidden="true"
          // The reveal marker for the original value beside it. Decorative, so
          // it is hidden from assistive tech and measured at the non-text tier.
          data-fidelity="original-preview"
          sx={{ display: 'none', lineHeight: 1.35, color: componentTheme.fgSubtle, opacity: 0.7 }}
        >
          →
        </Box>
      </>
    )}
    {previewSegments && (() => {
      // Resolve the preview's effective change type once.
      const effectiveType = previewChangeType ?? changeType;
      // UPGRADE and EDIT use the IDENTICAL inline token-diff treatment — the
      // unchanged chars dim to muted grey and the CHANGED chars get a subtle
      // bg + border + bold colored highlight — differing ONLY in colour:
      // upgrade is purple, edit is yellow. This makes a staged edit display
      // identically to a staged upgrade. ADD renders the proposed value flat
      // (green) since there is no original to diff against character-by-character.
      const isTokenDiff = effectiveType === 'upgrade' || effectiveType === 'edit';
      // Per-type changed-token highlight palette (mirrored alphas, swapped hue).
      const tokText = effectiveType === 'edit' ? EDIT_TOK_TEXT : UP_TOK_TEXT;
      const tokBg = effectiveType === 'edit' ? EDIT_TOK_BG : UP_TOK_BG;
      const tokBorder = effectiveType === 'edit' ? EDIT_TOK_BORDER : UP_TOK_BORDER;
      return (
      <Box
        component="span"
        className="current-preview"
        data-fidelity="value-preview"
        sx={{
          display: 'none',
          lineHeight: 1.35,
          // ADD → plain green text (weight 580). UPGRADE/EDIT dim the unchanged
          // chars (#59636e) and box only the changed chars (purple / yellow below).
          ...(effectiveType === 'add' && { color: ADD_VAL_TEXT, fontWeight: 580 }),
          ...(isTokenDiff && { color: VAL_MUTED }),
        }}
      >
        {previewSegments.map((seg, idx) =>
          // UPGRADE and EDIT box their CHANGED chars with the identical subtle
          // highlight structure (bg + border + bold colored text), differing only
          // in colour (purple vs yellow). ADD renders flat in its type colour.
          seg.changed && isTokenDiff ? (
            <Box
              key={idx}
              component="span"
              data-fidelity="token-changed"
              sx={{
                color: tokText,
                fontWeight: 700,
                background: tokBg,
                border: `1px solid ${tokBorder}`,
                borderRadius: '3px',
                padding: '0 3px',
                WebkitBoxDecorationBreak: 'clone',
                boxDecorationBreak: 'clone',
              }}
            >
              {seg.text}
            </Box>
          ) : (
            <Box key={idx} component="span" data-fidelity="token-kept">{seg.text}</Box>
          ),
        )}
      </Box>
      );
    })()}
    {previewRemoved && (
      <Box
        component="span"
        className="current-removed"
        data-fidelity="value-removed"
        sx={{ display: 'none', textDecoration: 'line-through', color: componentTheme.danger, opacity: 0.6, lineHeight: 1.35, ...(isEmptyValue(value) && { fontStyle: 'italic' }) }}
      >
        {isEmptyValue(value) ? NO_VALUE_LABEL : value}
      </Box>
    )}
  </Box>
);
