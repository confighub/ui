// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from './componentTheme';
import {
  BADGE_SX,
  CLEAR_SLOT_SX,
  EMPTY_SLOT_SX,
  EMPTY_SLOT_TRACK_SX,
  GUTTER_SX,
  GUTTER_RULE_SX,
  LETTER_SX,
  META_SX,
  NAME_SX,
  OPTION_SX,
  SHEET_SX,
  SLOTS_SX,
  SLOT_BADGE_MIN,
  SLOT_CONTAINER_NAME,
  SLOT_DECLARED_SX,
  SLOT_FILLED_SX,
  SLOT_SX,
  SLOT_TOP_SX,
  SWAP_SX,
  TAG_SX,
} from './selectorSlotStyles';
import { Chevron, CloseGlyph, PlusGlyph, SwapGlyph } from './selectorGlyphs';

/**
 * The two release selectors: what is being compared, and the means of changing
 * it.
 *
 * Both endpoints are on screen at all times, including while the picker is
 * open — the picker opens BELOW them rather than over them, so the pair you are
 * editing stays readable and the other endpoint stays clickable. Choosing a
 * comparison means holding two things in mind, and a menu that hides one of
 * them makes the user hold it in their head instead.
 *
 * THE TWO SLOTS ARE NOT PEERS. A always holds something and is always a full
 * chip. B starts empty, and while it is empty it is a 36px square rather than a
 * second chip — because the pane is not comparing nothing, it is comparing A
 * against A's own immediate predecessor, and a chip-sized hole would claim
 * otherwise. Filling B grows it to A's size: the square's smallness has to mean
 * "empty" and nothing else, and a name like `canary-eu` does not fit in 36px
 * anyway — see `SLOT_BADGE_MIN`, whose rule is to surrender identity LAST.
 *
 * Presentational: it renders the options it is handed and reports the selection
 * back. Which releases exist, what they are called and how their ages read are
 * the owner's business, so the owner formats them.
 */

/** One pickable endpoint: a published release, or the working configuration. */
export interface ReleaseOption {
  /** ReleaseID, or the owner's sentinel for the un-released working config. */
  id: string;
  /** Short name — `rel-12`, or a word for the working config. */
  label: string;
  /** The tag's display name, when the release carries a tag that has one. */
  displayName?: string;
  /** The release currently served to the target. At most one. */
  isCurrent: boolean;
  /** The working configuration: newer than every release, never published. */
  isDeclared: boolean;
  /** Preformatted, because the owner holds the formatter. */
  stamp?: string;
  age?: string;
  /**
   * Short OCI digest of the release's stored bundle. It is NOT a revision
   * reference and must not be labelled as one: a release bundles many units,
   * each with a revision of its own, so no single revision identifies it.
   */
  bundleDigest?: string;
  /** Logical changed-field count; undefined while `state` is not 'resolved'. */
  changedFields?: number;
  state: 'pending' | 'resolved' | 'unavailable';
  /** Why a count understates, when it does. */
  note?: string;
}

export interface ReleaseSelectorsProps {
  /** NEWEST FIRST — the order the picker lists them in. */
  options: ReleaseOption[];
  /** 0–2 ids in click order. The owner decides which is older. */
  selection: readonly string[];
  onSelectionChange: (next: readonly string[]) => void;
}

type Side = 'a' | 'b';

/**
 * `inSlot` marks the cramped copy. The picker sheet is the full width of the
 * pane and has room for both, so only the selector surrenders its chip.
 */
function badgeFor(option: ReleaseOption, inSlot = false): ReactNode {
  const yields = inSlot
    ? { [`@container ${SLOT_CONTAINER_NAME} (max-width: ${SLOT_BADGE_MIN}px)`]: { display: 'none' } }
    : null;
  if (option.isDeclared) {
    return (
      <Box component="span" sx={{ ...BADGE_SX, color: componentTheme.attention, background: componentTheme.bgDefault, border: `1px dashed ${componentTheme.attention}`, ...yields }}>
        unreleased
      </Box>
    );
  }
  if (option.isCurrent) {
    return (
      <Box component="span" data-testid="release-current-badge" sx={{ ...BADGE_SX, color: componentTheme.successEmphasis, background: componentTheme.successMuted, border: `1px solid ${componentTheme.success}`, ...yields }}>
        current
      </Box>
    );
  }
  return null;
}

