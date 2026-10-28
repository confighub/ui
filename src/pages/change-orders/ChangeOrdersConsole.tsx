// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Altitude 0: every ChangeOrder in motion across the estate.
 *
 * Built against `7-typographic.html` in `design-mockups/change-order-promotions/`.
 * The reference is frozen; nothing here modifies it.
 *
 * ⚠️ NOTHING HERE RENDERS INVENTED DATA TO FILL A SPACE. A placeholder that
 * looks finished is indistinguishable from a finished region, and a review that
 * cannot tell them apart is worth nothing. A column the data cannot supply is
 * not rendered at all — see the Source note on `FilterBar` below.
 *
 * NOT ROUTED HERE. `ChangeOrdersPage.tsx` owns the `/change-orders` route and decides,
 * from the slug, whether to render this list or one ChangeOrder's detail. This file
 * exports a component and takes no view on when it is on screen.
 *
 * ⚠️ THIS COMPONENT OWNS THE `h1`, AND THE MOUNTING PAGE MUST NOT RENDER A
 * SECOND "ChangeOrders" TITLE. At altitude 0 the console is the whole page, so the
 * heading the contract asserts (`heading1::ChangeOrders`) belongs here rather than
 * behind a prop or an agreement with the caller. Two `h1`s on one document is
 * the anchoring defect the contract is least able to report — each looks
 * correct in isolation — so the rule is stated here, where the heading is.
 *
 * WHAT THIS PAGE IS FOR, AND THE AFFORDANCES THAT FOLLOW FROM IT. A ChangeOrder's
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
 * trusted. `ChangeOrderStageStrip` renders its caption as `variant='caption'` with
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
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import IndeterminateCheckBoxIcon from '@mui/icons-material/IndeterminateCheckBox';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import MoreVertIcon from '@mui/icons-material/MoreVert';

import { ROUTE_COMPONENTS } from '../x/apps/appTypes';
import { EndChangeOrderDialog } from '../x/apps/change-order/EndChangeOrderDialog';
import { ChangeOrderStageStrip } from '../x/apps/change-order/ChangeOrderStageStrip';
import { actionFor, promotionFor, changeOrderIntents } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { SegmentTone } from '../x/apps/change-order/changeOrdersConsoleModel';
import {
  NO_STATES,
  STATE_SECTIONS,
  rowMatchesStates,
  sectionCheck,
  sectionLabel,
  selectionAfterCardClick,
  selectionAfterSectionToggle,
  selectionAfterStateToggle,
  selectionLabel,
  statesInSection,
  type SectionCheck,
  type StateSelection,
} from '../x/apps/change-order/changeOrdersConsoleStateFilter';
import { createdWithin } from '../x/apps/change-order/changeOrdersConsoleFilters';
import type { ConsoleGroup, ConsoleRow, ConsoleState } from '../x/apps/change-order/changeOrdersConsoleModel';
import type { ChangeOrderEndIntent } from '../x/apps/change-order/changeOrderRollback';
import { gatesBlockPromotion } from '../x/apps/change-order/changeOrderFooterModel';
import { partitionBlockingGates } from '../x/apps/change-order/changeOrderGates';
import { useEndChangeOrder } from '../x/apps/change-order/useEndChangeOrder';
import { promoteAnnouncement, useChangeOrderActions } from '../x/apps/change-order/useChangeOrderActions';
import { changeWorkflowLabel, useChangeWorkflowNames } from './useChangeWorkflowNames';
import { changeOrdersConsoleCopy } from '../x/apps/change-order/changeOrdersConsoleCopy';
import { changeOrderCopy, stageDisplayName } from '../x/apps/change-order/changeOrderCopy';
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { ConsoleTable, ConsoleTableRow, type ConsoleTableColumn } from '@/components/console-table/ConsoleTable';
import { LiveRegion } from '@/components/live-region/LiveRegion';
import { useListUsersByIdChunkedQuery } from '@/hooks/chunkedQueriesApi';
import { reviewPersonOf } from '../change-sets/changeSetReviewModel';
import { PromoteDialog } from './components/PromoteDialog';
import { ChangeOrderExceptions } from './components/ChangeOrderExceptions';
import { buildCompleteConsoleStage } from './changeOrderCompleteStep';
import { ImageChangeCell } from './components/ImageChangeCell';
import { draftCopy } from './draft/draftCopy';
import { DRAFT_UPDATE_TYPES, draftHref } from './draft/draftDecisions';
import { NewChangeOrderButton } from './draft/NewChangeOrderButton';
import { useChangeOrderConsole, type ChangeOrderConsoleData } from './useChangeOrderConsole';
import {
  consoleTokens as T,
  FILTER_SELECT_SX,
  KPI_ACTIVE_CARD_SX,
  KPI_CARD_SX,
  KPI_HINT_SX,
  KPI_LABEL_SX,
  KPI_NUM_SX,
  KPI_PARTIAL_CARD_SX,
  R_CONTROL,
  R_MICRO,
  ABOVE_ROW_LINK_SX,
  ROW_LINK_SX,
  ageFrom,
  controlSx,
  freshnessFrom,
  truncateWords,
} from './consoleStyle';
import {
  ConsoleClearButton,
  ConsoleDateRange,
  ConsoleEmpty,
  ConsoleFilterBar,
  ConsoleFooter,
  ConsoleSearch,
  ConsoleSelectFilter,
  ConsoleTitleRow,
  FieldLabel,
} from './components/ConsoleParts';

