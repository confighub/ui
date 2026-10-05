// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Altitude 0: every rollout in motion across the estate.
 *
 * Built against `7-typographic.html` in `design-mockups/change-order-promotions/`.
 * The reference is frozen; nothing here modifies it.
 *
 * ⚠️ NOTHING HERE RENDERS INVENTED DATA TO FILL A SPACE. A placeholder that
 * looks finished is indistinguishable from a finished region, and a review that
 * cannot tell them apart is worth nothing. A column the data cannot supply is
 * not rendered at all — see the Source note on `FilterBar` below.
 *
 * NOT ROUTED HERE. `RolloutsPage.tsx` owns the `/rollouts` route and decides,
 * from the slug, whether to render this list or one rollout's detail. This file
 * exports a component and takes no view on when it is on screen.
 *
 * ⚠️ THIS COMPONENT OWNS THE `h1`, AND THE MOUNTING PAGE MUST NOT RENDER A
 * SECOND "Rollouts" TITLE. At altitude 0 the console is the whole page, so the
 * heading the contract asserts (`heading1::Rollouts`) belongs here rather than
 * behind a prop or an agreement with the caller. Two `h1`s on one document is
 * the anchoring defect the contract is least able to report — each looks
 * correct in isolation — so the rule is stated here, where the heading is.
 *
 * WHAT THIS PAGE IS FOR, AND THE AFFORDANCES THAT FOLLOW FROM IT. A rollout's
 * scope is immutable: the change cannot be created or edited from this surface,
 * only advanced through stages. So there is no New, no Edit, and no field this
 * screen can write.
 *
 * NO UPPERCASE, ANYWHERE (user ruling), AND THAT IS A DEVIATION FROM THE
 * REFERENCE, NOT AN OVERSIGHT. The reference's `.thead` (`7-typographic.html:449-455`)
 * is `text-transform: uppercase` with `letter-spacing: .06em`. Both the
 * transform and the tracking come out here; the tracking was computed for
 * capitals and reads loose without them. Expect `type-vocabulary` to report the
 * new sentence-case role and `type-coverage` the abandoned uppercase one —
 * those are the deviation being visible, which is the point of the instrument.
 *
 * This theme also uppercases `caption`, `overline` and `MuiTableCell head`
 * (`ThemeProvider.tsx:193,203,756`), so those roles are avoided rather than
 * trusted. `RolloutStageStrip` renders its caption as `variant='caption'` with
 * no override, which is one of the two reasons it is used here with
 * `showCaption={false}`.
 *
 * ANCHORING IS A BUILD REQUIREMENT, NOT A TEST ARTEFACT
 * (`tools/design-fidelity/ANCHOR-REQUIREMENTS.md`). The contract binds to real
 * roles and accessible names, never to class names, so a region with no role
 * and no name is permanently unmeasurable rather than merely untested. The
 * reference's own `data-*` verbs are documentation, not assertions — none are
 * reproduced here.
 *
 * FILTERING IS BY NOT RENDERING. The reference hides filtered rows with
 * `.order.is-hidden { display: none }`. `ANCHOR-REQUIREMENTS.md` names that
 * exact shape as the anti-pattern: a control that exists but does not paint is
 * not a control. Hidden rows are absent from the DOM here.
 */

import { memo, useCallback, useEffect, useId, useMemo, useState } from 'react';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import RefreshIcon from '@mui/icons-material/Cached';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import { componentTheme } from '../x/apps/componentTheme';
import { EndRolloutDialog } from '../x/apps/rollout/EndRolloutDialog';
import { RolloutStageStrip } from '../x/apps/rollout/RolloutStageStrip';
import { actionFor, promotionFor, rolloutIntents } from '../x/apps/rollout/rolloutsConsoleModel';
import type { SegmentTone } from '../x/apps/rollout/rolloutsConsoleModel';
import type { ConsoleRow, ConsoleState } from '../x/apps/rollout/rolloutsConsoleModel';
import type { RolloutEndIntent } from '../x/apps/rollout/rolloutRollback';
import { gatesBlockPromotion } from '../x/apps/rollout/rolloutFooterModel';
import { partitionBlockingGates } from '../x/apps/rollout/rolloutGates';
import { useEndRollout } from '../x/apps/rollout/useEndRollout';
import { promoteAnnouncement, useRolloutActions } from '../x/apps/rollout/useRolloutActions';
import { changeWorkflowLabel, useChangeWorkflowNames } from './useChangeWorkflowNames';
import { rolloutsConsoleCopy } from '../x/apps/rollout/rolloutsConsoleCopy';
import { rolloutCopy, stageDisplayName } from '../x/apps/rollout/rolloutCopy';
import { LiveRegion } from '@/components/live-region/LiveRegion';
import { PromoteDialog } from './components/PromoteDialog';
import { RolloutExceptions } from './components/RolloutExceptions';
import { buildCompleteConsoleStage } from './rolloutCompleteStep';
import { useRolloutConsole, type RolloutConsoleData } from './useRolloutConsole';

/**
 * THE CONSOLE'S OWN TOKENS, TAKEN FROM `tools/design-fidelity/contract.json`.
 *
 * Local, not shared, and that is the whole point. `componentTheme` is read by
 * the Component view as well, so correcting its values here would restyle
 * screens outside this task. These shadow it for this page only.
 *
 * ⚠️ EVERY VALUE IS THE CONTRACT'S, NOT AN EYEBALLED MATCH. The reference's
 * designer refused to copy `#8e9aaa` out of the product on the grounds that
 * "copying a colour I had already established as unreadable would be fidelity
 * to the bug", so the contract holds a CORRECTION rather than a variant. Read
 * a value from the contract before changing one here.
 *
 * The worst offender was `fgSubtle` — `#8e9aaa` on white is **2.86:1**, under
 * the 4.5 floor, and it was carrying ten roles on this page: the space slug,
 * the age, the stage key, the column heads and the freshness line. Every piece
 * of secondary information on the screen was the least readable thing on it.
 * `#646b78` is the contract's answer at 5.36:1 on white and 5.09:1 on sunk.
 */
const T = {
  /** #191d23, 16.92:1 on white. Not `#111214` — the design contains no pure-black-adjacent ink. */
  ink: '#191d23',
  /** #4b5361, 7.75:1. Prose and secondary text. */
  ink2: '#4b5361',
  /** #646b78, 5.36:1 on white / 5.09:1 on sunk. Meta, labels, the quiet half of a two-ended line. */
  ink3: '#646b78',
  onEmphasis: '#ffffff',

  surface: '#ffffff',
  /** Not a row: column head and footer. */
  surfaceSunk: '#f8f9fb',
  /** Row and control hover. Distinct from `surfaceSunk`, which means "not a row". */
  surfaceHover: '#f2f5fa',

  /** Every internal rule and card border. */
  line: '#e2e5ea',
  /** Control borders. */
  lineStrong: '#cdd2da',
  /** The ring on a stage not yet reached. */
  idleLine: '#d3d8df',
  idleSoft: '#eef0f3',

  /** The ONLY accent: selection and primary action. */
  accent: '#2f5fd0',
  /** The text-on-white and hover value of the accent. */
  accentInk: '#234ba6',
  accentSoft: '#eaf0fd',

  ok: '#1c7a4c',
  wait: '#8a6100',
  waitSoft: '#fbf1dc',
  bad: '#ad2b2b',
  badSoft: '#fbeaea',
  badLine: '#eec5c5',

  shadow: '0 1px 2px rgba(25,29,35,.05), 0 1px 1px rgba(25,29,35,.04)',

  /**
   * ⚠️ DELIBERATELY NOT THE CONTRACT'S FAMILIES, and the one place this file
   * knowingly departs from a measured value.
   *
   * The reference declares `"Segoe UI", system-ui, …` and `ui-monospace, …`.
   * Those are a mockup author's system stacks, not a decision about the
   * product: ConfigHub's face is Manrope and every other screen uses it.
   * Adopting the reference's stack would make this the only page in the product
   * set in a different typeface — a brand change smuggled in as a fidelity fix.
   *
   * Expect `type-vocabulary` and `font-rendering` findings on the family field
   * of every role here. That is the deviation being visible, which is what the
   * instrument is for. It is a decision for the user, not for this file.
   */
  sans: componentTheme.fontSans,
  mono: componentTheme.fontMono,

  /**
   * The contract never renders `line-height: normal`. Its ramp is 1.25 / 1.35 /
   * 1.45 / 1.55, and 1.45 carries almost everything, so leaving it unset — which
   * is what `normal` means — is the single most repeated type defect available.
   *
   * ⚠️ LETTER-SPACING IS NOT THE SAME CASE, THOUGH IT LOOKS LIKE IT. The
   * contract stores `0px` and Chrome reports `normal` for the same declaration,
   * so the two READ as drift and are not. `probe.mjs:224` maps `normal` to
   * `0px` before comparing. Do not "fix" it: setting `letterSpacing: 0` changes
   * no pixel and no measurement, and leaves a comment claiming a correction
   * that never happened.
   */
  lh: 1.45,
} as const;

