// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What the builder knows about the workflow it is editing: which names are
 * declared, which Stages name them, what each Stage resolves to, what a save
 * would refuse, and which variants no Stage reaches.
 *
 * Every screen region reads from here rather than deriving its own answer, so
 * the rail tile and the problem band cannot come to differ about which Stage is
 * wrong.
 */

import { BUILTIN_NAMES, COMPLETE_LABEL, IMPLICIT_GATE } from './vocabulary';
import { COMPONENT_IN_SELECTOR_MESSAGE, namesComponent } from './api/componentPredicate';
import type { SpaceRow, StageResolution } from './api/resolution/stageResolution';
import type { MessagePart, Problem, StageProblem, Stage, Workflow } from './types';

/**
 * What a ChangeWorkflow is without the two things a definition does not carry:
 * the component a selector would resolve against, and the count of orders it
 * governs. A console row is this -- real, readable, and unable to answer either.
 */
export type UnresolvedWorkflow = Omit<Workflow, 'component' | 'governs'>;

/**
 * A count and the word for it, agreeing.
 *
 * ⚠️ THE ONLY PLACE A NUMBER SHOULD BECOME LANGUAGE IN THIS PAGE. Writing
 * `${n} variants` directly is the bug this exists to prevent, and it is not
 * theoretical: five of them shipped in one afternoon, all reading correctly at
 * the number the author was picturing and wrongly at one. In a real organisation
 * 148 of 177 components hold exactly one Space and there is exactly one workflow,
 * so ONE IS THE COMMON CASE and the number in anyone's head is the rare one.
 *
 * Where a fraction reads badly at one -- "1 of 1 workflows" -- say the thing
 * instead of expressing it as a fraction. A ratio of one to one is not a ratio.
 */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * `a`, `a and b`, `a, b and c`, as runs a caller can render differently.
 *
 * The items and the separators are tagged rather than both being plain strings:
 * these lists are lists of gate names, which are themselves strings, and a caller
 * that had to tell them apart by type would set the separators in the gate face
 * too.
 */
export type JoinRun<T> = { sep: string; item?: undefined } | { item: T; sep?: undefined };

export function andJoin<T>(parts: T[]): Array<JoinRun<T>> {
  if (!parts.length) return [];
  if (parts.length === 1) return [{ item: parts[0] }];
  const out: Array<JoinRun<T>> = [];
  parts.slice(0, -1).forEach((p, i) => {
    if (i > 0) out.push({ sep: ', ' });
    out.push({ item: p });
  });
  out.push({ sep: ' and ' });
  out.push({ item: parts[parts.length - 1] });
  return out;
}