/**
 * The row grid, shared by the column head and every row so the two cannot drift
 * apart. This is the reference's own template (`7-typographic.html`, `.grid`)
 * with two tracks added, which the reference does not have: the Image change,
 * second, and Created by, after the Blocker. The Image change is the widest
 * track, because most ChangeOrders only move an image tag and that move is what
 * a reader scans the list for; the Component it replaced now sits in the name
 * cell's sub-line. The reference's own tracks are members of the contract's closed
 * `grid-columns-vocabulary`, so they are not values to round off.
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
  gridTemplateColumns: 'minmax(160px, 1fr) minmax(400px, 2.2fr) 164px minmax(120px, .9fr) minmax(110px, .7fr) 44px 112px',
  // Below 1400 the page is tight, and near 1280 it also carries the Functions rail. The Blocker gives up width first; the image tags never do.
  '@media (max-width: 1400px)': {
    gridTemplateColumns: 'minmax(140px, .9fr) minmax(400px, 2.6fr) 156px minmax(110px, .7fr) minmax(100px, .6fr) 40px 112px',
  },
  // Below 1275 the image change no longer fits beside the other cells; it takes the row's second line.
  '@media (max-width: 1275px)': {
    gridTemplateColumns: 'minmax(170px, 1fr) 180px minmax(180px, 2fr) minmax(110px, .8fr) 112px',
  },
  '@media (max-width: 860px)': {
    gridTemplateColumns: 'minmax(150px, 1.4fr) 170px minmax(160px, 1.3fr)',
  },
} as const;

/** Hidden at the same widths the grid stops reserving a track for them. */
const HIDE_AGE = { '@media (max-width: 1275px)': { display: 'none' } } as const;
const HIDE_ACTION = { '@media (max-width: 860px)': { display: 'none' } } as const;
const HIDE_CREATOR = HIDE_ACTION;
const HIDE_IMAGE_HEAD = HIDE_AGE;
/** Below 1275 the image change is the row's second line, across every column. */
const IMAGE_CHANGE_CELL = {
  minWidth: 0,
  '@media (max-width: 1275px)': { gridColumn: '1 / -1', gridRow: 2, marginTop: '8px', maxWidth: 640 },
} as const;

/**
 * The strip's segment tones, re-hued for this page.
 *
 * `ChangeOrderStageStrip` accepts this override precisely so a second strip does not
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
    bgcolor: T.progressSoft,
    borderRadius: R_MICRO,
    boxShadow: `inset 0 0 0 1.5px ${T.progress}`,
  },
  progressing: {
    borderRadius: R_MICRO,
    backgroundImage: `repeating-linear-gradient(115deg, ${T.progressSoft} 0 4px, ${T.progressInk} 4px 8px)`,
    boxShadow: `inset 0 0 0 1.5px ${T.progress}`,
    animation: 'change-order-seg-live 1.6s ease-in-out infinite',
    '@keyframes change-order-seg-live': { '0%, 100%': { opacity: 1 }, '50%': { opacity: 0.55 } },
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
  ready: T.progress,
  degraded: T.bad,
  blocked: T.wait,
  held: T.wait,
  progressing: T.progress,
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
 * `ChangeOrderExceptions`' whole appearance, in this page's own tokens: `tones`
 * (the figure's colour), `numSx` (the figure's own type), `labelSx`, `hintSx`,
 * `cardSx` and `activeCardSx`. The component owns the strip's shape and
 * behaviour and holds no palette of its own, so all six are stated here — the
 * page that shows the strip is the page that decides how it reads.
 *
 * Needs you is the only card in the progress blue, because it is the only group that
 * asks the reader to act. In progress asks nothing, so it takes the neutral
 * secondary ink, not `progressing`'s blue: two blue figures would make the
 * strip ask for action twice. Stuck takes the warning ink, not `degraded`'s:
 * most of what it counts is waiting on a fix, and only some of it is failing.
 */
const KPI_TONES: Record<ConsoleGroup, string> = {
  'needs-you': STATE_INK.ready,
  stuck: STATE_INK.blocked,
  'in-progress': T.ink2,
  finished: STATE_INK.complete,
};

/**
 * The two faces, and the rule that decides between them.
 *
 * The reference states it outright: "Mono is a literal the system produced: a
 * field path, a value, a variant slug, a stage key, a count. The text face is
 * the interface talking about one." Slug, stage key and age are mono here for
 * that reason and no other.
 */