/**
 * The row grid, shared by the column head and every row so the two cannot drift
 * apart. This is the reference's own template, verbatim
 * (`7-typographic.html`, `.grid`), and it is a member of the contract's closed
 * `grid-columns-vocabulary`, so it is not a value to round off.
 *
 * ⚠️ NO BARE `auto` OR CONTENT-SIZED TRACK. Each row is its OWN grid — they
 * share this string, not a grid container — so a track sized from content
 * resolves to THAT row's width, not one shared across rows, drifting every row
 * out of alignment with the header.
 *
 * ⚠️ The breakpoints are the reference's, and they are NOT this theme's `sm`
 * (1280) and `md` (1715). Columns drop, they never wrap. Age drops before the
 * blocker, because the blocker is the whole point of a status-by-exception list
 * and was once invisible at 1500px.
 */
const GRID = {
  gap: '0 14px',
  padding: '0 14px',
  display: 'grid',
  alignItems: 'center',
  gridTemplateColumns: 'minmax(190px, 1.5fr) 198px minmax(190px, 1.4fr) 56px 186px',
  '@media (max-width: 1150px)': {
    gridTemplateColumns: 'minmax(170px, 1.4fr) 180px minmax(180px, 1.3fr) 168px',
  },
  '@media (max-width: 860px)': {
    gridTemplateColumns: 'minmax(150px, 1.4fr) 170px minmax(160px, 1.3fr)',
  },
} as const;

/** Hidden at the same widths the grid stops reserving a track for them. */
const HIDE_AGE = { '@media (max-width: 1150px)': { display: 'none' } } as const;
const HIDE_ACTION = { '@media (max-width: 860px)': { display: 'none' } } as const;

/**
 * The reference's radii, by name. `componentTheme.radiusSm` is 5px and
 * `radiusMd` 9px; the contract's closed `radius-vocabulary` holds neither 5px
 * nor the 4px that MUI's `borderRadius: 0.5` resolves to. These three are
 * members of it.
 */
const R_MICRO = '3px';
const R_CONTROL = '8px';
const R_SURFACE = '10px';

/**
 * The strip's segment tones, re-hued for this page.
 *
 * `RolloutStageStrip` accepts this override precisely so a second strip does not
 * have to be written — its documented "re-skin without re-implementing" prop.
 * Two of its defaults do not match the reference and are corrected here:
 *
 *  - `progressing` is a WARNING-hued stripe by default; the reference's
 *    `.seg.promoting` is an ACCENT-hued stripe. Warning reads as a problem, and
 *    a promotion running normally is not one.
 *  - every default radius resolves to 4px, which is not in the vocabulary.
 *
 * `degraded` maps to the reference's `.seg.bad`, and `gated` to its unclassed
 * default. The reference has no separate degraded treatment; flat danger is the
 * closest member of its own set rather than a new one invented here.
 */
const SEGMENT_TONES: Record<SegmentTone, SxProps<Theme>> = {
  done: { bgcolor: T.ok, borderRadius: R_MICRO, boxShadow: 'none' },
  ready: {
    bgcolor: T.accentSoft,
    borderRadius: R_MICRO,
    boxShadow: `inset 0 0 0 1.5px ${T.accent}`,
  },
  progressing: {
    borderRadius: R_MICRO,
    backgroundImage: `repeating-linear-gradient(115deg, ${T.accentSoft} 0 4px, ${T.accentInk} 4px 8px)`,
    boxShadow: `inset 0 0 0 1.5px ${T.accent}`,
    animation: 'rollout-seg-live 1.6s ease-in-out infinite',
    '@keyframes rollout-seg-live': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
    '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
  },
  degraded: { bgcolor: T.bad, borderRadius: R_MICRO, boxShadow: 'none' },
  // The outline of `done` without its fill: the change landed here, and the
  // green nobody earned is withheld rather than drawn.
  unverified: {
    bgcolor: 'transparent',
    borderRadius: R_MICRO,
    boxShadow: `inset 0 0 0 1.5px ${T.ok}`,
  },
  blocked: {
    bgcolor: T.waitSoft,
    borderRadius: R_MICRO,
    boxShadow: `inset 0 0 0 1.5px ${T.wait}`,
  },
  gated: {
    bgcolor: T.idleSoft,
    borderRadius: R_MICRO,
    boxShadow: `inset 0 0 0 1px ${T.lineStrong}`,
  },
  // Flat and solid, unlike `gated`'s pale outline — a stage the change was
  // taken back out of is not "not yet reached", and should not read as one.
  restored: { bgcolor: T.lineStrong, borderRadius: R_MICRO, boxShadow: 'none' },
};

/**
 * The ink for the blocker cell's leading mark.
 *
 * ⚠️ THE MARK IS THE ONLY THING THAT TAKES THE STATE'S HUE. The reference sets
 * `.blk.ok svg`, `.blk.bad svg` and so on, and leaves `.blk .txt` at `--ink-2`
 * in every state. Tinting the sentence too would spend a second channel saying
 * what the first already said, and would drag a body-text colour pair into the
 * contrast floor for no added meaning.
 */
const STATE_INK: Record<ConsoleState, string> = {
  ready: T.accent,
  degraded: T.bad,
  blocked: T.wait,
  held: T.wait,
  progressing: T.accent,
  complete: T.ok,
  // Deliberately not the green of `complete`, and deliberately not a warning
  // hue either. Nothing is wrong; something simply went unread.
  'complete-unverified': T.ink3,
  aborted: T.ink3,
  'no-workflow': T.wait,
  'no-stages': T.wait,
  unknown: T.ink3,
};

/**
 * `RolloutExceptions`' whole appearance, in this page's own tokens: `tones`
 * (the figure's colour), `numSx` (the figure's own type), `labelSx`, `hintSx`,
 * `cardSx` and `activeCardSx`. The component owns the strip's shape and
 * behaviour and holds no palette of its own, so all six are stated here — the
 * page that shows the strip is the page that decides how it reads.
 */
const KPI_TONES: Record<ConsoleState, string> = STATE_INK;
/** The contract's own figure type: `ui-monospace | 18px | 650 | 1 | -0.36px`. */
const KPI_NUM_SX = {
  fontFamily: T.mono,
  fontSize: '18px',
  fontWeight: 650,
  lineHeight: 1,
  letterSpacing: '-0.36px',
} as const;
const KPI_LABEL_SX = { fontFamily: T.sans, fontSize: '12.5px', lineHeight: T.lh, color: T.ink } as const;
/**
 * `textTransform: 'none'` is the one override this file exists to make: the
 * component's own hint line is `variant='caption'`, which this theme
 * uppercases globally, and the ruling against uppercase applies here. The
 * reduced tracking matches every other place this file removes the same
 * transform — `.07em` was sized for capitals and reads loose without them.
 */
