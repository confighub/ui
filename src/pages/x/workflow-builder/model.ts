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

import { BUILTIN_NAMES, CHANGESET_REFUSED_BUILTINS, COMPLETE_LABEL, IMPLICIT_GATE } from './vocabulary';
import type { ChangeWorkflowAttestationPrerequisite } from '@confighub/rtk-query';

import {
  MAX_ATTESTATION_COUNT,
  MAX_ATTESTATION_PREREQUISITES,
  MAX_ATTESTATION_TYPE_LENGTH,
  MAX_ATTESTATION_USERS,
  MAX_DESCRIPTION_LENGTH,
} from './api/limits';
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
/**
 * Whether the workflow governs ChangeSets rather than ChangeOrders. One with no Stages
 * has nowhere to promote a change to, so a ChangeOrder refuses it; a ChangeSet is not
 * promoted, so it takes one, and Complete -- its Final -- is what closing the ChangeSet
 * is gated on, in every Space the ChangeSet was opened in.
 */
export function governsChangeSets(wf: { stages: readonly unknown[] }): boolean {
  return wf.stages.length === 0;
}

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

/** Every name the workflow declares: its custom prerequisites, then its attestation ones. */
export function declaredNames(wf: UnresolvedWorkflow): string[] {
  return [...wf.custom.map((c) => c.name), ...attestationNames(wf)];
}

export function attestationNames(wf: UnresolvedWorkflow): string[] {
  return wf.attestations.map((a) => a.Name);
}

export function isAttestationName(wf: UnresolvedWorkflow, name: string): boolean {
  return wf.attestations.some((a) => a.Name === name);
}

/** Which Stages require a prerequisite of their Releases. Only an attestation one can be. */
export function releasedBy(wf: UnresolvedWorkflow, name: string): string[] {
  return wf.stages.filter((s) => s.releasePrereqs.includes(name)).map((s) => s.name);
}

/** `a`, `a or b`, `a, b or c`: any one of them, where `andJoinText` would read as all. */
function orJoinText(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
}

/**
 * What an attestation prerequisite requires, in a sentence, with the server's defaults
 * applied: `Type` is Approval when empty and `Count` is 1 when zero.
 *
 * `nameOf` turns a User ID into what a reader calls that User. The Groups are counted rather
 * than named, since a Group's name is readable only by its members.
 */