export interface ChangeOrdersConsoleProps {
  /**
   * Injected by tests and by any caller that already holds the data. Omitted in
   * the app, where the component reads it itself.
   */
  data?: ChangeOrderConsoleData;
  /**
   * The address of one ChangeOrder. Absent leaves the control rendered and disabled rather
   * than hidden: the affordance exists in this design, and hiding it would
   * misreport the screen as one that never offers it.
   */
  changeOrderHref?: (row: ConsoleRow) => string;
  /**
   * Hands this console's announcement to a page that already owns a live region.
   *
   * ⚠️ ONE `role="status"` PER PAGE. Mounted inside `ChangeOrdersPage`, which
   * renders `#announce`, a region of our own makes TWO polite regions live at
   * once on `/change-orders` — they can double-announce one event, and a screen
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
  userNames,
  viewerUserId,
  now,
  changeOrderHref,
  onPromoteChangeOrder,
  onEndRequest,
}: {
  row: ConsoleRow;
  /**
   * What to call the workflow governing this ChangeOrder. Resolved by the caller
   * from the live entity: the copy a ChangeOrder carries has no name of its own.
   */
  workflowLabel: string;
  /** User id -> name, for the creator and the requested reviewers. */
  userNames: ReadonlyMap<string, string>;
  viewerUserId: string | undefined;
  now: number;
  changeOrderHref?: (row: ConsoleRow) => string;
  onPromoteChangeOrder?: (row: ConsoleRow) => void;
  onEndRequest?: (intent: ChangeOrderEndIntent, row: ConsoleRow) => void;
}) {
  const action = actionFor(row);
  const href = changeOrderHref?.(row);
  const state = changeOrdersConsoleCopy.states[row.state];
  const promote = useCallback(() => onPromoteChangeOrder?.(row), [onPromoteChangeOrder, row]);

  /*
   * The two ways to END this ChangeOrder, on the rule every other surface reads.
   * `changeOrderIntents` decides which of them this row may offer; nothing here
   * adds a condition of its own, so the same ChangeOrder cannot offer Roll back
   * in this list and withhold it on the detail page one click away.
   */
  const intents = changeOrderIntents(row);
  const offersEnd = (intents.rollBack || intents.abort) && onEndRequest !== undefined;
  // Re-aim: a new ChangeOrder drafted from this one. Only for a ChangeOrder that propagated over
  // Links, which is what a draft of base changes re-aims.
  const reAimHref =
    row.spaceSlug !== undefined && (DRAFT_UPDATE_TYPES as readonly string[]).includes(row.updateType)
      ? draftHref({ space: row.spaceSlug, from: row.slug })
      : undefined;
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const requestEnd = useCallback(
    (intent: ChangeOrderEndIntent) => {
      setMenuAnchor(null);
      onEndRequest?.(intent, row);
    },
    [onEndRequest, row],
  );

  // The next stage is never the source row, so it is always a real one and is named by the workflow's own word for it.
  const stageKey = row.nextStageId === null ? '' : stageDisplayName(row.nextStageId, false);
  const creator = row.userId ? reviewPersonOf(row.userId, userNames, viewerUserId).name : undefined;
  const reviewers = (row.reviewerUserIds ?? []).map((userId) => reviewPersonOf(userId, userNames, viewerUserId));

  return (
    <ConsoleTableRow grid={GRID} attributes={{ 'data-change-order-slug': row.slug }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          {...(href === undefined
            ? { component: 'span' as const }
            : {
                component: RouterLink,
                to: href,
                /*
                 * Short and distinguishing. The reference names each row by its own
                 * contents — 136 to 176 characters — which is why its rows were dropped
                 * from the contract's own control inventory as fixture data. A name is
                 * how the row is addressed, not a summary of it.
                 */
                'aria-label': `Open ChangeOrder ${row.slug}`,
              })}
          sx={{
            fontFamily: T.mono,
            fontSize: 13.5,
            lineHeight: T.lh,
            fontWeight: 600,
            letterSpacing: '-.01em',
            color: T.ink,
            // Two lines before it is cut: a slug often carries a version, and half a version misleads.
            overflowWrap: 'anywhere',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            ...(href === undefined ? {} : ROW_LINK_SX),
          }}
          title={row.slug}
        >
          {row.slug}
        </Typography>
        <Typography
          component="span"
          sx={{
            ...ABOVE_ROW_LINK_SX,
            fontSize: 11.5,
            lineHeight: T.lh,
            marginTop: '2px',
            color: T.ink3,
            display: 'block',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={[row.spaceSlug, row.appName, workflowLabel].filter(Boolean).join(' · ')}
          data-workflow-id={row.changeWorkflowId ?? ''}
        >
          {row.spaceSlug ?? ''}
          {row.appName === undefined ? null : (
            <>
              {' · '}
              <Typography
                component={RouterLink}
                data-testid="change-order-component"
                to={`${ROUTE_COMPONENTS}?app=${encodeURIComponent(row.appName)}`}
                title={row.appName}
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  fontSize: 11.5,
                  lineHeight: T.lh,
                  color: T.ink2,
                  textDecoration: 'underline',
                  textDecorationColor: T.lineStrong,
                  '&:hover': { color: T.actionInk, textDecorationColor: T.actionInk },
                  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1, borderRadius: R_MICRO },
                }}
              >
                {row.appName}
              </Typography>
            </>
          )}
          {' · '}
          {workflowLabel}
        </Typography>
      </Box>

      <Box sx={IMAGE_CHANGE_CELL}>
        <ImageChangeCell
          changeOrderId={row.changeOrderId}
          baseSpaceId={row.spaceId}
          updateType={row.updateType}
          startTagId={row.startTagId}
          endTagId={row.endTagId}
          inScopeSpaceIds={row.inScopeSpaceIds}
        />
      </Box>

      <Stack
        sx={{
          minWidth: 0,
          gap: '5px',
          /*
           * `showCaption={false}` does NOT suppress every caption the strip can
           * render. When it can build no sequence at all it returns EARLY with
           * its own `variant='caption'` line (`ChangeOrderStageStrip.tsx:113-119`),
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
          put the synthetic `__change_order_source__` (`changeOrderStages.ts:273`) in
          front of a user. The segments — the part worth reusing — are untouched.
        */}
        {/*
          ⚠️ NO STRIP FOR A CHANGEORDER WITH NOWHERE TO GO. Its only stage is the
          SOURCE, whose tone is `done`, and one segment on `flex: 1` fills the
          whole cell — so a ChangeOrder that has travelled nothing rendered as an
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
          <ChangeOrderStageStrip
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
          data-change-order-state={row.state}
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
        The blocker on one line: it truncates rather than wraps, and the full
        sentence is a native tooltip, so a row's height does not vary. The
        state is named once, in the stages cell; no headline repeats it here.
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
          <Typography
            data-testid="change-order-blocker"
            title={row.blocker}
            sx={{
              ...ABOVE_ROW_LINK_SX,
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

      <Stack sx={{ ...HIDE_CREATOR, minWidth: 0, gap: '1px' }}>
        <Typography
          data-testid="change-order-creator"
          title={creator}
          sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 12.5, lineHeight: T.lh, color: T.ink2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {creator === undefined ? '—' : truncateWords(creator, 32)}
        </Typography>
        {reviewers.length > 0 ? (
          <Typography
            data-testid="change-order-reviewers"
            title={reviewers.map((reviewer) => reviewer.name).join(', ')}
            sx={{ ...ABOVE_ROW_LINK_SX, fontSize: 11.5, lineHeight: T.lh, color: T.ink3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            Requested: {reviewers.map((reviewer) => `${reviewer.name}${reviewer.isYou ? ' (you)' : ''}`).join(', ')}
          </Typography>
        ) : null}
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
        {action.label !== 'Promote' && href !== undefined ? (
          <Box
            component={RouterLink}
            to={href}
            sx={{ ...controlSx(action.primary ? 'primary' : 'quiet', true), position: 'relative', zIndex: 1 }}
          >
            {action.label}
          </Box>
        ) : (
          <Box
            component="button"
            type="button"
            onClick={promote}
            disabled={action.label !== 'Promote' || onPromoteChangeOrder === undefined}
            sx={{
              ...controlSx(action.primary ? 'primary' : 'quiet', action.label === 'Promote' && onPromoteChangeOrder !== undefined),
              position: 'relative',
              zIndex: 1,
            }}
          >
            {action.label}
          </Box>
        )}
        {/*
          A MENU, NOT TWO MORE PILLS. This row opens on click, and a bare
          destructive control repeated down a fleet-length list is a misclick
          away from taking a change back out of production. `MoreVertIcon` row
          menus are this codebase's existing shape for that (`SpacesCard.tsx`,
          `InitiativeKanbanCard.tsx`), and it is the shape the ChangeOrders list
          carried before this console replaced it.

          Re-aim leads the menu: it drafts a new ChangeOrder from this one and
          writes nothing until that draft's Create.

          Withheld entirely when the row offers nothing: a menu that
          opens onto nothing is not an affordance, it is a dead end with a
          hover state. The cell keeps its track either way, so rows stay
          aligned with the head.
        */}
        {offersEnd || reAimHref !== undefined ? (
          <>
            <IconButton
              size="small"
              data-testid="change-order-row-menu"
              aria-label={`ChangeOrder actions for ${row.slug}`}
              aria-haspopup="true"
              aria-expanded={menuAnchor !== null ? 'true' : undefined}
              onClick={(event: React.MouseEvent<HTMLElement>) => setMenuAnchor(event.currentTarget)}
              sx={{ zIndex: 1, color: T.ink3, padding: '3px', borderRadius: R_MICRO }}
            >
              <MoreVertIcon sx={{ fontSize: 17 }} />
            </IconButton>
            <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
              {/*
                Roll back first and marked destructive: it is the one that
                MOVES something. "Abort" decides and writes into no Space, so it
                carries no danger colour — the difference has to be legible
                before the dialog opens, not only inside it.
              */}
              {reAimHref === undefined ? null : (
                <MenuItem
                  component={RouterLink}
                  to={reAimHref}
                  data-testid="change-order-row-reaim"
                  sx={{ textTransform: 'none' }}
                  onClick={closeMenu}
                >
                  {draftCopy.page.template.reAim}
                </MenuItem>
              )}
              {offersEnd && intents.rollBack ? (
                <MenuItem
                  data-testid="change-order-row-rollback"
                  sx={{ color: T.bad, textTransform: 'none' }}
                  onClick={() => requestEnd('roll-back')}
                >
                  {changeOrderCopy.endChangeOrder.rollBackLabel}
                </MenuItem>
              ) : null}
              {offersEnd && intents.abort ? (
                <MenuItem
                  data-testid="change-order-row-abort"
                  sx={{ textTransform: 'none' }}
                  onClick={() => requestEnd('abort')}
                >
                  {changeOrderCopy.endChangeOrder.abortLabel}
                </MenuItem>
              ) : null}
            </Menu>
          </>
        ) : null}
      </Box>
    </ConsoleTableRow>
  );
});