const KPI_HINT_SX = {
  fontFamily: T.sans,
  fontSize: '11.5px',
  lineHeight: T.lh,
  color: T.ink3,
  textTransform: 'none',
  letterSpacing: '.02em',
} as const;
/**
 * ⚠️ `opacity: 1` HERE IS NOT A NO-OP — it is overriding the component's own
 * `opacity: isDisabled ? 0.5 : 1` (R11: de-emphasis is a chosen colour, never
 * an opacity composite). Measured, not assumed: without this line the sweep
 * found five faded text elements — every zero-count chip. `cardSx` is layered
 * on top of the base rules by the component's own design (its header says
 * so), which is exactly the mechanism this uses; nothing in
 * `RolloutExceptions.tsx` was touched.
 *
 * The visual distinction survives losing the opacity: the component already
 * sends a disabled chip's count and label to `text.disabled` (a real colour,
 * not a composite) — only the hint line stops dimming further, which costs
 * nothing a reader needs, since the count and label already say "empty".
 */
const KPI_CARD_SX = {
  border: `1px solid ${T.line}`,
  borderRadius: R_CONTROL,
  background: T.surface,
  padding: '9px 13px 9px 11px',
  opacity: 1,
} as const;
const KPI_ACTIVE_CARD_SX = {
  borderColor: T.accent,
  background: T.accentSoft,
  boxShadow: `inset 0 0 0 1px ${T.accent}`,
} as const;

