// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// `summaryNote` and `definitionState` (workflow-builder/model.ts) — the sentence
// under the summary card's actions and the chip beside its slug — exercised
// directly, same pure-derivation pattern as `rollout-outcome.pure.spec.ts`: no
// page, no browser.
//
// These two now render in different places on different sides of the first
// save. A never-saved draft gets the band, which has NO CHIP AT ALL, so its
// note is the only state readout it has; a saved workflow gets both. The pair
// is tested together here because the thing that would go wrong quietly is
// them disagreeing — a chip saying "2 problems" over a sentence saying "Saved."
// reads as a broken page, and nothing in the types stops it.

import { expect, test } from '@playwright/test';

import {
  DRAFT_SPACE_NOTE,
  DRAFT_SPACE_REQUIRED,
  definitionState,
  summaryNote,
} from '../src/pages/x/workflow-builder/model';
import type { UnresolvedWorkflow } from '../src/pages/x/workflow-builder/model';
import type { Stage } from '../src/pages/x/workflow-builder/types';

function stage(name: string): Stage {
  return { id: `st-${name}`, name, where: 'Labels.Variant = "canary"', prereqs: [] };
}

/* No resolutions are ever passed below, so no Stage here can produce a
   resolution fault -- every problem these cases carry is a definition fault,
   which is the half of the ladder the draft states turn on. */
function workflow(stages: Stage[] = []): UnresolvedWorkflow {
  return {
    key: 'wf-1',
    displayName: '',
    slug: '',
    space: '',
    labels: [],
    updated: '',
    age: '',
    stages,
    final: { prereqs: [] },
    custom: [],
  };
}

/* The blank draft the page opens with: no slug, no Space, no Stages. */
const BLANK = workflow();
/* Enough to save: one named Stage, so `definitionFaults` reports nothing. */
const ONE_STAGE = workflow([stage('canary')]);

test.describe('summaryNote, never-saved draft', () => {
  test('an untouched draft is told what a Space is, not what it has failed', () => {
    const note = summaryNote(BLANK, false, true, false);

    expect(note.text).toBe(DRAFT_SPACE_NOTE);
    // Plain, not `wait` or `bad`: nothing is wrong yet, so nothing is warned.
    expect(note.tone).toBe('');
    // The regression this guards: `definitionFaults` genuinely reports the
    // empty Stage list as a problem, and an earlier ladder let that reach the
    // reader before they had touched anything.
    expect(note.text).not.toContain('problem');
  });

  test('an untouched draft with a Space already picked is still not graded', () => {
    // Picking a Space is page state, not workflow state, so `dirty` stays
    // false -- and the note must not fall through to the fault count.
    const note = summaryNote(BLANK, false, true, true);

    expect(note.text).toBe(DRAFT_SPACE_NOTE);
    expect(note.tone).toBe('');
  });

  test('an edited draft with no Space says why Save is refused', () => {
    // The band drops the Space field's own help text, so this sentence is the
    // only thing explaining a disabled Save button.
    const note = summaryNote(ONE_STAGE, true, true, false);

    expect(note.text).toBe(DRAFT_SPACE_REQUIRED);
    expect(note.text).toContain('Space');
    expect(note.tone).toBe('wait');
  });

  test('an edited, saveable draft reports the unsaved change, not the Space', () => {
    const note = summaryNote(ONE_STAGE, true, true, true);

    expect(note.text).toBe('Unsaved changes. Saving writes a revision.');
    expect(note.tone).toBe('wait');
  });

  test('an edited draft still short of a Stage reports the real fault', () => {
    // Once a Space is chosen and the reader has acted, the fault count is
    // theirs to see -- the suppression above is about timing, not about
    // hiding faults on a draft for good.
    const note = summaryNote(BLANK, true, true, true);

    expect(note.tone).toBe('bad');
    expect(note.text).toBe('1 problem to fix before this can be saved.');
  });
});

test.describe('summaryNote, saved workflow', () => {
  test('the Space argument cannot change a saved workflow’s note', () => {
    // `spaceChosen` is the pending Space for a FIRST save. Nothing about a
    // saved workflow may depend on it.
    for (const spaceChosen of [true, false]) {
      expect(summaryNote(ONE_STAGE, false, false, spaceChosen).text).toBe('Saved.');
      expect(summaryNote(ONE_STAGE, true, false, spaceChosen).text).toBe(
        'Unsaved changes. Saving writes a revision.',
      );
      expect(summaryNote(BLANK, false, false, spaceChosen).tone).toBe('bad');
    }
  });

  test('a clean saved workflow reads as saved', () => {
    const note = summaryNote(ONE_STAGE, false, false, false);

    expect(note.text).toBe('Saved.');
    expect(note.tone).toBe('');
  });
});

test.describe('the chip and the note agree', () => {
  /* Every combination the saved card can be in. The chip and the note are
     derived separately; this is what stops them drifting apart. */
  const cases: Array<{ wf: UnresolvedWorkflow; dirty: boolean }> = [
    { wf: BLANK, dirty: false },
    { wf: BLANK, dirty: true },
    { wf: ONE_STAGE, dirty: false },
    { wf: ONE_STAGE, dirty: true },
  ];

  for (const { wf, dirty } of cases) {
    test(`stages=${wf.stages.length} dirty=${dirty}`, () => {
      const chip = definitionState(wf, dirty);
      const note = summaryNote(wf, dirty, false, false);

      if (chip.tone === 'bad') {
        expect(note.tone).toBe('bad');
        // Same count, same wording, from the same `problems()` call.
        expect(note.text.startsWith(chip.label)).toBe(true);
      } else if (chip.label === 'Unsaved draft') {
        expect(note.tone).toBe('wait');
        expect(note.text).toContain('Unsaved changes');
      } else {
        expect(chip.label).toBe('Ready');
        expect(note.text).toBe('Saved.');
      }
    });
  }

  test('definitionState never returns nothing', () => {
    // It used to return null for the blank-untouched draft. That state has its
    // own layout now and never reaches a chip, so a null return would be an
    // unrenderable state nothing asks for.
    expect(definitionState(BLANK, false)).not.toBeNull();
  });
});