/** A control's own label, paired to its `<select>`/`<input>` by `htmlFor`, never by placement alone. */
const CHECK_ICON: Record<SectionCheck, typeof CheckBoxIcon> = {
  checked: CheckBoxIcon,
  indeterminate: IndeterminateCheckBoxIcon,
  unchecked: CheckBoxOutlineBlankIcon,
};

const ARIA_CHECKED = { checked: 'true', indeterminate: 'mixed', unchecked: 'false' } as const;

/**
 * A row of the State menu. A disabled row is a chosen colour, not MUI's
 * default `opacity` (R11), and nothing in it is uppercased.
 */
function stateMenuItemSx(indent: boolean, spaced = false): SxProps<Theme> {
  return {
    gap: '8px',
    marginTop: spaced ? '4px' : 0,
    padding: indent ? '5px 12px 5px 30px' : '6px 12px',
    fontFamily: T.sans,
    fontSize: 12.5,
    lineHeight: T.lh,
    fontWeight: indent ? 500 : 650,
    color: T.ink,
    textTransform: 'none',
    '&:hover': { background: T.surfaceHover, color: T.ink },
    '&.Mui-focusVisible': { background: T.surfaceHover },
    '&.Mui-disabled': { opacity: 1, color: T.ink3 },
  };
}

function CheckMark({ check, disabled }: { check: SectionCheck; disabled: boolean }) {
  const Icon = CHECK_ICON[check];
  return (
    <Icon
      sx={{ fontSize: 17, color: disabled ? T.lineStrong : check === 'unchecked' ? T.ink3 : T.action }}
    />
  );
}

/**
 * The State dropdown: the same selection the summary cards write, one state
 * or one heading at a time.
 *
 * A button and a menu of checkbox items, not a native `<select>` like its
 * neighbours: a native multi-select cannot show headings that check and
 * uncheck a group, or a count beside each state. The button takes the
 * neighbours' `FILTER_SELECT_SX` so the bar still reads as one row of selects.
 *
 * The menu stays open on a click, because a multi-select that closes after
 * every choice makes the reader reopen it for each state they add.
 *
 * Zero-count states are disabled unless selected: choosing one would only
 * empty the list, but a selected one must stay reachable so it can be cleared.
 */