/** What a release's count reads as, including when it has not arrived. */
function countLabel(option: ReleaseOption): string {
  if (option.state === 'unavailable') return 'count unavailable';
  if (option.state === 'pending' || option.changedFields === undefined) return 'counting…';
  return `${option.changedFields} ${option.changedFields === 1 ? 'field' : 'fields'}`;
}

interface SlotProps {
  side: Side;
  option: ReleaseOption | undefined;
  open: boolean;
  onToggle: (side: Side) => void;
}

const Slot = memo(({ side, option, open, onToggle }: SlotProps): ReactElement => {
  const letter = side.toUpperCase();
  return (
    <Box
      component="button"
      type="button"
      data-testid={`release-selector-${side}`}
      data-label={option?.label ?? ''}
      data-shape="chip"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={
        option
          ? `Selector ${letter} holds ${option.label}. Choose a different release.`
          : `Selector ${letter} is empty. Choose a release.`
      }
      onClick={() => onToggle(side)}
      sx={{ ...SLOT_SX, ...(option?.isDeclared ? SLOT_DECLARED_SX : null) }}
    >
      <Box component="span" sx={SLOT_TOP_SX}>
        <Box component="span" sx={{ ...LETTER_SX, background: side === 'a' ? componentTheme.accent : componentTheme.fgDefault }}>{letter}</Box>
        <Box component="span" data-testid={`release-selector-label-${side}`} sx={{ ...TAG_SX, ...(option ? null : { color: componentTheme.fgSubtle, fontWeight: 400 }) }}>
          {option ? option.label : 'Choose a release'}
        </Box>
        {option ? badgeFor(option, true) : null}
        <Box component="span" sx={{ marginLeft: 'auto', color: componentTheme.fgSubtle, flex: 'none', display: 'inline-flex' }}>{Chevron}</Box>
      </Box>
      {option?.displayName ? <Box component="span" sx={NAME_SX}>{option.displayName}</Box> : null}
      <Box component="span" sx={META_SX}>
        {option ? [option.stamp, option.age].filter(Boolean).join(' · ') || '—' : 'nothing selected'}
      </Box>
    </Box>
  );
});

Slot.displayName = 'Slot';

interface EmptyBProps {
  open: boolean;
  /**
   * What A is being read against while B holds nothing — A's own immediate
   * predecessor. NAMED OUT LOUD to a screen reader, because the square is the
   * one control whose emptiness could otherwise be heard as "this pane is
   * comparing nothing", which is the opposite of what is on screen.
   */
  predecessorLabel: string | undefined;
  onToggle: (side: Side) => void;
}

const EmptyB = memo(({ open, predecessorLabel, onToggle }: EmptyBProps): ReactElement => (
  <Box sx={EMPTY_SLOT_TRACK_SX}>
    <Box
      component="button"
      type="button"
      data-testid="release-selector-b"
      data-label=""
      data-shape="square"
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Compare against another release"
      aria-label={
        predecessorLabel
          ? `Selector B is empty. Choose a release to compare against. Currently showing what changed since ${predecessorLabel}.`
          : 'Selector B is empty. Choose a release to compare against.'
      }
      onClick={() => onToggle('b')}
      sx={EMPTY_SLOT_SX}
    >
      {PlusGlyph}
    </Box>
  </Box>
));

EmptyB.displayName = 'EmptyB';

interface PickerProps {
  side: Side;
  options: ReleaseOption[];
  selectedId: string | undefined;
  otherId: string | undefined;
  onPick: (side: Side, id: string) => void;
  onClose: () => void;
}