export function andJoinText(parts: string[]): string {
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function declaredNames(wf: UnresolvedWorkflow): string[] {
  return wf.custom.map((c) => c.name);
}

/** Which Stages name a prerequisite today, by the label a reader sees. */
export function usedBy(wf: UnresolvedWorkflow, name: string): string[] {
  const u: string[] = [];
  wf.stages.forEach((s) => {
    if (s.prereqs.includes(name)) u.push(s.name);
  });
  if (wf.final.prereqs.includes(name)) u.push(COMPLETE_LABEL);
  return u;
}

export function stageIndex(wf: UnresolvedWorkflow, id: string): number {
  return wf.stages.findIndex((s) => s.id === id);
}

export function stageById(wf: UnresolvedWorkflow, id: string): Stage | undefined {
  return wf.stages.find((s) => s.id === id);
}

export function customById(wf: UnresolvedWorkflow, id: string) {
  return wf.custom.find((c) => c.id === id);
}

export function isKnownGate(wf: UnresolvedWorkflow, name: string): boolean {
  return BUILTIN_NAMES.includes(name) || declaredNames(wf).includes(name);
}

/**
 * One line per Stage, or null. This is what the rail node reads, so the rail and
 * the problem list cannot come to differ about which Stage is wrong.
 */
export type Resolutions = ReadonlyMap<string, StageResolution>;

/**
 * What only a resolved selector can say about a Stage.
 *
 * ⚠️ IT READS AN ANSWER RATHER THAN COMPUTING ONE. There is no client-side `where`
 * parser: the server's grammar accepts seventeen operators over any queryable
 * attribute, a hand-written mirror accepted three, and the mirror's refusals were
 * refusals of correct work. `listSpaces` answers this authoritatively and this
 * reads what it said.
 *
 * `unresolved` yields nothing at all -- not a fault, not a count. Not yet knowing
 * is not a finding.
 */
export function stageResolutionFault(st: Stage, res: StageResolution | undefined): StageProblem | null {
  if (!res || res.kind === 'unresolved') return null;
  const n = (st.name || '').trim() || 'this Stage';

  if (res.kind === 'invalid') {
    return {
      sev: 'problem',
      short: 'where is unreadable',
      msg: [
        { text: 'Stage ' },
        { text: n, code: true },
        { text: ` cannot be evaluated. ${res.message}` },
      ],
    };
  }

  if (res.spaces.length === 0) {
    /* A note, not a fault. Matching nothing FOR THE COMPONENT BEING PREVIEWED says
       nothing about the definition -- the same Stage may select plenty under
       another, and the workflow names none. */
    return {
      sev: 'note',
      short: 'No variant here',
      msg: [
        { text: 'Stage ' },
        { text: n, code: true },
        { text: ' selects no variant of the component being previewed. It may select plenty under another.' },
      ],
    };
  }
  return null;
}

/**
 * Every fault that can be established from the definition alone.
 *
 * ⚠️ THESE ARE ASSERTIONS OF FAULT, NEVER OF HEALTH. An empty result means no
 * fault was FOUND, not that none exists -- the checks that need a selector
 * resolved are not in here. A caller that reads "nothing returned" as "this
 * workflow is fine" is making a claim this function cannot support.
 */
export function definitionFaults(wf: UnresolvedWorkflow): Problem[] {
  const out: Problem[] = [];

  if (wf.stages.length === 0) {
    out.push({
      sev: 'problem',
      msg: [
        {
          text: 'This workflow has no Stages, so a change order created from it would have nowhere to go.',
        },
      ],
      go: null,
    });
  }

  const seen: Record<string, boolean> = {};
  wf.stages.forEach((st, i) => {
    const n = (st.name || '').trim();
    if (n) {
      if (seen[n]) {
        out.push({
          sev: 'problem',
          msg: [
            { text: 'Two Stages are named ' },
            { text: n, code: true },
            { text: '. A Stage name is unique within the workflow.' },
          ],
          go: { kind: 'stage', id: st.id },
        });
      }
      seen[n] = true;
    }
    const undeclared = st.prereqs.filter((pr) => !isKnownGate(wf, pr));
    if (n && undeclared.length) {
      out.push({
        sev: 'problem',
        msg: [
          { text: 'Stage ' },
          { text: n, code: true },
          { text: ' names prerequisite ' },
          { text: undeclared[0], code: true },
          { text: ', which nothing declares.' },
        ],
        go: { kind: 'stage', id: st.id },
      });
    }
    if (!n) {
      out.push({
        sev: 'problem',
        msg: [{ text: `Stage ${i + 1} has no name.` }],
        go: { kind: 'stage', id: st.id },
      });
    }
  });

  wf.final.prereqs.forEach((pr) => {
    if (!isKnownGate(wf, pr)) {
      out.push({
        sev: 'problem',
        msg: [
          { text: `${COMPLETE_LABEL} names prerequisite ` },
          { text: pr, code: true },
          { text: ', which nothing declares.' },
        ],
        go: { kind: 'final' },
      });
    }
  });

  const cseen: Record<string, boolean> = {};
  wf.custom.forEach((c) => {
    const n = (c.name || '').trim();
    const go = { kind: 'custom' as const, id: c.id };

    if (!n) {
      out.push({ sev: 'problem', msg: [{ text: 'A custom prerequisite has no name.' }], go });
    } else {
      if (cseen[n]) {
        out.push({
          sev: 'problem',
          msg: [{ text: 'Two custom prerequisites are named ' }, { text: n, code: true }, { text: '.' }],
          go,
        });
      }
      cseen[n] = true;

      if (BUILTIN_NAMES.includes(n)) {
        out.push({
          sev: 'problem',
          msg: [
            { text: n, code: true },
            {
              text: ' shadows a built-in gate, which would leave its meaning depending on which was consulted.',
            },
          ],
          go,
        });
      }

      if (n === IMPLICIT_GATE) {
        out.push({
          sev: 'problem',
          msg: [
            { text: IMPLICIT_GATE, code: true },
            {
              text: ' is checked whatever a Stage declares, so it cannot be declared as a gate of your own.',
            },
          ],
          go,
        });
      }
    }

    if (!c.expression.trim().startsWith('cel:')) {
      out.push({
        sev: 'problem',
        msg: [
          { text: 'Custom prerequisite ' },
          { text: n, code: true },
          { text: ' has no ' },
          { text: 'cel:', code: true },
          {
            text: ' prefix on its expression, which is what says the value is an expression and not a literal.',
          },
        ],
        go,
        fix: c.id,
      });
    }

    if (n && usedBy(wf, n).length === 0) {
      out.push({
        sev: 'note',
        msg: [
          { text: 'Custom prerequisite ' },
          { text: n, code: true },
          { text: ` is named by no Stage and not by ${COMPLETE_LABEL}, so it gates nothing.` },
        ],
        go,
      });
    }
  });

  return out;
}

/**
 * Everything a save would refuse, plus what only a resolved selector can add.
 *
 * The component check is client-side on purpose and is the only judgement about
 * expression content that is: `listSpaces` resolves `Labels.Component = 'x'`
 * happily, so live resolution never reports it, and only a check here can say so
 * before the save is refused.
 */
export function problems(wf: UnresolvedWorkflow, resolutions?: Resolutions): Problem[] {
  const out = definitionFaults(wf);

  wf.stages.forEach((st) => {
    if (namesComponent(st.where)) {
      out.push({
        sev: 'problem',
        msg: [
          { text: 'Stage ' },
          { text: (st.name || '').trim() || 'this Stage', code: true },
          { text: ` names Labels.Component in its selector: ${COMPONENT_IN_SELECTOR_MESSAGE}` },
        ],
        go: { kind: 'stage', id: st.id },
      });
    }
    const r = stageResolutionFault(st, resolutions?.get(st.id));
    if (r) out.push({ sev: r.sev, msg: r.msg, go: { kind: 'stage', id: st.id } });
  });

  return out;
}

export function problemCount(wf: UnresolvedWorkflow, resolutions?: Resolutions): number {
  return problems(wf, resolutions).filter((p) => p.sev === 'problem').length;
}

export function noteCount(wf: UnresolvedWorkflow, resolutions?: Resolutions): number {
  return problems(wf, resolutions).filter((p) => p.sev === 'note').length;
}

export interface Coverage {
  all: SpaceRow[];
  covered: SpaceRow[];
  uncovered: SpaceRow[];
}

/**
 * Which variants of the component being previewed a Stage reaches, and which none
 * does.
 *
 * ⚠️ A FRACTION OF THE CHOSEN COMPONENT, NOT A FACT ABOUT THE WORKFLOW. A
 * different component gives different numbers for the same unchanged Stages, so
 * whatever renders this must say which one it is about.
 *
 * A Stage that is `invalid` or `unresolved` contributes nothing, so the figure
 * degrades toward "not covered" rather than claiming coverage it cannot show.
 */
export function coverage(
  wf: UnresolvedWorkflow,
  resolutions: Resolutions,
  inventory: readonly SpaceRow[],
): Coverage {
  const seen = new Set<string>();
  wf.stages.forEach((s) => {
    const r = resolutions.get(s.id);
    if (r?.kind === 'matched') r.spaces.forEach((sp) => seen.add(sp.spaceId));
  });
  return {
    all: [...inventory],
    covered: inventory.filter((sp) => seen.has(sp.spaceId)),
    uncovered: inventory.filter((sp) => !seen.has(sp.spaceId)),
  };
}

/**
 * A Stage's own coverage of the previewed Component's variants, as the two named
 * groups the detail pane renders: what it runs against, and what it does not.
 *
 * ⚠️ THE SAME THREE-WAY SPLIT AS `stageResolutionFault`, READ FOR A DIFFERENT
 * PURPOSE. `unresolved` and `invalid` are never a matched set of zero -- an
 * answer not yet given and a refused expression both read as neither list, so a
 * reader cannot mistake either for "this Stage selects nothing."
 */
export type StageCoverage =
  | { kind: 'unresolved' }
  | { kind: 'invalid'; message: string }
  | { kind: 'split'; runs: SpaceRow[]; skips: SpaceRow[] };

/**
 * `res.spaces` is resolved against Spaces narrowed by the preview scope, not by
 * the component being previewed, so it can name Spaces the component does not
 * own. Iterating `inventory` and partitioning by membership -- rather than
 * splitting `res.spaces` itself -- keeps both lists in `inventory`'s own order,
 * so a variant never jumps position between renders, and drops anything `res`
 * names that `inventory` does not.
 *
 * `res.stale` is read no differently from a fresh answer: `stageResolution.ts`
 * says the design has no state for it.
 */
export function stageCoverage(
  res: StageResolution | undefined,
  inventory: readonly SpaceRow[],
): StageCoverage {
  if (!res || res.kind === 'unresolved') return { kind: 'unresolved' };
  if (res.kind === 'invalid') return { kind: 'invalid', message: res.message };

  const matched = new Set(res.spaces.map((sp) => sp.spaceId));
  const runs: SpaceRow[] = [];
  const skips: SpaceRow[] = [];
  inventory.forEach((sp) => (matched.has(sp.spaceId) ? runs : skips).push(sp));
  return { kind: 'split', runs, skips };
}

export interface DefinitionState {
  tone: 'bad' | 'wait' | 'ok';
  label: string;
}

/**
 * The chip beside a saved workflow's slug.
 *
 * ⚠️ ONLY FOR A WORKFLOW THAT EXISTS. A never-saved draft renders no chip at
 * all -- `definitionFaults` reports its zero Stages as a problem the moment the
 * page opens, and a chip reading "1 problem" grades an empty page against a
 * checklist nobody has been given a chance to fail. The draft's own layout has
 * no chip to fill, so there is nothing here to suppress.
 *
 * Shares `problems()` and its priority order with `summaryNote`, so the chip
 * and the sentence under the actions cannot come to disagree.
 */
export function definitionState(
  wf: UnresolvedWorkflow,
  dirty: boolean,
  resolutions?: Resolutions,
): DefinitionState {
  const pc = problemCount(wf, resolutions);
  if (pc > 0) return { tone: 'bad', label: plural(pc, 'problem', 'problems') };
  if (dirty) return { tone: 'wait', label: 'Unsaved draft' };
  const nc = noteCount(wf, resolutions);
  if (nc > 0) return { tone: 'wait', label: plural(nc, 'note', 'notes') };
  return { tone: 'ok', label: 'Ready' };
}

/** Escape-free message rendering needs the parts; this is the plain-text fallback. */
export function messageText(parts: MessagePart[]): string {
  return parts.map((p) => p.text).join('');
}

/**
 * The hops a prerequisite name lights. `promoted` holds on every hop, so every
 * hop lights -- except the first Stage, which has no hop into it at all.
 */
export function litStageNames(wf: Workflow, name: string | null, implicit: boolean): Set<string> {
  const out = new Set<string>();
  if (!name) return out;
  if (implicit) {
    wf.stages.forEach((st, i) => {
      if (i > 0) out.add(st.name);
    });
    if (wf.stages.length) out.add(COMPLETE_LABEL);
    return out;
  }
  wf.stages.forEach((st) => {
    if (st.prereqs.includes(name)) out.add(st.name);
  });
  if (wf.final.prereqs.includes(name)) out.add(COMPLETE_LABEL);
  return out;
}

/**
 * A never-saved draft has no Space until one is picked at the first save, and
 * the band that carries that picker has no room for the help text a stacked
 * field had -- so the note under the band says it instead. Exported rather
 * than inlined so the two sentences have one home: the second is the first
 * turned into a reason a disabled Save gives for itself.
 */
export const DRAFT_SPACE_NOTE =
  'A workflow belongs to the Space it is created in. The Space is set once, at the first save.';
export const DRAFT_SPACE_REQUIRED =
  'Choose a Space to save into. A workflow belongs to the Space it is created in, set once at the first save.';

export interface SummaryNote {
  text: string;
  /** Empty for plain informational text; `.savenote` has no modifier for that. */
  tone: '' | 'wait' | 'bad';
}

/**
 * The sentence under the summary card's actions: what a save would do, or why
 * it cannot happen yet.
 *
 * ⚠️ THIS IS THE ONLY STATE READOUT A NEVER-SAVED DRAFT GETS. The draft's band
 * renders no `.statechip` at all, so unlike a saved workflow -- where this note
 * sits beside a chip and the two split the work -- every draft branch below has
 * to stand alone. That is why the first two branches come before `problemCount`
 * is consulted rather than after: on a draft the count is a checklist nobody has
 * been given a chance to fail (`definitionFaults` reports zero Stages the
 * instant the page opens), and the structural thing actually blocking the save
 * is the Space. Real faults are never hidden by this -- `ProblemsBand` lists
 * every one of them in full, with a control that goes to it, on the same screen.
 */
export function summaryNote(
  wf: UnresolvedWorkflow,
  dirty: boolean,
  neverSaved: boolean,
  /** Whether a Space has been picked for a first save. Meaningless when saved. */
  spaceChosen: boolean,
  resolutions?: Resolutions,
): SummaryNote {
  if (neverSaved && !dirty) return { text: DRAFT_SPACE_NOTE, tone: '' };
  if (neverSaved && !spaceChosen) return { text: DRAFT_SPACE_REQUIRED, tone: 'wait' };

  const pc = problemCount(wf, resolutions);
  if (pc > 0) {
    return {
      text: `${plural(pc, 'problem', 'problems')} to fix before this can be saved.`,
      tone: 'bad',
    };
  }
  if (dirty) return { text: 'Unsaved changes. Saving writes a revision.', tone: 'wait' };

  const nc = noteCount(wf, resolutions);
  if (nc > 0) {
    return { text: `${plural(nc, 'note', 'notes')}. Nothing here refuses the save.`, tone: 'wait' };
  }
  /* A ChangeWorkflow's stored metadata carries no revision number and no author,
     so neither is said here. When it was last written is on the Last written
     row, and saying it twice would not make it two facts. */
  return { text: 'Saved.', tone: '' };
}