function StateFilter({
  selection,
  onChange,
  counts,
}: {
  selection: StateSelection;
  onChange: (next: StateSelection) => void;
  counts: Readonly<Record<ConsoleState, number>>;
}) {
  const buttonId = useId();
  const labelId = useId();
  const valueId = useId();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = anchor !== null;

  const items = STATE_SECTIONS.flatMap((section, index) => {
    const states = statesInSection(section);
    const check = sectionCheck(selection, section);
    const headingDisabled = check === 'unchecked' && states.every((state) => counts[state] === 0);
    return [
      <MenuItem
        key={section}
        role="menuitemcheckbox"
        aria-checked={ARIA_CHECKED[check]}
        disabled={headingDisabled}
        onClick={() => onChange(selectionAfterSectionToggle(selection, section))}
        sx={stateMenuItemSx(false, index > 0)}
      >
        <CheckMark check={check} disabled={headingDisabled} />
        {sectionLabel(section)}
      </MenuItem>,
      ...states.map((state) => {
        const selected = selection.has(state);
        const disabled = !selected && counts[state] === 0;
        return (
          <MenuItem
            key={state}
            role="menuitemcheckbox"
            aria-checked={selected ? 'true' : 'false'}
            disabled={disabled}
            onClick={() => onChange(selectionAfterStateToggle(selection, state))}
            sx={stateMenuItemSx(true)}
          >
            <CheckMark check={selected ? 'checked' : 'unchecked'} disabled={disabled} />
            <Box component="span" sx={{ flex: 1 }}>
              {changeOrdersConsoleCopy.states[state].label}
            </Box>
            <Box component="span" sx={{ fontFamily: T.mono, fontSize: 12, color: T.ink3, paddingLeft: '16px' }}>
              {counts[state]}
            </Box>
          </MenuItem>
        );
      }),
    ];
  });

  return (
    <Stack direction="row" alignItems="center" sx={{ gap: '6px' }}>
      <FieldLabel htmlFor={buttonId} id={labelId}>
        {changeOrdersConsoleCopy.filters.state}
      </FieldLabel>
      {/*
        Named by the label AND the value, so a screen reader hears "State,
        Stuck" and not only "State" — the value is the point of the control.
      */}
      <Box
        component="button"
        type="button"
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={(event: React.MouseEvent<HTMLElement>) => setAnchor(event.currentTarget)}
        sx={{
          ...FILTER_SELECT_SX,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
          maxWidth: 280,
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Box
          component="span"
          id={valueId}
          sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {selectionLabel(selection)}
        </Box>
        <KeyboardArrowDownIcon sx={{ fontSize: 16, color: T.ink3, flexShrink: 0 }} />
      </Box>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={open}
        onClose={() => setAnchor(null)}
        MenuListProps={{ 'aria-labelledby': labelId, sx: { minWidth: 240, padding: '4px' } }}
      >
        {items}
      </Menu>
    </Stack>
  );
}

/**
 * Search, State, Space, Component, Update type, Created, Clear — the console's
 * own filter bar.
 *
 * ⚠️ NO SOURCE CONTROL, AND THAT IS A DECISION ALREADY MADE, NOT A GAP. The
 * reference renders a Source select (GitHub release / CI pipeline) beside a
 * Source column; `ChangeOrder` has no such field, so NEITHER is here. Rendering
 * a Source dropdown with one disabled option, or a column whose every cell is
 * empty, would be the "present but not painted" anti-pattern
 * (`ANCHOR-REQUIREMENTS.md`) in a new shape: something that exists and cannot
 * do anything. If `ChangeOrder` ever reports an origin, both come back together.
 *
 * ONE STATE FILTER, TWO CONTROLS. The State dropdown here and the KPI strip
 * above (`ChangeOrderExceptions`) both read and write the one `selectedStates`
 * value, and neither keeps a copy, so they cannot show different filters. The
 * cards are the fast way in, one group per click; the dropdown is the way to
 * one state, to several groups at once, and to the states no card counts.
 * The dropdown always renders, even when the strip hides, so those stay
 * reachable.
 *
 * A ChangeOrder scopes to Spaces, so the Space control filters by the Space the
 * ChangeOrder lives in. The Component control filters by that Space's Component —
 * a real entity, not the reference's fixture-only `checkout-api` groupings — and
 * a ChangeOrder whose Space has no Component matches no Component. `spaceSlugs`,
 * `componentSlugs` and `updateTypes` are computed by the hook; no second
 * derivation is added here.
 *
 * Created is a range of days in the viewer's time zone, both ends inclusive and
 * either one open (`createdWithin`).
 */
function FilterBar({
  search,
  onSearch,
  selectedStates,
  onSelectedStates,
  stateCounts,
  spaceFilter,
  onSpaceFilter,
  spaceSlugs,
  componentFilter,
  onComponentFilter,
  componentSlugs,
  updateTypeFilter,
  onUpdateTypeFilter,
  updateTypes,
  createdFrom,
  onCreatedFrom,
  createdTo,
  onCreatedTo,
  onClear,
  clearDisabled,
}: {
  search: string;
  onSearch: (v: string) => void;
  selectedStates: StateSelection;
  onSelectedStates: (next: StateSelection) => void;
  stateCounts: Readonly<Record<ConsoleState, number>>;
  spaceFilter: 'all' | string;
  onSpaceFilter: (v: 'all' | string) => void;
  spaceSlugs: readonly string[];
  componentFilter: 'all' | string;
  onComponentFilter: (v: 'all' | string) => void;
  componentSlugs: readonly string[];
  updateTypeFilter: 'all' | string;
  onUpdateTypeFilter: (v: 'all' | string) => void;
  updateTypes: readonly string[];
  /** `YYYY-MM-DD`, or `''` for an open end. */
  createdFrom: string;
  onCreatedFrom: (v: string) => void;
  createdTo: string;
  onCreatedTo: (v: string) => void;
  onClear: () => void;
  clearDisabled: boolean;
}) {
  return (
    <ConsoleFilterBar>
      <ConsoleSearch value={search} onChange={onSearch} placeholder={changeOrdersConsoleCopy.filters.searchPlaceholder} />
      <StateFilter selection={selectedStates} onChange={onSelectedStates} counts={stateCounts} />
      <ConsoleSelectFilter
        label={changeOrdersConsoleCopy.filters.space}
        value={spaceFilter}
        onChange={onSpaceFilter}
        allLabel={changeOrdersConsoleCopy.filters.allSpaces}
        options={spaceSlugs}
      />
      <ConsoleSelectFilter
        label={changeOrdersConsoleCopy.filters.component}
        value={componentFilter}
        onChange={onComponentFilter}
        allLabel={changeOrdersConsoleCopy.filters.allComponents}
        options={componentSlugs}
      />
      <ConsoleSelectFilter
        label={changeOrdersConsoleCopy.filters.updateType}
        value={updateTypeFilter}
        onChange={onUpdateTypeFilter}
        allLabel={changeOrdersConsoleCopy.filters.allUpdateTypes}
        options={updateTypes}
      />
      <ConsoleDateRange
        fromLabel={changeOrdersConsoleCopy.filters.createdFrom}
        toLabel={changeOrdersConsoleCopy.filters.createdTo}
        from={createdFrom}
        onFrom={onCreatedFrom}
        to={createdTo}
        onTo={onCreatedTo}
      />
      <ConsoleClearButton onClick={onClear} disabled={clearDisabled}>
        {changeOrdersConsoleCopy.filters.clear}
      </ConsoleClearButton>
    </ConsoleFilterBar>
  );
}

/**
 * The strip's own vocabulary, said once in words rather than left to be
 * inferred from five shades of the same six-by-seven-pixel bar.
 *
 * `aria-hidden`: every fact it states is already carried by
 * `data-change-order-state` and `ChangeOrderStageStrip`'s own segment `title`s. This is
 * a sighted-reader convenience, not a second source of the information.
 *
 * `aria-label="Legend"` alongside the hide is not a contradiction to fix:
 * `aria-hidden` already removes the whole thing from anything an AT will ever
 * read, so the label reaches no one — it exists purely as a plain-DOM anchor
 * a structural probe can find, exactly like this file's other `data-*` hooks.
 */
const LEGEND: { tone: SegmentTone; label: string }[] = [
  { tone: 'done', label: 'Done' },
  { tone: 'unverified', label: 'Health unchecked' },
  { tone: 'ready', label: 'Ready' },
  { tone: 'progressing', label: 'Promoting' },
  { tone: 'blocked', label: 'Needs Release' },
  { tone: 'degraded', label: 'Degraded' },
  { tone: 'gated', label: 'Not reached' },
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

/** Needs you first, then stuck, in progress, finished and the rest: the State filter's own order. */
const STATE_RANK: ReadonlyMap<ConsoleState, number> = new Map(
  STATE_SECTIONS.flatMap((section) => statesInSection(section)).map((state, index) => [state, index]),
);

/**
 * The column heads, in sentence case, and what each one sorts by. The cells are
 * `ConsoleRowLine`'s, in this order.
 *
 * The Image change does not sort: each cell reads its own image tags, so the
 * list holds no value to sort it by. Created by sorts by the name the cell
 * shows, so it is built with the names the list has read.
 */
function changeOrderColumns(userNames: ReadonlyMap<string, string>, viewerUserId: string | undefined): ConsoleTableColumn<ConsoleRow>[] {
  return [
    { id: 'name', header: changeOrdersConsoleCopy.columns.name, sortValue: (row) => row.slug },
    { id: 'image', header: changeOrdersConsoleCopy.columns.imageChange, sx: HIDE_IMAGE_HEAD },
    {
      id: 'stages',
      header: changeOrdersConsoleCopy.columns.stages,
      // The share of the path done, so a short path and a long one compare by how far each has gone.
      sortValue: (row) =>
        row.progressUnavailable || row.stagesTotal === 0 || row.state === 'no-stages' ? undefined : row.stagesDone / row.stagesTotal,
    },
    { id: 'blocker', header: changeOrdersConsoleCopy.columns.blocker, sortValue: (row) => STATE_RANK.get(row.state) },
    {
      id: 'creator',
      header: changeOrdersConsoleCopy.columns.createdBy,
      sx: HIDE_CREATOR,
      sortValue: (row) => (row.userId ? reviewPersonOf(row.userId, userNames, viewerUserId).name : undefined),
    },
    {
      id: 'age',
      header: changeOrdersConsoleCopy.columns.age,
      sx: { ...HIDE_AGE, textAlign: 'right' },
      // Age, not date: ascending is the youngest first. A missing or unreadable date is NaN, which sorts last.
      sortValue: (row) => (row.createdAt === undefined ? undefined : -Date.parse(row.createdAt)),
    },
    { id: 'action', header: 'Next action', sx: { ...HIDE_ACTION, textAlign: 'right' } },
  ];
}

const changeOrderRowId = (row: ConsoleRow) => row.changeOrderId;

/**
 * The console, rendering data it is given.
 *
 * Split from the fetching wrapper below because a component that reads a store
 * cannot be rendered without one. This half needs no provider, no store and no
 * network, so a fixture can drive it — which is the difference between checking
 * the render and checking a copy of the render.
 */
export function ChangeOrdersConsoleView({
  data,
  changeOrderHref,
  onPromoteChangeOrder,
  onEndRequest,
  onAnnounce,
}: ChangeOrdersConsoleProps & {
  data: ChangeOrderConsoleData;
  /**
   * Opens the promote confirmation for one row. Supplied by the fetching
   * wrapper below; absent leaves the row's action rendered and disabled rather
   * than hidden, because the affordance exists in this design and hiding it
   * would misreport the screen as one that never offers it.
   */
  onPromoteChangeOrder?: (row: ConsoleRow) => void;
  /**
   * Opens the end-ChangeOrder confirmation for one row, in one of the two intents.
   *
   * Supplied by the fetching wrapper below, never by the route. The row decides
   * WHICH intents to offer (`changeOrderIntents`) and nothing else: the dialog, the
   * two mutation hooks and the target all live once at console level, because a
   * page of N rows each owning a dialog is 2N idle hooks for the one a reader
   * ever uses.
   */
  onEndRequest?: (intent: ChangeOrderEndIntent, row: ConsoleRow) => void;
}) {
  const { rows, spaceSlugs, componentSlugs, updateTypes, stateCounts, groupCounts, isLoading, isFetching, error, lastLoadedAt, refetch, unreadable } = data;
  // One org-wide list, shared with every other console reading the same names.
  const workflowNames = useChangeWorkflowNames();

  const { userInfo } = useUserInfo();
  const viewerUserId = userInfo?.UserID;
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (row.userId) ids.add(row.userId);
      for (const userId of row.reviewerUserIds ?? []) ids.add(userId);
    }
    return [...ids].sort();
  }, [rows]);
  const users = useListUsersByIdChunkedQuery({ userIds }, { skip: userIds.length === 0 });
  const userNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const entry of users.data ?? []) {
      const name = entry.User?.DisplayName || entry.User?.Username;
      if (entry.User?.UserID && name) names.set(entry.User.UserID, name);
    }
    return names;
  }, [users.data]);

  /*
   * The filter bar's controls. `'all'` is the Space and Component selects'
   * sentinel for "no filter", matching the option each renders first — never
   * the empty string, which would collide with a Space slug or a search box
   * cleared to nothing. The State filter's "no filter" is the empty selection;
   * the KPI cards and the State dropdown both edit it.
   */
  const [search, setSearch] = useState('');
  const [selectedStates, setSelectedStates] = useState<StateSelection>(NO_STATES);
  const selectGroup = useCallback(
    (group: ConsoleGroup) => setSelectedStates((current) => selectionAfterCardClick(current, group)),
    [],
  );
  const [spaceFilter, setSpaceFilter] = useState<'all' | string>('all');
  const [componentFilter, setComponentFilter] = useState<'all' | string>('all');
  const [updateTypeFilter, setUpdateTypeFilter] = useState<'all' | string>('all');
  // `YYYY-MM-DD` days, as `<input type="date">` gives them; `''` is an open end.
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const filtersActive =
    search !== '' ||
    selectedStates.size > 0 ||
    spaceFilter !== 'all' ||
    componentFilter !== 'all' ||
    updateTypeFilter !== 'all' ||
    createdFrom !== '' ||
    createdTo !== '';
  const clearFilters = useCallback(() => {
    setSearch('');
    setSelectedStates(NO_STATES);
    setSpaceFilter('all');
    setComponentFilter('all');
    setUpdateTypeFilter('all');
    setCreatedFrom('');
    setCreatedTo('');
  }, []);

  /*
   * Whether the READER has done anything yet.
   *
   * ⚠️ `LiveRegion`'s own mount guard is not enough here, and the reason
   * generalises to every async page. That guard suppresses the FIRST message;
   * on this screen the first message is `''`, because the data has not arrived
   * yet. The real first sentence lands a moment later when the fetch resolves —
   * past the guard — so the page announced "10 ChangeOrders shown." at someone who
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
   * What the reader typed or picked narrows the fleet down to the ChangeOrders
   * they asked about. No second, independent "hide finished ones" pass over
   * that — Complete and Aborted rows show like any other state unless a
   * filter says otherwise, and clicking the Finished count shows
   * exactly that.
   */
  const matched = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!rowMatchesStates(selectedStates, row.state)) return false;
      if (spaceFilter !== 'all' && row.spaceSlug !== spaceFilter) return false;
      if (componentFilter !== 'all' && row.appName !== componentFilter) return false;
      if (updateTypeFilter !== 'all' && row.updateType !== updateTypeFilter) return false;
      if (!createdWithin(row.createdAt, createdFrom, createdTo)) return false;
      if (needle === '') return true;
      const creator = row.userId ? (userNames.get(row.userId) ?? '') : '';
      return `${row.slug} ${row.spaceSlug ?? ''} ${row.appName ?? ''} ${creator}`.toLowerCase().includes(needle);
    });
  }, [rows, search, selectedStates, spaceFilter, componentFilter, updateTypeFilter, createdFrom, createdTo, userNames]);

  const headingId = 'change-orders-console-heading';
  const freshness = freshnessFrom(lastLoadedAt, now);
  const emptyBecauseFiltered = rows.length > 0 && matched.length === 0;

  const columns = useMemo(() => changeOrderColumns(userNames, viewerUserId), [userNames, viewerUserId]);
  const renderRow = useCallback(
    (row: ConsoleRow) => (
      <ConsoleRowLine
        row={row}
        workflowLabel={changeWorkflowLabel(row.changeWorkflowId, workflowNames)}
        userNames={userNames}
        viewerUserId={viewerUserId}
        now={now}
        changeOrderHref={changeOrderHref}
        onPromoteChangeOrder={onPromoteChangeOrder}
        onEndRequest={onEndRequest}
      />
    ),
    [workflowNames, userNames, viewerUserId, now, changeOrderHref, onPromoteChangeOrder, onEndRequest],
  );

  /*
   * What a screen reader is told after the list changes.
   *
   * ⚠️ THE STATE OF THE LIST, NOT THE FACT THAT SOMETHING HAPPENED. "Refreshed"
   * tells a user nothing they did not already know — they pressed the button.
   * What they cannot see is what came back.
   *
   * And because `LiveRegion` compares by value, a Refresh that returns the same
   * ChangeOrders says NOTHING. That is the intended behaviour, not a gap: announcing
   * "10 ChangeOrders shown" every thirty seconds to confirm nothing changed is how a
   * live region becomes something a user turns off.
   */
  const announcement = useMemo(() => {
    if (!hasActed || isLoading) return '';
    if (error !== undefined && error !== null) {
      return rows.length === 0 ? changeOrdersConsoleCopy.loadFailed : changeOrdersConsoleCopy.refreshFailed;
    }
    return `${matched.length} ${matched.length === 1 ? 'ChangeOrder' : 'ChangeOrders'} shown.`;
  }, [hasActed, isLoading, error, rows.length, matched.length]);

  useEffect(() => {
    if (onAnnounce === undefined || announcement === '') return;
    onAnnounce(announcement);
  }, [onAnnounce, announcement]);

  return (
    <Box
      component="section"
      role="region"
      aria-label="ChangeOrders console"
      data-testid="change-orders-console"
      sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}
    >
      {/*
        The console IS the page at altitude 0, so it owns its own `h1` —
        `anchor-presence` asserts `heading1::ChangeOrders` on this route.
      */}
      {/* "New ChangeOrder" sits after Refresh, on the title row's own baseline. */}
      <Stack direction="row" alignItems="flex-end" sx={{ gap: '10px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <ConsoleTitleRow
            title={changeOrdersConsoleCopy.pageTitle}
            headingId={headingId}
            count={matched.length}
            freshness={freshness}
            refreshing={isFetching}
            onRefresh={refreshNow}
            note={
              /*
                ⚠️ A SHORT LIST MUST SAY SO. Records the server sent that could not
                be built into a row are dropped, and a drop that says nothing turns
                "we could not read this" into "this does not exist". Rendered only
                when non-zero, so the normal case carries no text.
              */
              unreadable.orders + unreadable.spaces > 0 ? (
                <Typography
                  component="span"
                  role="status"
                  data-testid="change-orders-unreadable"
                  sx={{ fontSize: 11.5, lineHeight: T.lh, color: T.wait }}
                >
                  {`${unreadable.orders + unreadable.spaces} not readable, not shown`}
                </Typography>
              ) : null
            }
          />
        </Box>
        <NewChangeOrderButton
          spaceSlug={spaceFilter === 'all' ? undefined : spaceFilter}
          componentSlug={componentFilter === 'all' ? undefined : componentFilter}
        />
      </Stack>

      {/*
        `selection` is the State filter's one value, the same one the State
        dropdown in `FilterBar` edits; a card click becomes the next selection
        through `selectionAfterCardClick`, so the cards keep no state of their
        own to disagree with the dropdown.

        `role="group"` + an `aria-label` on the WRAPPER, not inside
        `ChangeOrderExceptions.tsx`: the contract's `component-shape` check names
        exactly this — a labelled group around the KPI buttons — and
        `ChangeOrderExceptions` is a presentational strip that renders none. A
        `<Box>` here supplies the anchor without pushing this page's
        accessibility contract down into a component that does not know it.
      */}
      <Box role="group" aria-label="ChangeOrder exceptions">
        <ChangeOrderExceptions
          counts={groupCounts}
          selection={selectedStates}
          onSelect={selectGroup}
          tones={KPI_TONES}
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
          partialCardSx={KPI_PARTIAL_CARD_SX}
        />
      </Box>
      <FilterBar
        search={search}
        onSearch={setSearch}
        selectedStates={selectedStates}
        onSelectedStates={setSelectedStates}
        stateCounts={stateCounts}
        spaceFilter={spaceFilter}
        onSpaceFilter={setSpaceFilter}
        spaceSlugs={spaceSlugs}
        componentFilter={componentFilter}
        onComponentFilter={setComponentFilter}
        componentSlugs={componentSlugs}
        updateTypeFilter={updateTypeFilter}
        onUpdateTypeFilter={setUpdateTypeFilter}
        updateTypes={updateTypes}
        createdFrom={createdFrom}
        onCreatedFrom={setCreatedFrom}
        createdTo={createdTo}
        onCreatedTo={setCreatedTo}
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
          {rows.length === 0 ? changeOrdersConsoleCopy.loadFailed : changeOrdersConsoleCopy.refreshFailed}
        </Box>
      )}

      {/* Square at the top: the Legend directly above supplies that edge, so the panels read as one card. */}
      {/*
        Newest first until a head is clicked: that is the order `rows` arrives in.
        The list is one flat run, not sections, so a sort orders the whole of it.
      */}
      <ConsoleTable
        label={changeOrdersConsoleCopy.pageTitle}
        data={matched}
        columns={columns}
        grid={GRID}
        getRowId={changeOrderRowId}
        isLoading={isLoading}
        loadingTestId="change-orders-loading"
        renderRow={renderRow}
        empty={
          /*
            Two distinct empty claims: "nothing exists" and "your filters matched
            nothing", which Clear undoes. Telling the reader to Clear filters when
            no filter is responsible sends them looking for a control that
            changes nothing.
          */
          <ConsoleEmpty
            message={rows.length === 0 ? changeOrdersConsoleCopy.empty.none : changeOrdersConsoleCopy.empty.filtered}
            action={
              emptyBecauseFiltered ? (
                <ConsoleClearButton onClick={clearFilters} disabled={false}>
                  {changeOrdersConsoleCopy.filters.clear}
                </ConsoleClearButton>
              ) : null
            }
          />
        }
        footer={
          /*
            A persistent footer, not a conditional one — present whenever
            there is a list to describe, the same way the reference's
            `.tfoot` always sits under the table.
          */
          <ConsoleFooter
            countTestId="change-orders-count"
            count={`${matched.length} ${matched.length === 1 ? 'ChangeOrder' : 'ChangeOrders'}`}
          />
        }
      />

      {onAnnounce === undefined && (
        <LiveRegion message={announcement} data-testid="change-orders-announce" />
      )}
    </Box>
  );
}