const Picker = memo(({ side, options, selectedId, otherId, onPick, onClose }: PickerProps): ReactElement => {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const shown = useMemo(
    () => (query ? options.filter((o) => o.label.toLowerCase().includes(query) || (o.displayName ?? '').toLowerCase().includes(query)) : options),
    [options, query],
  );

  return (
    <Box
      aria-label={`Choose what goes in selector ${side.toUpperCase()}`}
      data-testid={`release-picker-${side}`}
      sx={SHEET_SX}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <Box sx={{ flex: 'none', padding: '8px 12px', borderBottom: `1px solid ${componentTheme.borderMuted}`, background: componentTheme.bgSubtle }}>
        <Box
          component="input"
          autoFocus
          value={filter}
          placeholder="Filter releases"
          aria-label="Filter releases"
          data-testid={`release-picker-filter-${side}`}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilter(e.target.value)}
          sx={{
            width: '100%',
            border: `1px solid ${componentTheme.borderDefault}`,
            borderRadius: `${componentTheme.radiusSm}px`,
            padding: '5px 9px',
            fontSize: 12,
            fontFamily: 'inherit',
            color: componentTheme.fgDefault,
            background: componentTheme.bgDefault,
            '&:focus': { outline: 'none', borderColor: componentTheme.accent, boxShadow: `0 0 0 3px ${componentTheme.accentMuted}` },
          }}
        />
      </Box>
      <Box
        role="radiogroup"
        aria-label={`Releases available for selector ${side.toUpperCase()}`}
        sx={{ flex: 1, overflow: 'auto', overscrollBehavior: 'contain' }}
      >
        {shown.length === 0 ? (
          <Box sx={{ padding: '18px 12px', fontSize: 12, color: componentTheme.fgMuted, textAlign: 'center' }}>No release matches that.</Box>
        ) : (
          shown.map((option) => {
            // Choosing what the OTHER slot holds reverses the pair. Refusing
            // it would be defensible — the same release on both ends compares
            // nothing — but the only way out is the swap control, and a reader
            // who has not noticed the gutter has nowhere to go. Swapping is
            // also what they almost certainly meant.
            //
            // Only when BOTH ends are filled. With this slot empty there is no
            // pair to reverse: the two ends are held as one ordered list, so
            // "the other slot's release, moved here" is a state that cannot be
            // expressed, and a swap would silently do nothing. That case keeps
            // the refusal, and keeps saying why.
            const takenAlone = option.id === otherId && selectedId === undefined;
            // A release whose magnitude never resolved has no diff to show
            // either — both come from the same cache — so offering it would
            // produce an empty comparison with nothing to explain it. This is
            // the refusal that remains, and it still says why.
            const unavailable = option.state === 'unavailable';
            const disabled = unavailable || takenAlone;
            return (
              <Box
                key={option.id}
                component="button"
                type="button"
                role="radio"
                aria-checked={option.id === selectedId}
                disabled={disabled}
                data-testid="release-picker-option"
                data-label={option.label}
                data-current={String(option.isCurrent)}
                data-declared={String(option.isDeclared)}
                data-state={option.state}
                data-fields={option.changedFields === undefined ? '' : String(option.changedFields)}
                title={
                  unavailable
                    ? `${option.label} could not be loaded`
                    : takenAlone
                      ? `${option.label} is already in the other selector`
                      : option.id === selectedId
                        ? `Clear selector ${side.toUpperCase()}`
                        : undefined
                }
                onClick={() => onPick(side, option.id)}
                sx={OPTION_SX}
              >
                <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, width: '100%' }}>
                  <Box component="span" sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 700, color: componentTheme.fgDefault, flex: 'none' }}>{option.label}</Box>
                  {badgeFor(option)}
                  <Box component="span" sx={{ marginLeft: 'auto', fontFamily: componentTheme.fontMono, fontSize: 10, color: componentTheme.fgMuted, flex: 'none' }}>
                    {countLabel(option)}
                  </Box>
                </Box>
                {option.displayName ? (
                  <Box component="span" sx={{ marginTop: '1px', fontSize: 11.5, color: componentTheme.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {option.displayName}
                  </Box>
                ) : null}
                <Box component="span" sx={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontFamily: componentTheme.fontMono, fontSize: 10, color: componentTheme.fgMuted }}>
                  {option.stamp ? <Box component="span">{option.stamp}</Box> : null}
                  {option.age ? <Box component="span">{option.age}</Box> : null}
                  {/* Labelled as what it is. A release bundles many units, each
                      with its own revision, so this identifies the bundle and
                      not a revision of anything. */}
                  {option.bundleDigest ? <Box component="span">{`bundle ${option.bundleDigest}`}</Box> : null}
                </Box>
                {option.note ? (
                  <Box component="span" sx={{ marginTop: '2px', fontSize: 10.5, color: componentTheme.attention }}>{option.note}</Box>
                ) : null}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
});

Picker.displayName = 'Picker';

export const ReleaseSelectors = memo(({ options, selection, onSelectionChange }: ReleaseSelectorsProps): ReactElement => {
  const [open, setOpen] = useState<Side | null>(null);
  const slotsRef = useRef<HTMLDivElement | null>(null);

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const aId = selection[0];
  const bId = selection[1];
  const bOption = bId ? byId.get(bId) : undefined;

  const closeAndRestore = useCallback((side: Side) => {
    setOpen(null);
    // Focus belongs back on the control that opened the sheet, not on whatever
    // the browser falls back to when the sheet is removed.
    window.requestAnimationFrame(() => {
      slotsRef.current?.querySelector<HTMLElement>(`[data-testid="release-selector-${side}"]`)?.focus();
    });
  }, []);

  const handleToggle = useCallback((side: Side) => {
    setOpen((current) => (current === side ? null : side));
  }, []);

  const handlePick = useCallback(
    (side: Side, id: string) => {
      // Choosing what the OTHER slot holds reverses the pair, rather than
      // refusing a reader who means "these two, the other way round".
      if (selection.length === 2 && (side === 'a' ? selection[1] : selection[0]) === id) {
        onSelectionChange([selection[1], selection[0]]);
        closeAndRestore(side);
        return;
      }
      // Choosing what is already in THIS slot empties it. Without that there is
      // no way back to comparing nothing, which is the state that shows
      // unreleased work.
      const chosen = (side === 'a' ? selection[0] : selection[1]) === id ? undefined : id;
      const next = side === 'a' ? [chosen, selection[1]] : [selection[0], chosen];
      onSelectionChange(next.filter((value): value is string => Boolean(value)));
      closeAndRestore(side);
    },
    [selection, onSelectionChange, closeAndRestore],
  );

  const handleSwap = useCallback(() => {
    if (selection.length !== 2) return;
    onSelectionChange([selection[1], selection[0]]);
  }, [selection, onSelectionChange]);

  // Focus goes back to the square that replaces the chip the click removed.
  // Without this it falls to the document, and a keyboard reader who cleared B
  // is left at the top of the page.
  const handleClearB = useCallback(() => {
    onSelectionChange(selection.slice(0, 1));
    window.requestAnimationFrame(() => {
      slotsRef.current?.querySelector<HTMLElement>('[data-testid="release-selector-b"]')?.focus();
    });
  }, [selection, onSelectionChange]);

  // A's own immediate predecessor — the comparison the pane runs while B is
  // empty. `options` is newest-first, so it is the next one along. This is the
  // SAME release the owner's comparison resolves to; it is read here only to
  // name it, and the square is not what makes the diff happen.
  const predecessorOfA = useMemo(() => {
    if (!aId) return undefined;
    const i = options.findIndex((o) => o.id === aId);
    return i < 0 ? undefined : options[i + 1]?.label;
  }, [options, aId]);

  return (
    <Box ref={slotsRef} sx={SLOTS_SX} data-testid="release-selectors">
      <Slot side="a" option={aId ? byId.get(aId) : undefined} open={open === 'a'} onToggle={handleToggle} />
      <Box sx={GUTTER_SX}>
        <Box component="span" sx={GUTTER_RULE_SX} />
        <Box
          component="button"
          type="button"
          data-testid="release-selector-swap"
          aria-label="Swap the two selectors"
          disabled={selection.length !== 2}
          onClick={handleSwap}
          sx={SWAP_SX}
        >
          {SwapGlyph}
        </Box>
      </Box>
      {bOption ? (
        <Box key={bOption.id} sx={SLOT_FILLED_SX}>
          <Slot side="b" option={bOption} open={open === 'b'} onToggle={handleToggle} />
          <Box
            component="button"
            type="button"
            data-testid="release-selector-b-clear"
            aria-label="Clear selector B and compare against the previous release"
            title="Clear the comparison"
            onClick={handleClearB}
            sx={CLEAR_SLOT_SX}
          >
            {CloseGlyph}
          </Box>
        </Box>
      ) : (
        <EmptyB open={open === 'b'} predecessorLabel={predecessorOfA} onToggle={handleToggle} />
      )}
      {open ? (
        <Picker
          side={open}
          options={options}
          selectedId={open === 'a' ? aId : bId}
          otherId={open === 'a' ? bId : aId}
          onPick={handlePick}
          onClose={() => closeAndRestore(open)}
        />
      ) : null}
    </Box>
  );
});

ReleaseSelectors.displayName = 'ReleaseSelectors';
