// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The builder's state and every action that changes it.
 *
 * The workflow is held as one value and replaced wholesale on each edit rather
 * than mutated in place: the rail, the detail pane, the prerequisites column and
 * the fault band all derive from it, and a partial update would let two of them
 * disagree for a frame.
 *
 * The workflow being edited arrives from outside. This hook owns the DRAFT --
 * the unsaved edits and the last written revision it can be discarded back to --
 * and knows nothing about how either was fetched.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { customById, problemCount, problems, stageById, stageIndex, usedBy } from './model';
import { describeMove } from './reorder';
import { IMPLICIT_GATE } from './vocabulary';
import type { ReorderNote, Selection, Stage, Workflow } from './types';

export type Screen = 'builder' | 'console';

/**
 * A copy the draft can edit without the fetched value changing under it.
 * `structuredClone` rather than a JSON round trip: the fetched workflow carries
 * server-shaped values, and a JSON round trip turns a Date into a string and
 * drops an undefined without saying so.
 */
function draftCopy<T>(v: T): T {
  return structuredClone(v);
}

interface BuilderState {
  screen: Screen;
  /** Null until the workflow being edited has been fetched. */
  workflow: Workflow | null;
  /** The last written revision, so Discard has something to go back to. */
  saved: Workflow | null;
  /**
   * The workflow a console row asked for, by id.
   *
   * ⚠️ NOT BY SLUG. A ChangeWorkflow slug is unique within a Space, not across the
   * organisation -- the index is `(organization_id, space_id, slug)` -- so two
   * Spaces may each hold a `payments-main-line`, and a slug alone would open
   * whichever was found first without saying it had chosen.
   */
  openId: string | null;
  /**
   * How the last save ended, when it did not save. Never discards the draft:
   * a refusal is about the stored copy or the content, not about the work.
   */
  saveNotice: { kind: 'rejected' | 'conflict' | 'failed'; message: string } | null;
  /** True while a save is in flight. The acting control says so; the page stays usable. */
  saving: boolean;
  selection: Selection;
  /**
   * The column's own selection, separate from the rail's: a Stage can be open on
   * the left while a custom prerequisite is open on the right, which is the whole
   * reason for putting them side by side.
   */
  cpSel: string | null;
  reorder: ReorderNote | null;
  dirty: boolean;
  search: string;
  /**
   * The Space to filter rows by, or `null` for every Space.
   *
   * ⚠️ NOT A STRING WITH A SENTINEL. `'all'` was overloaded to mean both "no
   * filter" and "the literal value some Space is slugged", which are not the
   * same fact -- a Space named `all` is a legal slug, and selecting it read
   * back exactly like selecting nothing. `null` cannot collide with anything a
   * Space is ever named, which a string sentinel can never guarantee.
   */
  spaceFilter: string | null;
}

function emptyState(): BuilderState {
  return {
    screen: 'builder',
    workflow: null,
    saved: null,
    openId: null,
    saveNotice: null,
    saving: false,
    selection: null,
    cpSel: null,
    reorder: null,
    dirty: false,
    search: '',
    spaceFilter: null,
  };
}