/**
 * The console, fetching its own data and owning the writes its rows ask for.
 *
 * This is what the route mounts. The view above stays renderable without a
 * store, so everything that talks to one lives here: the read, and the single
 * end-ChangeOrder controller every row shares.
 *
 * ONE CONTROLLER AND ONE DIALOG FOR THE WHOLE LIST. `useEndChangeOrder` mounts two
 * mutation hooks; per row that would be 2N idle hooks for the one a reader ever
 * uses. A row asks for the dialog to open against itself and knows nothing
 * else.
 *
 * ONE LIVE REGION, WHEREVER IT LIVES. Three things announce here — the list, the
 * end-ChangeOrder controller and the promote — and a second `role="status"` for any
 * of them is how one event gets read out twice in an order nobody controls. All
 * are funnelled through `announce`, which hands them to the mounting page when
 * it owns a region and renders one here when it does not.
 *
 * ⚠️ A KNOWN RISK RIDES ON THE PROMOTE, ACCEPTED DELIBERATELY AND STATED HERE
 * BECAUSE THIS SURFACE SHOWS MANY CHANGEORDERS AT ONCE. A promotion gate can report
 * itself satisfied when a Space has not received the change: a Unit skipped at
 * creation carries neither start nor end tag, so promotion passes it over
 * without error and the propagation walk never holds the Space back on its
 * account. One person promoting one row can look at what happened; DO NOT add
 * an affordance here that promotes many ChangeOrders at once without revisiting
 * that first, because a fleet-wide sweep cannot.
 */
