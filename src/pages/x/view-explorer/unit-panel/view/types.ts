// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { UnitRead } from '@confighub/rtk-query';

import type { RowFacts } from '../attention';
import type { StatusKind } from '../../model/types';
import type { GroupSummary } from '../group-context';
import type { PanelLinks } from '../links';
import type { UpgradePreviewRequest } from '../upgrade-preview';
import type { ActionId, ActionState, FetchedDetails, NextProblem, Verdict } from '../verdict';

/**
 * The actions the panel can run now. The views draw a button, a fix link or
 * an item of the action list only for an action that is here, so an action
 * whose flow is not wired is left out rather than shown dead.
 */
export type PanelActions = Partial<Record<ActionId, (arg?: string) => void>>;

/** The diff of a Unit's unreleased revisions, from the released one to the head. */
export interface UnitDiffRequest {
  spaceId: string;
  unitId: string;
  slug: string;
  from: number;
  to: number;
}

export type UnitPanelTab = 'summary' | 'resources';

/**
 * The dialog open on the panel's Unit. The diff and the upgrade preview are
 * read only; the upgrade and restore confirms are the only steps that write.
 */
export type PanelDialog =
  | { kind: 'diff'; unitId: string; request: UnitDiffRequest }
  | { kind: 'preview'; unitId: string; request: UpgradePreviewRequest }
  | { kind: 'upgrade'; unitId: string; unit: UnitRead }
  | { kind: 'restore'; unitId: string; unit: UnitRead };

export interface PanelDialogActions {
  close: () => void;
  /** From the upgrade preview, on to the upgrade confirm. */
  confirmUpgrade: () => void;
  /** The upstream moved while the preview was open: preview the revisions the Unit has now. */
  previewAgain: () => void;
  /** A confirm wrote: the panel takes focus back when it closes, since what opened it may be gone. */
  written: () => void;
}

/** Everything the row panel of a Unit draws, worked out above it from the row and the view. */
export interface UnitPanelModel {
  facts: RowFacts;
  verdict: Verdict;
  /** The open Unit's place in table order, from 1; null when a filter hides it. */
  position: number | null;
  total: number;
  group: GroupSummary | null;
  /** The table's status of the open Unit, which its group's count names. */
  status: StatusKind;
  needsAttention: boolean;
  nextProblem: NextProblem | null;
  onPrevious?: () => void;
  onNext?: () => void;
  /** Open another Unit of the view, showing it in the table. */
  onGoTo: (id: string) => void;
  actions: PanelActions;
  /** The actions that go to another page, by where they go: drawn as links that open a new browser tab. */
  links: PanelLinks;
  /** The read of the Unit's own details. */
  details: {
    status: FetchedDetails['status'];
    /** The Unit no longer exists. */
    gone: boolean;
    /** The Unit was read, but not its Space's Component, which Release needs. */
    componentError: boolean;
    retry: () => void;
  };
  tab: UnitPanelTab;
  onTabChange: (tab: UnitPanelTab) => void;
  /** The dialog open on this Unit, if any. */
  dialog: PanelDialog | null;
  /** The upgrade the Unit has now, which an open preview is checked against; null when it has none. */
  upgrade: UpgradePreviewRequest | null;
  dialogActions: PanelDialogActions;
}

/** The actions of the list that can run now, in the verdict's order. */
export function runnableActions(list: readonly ActionState[], actions: PanelActions): ActionState[] {
  return list.filter((a) => !!actions[a.id]);
}