/** `"needs a Release"` -> `"Needs a Release"`. The copy module writes hints as fragments; this is the only place they are read as sentences. */
function sentenceCase(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A short label, not a clipped sentence — cut at the last whole word inside
 * `max`, never mid-word.
 *
 * ⚠️ THE CSS ELLIPSIS ON THE DETAIL LINE TRUNCATES THE PIXELS, NOT THE
 * CHARACTERS. `text-overflow: ellipsis` hides overflow visually; the full
 * sentence is still every one of its own characters in the DOM, so a reader
 * using a browser's own "find in page", copy, or any tool that reads
 * `textContent` — including a structural fidelity probe — sees the whole
 * paragraph regardless of what is painted. Cutting the STRING here, not just
 * its rendering, is what makes "a short label" actually true rather than
 * only true to the eye. The full sentence survives as the `title` tooltip.
 */
function truncateWords(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Coarse on purpose: an exact duration on a list row is noise, not information. */
function ageFrom(createdAt: string | undefined, now: number): string {
  if (createdAt === undefined) return '';
  const then = Date.parse(createdAt);
  if (Number.isNaN(then)) return '';
  return elapsed(now - then);
}

function elapsed(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** `Updated 4m ago`. The number is the message; there is no sentence around it. */
function freshnessFrom(lastLoadedAt: number | null, now: number): string {
  if (lastLoadedAt === null) return '';
  const ms = now - lastLoadedAt;
  return ms < 60000 ? 'Updated just now' : `Updated ${elapsed(ms)} ago`;
}

/**
 * The two faces, and the rule that decides between them.
 *
 * The reference states it outright: "Mono is a literal the system produced: a
 * field path, a value, a variant slug, a stage key, a count. The text face is
 * the interface talking about one." Slug, stage key and age are mono here for
 * that reason and no other.
 */

/** A control's chrome, shared so `Refresh` and a row action cannot drift apart. */
function controlSx(variant: 'primary' | 'quiet', enabled: boolean): SxProps<Theme> {
  return {
    all: 'unset',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    padding: '0 11px',
    fontFamily: T.sans,
    fontSize: 12.5,
    lineHeight: T.lh,
    fontWeight: 600,
    borderRadius: R_CONTROL,
    border: '1px solid',
    cursor: enabled ? 'pointer' : 'not-allowed',
    /*
     * ⚠️ DISABLED IS A CHOSEN COLOUR, NEVER `opacity` (R11).
     *
     * An opacity composite produces a value nobody picked and no vocabulary
     * check can see: the token says `#2f5fd0`, the screen shows whatever 0.55
     * of it over whatever happens to be behind it comes to. That mechanism is
     * behind the reference's four worst below-AA pairs — the ratio is never
     * wrong on purpose, it is simply never anybody's decision.
     *
     * The disabled TEXT is measured, not assumed: `#646b78` on white is
     * **5.36:1**, clearing the 4.5 floor.
     *
     * ⚠️ THE BORDER IS NOT AT THE 3:1 TIER AND THIS COMMENT ORIGINALLY CLAIMED
     * IT WAS. `#cdd2da` on white measures **1.52:1**. It is the reference's own
     * `--line-strong`, carried deliberately and used on every quiet control
     * here, enabled ones included — so it is a property of the contract rather
     * than of this button, and WCAG exempts a disabled control's boundary in
     * any case. The ENABLED controls using it are not exempt; recorded as a
     * finding against the palette rather than patched locally, which would
     * leave this one button inconsistent with every other.
     *
     * Left as a warning about the shape: I wrote the ratio into the comment
     * before measuring it, in the same edit that removed an opacity for being
     * a value nobody had checked.
     */
    ...(!enabled
      ? { background: T.surface, color: T.ink3, borderColor: T.lineStrong }
      : variant === 'primary'
        ? {
            background: T.accent,
            color: T.onEmphasis,
            borderColor: T.accentInk,
            '&:hover': { background: T.accentInk },
          }
        : {
            background: T.surface,
            color: T.ink,
            borderColor: T.lineStrong,
            '&:hover': { background: T.surfaceSunk },
          }),
    '&:focus-visible': {
      outline: `2px solid ${T.accent}`,
      outlineOffset: 2,
      borderRadius: R_MICRO,
    },
  };
}

export interface RolloutsConsoleProps {
  /**
   * Injected by tests and by any caller that already holds the data. Omitted in
   * the app, where the component reads it itself.
   */
  data?: RolloutConsoleData;
  /**
   * Opens one rollout. Absent leaves the control rendered and disabled rather
   * than hidden: the affordance exists in this design, and hiding it would
   * misreport the screen as one that never offers it.
   */
  onOpenRollout?: (row: ConsoleRow) => void;
  /**
   * Hands this console's announcement to a page that already owns a live region.
   *
   * ⚠️ ONE `role="status"` PER PAGE. Mounted inside `RolloutsPage`, which
   * renders `#announce`, a region of our own makes TWO polite regions live at
   * once on `/rollouts` — they can double-announce one event, and a screen
   * reader has no way to tell they are one surface.
   *
   * Pass this and the console renders no region, handing the sentence up
   * instead. Omit it — standalone, or in a test — and it provides its own, so
   * the announcements are never silently lost either way.
   *
   * A portal into `#announce` would have been the obvious fix and is the wrong
   * one: that node belongs to another React tree, and two trees rendering into
   * one element is a different bug from the one being fixed.
   */
  onAnnounce?: (message: string) => void;
}

const ConsoleRowLine = memo(function ConsoleRowLine({
  row,
  workflowLabel,
  now,
  onOpenRollout,
  onPromoteRollout,
  onEndRequest,
}: {
  row: ConsoleRow;
  /**
   * What to call the workflow governing this rollout. Resolved by the caller
   * from the live entity: the copy a rollout carries has no name of its own.
   */
  workflowLabel: string;
  now: number;
  onOpenRollout?: (row: ConsoleRow) => void;
  onPromoteRollout?: (row: ConsoleRow) => void;
  onEndRequest?: (intent: RolloutEndIntent, row: ConsoleRow) => void;
}) {
  const action = actionFor(row);
  const actionHandler = action.label === 'Promote' ? onPromoteRollout : onOpenRollout;
  const state = rolloutsConsoleCopy.states[row.state];

  const openRollout = useCallback(() => onOpenRollout?.(row), [onOpenRollout, row]);
  const runAction = useCallback(() => actionHandler?.(row), [actionHandler, row]);

  /*
   * The two ways to END this rollout, on the rule every other surface reads.
   * `rolloutIntents` decides which of them this row may offer; nothing here
   * adds a condition of its own, so the same ChangeOrder cannot offer Roll back
   * in this list and withhold it on the detail page one click away.
   */
  const intents = rolloutIntents(row);
  const offersEnd = intents.rollBack || intents.abort;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const requestEnd = useCallback(
    (intent: RolloutEndIntent) => {
      setMenuAnchor(null);
      onEndRequest?.(intent, row);
    },
    [onEndRequest, row],
  );

  /*
   * The row is a container with a button's role, not a `<button>`, and the
   * reference says why in its own source: "The console row is a container, not
   * a button, because it holds a real button of its own." A `<button>` inside a
   * `<button>` is invalid and assistive technology resolves it inconsistently.
   *
   * So the row carries its own keyboard contract, and it fires only when the
   * row ITSELF has focus — never when the event bubbled up from the action
   * button inside it, which would run two different actions from one keypress.
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      openRollout();
    },
    [openRollout],
  );

  // The next stage is never the source row, so it is always a real one and is named by the workflow's own word for it.
  const stageKey = row.nextStageId === null ? '' : stageDisplayName(row.nextStageId, false);

  return (
    <Box
      role="button"
      tabIndex={0}
      data-rollout-slug={row.slug}
      onClick={openRollout}
      onKeyDown={onKeyDown}
      /*
       * Short and distinguishing. The reference names each row by its own
       * contents — 136 to 176 characters — which is why its rows were dropped
       * from the contract's own control inventory as fixture data. A name is
       * how the row is addressed, not a summary of it.
       */
      aria-label={`Open rollout ${row.slug}`}
      sx={{
        ...GRID,
        paddingTop: '11px',
        paddingBottom: '11px',
        borderBottom: `1px solid ${T.line}`,
        background: 'transparent',
        textAlign: 'left',
        cursor: onOpenRollout === undefined ? 'default' : 'pointer',
        transition: 'background .1s ease',
        '&:hover': { background: T.surfaceSunk },
        '&:focus-visible': {
          outline: `2px solid ${T.accent}`,
          outlineOffset: -2,
          borderRadius: R_MICRO,
        },
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          component="span"
          sx={{
            display: 'block',
            fontFamily: T.mono,
            fontSize: 13.5,
            lineHeight: T.lh,
            fontWeight: 600,
            letterSpacing: '-.01em',
            color: T.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {row.slug}
        </Typography>
        <Typography
          component="span"
          sx={{
            display: 'block',
            fontSize: 11.5,
            lineHeight: T.lh,
            marginTop: '2px',
            color: T.ink3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          data-workflow-id={row.changeWorkflowId ?? ''}
        >
          {row.spaceSlug ?? ''}
          {' · '}
          {workflowLabel}
        </Typography>
      </Box>

      <Stack
        sx={{
          minWidth: 0,
          gap: '5px',
          /*
           * `showCaption={false}` does NOT suppress every caption the strip can
           * render. When it can build no sequence at all it returns EARLY with
           * its own `variant='caption'` line (`RolloutStageStrip.tsx:113-119`),
           * before the prop is ever consulted — and this theme uppercases that
           * role, so a scope-unavailable row printed "NOT REPORTED".
           *
           * Found by reading the rendered page, not the component: the prop
           * says the caption is off and the file says so too. Only the render
           * says there are two of them. The strip is now withheld entirely when
           * it has no segments to draw, so that line no longer renders — this
           * override stays as the guard, because the next person to relax the
           * condition above should not reintroduce a shouting cell.
           */
          '& .MuiTypography-caption': { textTransform: 'none', letterSpacing: 0, fontSize: 11.5, lineHeight: T.lh },
        }}
      >
        {/*
          `showCaption={false}`, for two reasons that both bite. The strip's
          caption is `variant='caption'`, which this theme uppercases; and it
          prints `nextStageId` raw, so a base Space with no `Stage` label would
          put the synthetic `__rollout_source__` (`rolloutStages.ts:273`) in
          front of a user. The segments — the part worth reusing — are untouched.
        */}
        {/*
          ⚠️ NO STRIP FOR A ROLLOUT WITH NOWHERE TO GO. Its only stage is the
          SOURCE, whose tone is `done`, and one segment on `flex: 1` fills the
          whole cell — so a rollout that has travelled nothing rendered as an
          unbroken green bar, which is what a fully-promoted one looks like.

          That is precisely the confusion `no-stages` exists to prevent: the
          reducer was fixed so this could not be counted as Complete, and the
          strip put it back at the only place a reader actually looks. Caught in
          the render, and invisible in the props.
        */}
        {/*
          ONE SEGMENT LONGER THAN THE SEQUENCE, DELIBERATELY. The trailing
          segment is the ChangeWorkflow's `Final` completion checklist — not a
          stage, and so not in `row.stages` — appended here rather than inside
          the strip, which takes a plain `ConsoleStage[]` and knows nothing of a
          workflow's `Final`.

          `stagesDone`/`stagesTotal` are passed through UNCHANGED: they
          already count every segment drawn here, the source and the
          Complete step included (`stagePathProgress`).
        */}
        {row.stages.length > 0 && row.state !== 'no-stages' && (
          <RolloutStageStrip
            stages={[...row.stages, buildCompleteConsoleStage(row)]}
            stagesDone={row.stagesDone}
            stagesTotal={row.stagesTotal}
            nextStageId={row.nextStageId}
            progressUnavailable={row.progressUnavailable}
            showCaption={false}
            tones={SEGMENT_TONES}
          />
        )}
        {/*
          The reference's `.strip .at`: a two-ended line, state name left and
          stage key right. This is where the row says what state it is in —
          there is no status chip in this design, deliberately. At eight states a
          row of filled pills is the loudest thing on a page whose whole argument
          is that only some rows need attention.
        */}
        <Stack
          direction="row"
          justifyContent="space-between"
          data-rollout-state={row.state}
          sx={{ gap: '8px', fontFamily: T.mono, fontSize: 11.5, lineHeight: T.lh, letterSpacing: '-.01em', minWidth: 0 }}
        >
          <Typography
            component="b"
            sx={{ fontFamily: T.mono, fontSize: 11.5, lineHeight: T.lh, fontWeight: 600, color: T.ink2, whiteSpace: 'nowrap' }}
          >
            {state.label}
          </Typography>
          <Typography
            component="span"
            sx={{
              fontFamily: T.mono,
              fontSize: 11.5,
              lineHeight: T.lh,
              color: T.ink3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stageKey}
          </Typography>
        </Stack>
      </Stack>

      {/*
        Icon + short headline + one line of detail, not a wrapped paragraph.
        The headline is `state.hint` — already in `rolloutsConsoleCopy`, a
        fragment written for exactly this ("waiting on you", "needs a
        Release") — so no new copy is invented here. `row.blocker`, the
        model's own full sentence, becomes the ONE-LINE supporting detail: it
        still carries every word, but truncates instead of wrapping, and the
        full sentence is still reachable as a native tooltip. A row's height
        can no longer vary with how much its blocker has to say.
      */}
      <Stack direction="row" sx={{ gap: '7px', minWidth: 0, alignItems: 'flex-start' }}>
        <Box
          aria-hidden="true"
          sx={{
            flex: 'none',
            marginTop: '6px',
            width: 6,
            height: 6,
            borderRadius: '999px',
            background: STATE_INK[row.state],
          }}
        />
        <Stack sx={{ minWidth: 0, gap: '1px' }}>
          <Typography component="b" sx={{ fontSize: 12.5, lineHeight: T.lh, fontWeight: 600, color: T.ink }}>
            {sentenceCase(state.hint)}
          </Typography>
          <Typography
            data-testid="rollout-blocker"
            title={row.blocker}
            sx={{
              fontSize: 11.5,
              lineHeight: T.lh,
              color: T.ink2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {truncateWords(row.blocker, 64)}
          </Typography>
        </Stack>
      </Stack>

      <Typography
        sx={{
          ...HIDE_AGE,
          fontFamily: T.mono,
          fontSize: 12.5,
          lineHeight: T.lh,
          color: T.ink3,
          textAlign: 'right',
          whiteSpace: 'nowrap',
        }}
      >
        {ageFrom(row.createdAt, now)}
      </Typography>

      {/*
        The row's own controls: what to do NEXT, and how to end it.

        ⚠️ BOTH GO WITH THIS CELL BELOW 860px, which is the column's existing
        rule and not an oversight. The row still opens, and the detail page it
        opens offers the same two end controls — so the narrow layout withholds
        a shortcut, never the only route to an action.
      */}
      <Box sx={{ ...HIDE_ACTION, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
        <Box
          component="button"
          type="button"
          onClick={(event: React.MouseEvent) => {
            // The row navigates on click. Without this the action would open the
            // dialog and navigate away from it in the same gesture.
            event.stopPropagation();
            runAction();
          }}
          disabled={actionHandler === undefined}
          sx={controlSx(action.primary ? 'primary' : 'quiet', actionHandler !== undefined)}
        >
          {action.label}
        </Box>
        {/*
          A MENU, NOT TWO MORE PILLS. This row navigates on click, and a bare
          destructive control repeated down a fleet-length list is a misclick
          away from taking a change back out of production. `MoreVertIcon` row
          menus are this codebase's existing shape for that (`SpacesCard.tsx`,
          `InitiativeKanbanCard.tsx`), and it is the shape the rollouts list
          carried before this console replaced it.

          Withheld entirely when the row offers neither intent: a menu that
          opens onto nothing is not an affordance, it is a dead end with a
          hover state. The cell keeps its track either way, so rows stay
          aligned with the head.
        */}
        {offersEnd && onEndRequest !== undefined ? (
          <>
            <IconButton
              size="small"
              data-testid="rollout-row-menu"
              aria-label={`Rollout actions for ${row.slug}`}
              aria-haspopup="true"
              aria-expanded={menuAnchor !== null ? 'true' : undefined}
              onClick={(event: React.MouseEvent<HTMLElement>) => {
                // Same reason as the action button above: the row navigates.
                event.stopPropagation();
                setMenuAnchor(event.currentTarget);
              }}
              sx={{ color: T.ink3, padding: '3px', borderRadius: R_MICRO }}
            >
              <MoreVertIcon sx={{ fontSize: 17 }} />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={menuAnchor !== null}
              onClose={closeMenu}
              onClick={(event) => event.stopPropagation()}
            >
              {/*
                Roll back first and marked destructive: it is the one that
                MOVES something. "Abort" decides and writes into no Space, so it
                carries no danger colour — the difference has to be legible
                before the dialog opens, not only inside it.
              */}
              {intents.rollBack ? (
                <MenuItem
                  data-testid="rollout-row-rollback"
                  sx={{ color: T.bad, textTransform: 'none' }}
                  onClick={() => requestEnd('roll-back')}
                >
                  {rolloutCopy.endRollout.rollBackLabel}
                </MenuItem>
              ) : null}
              {intents.abort ? (
                <MenuItem
                  data-testid="rollout-row-abort"
                  sx={{ textTransform: 'none' }}
                  onClick={() => requestEnd('abort')}
                >
                  {rolloutCopy.endRollout.abortLabel}
                </MenuItem>
              ) : null}
            </Menu>
          </>
        ) : null}
      </Box>
    </Box>
  );
});

/** A control's own label, paired to its `<select>`/`<input>` by `htmlFor`, never by placement alone. */
function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      sx={{ fontSize: 11.5, lineHeight: T.lh, fontWeight: 600, color: T.ink3, whiteSpace: 'nowrap' }}
    >
      {children}
    </Typography>
  );
}

const SELECT_SX: SxProps<Theme> = {
  height: 30,
  fontFamily: T.sans,
  fontSize: 13,
  lineHeight: T.lh,
  color: T.ink,
  background: T.surface,
  border: `1px solid ${T.lineStrong}`,
  borderRadius: R_CONTROL,
  padding: '0 8px',
  '&:focus-visible': { outline: `2px solid ${T.accent}`, outlineOffset: 1 },
};

/**
 * Search, Space, Clear — the console's own filter bar.
 *
 * ⚠️ NO SOURCE CONTROL, AND THAT IS A DECISION ALREADY MADE, NOT A GAP. The
 * reference renders a Source select (GitHub release / CI pipeline) beside a
 * Source column; `ChangeOrder` has no such field, so NEITHER is here. Rendering
 * a Source dropdown with one disabled option, or a column whose every cell is
 * empty, would be the "present but not painted" anti-pattern
 * (`ANCHOR-REQUIREMENTS.md`) in a new shape: something that exists and cannot
 * do anything. If `ChangeOrder` ever reports an origin, both come back together.
 *
 * ⚠️ NO STATE CONTROL EITHER, AND THAT IS ALSO DECIDED, NOT A GAP. The KPI
 * strip above (`RolloutExceptions`) already IS the State filter — each card's
 * `onSelect` writes the same `stateFilter` a dropdown here would duplicate.
 * A second control driving the same value is not a second way to filter, it
 * is two places a reader has to check to find out what is currently applied.
 *
 * ⚠️ "SPACE", NOT THE REFERENCE'S "COMPONENT". A rollout scopes to Spaces, not
 * to the reference's fixture-only `checkout-api` style groupings, and
 * `rolloutsConsoleCopy.filters.space` already settled this translation —
 * consistent with "ChangeOrder" becoming "Rollout" elsewhere in this file.
 * `spaceSlugs` is data the hook already computed for exactly this control; no
 * second derivation is added here.
 */
function FilterBar({
  search,
  onSearch,
  spaceFilter,
  onSpaceFilter,
  spaceSlugs,
  onClear,
  clearDisabled,
}: {
  search: string;
  onSearch: (v: string) => void;
  spaceFilter: 'all' | string;
  onSpaceFilter: (v: 'all' | string) => void;
  spaceSlugs: readonly string[];
  onClear: () => void;
  clearDisabled: boolean;
}) {
  const spaceId = useId();
  return (
    <Stack
      direction="row"
      alignItems="center"
      flexWrap="wrap"
      sx={{
        gap: '8px',
        padding: '10px 12px',
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderBottom: 'none',
        borderRadius: `${R_SURFACE} ${R_SURFACE} 0 0`,
      }}
    >
      {/*
        `type="search"` maps to `role="searchbox"` on its own — no `role`
        attribute needed, and one fewer place for the DOM and the accessibility
        tree to disagree.
      */}
      <Box
        component="input"
        type="search"
        value={search}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearch(e.target.value)}
        placeholder={rolloutsConsoleCopy.filters.searchPlaceholder}
        aria-label={rolloutsConsoleCopy.filters.searchPlaceholder}
        sx={{ ...SELECT_SX, width: 220, '&::placeholder': { color: T.ink3 } }}
      />

      <Stack direction="row" alignItems="center" sx={{ gap: '6px' }}>
        <FieldLabel htmlFor={spaceId}>{rolloutsConsoleCopy.filters.space}</FieldLabel>
        <Box
          component="select"
          id={spaceId}
          value={spaceFilter}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onSpaceFilter(e.target.value)}
          sx={SELECT_SX}
        >
          <option value="all">{rolloutsConsoleCopy.filters.allSpaces}</option>
          {spaceSlugs.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </Box>
      </Stack>

      <Box
        component="button"
        type="button"
        onClick={onClear}
        disabled={clearDisabled}
        sx={controlSx('quiet', !clearDisabled)}
      >
        {rolloutsConsoleCopy.filters.clear}
      </Box>
    </Stack>
  );
}

/**
 * The strip's own vocabulary, said once in words rather than left to be
 * inferred from five shades of the same six-by-seven-pixel bar.
 *
 * `aria-hidden`: every fact it states is already carried by
 * `data-rollout-state` and `RolloutStageStrip`'s own segment `title`s. This is
 * a sighted-reader convenience, not a second source of the information.
 *
 * `aria-label="Legend"` alongside the hide is not a contradiction to fix:
 * `aria-hidden` already removes the whole thing from anything an AT will ever
 * read, so the label reaches no one — it exists purely as a plain-DOM anchor
 * a structural probe can find, exactly like this file's other `data-*` hooks.
 */
const LEGEND: { tone: SegmentTone; label: string }[] = [
  { tone: 'done', label: 'Stage complete' },
  { tone: 'unverified', label: 'Landed, health unchecked' },
  { tone: 'ready', label: 'Ready to promote' },
  { tone: 'progressing', label: 'Promoting' },
  { tone: 'blocked', label: 'Held for a Release' },
  { tone: 'degraded', label: 'Degraded' },
  { tone: 'gated', label: 'Not yet reached' },
];

function Legend() {
  return (
    <Stack
      direction="row"
      aria-hidden="true"
      aria-label="Legend"
      flexWrap="wrap"
      sx={{
        gap: '13px',
        padding: '7px 12px',
        background: T.surfaceSunk,
        border: `1px solid ${T.line}`,
        borderBottom: 'none',
      }}
    >
      {LEGEND.map(({ tone, label }) => (
        <Stack key={tone} direction="row" alignItems="center" sx={{ gap: '6px' }}>
          <Box sx={{ width: 16, height: 6, ...SEGMENT_TONES[tone] }} />
          <Typography component="span" sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink2 }}>
            {label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Column labels. Sentence case, and `Rollout` rather than the reference's
 * `ChangeOrder`: the reader is looking at the promotion, not at the record the
 * API keeps of it.
 */
const COLUMNS = [
  { key: 'name', label: rolloutsConsoleCopy.columns.name, sx: {} },
  { key: 'stages', label: rolloutsConsoleCopy.columns.stages, sx: {} },
  { key: 'blocker', label: rolloutsConsoleCopy.columns.blocker, sx: {} },
  { key: 'age', label: rolloutsConsoleCopy.columns.age, sx: { ...HIDE_AGE, textAlign: 'right' } },
  { key: 'action', label: 'Next action', sx: { ...HIDE_ACTION, textAlign: 'right' } },
] as const;

function ColumnHead() {
  return (
    <Box
      role="row"
      sx={{
        ...GRID,
        height: 33,
        borderBottom: `1px solid ${T.line}`,
        background: T.surfaceSunk,
      }}
    >
      {COLUMNS.map((column) => (
        <Typography
          key={column.key}
          component="span"
          sx={{
            fontSize: 11.5,
            lineHeight: T.lh,
            fontWeight: 700,
            // The reference sets `.06em` here to open up capitals. Without the
            // capitals that tracking reads loose, so it comes down with them.
            letterSpacing: '.02em',
            textTransform: 'none',
            color: T.ink3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            ...column.sx,
          }}
        >
          {column.label}
        </Typography>
      ))}
    </Box>
  );
}

/**
 * The console, rendering data it is given.
 *
 * Split from the fetching wrapper below because a component that reads a store
 * cannot be rendered without one. This half needs no provider, no store and no
 * network, so a fixture can drive it — which is the difference between checking
 * the render and checking a copy of the render.
 */
export function RolloutsConsoleView({
  data,
  onOpenRollout,
  onPromoteRollout,
  onEndRequest,
  onAnnounce,
}: RolloutsConsoleProps & {
  data: RolloutConsoleData;
  /**
   * Opens the promote confirmation for one row. Supplied by the fetching
   * wrapper below; absent leaves the row's action rendered and disabled rather
   * than hidden, because the affordance exists in this design and hiding it
   * would misreport the screen as one that never offers it.
   */
  onPromoteRollout?: (row: ConsoleRow) => void;
  /**
   * Opens the end-rollout confirmation for one row, in one of the two intents.
   *
   * Supplied by the fetching wrapper below, never by the route. The row decides
   * WHICH intents to offer (`rolloutIntents`) and nothing else: the dialog, the
   * two mutation hooks and the target all live once at console level, because a
   * page of N rows each owning a dialog is 2N idle hooks for the one a reader
   * ever uses.
   */
  onEndRequest?: (intent: RolloutEndIntent, row: ConsoleRow) => void;
}) {
  const { rows, spaceSlugs, stateCounts, isLoading, isFetching, error, lastLoadedAt, refetch, unreadable } = data;
  // One org-wide list, shared with every other console reading the same names.
  const workflowNames = useChangeWorkflowNames();

  /*
   * The filter bar's three controls. `'all'` is the sentinel for "no filter",
   * matching the option every select renders first — never the empty string,
   * which would collide with a Space slug or a search box cleared to nothing.
   */
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'all' | ConsoleState>('all');
  const [spaceFilter, setSpaceFilter] = useState<'all' | string>('all');
  const filtersActive = search !== '' || stateFilter !== 'all' || spaceFilter !== 'all';
  const clearFilters = useCallback(() => {
    setSearch('');
    setStateFilter('all');
    setSpaceFilter('all');
  }, []);

  /*
   * Whether the READER has done anything yet.
   *
   * ⚠️ `LiveRegion`'s own mount guard is not enough here, and the reason
   * generalises to every async page. That guard suppresses the FIRST message;
   * on this screen the first message is `''`, because the data has not arrived
   * yet. The real first sentence lands a moment later when the fetch resolves —
   * past the guard — so the page announced "10 rollouts shown." at someone who
   * had just opened it and asked for nothing.
   *
   * Only the caller can tell an arrival from an action, so the caller says so.
   * `ReleaseLane` needs none of this because its text is non-empty from its very
   * first render, which is exactly why the bug was invisible until this
   * component was reused somewhere that fetches.
   */
  const [hasActed, setHasActed] = useState(false);
  const refreshNow = useCallback(() => {
    setHasActed(true);
    refetch();
  }, [refetch]);

  /*
   * One timestamp for the whole render, and it ticks.
   *
   * Every age on the screen is measured from the same instant, so two rows
   * created a second apart cannot round to ages that contradict their order.
   *
   * It advances on a timer rather than being taken once, because a freshness
   * line that does not visibly age is worth nothing: the reason to show the
   * data's age at all is to remove the MOTIVE for adding a poll back, and a
   * reading frozen at "Updated just now" argues for the poll instead of against
   * it. Thirty seconds is a `setState`, never a request — the whole point is
   * that this page does not talk to the server on a timer.
   */
  const [clock, setClock] = useState(() => ({ now: Date.now(), loadedAt: lastLoadedAt }));
  useEffect(() => {
    const id = window.setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // A fresh load re-dates the screen at once rather than up to 30s later. Done
  // during render, not in a second effect: React re-runs this component before
  // touching the DOM, so no one ever sees the stale reading.
  if (clock.loadedAt !== lastLoadedAt) setClock({ now: Date.now(), loadedAt: lastLoadedAt });
  const now = clock.now;

  /*
   * What the reader typed or picked narrows the fleet down to the rollouts
   * they asked about. No second, independent "hide finished ones" pass over
   * that — Complete and Aborted rows show like any other state unless a
   * filter says otherwise, and clicking the Complete/Aborted count shows
   * exactly that.
   */
  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (stateFilter !== 'all' && row.state !== stateFilter) return false;
      if (spaceFilter !== 'all' && row.spaceSlug !== spaceFilter) return false;
      if (needle === '') return true;
      return `${row.slug} ${row.spaceSlug ?? ''}`.toLowerCase().includes(needle);
    });
  }, [rows, search, stateFilter, spaceFilter]);

  const headingId = 'rollouts-console-heading';
  const freshness = freshnessFrom(lastLoadedAt, now);
  const emptyBecauseFiltered = rows.length > 0 && matched.length === 0;

  /*
   * What a screen reader is told after the list changes.
   *
   * ⚠️ THE STATE OF THE LIST, NOT THE FACT THAT SOMETHING HAPPENED. "Refreshed"
   * tells a user nothing they did not already know — they pressed the button.
   * What they cannot see is what came back.
   *
   * And because `LiveRegion` compares by value, a Refresh that returns the same
   * rollouts says NOTHING. That is the intended behaviour, not a gap: announcing
   * "10 rollouts shown" every thirty seconds to confirm nothing changed is how a
   * live region becomes something a user turns off.
   */
  const announcement = useMemo(() => {
    if (!hasActed || isLoading) return '';
    if (error !== undefined && error !== null) {
      return rows.length === 0 ? rolloutsConsoleCopy.loadFailed : rolloutsConsoleCopy.refreshFailed;
    }
    return `${matched.length} ${matched.length === 1 ? 'rollout' : 'rollouts'} shown.`;
  }, [hasActed, isLoading, error, rows.length, matched.length]);

  useEffect(() => {
    if (onAnnounce === undefined || announcement === '') return;
    onAnnounce(announcement);
  }, [onAnnounce, announcement]);

  return (
    <Box
      component="section"
      role="region"
      aria-label="Rollouts console"
      data-testid="rollouts-console"
      sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}
    >
      <Stack
        direction="row"
        alignItems="flex-end"
        justifyContent="space-between"
        sx={{ gap: '14px' }}
      >
        <Stack direction="row" alignItems="baseline" sx={{ gap: '10px', minWidth: 0 }}>
          {/*
            The console IS the page at altitude 0, so it owns its own `h1` —
            `anchor-presence` asserts `heading1::Rollouts` on this route. Taking
            the title from a prop or from the mounting page would put the
            contract's most basic anchor behind a cross-file agreement that
            breaks silently: mount it somewhere that forgets, and the check
            fails with nothing on screen to explain why.
          */}
          <Typography
            component="h1"
            id={headingId}
            sx={{ fontSize: 21, lineHeight: T.lh, fontWeight: 650, letterSpacing: '-.02em', color: T.ink }}
          >
            {rolloutsConsoleCopy.pageTitle}
          </Typography>
          <Typography
            component="span"
            sx={{ fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}
          >
            {matched.length}
          </Typography>
          {/*
            ⚠️ A SHORT LIST MUST SAY SO. Records the server sent that could not
            be built into a row are dropped — they have no id to open or no slug
            to name — and a drop that says nothing turns "we could not read
            this" into "this does not exist". The count above would then be a
            confident claim about a fleet it had never fully seen.

            Rendered only when non-zero, so the normal case carries no text.
          */}
          {unreadable.orders + unreadable.spaces > 0 && (
            <Typography
              component="span"
              role="status"
              data-testid="rollouts-unreadable"
              sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.wait }}
            >
              {`${unreadable.orders + unreadable.spaces} not readable, not shown`}
            </Typography>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" sx={{ gap: '10px' }}>
          {freshness !== '' && (
            <Typography component="span" sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.ink3 }}>
              {freshness}
            </Typography>
          )}
          <Box
            component="button"
            type="button"
            onClick={refreshNow}
            disabled={isFetching}
            sx={{ ...controlSx('quiet', !isFetching), gap: '6px' }}
          >
            {/* Decorative: the button's own text is its accessible name already. */}
            <RefreshIcon aria-hidden="true" sx={{ fontSize: 15 }} />
            Refresh
          </Box>
        </Stack>
      </Stack>

      {/*
        The one-sentence explanation, under the title row rather than beside
        it. `max-width` caps it well short of the console's own width — an
        operator reading this forty times a week should be able to skip a
        short paragraph at a glance, not parse one that runs the page's width.
      */}
      <Typography
        sx={{ fontSize: 13.5, lineHeight: T.lh, color: T.ink2, maxWidth: '78ch', margin: '4px 0 16px' }}
      >
        {rolloutsConsoleCopy.pageIntro}
      </Typography>

      {/*
        `active`/`onSelect` bind straight to the State filter's own state —
        this KPI strip IS the State filter, there is no separate dropdown for
        it to agree with. `RolloutExceptions`' `onSelect` type (`ConsoleState |
        'all'`) is `setStateFilter`'s exactly; no wrapper.

        `role="group"` + an `aria-label` on the WRAPPER, not inside
        `RolloutExceptions.tsx`: the contract's `component-shape` check names
        exactly this — a labelled group around the KPI buttons — and
        `RolloutExceptions` is a presentational strip that renders none. A
        `<Box>` here supplies the anchor without pushing this page's
        accessibility contract down into a component that does not know it.
      */}
      <Box role="group" aria-label="Rollout exceptions">
        <RolloutExceptions
          counts={stateCounts}
          active={stateFilter}
          onSelect={setStateFilter}
          tones={KPI_TONES}
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
        />
      </Box>
      <FilterBar
        search={search}
        onSearch={setSearch}
        spaceFilter={spaceFilter}
        onSpaceFilter={setSpaceFilter}
        spaceSlugs={spaceSlugs}
        onClear={clearFilters}
        clearDisabled={!filtersActive}
      />
      <Legend />

      {error !== undefined && error !== null && (
        <Box
          role="alert"
          sx={{
            border: `1px solid ${T.badLine}`,
            background: T.badSoft,
            borderRadius: R_CONTROL,
            padding: '10px 12px',
            marginBottom: '10px',
            fontSize: 12.5,
            lineHeight: T.lh,
            color: T.bad,
          }}
        >
          {rows.length === 0 ? rolloutsConsoleCopy.loadFailed : rolloutsConsoleCopy.refreshFailed}
        </Box>
      )}

      <Box
        component="section"
        role="region"
        aria-label={rolloutsConsoleCopy.pageTitle}
        sx={{
          background: T.surface,
          border: `1px solid ${T.line}`,
          // Square at the top: the Legend directly above supplies that edge
          // (its own border omits the bottom line for the same reason), so the
          // three panels read as one continuous card rather than three stacked
          // ones.
          borderRadius: `0 0 ${R_SURFACE} ${R_SURFACE}`,
          boxShadow: T.shadow,
          minWidth: 0,
        }}
      >
        <ColumnHead />

        {isLoading ? (
          <Typography
            data-testid="rollouts-loading"
            sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3, padding: '46px 20px 50px', textAlign: 'center' }}
          >
            Loading…
          </Typography>
        ) : matched.length === 0 ? (
          <Stack alignItems="center" sx={{ gap: '8px', padding: '46px 20px 50px', textAlign: 'center' }}>
            <Typography sx={{ fontSize: 15, lineHeight: T.lh, fontWeight: 650, color: T.ink }}>
              {/*
                Two distinct empty claims, not one message doing both jobs.
                "Nothing exists" (`rows.length === 0`) and "your filters
                matched nothing" (a fixable, reader-caused state — Clear
                undoes it) are different facts, and telling the reader to
                Clear filters when no filter is responsible sends them
                looking for a control that changes nothing.
              */}
              {rows.length === 0 ? rolloutsConsoleCopy.empty.none : rolloutsConsoleCopy.empty.filtered}
            </Typography>
            {emptyBecauseFiltered ? (
              <Box component="button" type="button" onClick={clearFilters} sx={controlSx('quiet', true)}>
                {rolloutsConsoleCopy.filters.clear}
              </Box>
            ) : null}
          </Stack>
        ) : (
          <>
            {matched.map((row) => (
              <ConsoleRowLine
                key={row.changeOrderId}
                row={row}
                workflowLabel={changeWorkflowLabel(row.changeWorkflowId, workflowNames)}
                now={now}
                onOpenRollout={onOpenRollout}
                onPromoteRollout={onPromoteRollout}
                onEndRequest={onEndRequest}
              />
            ))}
            {/*
              A persistent footer, not a conditional one — present whenever
              there is a list to describe, the same way the reference's
              `.tfoot` always sits under the table. The hidden-rollouts reveal
              folds in here rather than getting a second, separately-styled
              bar underneath it.
            */}
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{
                gap: '10px',
                padding: '10px 14px',
                borderTop: `1px solid ${T.line}`,
                background: T.surfaceSunk,
                borderRadius: `0 0 ${R_SURFACE} ${R_SURFACE}`,
                fontSize: 12.5,
                lineHeight: T.lh,
                color: T.ink3,
              }}
            >
              <Stack direction="row" alignItems="center" sx={{ gap: '10px' }}>
                <Typography
                  component="span"
                  data-testid="rollouts-count"
                  sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}
                >
                  {`${matched.length} ${matched.length === 1 ? 'rollout' : 'rollouts'}`}
                </Typography>
              </Stack>
              <Typography component="span" sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink3 }}>
                Select a row to open its promotion rail.
              </Typography>
            </Stack>
          </>
        )}
      </Box>

      {onAnnounce === undefined && (
        <LiveRegion message={announcement} data-testid="rollouts-announce" />
      )}
    </Box>
  );
}

/**
 * The console, fetching its own data and owning the writes its rows ask for.
 *
 * This is what the route mounts. The view above stays renderable without a
 * store, so everything that talks to one lives here: the read, and the single
 * end-rollout controller every row shares.
 *
 * ONE CONTROLLER AND ONE DIALOG FOR THE WHOLE LIST. `useEndRollout` mounts two
 * mutation hooks; per row that would be 2N idle hooks for the one a reader ever
 * uses. A row asks for the dialog to open against itself and knows nothing
 * else.
 *
 * ONE LIVE REGION, WHEREVER IT LIVES. Three things announce here — the list, the
 * end-rollout controller and the promote — and a second `role="status"` for any
 * of them is how one event gets read out twice in an order nobody controls. All
 * are funnelled through `announce`, which hands them to the mounting page when
 * it owns a region and renders one here when it does not.
 *
 * ⚠️ A KNOWN RISK RIDES ON THE PROMOTE, ACCEPTED DELIBERATELY AND STATED HERE
 * BECAUSE THIS SURFACE SHOWS MANY ROLLOUTS AT ONCE. A promotion gate can report
 * itself satisfied when a Space has not received the change: a Unit skipped at
 * creation carries neither start nor end tag, so promotion passes it over
 * without error and the propagation walk never holds the Space back on its
 * account. One person promoting one row can look at what happened; DO NOT add
 * an affordance here that promotes many rollouts at once without revisiting
 * that first, because a fleet-wide sweep cannot.
 */
export function RolloutsConsole(props: RolloutsConsoleProps) {
  const fetched = useRolloutConsole();
  const data = props.data ?? fetched;
  const { onAnnounce } = props;

  const [ownAnnouncement, setOwnAnnouncement] = useState('');
  const announce = useCallback(
    (message: string) => {
      if (onAnnounce === undefined) setOwnAnnouncement(message);
      else onAnnounce(message);
    },
    [onAnnounce],
  );

  /*
   * A write settles, so the list is re-read. That read is the expensive
   * org-wide walk `useRolloutConsole`'s header warns about, which is exactly
   * why it is tied to an action a person took rather than to a timer.
   */
  const endRollout = useEndRollout({ spaceLabel: data.spaceLabel, onSettled: data.refetch });
  useEffect(() => {
    if (endRollout.announcement !== '') announce(endRollout.announcement);
  }, [endRollout.announcement, announce]);

  const { request } = endRollout;
  const requestEnd = useCallback(
    (intent: RolloutEndIntent, row: ConsoleRow) =>
      request(intent, {
        changeOrderId: row.changeOrderId,
        slug: row.slug,
        baseSpaceId: row.spaceId,
        startTagId: row.startTagId,
        abortedReason: row.abortedReason,
        progress: row.progress,
      }),
    [request],
  );

  /*
   * THE ROW BEING PROMOTED, AND WHY IT IS STATE RATHER THAN A HOOK PER ROW.
   * `useRolloutActions` binds to ONE ChangeOrder, so a list of N rows would
   * otherwise mount N of it. The promote target names the row instead, and the
   * one instance re-binds to it — the same shape as the end-rollout controller
   * above, for the same reason.
   */
  const [promoteRow, setPromoteRow] = useState<ConsoleRow | null>(null);
  const actions = useRolloutActions({
    changeOrderId: promoteRow?.changeOrderId,
    baseSpaceId: promoteRow?.spaceId,
    onSettled: data.refetch,
  });

  /*
   * What promoting this row would do, derived by the model rather than here:
   * which Spaces the write lands in, what holds it, and whether "and release"
   * is a real second path. The detail page asks the same questions of the same
   * facts, so they are answered in one place (`promotionFor`).
   */
  const promotion = promoteRow === null ? null : promotionFor(promoteRow);
  const blocking = partitionBlockingGates(promotion?.gates ?? []);
  const blockingCount = blocking.failed.length + blocking.notEvaluated.length;
  const gatesBlock = gatesBlockPromotion(blockingCount);

  const confirmPromote = useCallback(
    ({ release }: { release: boolean }) => {
      if (promoteRow === null || promotion === null) return;
      const { stageId, spaceIds } = promotion;
      /*
       * The gate is enforced HERE as well as in the dialog, and deliberately.
       * The dialog decides what to OFFER; this decides what may be WRITTEN. A
       * promote past a held gate is the failure this path exists to prevent, so
       * it is refused at the point of action and not only at the point of
       * asking — the same two-layer rule the detail page keeps.
       */
      if (gatesBlock) {
        announce(`${stageId} is held by a gate, so it was not promoted.`);
        return;
      }
      setPromoteRow(null);
      announce(`Promoting to ${stageId}.`);
      const run = release ? actions.promoteAndRelease : actions.promote;
      // Branch on the returned result, never on message text: the hook inspects
      // every item of a bulk 200/207, which `.unwrap()` does not, and
      // `promoteAnnouncement` owns which of those results says what.
      void run(spaceIds, { blockingGateCount: blockingCount }).then((result) => {
        announce(promoteAnnouncement(stageId, result));
      });
    },
    [promoteRow, promotion, gatesBlock, blockingCount, actions, announce],
  );

  return (
    <>
      <RolloutsConsoleView
        {...props}
        data={data}
        onPromoteRollout={setPromoteRow}
        onEndRequest={requestEnd}
        onAnnounce={announce}
      />
      <PromoteDialog
        open={promoteRow !== null}
        stageName={promotion === null ? '' : stageDisplayName(promotion.stageId, false)}
        targetCount={promotion?.spaceIds.length ?? 0}
        /*
         * ⚠️ THE CONSOLE PREVIEWS NOTHING, AND SAYS NOTHING ABOUT COVERAGE.
         *
         * `null`, not zero. Zero would say a dry run ran and reached none of
         * the targets — which the dialog then explains, naming a cause that is
         * not this one: a variant waiting on another variant of the same
         * promotion. Nothing here is waiting on anything; nobody looked. A
         * sentence that gives the wrong reason for the right number is worse
         * than no sentence, and `targetCount` would be worse still, asserting a
         * complete preview that was never performed.
         */
        previewedCount={null}
        canRelease={promotion?.canRelease ?? false}
        /*
          Non-null is what makes the dialog state the hold and withhold every
          action, and it is derived from the same `gatesBlock` the confirm
          handler refuses on — so the dialog can never offer a promote this
          component will then refuse.
        */
        blockedReason={
          gatesBlock
            ? rolloutCopy.blockedBy(
                blocking.failed.length,
                blocking.notEvaluated.length,
                blocking.principal?.reason ?? rolloutCopy.promoteHeld.generic,
              )
            : null
        }
        /*
          Nothing refuses a promotion from here before it is asked for. What a
          change covers is the server's to establish, so the refusals this
          dialog used to pre-empt now come back from the promotion itself.
        */
        refusedReason={null}
        busy={actions.busy}
        onCancel={() => setPromoteRow(null)}
        onConfirm={confirmPromote}
      />
      <EndRolloutDialog {...endRollout.dialogProps} />
      {onAnnounce === undefined && (
        <LiveRegion message={ownAnnouncement} data-testid="rollouts-announce" />
      )}
    </>
  );
}