export function ChangeOrdersConsole(props: ChangeOrdersConsoleProps) {
  const fetched = useChangeOrderConsole();
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
   * org-wide walk `useChangeOrderConsole`'s header warns about, which is exactly
   * why it is tied to an action a person took rather than to a timer.
   */
  const endChangeOrder = useEndChangeOrder({ spaceLabel: data.spaceLabel, onSettled: data.refetch });
  useEffect(() => {
    if (endChangeOrder.announcement !== '') announce(endChangeOrder.announcement);
  }, [endChangeOrder.announcement, announce]);

  const { request } = endChangeOrder;
  const requestEnd = useCallback(
    (intent: ChangeOrderEndIntent, row: ConsoleRow) =>
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
   * `useChangeOrderActions` binds to ONE ChangeOrder, so a list of N rows would
   * otherwise mount N of it. The promote target names the row instead, and the
   * one instance re-binds to it — the same shape as the end-ChangeOrder controller
   * above, for the same reason.
   */
  const [promoteRow, setPromoteRow] = useState<ConsoleRow | null>(null);
  const actions = useChangeOrderActions({
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
  const failedGateCount = blocking.failed.length;
  const gatesBlock = gatesBlockPromotion(failedGateCount);

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
      void run(spaceIds, { failedGateCount }).then((result) => {
        announce(promoteAnnouncement(stageId, result));
      });
    },
    [promoteRow, promotion, gatesBlock, failedGateCount, actions, announce],
  );

  return (
    <>
      <ChangeOrdersConsoleView
        {...props}
        data={data}
        onPromoteChangeOrder={setPromoteRow}
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
            ? changeOrderCopy.blockedBy(
                blocking.failed.length,
                blocking.notEvaluated.length,
                blocking.principal?.reason ?? changeOrderCopy.promoteHeld.generic,
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
      <EndChangeOrderDialog {...endChangeOrder.dialogProps} />
      {onAnnounce === undefined && (
        <LiveRegion message={ownAnnouncement} data-testid="change-orders-announce" />
      )}
    </>
  );
}
