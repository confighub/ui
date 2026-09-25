// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The component a workflow is being looked at through, and what that makes its
 * Stages resolve to.
 *
 * ⚠️ NONE OF THIS IS PART OF THE DEFINITION. A ChangeWorkflow names no component;
 * the one here is scratch, chosen to answer "show me what this would do for
 * payments", never stored and never sent. Every number derived from it is a fact
 * about the workflow SEEN THROUGH this component, and a different choice gives
 * different numbers for the same unchanged Stages.
 *
 * Which is why it travels as one object rather than as a component here and a
 * count there: anything that renders a number from it needs the name that makes
 * the number true, and separating them is how a count ends up on screen without
 * the thing it is a count of.
 */

import type { Resolutions } from './model';
import type { SpaceRow } from './api/resolution/stageResolution';

export interface Preview {
  /** Null until one is chosen. Nothing resolves and no count is shown until it is. */
  component: string | null;
  resolutions: Resolutions;
  /** Every variant of the chosen component: the denominator coverage is a fraction of. */
  inventory: readonly SpaceRow[];
  /**
   * Whether `inventory` is an answer, and why not when it isn't.
   *
   * ⚠️ 'unasked' AND 'unsettled' ARE DIFFERENT FACTS. A single boolean here used
   * to answer "not established" for both a component nobody has chosen and a
   * read that is loading or has failed for one that was -- so a reader who
   * checked only the boolean could not tell a question with no answer yet from
   * a question nobody has asked. They are not the same kind of absence: 'unasked'
   * is answerable immediately, by choosing a component; 'unsettled' is not
   * something the reader can do anything about from here.
   *
   * An empty or short `inventory` is not a small component -- it is also what
   * every one of these three states looks like by length alone, which is why
   * `inventory.length` cannot stand in for this. Without it, a loading page
   * would report "All 0 variants are covered", the same defect as a failed
   * count rendering as zero.
   */
  status: 'unasked' | 'unsettled' | 'established';
}

export const NO_PREVIEW: Preview = {
  component: null,
  resolutions: new Map(),
  inventory: [],
  status: 'unasked',
};
