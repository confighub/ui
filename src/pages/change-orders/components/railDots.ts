// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { SvgIconComponent } from '@mui/icons-material';
import AutorenewIcon from '@mui/icons-material/Autorenew';
import BlockIcon from '@mui/icons-material/Block';
import CheckIcon from '@mui/icons-material/Check';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RemoveIcon from '@mui/icons-material/Remove';
import RestoreIcon from '@mui/icons-material/Restore';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';

import type { ChangeOrderStageState } from '../../x/apps/change-order/changeOrderTypes';
import type { CompleteStepTone } from '../changeOrderCompleteStep';
import {
  changeOrderBorder,
  changeOrderInk,
  changeOrderKindLine,
  changeOrderStatus,
  changeOrderSurface,
} from '../changeOrdersTokens';
import type { StageReviewRail } from '../reviews/changeOrderReviewTypes';

/** A rail node's leading dot: the icon and its three tones. */
export interface RailDot {
  Icon: SvgIconComponent;
  bg: string;
  border: string;
  color: string;
}

/**
 * Whether a stage is held on review: it is the next stage, it has not taken
 * the change, and its review requirements are waiting (`held`) or rejected
 * (`blocked`). `null` for a stage with no reviews, or one not held by them.
 */
export function reviewHoldTone(
  state: ChangeOrderStageState,
  isNext: boolean,
  review: StageReviewRail | undefined,
): 'held' | 'blocked' | null {
  if (review === undefined || state.verdict === 'source') return null;
  // An entry review holds the next stage; a release review holds a promoted stage's release.
  if (review.gateKind === 'release' ? state.verdict !== 'promoted' : !isNext) return null;
  if (review.state === 'rejected') return 'blocked';
  if (review.state === 'pending' || review.state === 'partial') return 'held';
  return null;
}

/**
 * The rail node's leading dot, keyed off `ChangeOrderStageVerdict` the same way
 * the reference keys its own node off `stage.state` (`ICON.check`/`spin`/
 * `play`/`warn`/`lock` at line ~4224 of the mockup). `source`, `promoted` and
 * `released` all read as the reference's "done" — none of them is a stage
 * still to happen. `waiting` splits in two: the one stage the sequence would
 * promote next reads as "next" (a ready action), every later `waiting` stage
 * reads as the reference's untouched default (a future stage, locked).
 *
 * `passed` is the console row's own count (`stagePathProgress`): a stage the
 * ChangeOrder has passed is drawn done, so the rail, its pips and "N of M" agree.
 */
export function railDot(state: ChangeOrderStageState, isNext: boolean, passed: boolean, review?: StageReviewRail): RailDot {
  const done = { Icon: CheckIcon, bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success };
  if (passed && state.verdict !== 'restored' && state.verdict !== 'restore-released') return done;
  // Held on review: the next stage waits on approvals (person) or a rejection blocks it (ban).
  const reviewTone = reviewHoldTone(state, isNext, review);
  if (reviewTone === 'blocked') {
    return { Icon: BlockIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderStatus.dangerLine, color: changeOrderStatus.danger };
  }
  if (reviewTone === 'held') {
    return { Icon: PersonOutlineOutlinedIcon, bg: changeOrderStatus.warnSoft, border: changeOrderStatus.warnLine, color: changeOrderStatus.warn };
  }
  // The stage selects no Space, so there is no workload of its own to report
  // on: it is drawn neutral rather than in the danger tone of a failed gate.
  // What it does to the stage after it — the server refuses to promote past a
  // stage that selects no Space — is said on that stage's gate.
  if (state.verdict !== 'source' && state.spaceCount === 0) {
    return { Icon: RemoveIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
  switch (state.verdict) {
    case 'source':
    case 'promoted':
    case 'released':
      return done;
    case 'in-progress':
      return { Icon: AutorenewIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent };
    case 'gated':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderKindLine.unknown, color: changeOrderStatus.danger };
    case 'waiting':
      return isNext
        ? { Icon: PlayCircleOutlineIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent }
        : { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
    case 'unknown':
      return { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
    // Reverted, not a live problem — same neutral treatment as 'unknown'
    // rather than the danger tone 'gated' gets, so a reader does not mistake
    // an undone stage for one still failing a check.
    case 'restored':
    case 'restore-released':
      return { Icon: RestoreIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
}

/**
 * The Complete node's leading dot, keyed off `completeStepTone` rather than a
 * stage verdict — the step has none, because it is not a stage.
 *
 * Same icons `railDot` draws (check / warning / lock / restore), so the
 * trailing node reads as one more node on the same rail rather than a second
 * vocabulary at the end of it.
 *
 * A complete ChangeOrder reads `done` whether or not its last stage's health was
 * checked. The rail's ticks report ARRIVAL, not health — every stage node to
 * the left draws a plain green tick off promote/release counts — and the
 * node's label ("Complete, unverified") says when health went unchecked.
 *
 * `blocked` takes the accent rather than the danger tone — something is
 * outstanding, which is a thing to do, not a thing that failed.
 *
 * ⚠️ `restored` NEEDS `abandoned` TO DRAW AT ALL, AND THE TONE ALONE CANNOT
 * SUPPLY IT. Two different ChangeOrders reach that tone (`completeStepTone` rung
 * 4) and only one of them was ever undone; `isCompleteStepAbandoned` is the
 * one place that tells them apart. An undo glyph on a ChangeOrder that was
 * abandoned in place claims a restore that never happened — the promotions it
 * had already made are still standing. The TREATMENT stays identical either
 * way, deliberately: both readings are terminal and unactionable, and an
 * abandoned ChangeOrder is not an error, so the neutral ground/border/ink is the
 * honest one for both and only the glyph moves.
 */
export function completeRailDot(tone: CompleteStepTone, abandoned: boolean): RailDot {
  switch (tone) {
    case 'done':
      return { Icon: CheckIcon, bg: changeOrderStatus.successGround, border: changeOrderStatus.successLine, color: changeOrderStatus.success };
    case 'degraded':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.dangerSoft, border: changeOrderKindLine.unknown, color: changeOrderStatus.danger };
    case 'blocked':
      return { Icon: WarningAmberOutlinedIcon, bg: changeOrderStatus.accentSoft, border: changeOrderStatus.accentLine, color: changeOrderStatus.accent };
    case 'restored':
      return {
        Icon: abandoned ? BlockIcon : RestoreIcon,
        bg: changeOrderSurface.sunk,
        border: changeOrderBorder.strong,
        color: changeOrderInk.subtle,
      };
    case 'gated':
      return { Icon: LockOutlinedIcon, bg: changeOrderSurface.sunk, border: changeOrderBorder.strong, color: changeOrderInk.subtle };
  }
}