export interface BuilderApi extends BuilderState {
  selectStage: (id: string) => void;
  selectFinal: () => void;
  clearSelection: () => void;
  selectCustom: (id: string) => void;
  /** The column's own toggle: an empty id closes whatever is open. */
  toggleCustom: (id: string) => void;
  goConsole: () => void;
  openWorkflow: (changeWorkflowId: string) => void;
  /** Reported by the save path; clearing it is the caller's, since only they know it is resolved. */
  setSaveNotice: (notice: BuilderState['saveNotice']) => void;
  /**
   * ⚠️ DO NOT CLEAR THIS IN A `finally`, OR IN ANYTHING ELSE THAT ONLY RUNS WHEN
   * THE SAVE SETTLES.
   *
   * A save refused with 403 never settles: `baseQueryWithReauth` answers one with
   * a promise that neither resolves nor rejects, deliberately, while the app
   * navigates to `/access-denied`. So a `finally` never runs, and the button
   * keeps saying `Saving...` for as long as the page survives -- which is not
   * long, because the redirect unmounts it.
   *
   * That is what makes the mistake durable: **it is invisible exactly when the
   * mechanism works.** The button nobody sees is on a page that is going away. It
   * becomes visible only if the redirect is slow, fails, or is later removed, at
   * which point the control is stuck with no way back.
   *
   * Two of the three navigations use `location.replace`, which leaves no history
   * entry, and the third goes to a server endpoint. So a reader stranded by a
   * navigation that does not complete has no working control AND no way back.
   * That compounding is why this is worth guarding rather than leaving to the
   * redirect: the failure has no exit.
   *
   * So clear it where the outcome is known instead -- on each arm of the result
   * -- and let the permission case simply never arrive. Nothing here should be
   * correct only because a promise resolved.
   */
  setSaving: (saving: boolean) => void;
  /** Take the stored copy, discarding the draft. The refetch itself belongs to the data layer. */
  acceptStored: () => void;
  setSearch: (v: string) => void;
  setSpaceFilter: (v: string | null) => void;
  clearFilters: () => void;
  addStage: () => void;
  removeStage: (id: string) => void;
  moveStage: (id: string, dir: -1 | 1) => void;
  undoMove: () => void;
  dropMove: () => void;
  goToFirstProblem: () => void;
  setStageName: (value: string) => void;
  setStageWhere: (value: string) => void;
  toggleGate: (gate: string, on: boolean) => void;
  addCustom: () => void;
  removeCustom: (id: string) => void;
  setCustomName: (id: string, value: string) => void;
  setCustomExpression: (id: string, value: string) => void;
  setCustomDescription: (id: string, value: string) => void;
  fixPrefix: (id: string) => void;
  setWorkflowName: (value: string) => void;
  setWorkflowSlug: (value: string) => void;
  save: () => void;
  discard: () => void;
  /** Set on the render after a Stage is opened, so the detail can be scrolled to once. */
  revealNonce: number;
  customRevealNonce: number;
  /** Set when a newly declared prerequisite's name field should take focus. */
  focusCustomId: string | null;
  clearFocusCustom: () => void;
}

/** A builder whose workflow has arrived. Everything below the loading gate has one. */
export type LoadedBuilderApi = BuilderApi & { workflow: Workflow; saved: Workflow };

export function isLoaded(api: BuilderApi): api is LoadedBuilderApi {
  return api.workflow !== null && api.saved !== null;
}