export function attestationSummary(
  a: ChangeWorkflowAttestationPrerequisite,
  nameOf: (userId: string) => string,
): string {
  const type = a.Type?.trim() || 'Approval';
  const count = a.Count && a.Count > 0 ? a.Count : 1;
  const users = (a.FromUserIDs ?? []).map(nameOf);
  const groups = a.FromGroupIDs ?? [];

  let what: string;
  if (a.DistinctGroups && groups.length) {
    what = `One ${type} from a member of each of ${plural(groups.length, 'group', 'groups')}`;
  } else {
    const from: string[] = [];
    if (users.length) from.push(orJoinText(users));
    if (groups.length) from.push(`members of ${plural(groups.length, 'group', 'groups')}`);
    what = from.length
      ? `${plural(count, type, `${type}s`)} from ${from.join(' or ')}`
      : `${plural(count, type, `${type}s`)} from anyone who may attest in the Space`;
  }

  const rules = [`${what} on each Revision.`];
  rules.push(a.AllowAuthors ? 'Authors of the change count.' : 'Authors of the change do not count.');
  if (a.MaxAge) rules.push(`No older than ${a.MaxAge}.`);
  if (a.IgnoreFail) rules.push('A Fail does not block.');
  return rules.join(' ');
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

export function attestationById(wf: UnresolvedWorkflow, id: string) {
  return wf.attestations.find((a) => a.id === id);
}

/** The declaration an id names, whichever kind it is. Ids are minted per kind, so one names at most one. */
export function declaredById(wf: UnresolvedWorkflow, id: string) {
  return customById(wf, id) ?? attestationById(wf, id);
}

/**
 * Follow a declaration's new name into every list that carried the old one: each
 * Stage's entry gates and release gates, and Complete's. Declared once and named
 * wherever it applies, so a rename that stopped at the declaration would leave the
 * names it was known by declared by nothing, and the workflow would stop saving.
 *
 * Mutates `wf`, which the builder hands it as a draft copy.
 */
export function renameGate(wf: UnresolvedWorkflow, from: string, to: string): void {
  const follow = (list: string[]) => {
    const i = list.indexOf(from);
    if (i !== -1) list[i] = to;
  };
  wf.stages.forEach((st) => {
    follow(st.prereqs);
    follow(st.releasePrereqs);
  });
  follow(wf.final.prereqs);
}

/**
 * What a Type may look like, as the server checks it (`internal/models/attestation.go`): a
 * name, as a Label key's name part is.
 */
const ATTESTATION_TYPE = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;

export function isValidAttestationType(type: string): boolean {
  return type.length <= MAX_ATTESTATION_TYPE_LENGTH && ATTESTATION_TYPE.test(type);
}

/**
 * A positive Go duration, which is what the server parses `MaxAge` with: one or more
 * number-and-unit pairs such as `72h`, `1h30m` or `90m`, where the units are `ns`, `us`,
 * `ms`, `s`, `m` and `h`. A duration of all zeros parses but is refused, since no
 * Attestation is younger than nothing.
 */
const GO_DURATION = /^(\d+(\.\d*)?(ns|us|µs|ms|s|m|h))+$/;

export function isValidMaxAge(maxAge: string): boolean {
  return GO_DURATION.test(maxAge) && /[1-9]/.test(maxAge);
}

/** A UUID as the API writes one, for a Group ID typed rather than picked. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

  if (governsChangeSets(wf)) {
    const refused = wf.final.prereqs.filter((pr) => CHANGESET_REFUSED_BUILTINS.includes(pr));
    if (refused.length) {
      out.push({
        sev: 'problem',
        msg: [
          { text: `With no Stages this workflow governs ChangeSets, and ${COMPLETE_LABEL} names ` },
          { text: refused[0], code: true },
          { text: ', which closing a ChangeSet cannot wait on: its change is released by a ChangeOrder after it closes.' },
        ],
        go: { kind: 'final' },
      });
    }
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

  wf.stages.forEach((st) => {
    const n = (st.name || '').trim();
    const undeclared = st.releasePrereqs.filter((pr) => !isAttestationName(wf, pr));
    if (n && undeclared.length) {
      out.push({
        sev: 'problem',
        msg: [
          { text: 'Stage ' },
          { text: n, code: true },
          { text: ' requires ' },
          { text: undeclared[0], code: true },
          { text: ' of its Releases, which no attestation prerequisite declares.' },
        ],
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

      if (isAttestationName(wf, n)) {
        out.push({
          sev: 'problem',
          msg: [
            { text: 'A custom prerequisite and an attestation prerequisite are both named ' },
            { text: n, code: true },
            { text: '.' },
          ],
          go,
        });
      }

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

  if (wf.attestations.length > MAX_ATTESTATION_PREREQUISITES) {
    out.push({
      sev: 'problem',
      msg: [
        {
          text: `This workflow declares ${plural(wf.attestations.length, 'attestation prerequisite', 'attestation prerequisites')}, and a workflow may carry at most ${MAX_ATTESTATION_PREREQUISITES}.`,
        },
      ],
      go: null,
    });
  }

  const aseen: Record<string, boolean> = {};
  wf.attestations.forEach((a) => {
    const n = (a.Name || '').trim();
    const go = { kind: 'attestation' as const, id: a.id };
    const who = (what: string): MessagePart[] =>
      n
        ? [{ text: 'Attestation prerequisite ' }, { text: n, code: true }, { text: ` ${what}` }]
        : [{ text: `An attestation prerequisite ${what}` }];

    if (!n) {
      out.push({ sev: 'problem', msg: [{ text: 'An attestation prerequisite has no name.' }], go });
    } else {
      if (aseen[n]) {
        out.push({
          sev: 'problem',
          msg: [{ text: 'Two attestation prerequisites are named ' }, { text: n, code: true }, { text: '.' }],
          go,
        });
      }
      aseen[n] = true;

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

    const type = a.Type?.trim() ?? '';
    if (type && !isValidAttestationType(type)) {
      out.push({
        sev: 'problem',
        msg: who(
          `has a Type of ${type}, and a Type is at most ${MAX_ATTESTATION_TYPE_LENGTH} characters of letters, digits, '-', '_' and '.', beginning and ending with a letter or digit.`,
        ),
        go,
      });
    }

    if (a.Count !== undefined && (a.Count < 0 || a.Count > MAX_ATTESTATION_COUNT)) {
      out.push({
        sev: 'problem',
        msg: who(`asks for ${a.Count} attesters, and a count is between 1 and ${MAX_ATTESTATION_COUNT}.`),
        go,
      });
    }

    const users = a.FromUserIDs ?? [];
    if (users.length > MAX_ATTESTATION_USERS) {
      out.push({
        sev: 'problem',
        msg: who(`names ${plural(users.length, 'User', 'Users')}, and at most ${MAX_ATTESTATION_USERS} may be named.`),
        go,
      });
    }

    const groups = a.FromGroupIDs ?? [];
    if (groups.some((g) => !isUuid(g))) {
      out.push({
        sev: 'problem',
        msg: who(`names a Group by something other than its ID.`),
        go,
      });
    }

    if (a.DistinctGroups && groups.length === 0) {
      out.push({
        sev: 'problem',
        msg: who('requires an attester from each Group but names no Groups to draw them from.'),
        go,
      });
    }

    const maxAge = a.MaxAge?.trim() ?? '';
    if (maxAge && !isValidMaxAge(maxAge)) {
      out.push({
        sev: 'problem',
        msg: who(`has a maximum age of ${maxAge}, and a maximum age is a positive duration such as 72h.`),
        go,
      });
    }

    if ((a.Description ?? '').length > MAX_DESCRIPTION_LENGTH) {
      out.push({
        sev: 'problem',
        msg: who(
          `has a description of ${(a.Description ?? '').length} characters, and a description is at most ${MAX_DESCRIPTION_LENGTH}.`,
        ),
        go,
      });
    }

    if (n && usedBy(wf, n).length === 0 && releasedBy(wf, n).length === 0) {
      out.push({
        sev: 'note',
        msg: [
          { text: 'Attestation prerequisite ' },
          { text: n, code: true },
          {
            text: ` is named by no Stage, no Stage's Releases and not by ${COMPLETE_LABEL}, so it gates nothing.`,
          },
        ],
        go,
      });
    }
  });

  return out;
}

/**
 * Everything a save would refuse, plus what only a resolved selector can add.
 */
export function problems(wf: UnresolvedWorkflow, resolutions?: Resolutions): Problem[] {
  const out = definitionFaults(wf);

  wf.stages.forEach((st) => {
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
    if (st.prereqs.includes(name) || st.releasePrereqs.includes(name)) out.add(st.name);
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