export function useWorkflowBuilder(
  loaded: Workflow | null,
  /**
   * What to reseed the guard on, when it should not be `loaded.slug`.
   *
   * A real workflow's own slug already varies per session, and reading it is
   * enough -- that is the default, unchanged, when this is omitted. A blank
   * draft is different: its slug is meant to be an honest, empty, EDITABLE
   * field (`SummaryCard`'s slug input reads and writes this same value), not a
   * place to hide a uniqueness marker. Baking a fresh marker into the slug
   * itself would put that marker in front of the person typing and, if they
   * saved before noticing, onto the server. So a caller constructing `loaded`
   * locally -- rather than reading it from a fetch -- supplies its own key
   * here instead, and the two values never have to be the same one.
   */
  identityKey?: string,
): BuilderApi {
  const [s, setS] = useState<BuilderState>(emptyState);
  const [revealNonce, setRevealNonce] = useState(0);
  const [customRevealNonce, setCustomRevealNonce] = useState(0);
  const [focusCustomId, setFocusCustomId] = useState<string | null>(null);

  /**
   * Seed the draft from a newly fetched -- or newly constructed -- workflow.
   *
   * Keyed on `loaded.key` by default, not `loaded.slug`. `key` is the server's
   * identity for the entity (`ChangeWorkflowID`, or the slug only when that is
   * absent -- see `fromWire`) and never changes for a given workflow; `slug` is
   * editable content, the same field `SummaryCard`'s slug input reads and
   * writes. Keying on slug meant a background refetch landing after a rename
   * looked exactly like a refetch of a DIFFERENT workflow -- the guard below
   * failed for a reason that was never "the reader asked for something else",
   * and a save-in-flight edit could be silently overwritten by the fetch that
   * confirmed the very rename that triggered it. `key` doesn't move when the
   * one editable field it used to be a stand-in for does.
   *
   * A refetch of the SAME identity does not discard edits in progress: a
   * background refresh must never take the document out from under someone
   * typing into it. A refetch that has genuinely moved on is a conflict, which
   * Save reports rather than this resolving silently. `identityKey`, when
   * supplied, overrides what counts as "the same one" -- see its own comment
   * for why a synthetic draft needs that.
   */
  const loadedKey = loaded ? (identityKey ?? loaded.key) : null;
  const seededKey = useRef<string | null>(null);
  const loadedRef = useRef<Workflow | null>(loaded);
  loadedRef.current = loaded;
  useEffect(() => {
    if (!loaded || seededKey.current === loadedKey) return;
    seededKey.current = loadedKey;
    setS((p) => ({
      ...emptyState(),
      screen: p.screen,
      openId: p.openId,
      workflow: draftCopy(loaded),
      saved: draftCopy(loaded),
    }));
    setRevealNonce(0);
  }, [loaded, loadedKey]);

  /** Replace the workflow and mark the definition unsaved in one step. */
  const edit = useCallback((fn: (wf: Workflow, st: BuilderState) => Partial<BuilderState> | void) => {
    setS((prev) => {
      if (!prev.workflow) return prev;
      const wf = draftCopy(prev.workflow);
      const extra = fn(wf, prev) || {};
      return { ...prev, workflow: wf, dirty: true, ...extra };
    });
  }, []);

  /**
   * Client-side ids for newly added Stages and prerequisites. Minted outside the
   * state updater on purpose: an updater React may run twice would otherwise mint
   * two ids for one Stage and leave the caller holding the wrong one.
   */
  const seqRef = useRef(20);
  const nextId = useCallback((prefix: string) => {
    seqRef.current += 1;
    return prefix + seqRef.current;
  }, []);

  const selectStage = useCallback((id: string) => {
    setS((p) => ({ ...p, selection: { kind: 'stage', id } }));
    setRevealNonce((n) => n + 1);
  }, []);

  const selectFinal = useCallback(() => {
    setS((p) => ({ ...p, selection: { kind: 'final' } }));
    setRevealNonce((n) => n + 1);
  }, []);

  const clearSelection = useCallback(() => setS((p) => ({ ...p, selection: null })), []);

  const selectCustom = useCallback((id: string) => {
    setS((p) => ({ ...p, cpSel: id }));
    setCustomRevealNonce((n) => n + 1);
  }, []);

  const toggleCustom = useCallback((id: string) => {
    setS((p) => ({ ...p, cpSel: id && p.cpSel !== id ? id : null }));
  }, []);

  const setSaveNotice = useCallback(
    (notice: BuilderState['saveNotice']) => setS((p) => ({ ...p, saveNotice: notice })),
    [],
  );

  const setSaving = useCallback((saving: boolean) => setS((p) => ({ ...p, saving })), []);

  /* Reseeds from whatever the data layer last handed over. Fetching a fresher
     copy first is the data layer's; this only says the draft is being given up. */
  const acceptStored = useCallback(() => {
    const stored = loadedRef.current;
    if (!stored) return;
    setS((p) => ({
      ...emptyState(),
      screen: p.screen,
      openId: p.openId,
      workflow: draftCopy(stored),
      saved: draftCopy(stored),
    }));
  }, []);

  const goConsole = useCallback(() => setS((p) => ({ ...p, screen: 'console' })), []);

  /* Records which workflow to show. Fetching it belongs to the data layer, which
     reads `openId`; seeding the draft from the result is the effect above. */
  const openWorkflow = useCallback((changeWorkflowId: string) => {
    setS((p) => ({ ...p, screen: 'builder', openId: changeWorkflowId }));
  }, []);

  const setSearch = useCallback((v: string) => setS((p) => ({ ...p, search: v })), []);
  const setSpaceFilter = useCallback(
    (v: string | null) => setS((p) => ({ ...p, spaceFilter: v })),
    [],
  );
  const clearFilters = useCallback(
    () => setS((p) => ({ ...p, search: '', spaceFilter: null })),
    [],
  );

  const addStage = useCallback(() => {
    const created = nextId('s');
    edit((wf) => {
      const used: Record<string, number> = {};
      wf.stages.forEach((st) => (used[st.name] = 1));
      let k = wf.stages.length + 1;
      let n = `stage-${k}`;
      while (used[n]) {
        k += 1;
        n = `stage-${k}`;
      }
      const st: Stage = {
        id: created,
        name: n,
        where: '',
        /* A Stage added after another enters from it, and the common case is a
           Release having carried the change. The first Stage has nothing ahead
           of it, so it gets none. */
        prereqs: wf.stages.length ? ['Released'] : [],
      };
      wf.stages.push(st);
      return { reorder: null, selection: { kind: 'stage', id: st.id } };
    });
    setRevealNonce((n) => n + 1);
  }, [edit, nextId]);

  const removeStage = useCallback(
    (id: string) => {
      edit((wf, prev) => {
        const i = stageIndex(wf, id);
        if (i === -1) return {};
        wf.stages.splice(i, 1);
        const clears = prev.selection?.kind === 'stage' && prev.selection.id === id;
        return { reorder: null, ...(clears ? { selection: null } : {}) };
      });
    },
    [edit],
  );

  const moveStage = useCallback(
    (id: string, dir: -1 | 1) => {
      edit((wf) => {
        const i = stageIndex(wf, id);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= wf.stages.length) return {};
        const beforeNames = wf.stages.map((st) => st.name);
        const tmp = wf.stages[i];
        wf.stages[i] = wf.stages[j];
        wf.stages[j] = tmp;
        return { reorder: describeMove(wf, wf.stages[j], i, j, beforeNames) };
      });
    },
    [edit],
  );

  const undoMove = useCallback(() => {
    setS((prev) => {
      if (!prev.reorder || !prev.workflow) return prev;
      const wf = draftCopy(prev.workflow);
      const { a, b } = prev.reorder;
      const tmp = wf.stages[a];
      wf.stages[a] = wf.stages[b];
      wf.stages[b] = tmp;
      return { ...prev, workflow: wf, reorder: null };
    });
  }, []);

  const dropMove = useCallback(() => setS((p) => ({ ...p, reorder: null })), []);

  const setStageName = useCallback(
    (value: string) => {
      edit((wf, prev) => {
        if (prev.selection?.kind !== 'stage') return {};
        const st = stageById(wf, prev.selection.id);
        if (st) st.name = value;
      });
    },
    [edit],
  );

  const setStageWhere = useCallback(
    (value: string) => {
      edit((wf, prev) => {
        if (prev.selection?.kind !== 'stage') return {};
        const st = stageById(wf, prev.selection.id);
        if (st) st.where = value;
      });
    },
    [edit],
  );

  const toggleGate = useCallback(
    (gate: string, on: boolean) => {
      /* `promoted` can never reach a stored Prerequisites array, so it is refused
         here as well as being left out of the list offered. */
      if (gate === IMPLICIT_GATE) return;
      edit((wf, prev) => {
        const target =
          prev.selection?.kind === 'final'
            ? wf.final
            : prev.selection?.kind === 'stage'
              ? stageById(wf, prev.selection.id)
              : undefined;
        if (!target) return {};
        const i = target.prereqs.indexOf(gate);
        if (on && i === -1) target.prereqs.push(gate);
        if (!on && i !== -1) target.prereqs.splice(i, 1);
      });
    },
    [edit],
  );

  const addCustom = useCallback(() => {
    const created = nextId('c');
    edit((wf) => {
      let name = 'new-check';
      let k = 1;
      while (wf.custom.some((x) => x.name === name)) {
        k += 1;
        name = `new-check-${k}`;
      }
      wf.custom.push({
        id: created,
        name,
        expression: "cel:'my-app.com/signal' in Release.Annotations",
        description: '',
      });
      return { cpSel: created };
    });
    setFocusCustomId(created);
  }, [edit, nextId]);

  const clearFocusCustom = useCallback(() => setFocusCustomId(null), []);

  const removeCustom = useCallback(
    (id: string) => {
      if (!s.workflow) return;
      const c = customById(s.workflow, id);
      if (!c) return;
      const used = usedBy(s.workflow, c.name);
      if (
        used.length &&
        !window.confirm(
          `Delete ${c.name}? It is named by ${used.join(', ')}. Those names will be left declared by nothing until you clear them.`,
        )
      ) {
        return;
      }
      edit((wf, prev) => {
        wf.custom = wf.custom.filter((x) => x.id !== id);
        return prev.cpSel === id ? { cpSel: null } : {};
      });
    },
    [edit, s.workflow],
  );

  const setCustomName = useCallback(
    (id: string, value: string) => {
      edit((wf) => {
        const c = customById(wf, id);
        if (!c) return {};
        /* Declared once, named wherever it applies: a rename has to follow the
           name into every array that carries it, or the workflow stops saving. */
        const old = c.name;
        wf.stages.forEach((st) => {
          const i = st.prereqs.indexOf(old);
          if (i !== -1) st.prereqs[i] = value;
        });
        const fi = wf.final.prereqs.indexOf(old);
        if (fi !== -1) wf.final.prereqs[fi] = value;
        c.name = value;
      });
    },
    [edit],
  );

  const setCustomExpression = useCallback(
    (id: string, value: string) => {
      edit((wf) => {
        const c = customById(wf, id);
        if (c) c.expression = value;
      });
    },
    [edit],
  );

  const setCustomDescription = useCallback(
    (id: string, value: string) => {
      edit((wf) => {
        const c = customById(wf, id);
        if (c) c.description = value;
      });
    },
    [edit],
  );

  const fixPrefix = useCallback(
    (id: string) => {
      edit((wf) => {
        const c = customById(wf, id);
        if (c) c.expression = `cel:${c.expression.trim()}`;
      });
    },
    [edit],
  );

  const setWorkflowName = useCallback(
    (value: string) => edit((wf) => void (wf.displayName = value)),
    [edit],
  );
  const setWorkflowSlug = useCallback(
    (value: string) => edit((wf) => void (wf.slug = value)),
    [edit],
  );

  const save = useCallback(() => {
    setS((prev) => {
      if (!prev.workflow || problemCount(prev.workflow) > 0) return prev;
      const wf = draftCopy(prev.workflow);
      return { ...prev, workflow: wf, saved: draftCopy(wf), dirty: false, reorder: null };
    });
  }, []);

  const discard = useCallback(() => {
    setS((prev) => {
      if (!prev.saved) return prev;
      const wf = draftCopy(prev.saved);
      const selection =
        prev.selection?.kind === 'stage' && !stageById(wf, prev.selection.id)
          ? null
          : prev.selection;
      return { ...prev, workflow: wf, dirty: false, reorder: null, selection };
    });
  }, []);

  const goToFirstProblem = useCallback(() => {
    setS((prev) => {
      /* The same list the fault band reads, so the chip, the band and this jump
         cannot disagree about which problem is first. */
      if (!prev.workflow) return prev;
      const first = problems(prev.workflow).filter((p) => p.sev === 'problem')[0]?.go ?? null;
      if (!first) return prev;
      if (first.kind === 'stage') return { ...prev, selection: { kind: 'stage', id: first.id } };
      if (first.kind === 'final') return { ...prev, selection: { kind: 'final' } };
      return { ...prev, cpSel: first.id };
    });
    setRevealNonce((n) => n + 1);
  }, []);

  return useMemo<BuilderApi>(
    () => ({
      ...s,
      revealNonce,
      customRevealNonce,
      focusCustomId,
      clearFocusCustom,
      selectStage,
      selectFinal,
      clearSelection,
      selectCustom,
      toggleCustom,
      goConsole,
      openWorkflow,
      setSaveNotice,
      setSaving,
      acceptStored,
      setSearch,
      setSpaceFilter,
      clearFilters,
      addStage,
      removeStage,
      moveStage,
      undoMove,
      dropMove,
      goToFirstProblem,
      setStageName,
      setStageWhere,
      toggleGate,
      addCustom,
      removeCustom,
      setCustomName,
      setCustomExpression,
      setCustomDescription,
      fixPrefix,
      setWorkflowName,
      setWorkflowSlug,
      save,
      discard,
    }),
    [
      s,
      revealNonce,
      customRevealNonce,
      focusCustomId,
      clearFocusCustom,
      selectStage,
      selectFinal,
      clearSelection,
      selectCustom,
      toggleCustom,
      goConsole,
      openWorkflow,
      setSaveNotice,
      setSaving,
      acceptStored,
      setSearch,
      setSpaceFilter,
      clearFilters,
      addStage,
      removeStage,
      moveStage,
      undoMove,
      dropMove,
      goToFirstProblem,
      setStageName,
      setStageWhere,
      toggleGate,
      addCustom,
      removeCustom,
      setCustomName,
      setCustomExpression,
      setCustomDescription,
      fixPrefix,
      setWorkflowName,
      setWorkflowSlug,
      save,
      discard,
    ],
  );
}

