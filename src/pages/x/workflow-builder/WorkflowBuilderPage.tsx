// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Authoring a ChangeWorkflow: the ordered Stages a change moves through, which
 * variants each Stage covers, and what must hold before it enters one.
 *
 * Built against the `workflow-builder-v2` mockup, which is the design. That
 * file is not in the repository -- design artifacts do not ship in a feature
 * PR -- so it is named here rather than linked, and whoever
 * holds the design holds the answer to what this page is supposed to look
 * like. Where this page differs from it now, it is because the design draws
 * invented data and this page draws a real workflow.
 *
 * WHY THIS PAGE IS NOT BUILT OUT OF MUI. Its surface is dense -- 22px dots,
 * 18px chips, 28px buttons, 1px hairlines and a 12.5px body -- and MUI's own
 * defaults (ripples, 40px minimum heights, uppercase labels, elevation, margin)
 * each have to be undone before a single value matches. The rollouts console
 * settled the same question the same way: plain elements plus a page-local token
 * set that overrides the global theme. The tokens and rules live in
 * `workflowBuilder.css`, scoped under `.wfb` so none of it reaches other pages.
 *
 * ⚠️ EVERY CONTIGUOUS RUN OF TEXT IS ONE STRING EXPRESSION, DELIBERATELY. Split a
 * sentence across interpolations, or separate two runs with `{' '}`, and the
 * browser emits several DOM text nodes where one is meant. It breaks glyph
 * shaping at each seam, moving kerning and sub-pixel positions, while every
 * computed style stays byte-identical -- so a style diff cannot see it and only a
 * per-pixel comparison can.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import './workflowBuilder.css';

import { BuilderSkeleton } from './components/BuilderSkeleton';
import { DetailPane } from './components/DetailPane';
import { PrereqColumn } from './components/PrereqColumn';
import { ProblemsBand } from './components/ProblemsBand';
import { ShellNotice } from './components/ShellNotice';
import { ReorderWarning } from './components/ReorderWarning';
import { RailKeyHelp, StageRail } from './components/StageRail';
import { SummaryCard } from './components/SummaryCard';
import { WorkflowsConsole } from './components/WorkflowsConsole';
import { useChangeWorkflowDetail } from './api/useChangeWorkflowDetail';
import { useCloneToSpace } from './api/useCloneToSpace';
import { useCreateWorkflowFlow } from './api/useCreateWorkflowFlow';
import { useWorkflowList } from './api/useWorkflowList';
import { useWorkflowSpaces } from './api/useWorkflowSpaces';
import { useWorkflowSave } from './api/useWorkflowSave';
import { useWritableSpaces } from './api/useWritableSpaces';
import { ComponentPicker } from './components/ComponentPicker';
import { NoComponentChosen } from './components/NoComponentChosen';
import { emptyWorkflow } from './api/mapping';
import type { Preview } from './preview';
import { customById, litStageNames, plural } from './model';
import { isLoaded, useWorkflowBuilder } from './useWorkflowBuilder';
import type { Workflow } from './types';

/**
 * Why the builder has no workflow to draw. `missing` and `forbidden` read
 * differently but neither denies the other, so the pair cannot be used to learn
 * that a workflow exists in a Space the reader cannot see.
 *
 * ⚠️ THERE IS NO MEMBER FOR "NO WORKFLOW ASKED FOR". That is not a kind of
 * failure to READ one, and giving it a name here would put it beside the ones
 * that are. A page with no workflow in hand and no draft started shows the
 * list instead, which is what the reader would have had to visit anyway -- so
 * the state has somewhere to be rather than somewhere to be reported.
 */
export type DetailStatus = 'loading' | 'ready' | 'missing' | 'forbidden' | 'failed';

/**
 * The builder with no FETCHED workflow to draw -- which is not the same as no
 * workflow at all. `ready` reaches here in two different circumstances: the
 * ordinary one, where a real fetch has resolved but the draft has not seeded
 * from it yet; and a blank draft, where nothing was ever asked for because
 * there is nothing to fetch, and `ready` is simply what an unasked, unfailed,
 * un-loading read looks like by elimination. Both are a frame of waiting for
 * the seed effect to run, not a failure, which is why one arm covers both.
 *
 * ⚠️ NO `default`. An exhaustive switch makes a new status a type error rather
 * than something that quietly lands in the failure arm -- which is exactly what
 * happened when `ready` reached a `default` written to be careful: a request
 * nobody made was reported as a read that failed, offering a retry that had
 * nothing to retry.
 */
function NoWorkflow({ status, onRetry }: { status: DetailStatus; onRetry: () => void }) {
  switch (status) {
    case 'loading':
    case 'ready':
      return <BuilderSkeleton />;
    case 'missing':
      return <ShellNotice kind='missing' />;
    case 'forbidden':
      return <ShellNotice kind='forbidden' />;
    case 'failed':
      return <ShellNotice kind='failed' onRetry={onRetry} />;
  }
}

export default function WorkflowBuilderPage() {
  /**
   * The component this workflow is being looked at through. Scratch state, held
   * here rather than in the draft because it is not part of the definition and is
   * never saved with it.
   */
  const [component, setComponent] = useState<string | null>(null);

  /* Which workflow is open lives in the URL, so it survives a reload and can be
     linked to. There is no second copy of it to fall out of step. */
  const { changeWorkflowId } = useParams<{ changeWorkflowId: string }>();
  const navigate = useNavigate();
  /* `||`, not `??`: an id that is present but empty names no workflow, and
     admitting it would open the builder on a read that never runs -- a frame of
     waiting that never ends. Absent stays absent. */
  const openId = changeWorkflowId || null;
  const setOpenId = useCallback(
    (id: string | null) => navigate(id ? `/x/workflow-builder/${id}` : '/x/workflow-builder'),
    [navigate],
  );
  const detail = useChangeWorkflowDetail(openId ?? undefined);

  /**
   * A workflow that exists only in the draft, never fetched and never yet
   * saved. Kept separate from `openId` rather than folded into it -- `openId`
   * names what to FETCH, and stays exactly that whether it is `null` (nothing
   * to fetch) or a real id; overloading it with a value meaning "don't fetch,
   * start blank" would make it answer two different questions depending on
   * what it held, which is the shape every fix tonight has been undoing.
   *
   * ⚠️ CLEARED ON EXACTLY TWO SIGNALS: the save that gives the draft a real
   * identity, and the reader choosing to leave it -- see `leaveWorkflow`
   * below, which clears this alongside `openId` for that reason. Nothing else
   * should touch it. `Discard changes` deliberately does NOT: it resets the
   * live edits back to the draft's own starting shape, the same contract it
   * already has for a real workflow, and stays on the builder -- discarding is
   * "undo what I typed", not "leave", and folding a second meaning into it
   * would make it into exactly the kind of control tonight's fixes have been
   * removing, one whose action depends on state the reader cannot see.
   */
  const [draftMode, setDraftMode] = useState(false);
  const onNewBlank = useCallback(() => setDraftMode(true), []);
  /**
   * The only other legitimate way `draftMode` clears. `setOpenId(null)` alone
   * was the backlink's whole handler until this was found: it works for a real
   * workflow, whose `openId` was non-null, but a blank draft's `openId` was
   * already null from the moment it opened -- clearing it a second time changes
   * nothing `showingList` reads, and nothing else on the page could get the
   * reader back to the console at all. Calling both setters unconditionally is
   * correct for either case: whichever one actually held the open workflow is
   * the one this clears, and clearing the other is a no-op.
   */
  const leaveWorkflow = useCallback(() => {
    setDraftMode(false);
    setOpenId(null);
  }, [setOpenId]);

  /**
   * The blank workflow's own base shape, and the key that tells
   * `useWorkflowBuilder` this is a fresh session rather than a reseed of
   * whatever the last blank draft held. Minted once per false->true transition
   * of `draftMode`, in one effect so the two can never fall out of step with
   * each other -- `emptyWorkflow()` gives an honest, empty, SHOWABLE slug;
   * `key` exists purely to differ from every other session's and is never
   * rendered or sent anywhere.
   *
   * Held WITHOUT `component` merged in, and merged fresh on every render
   * instead, in `loaded` below -- the same way the real-fetch branch already
   * merges `detail.workflow` fresh each render. `component` changes far more
   * often than a draft session starts (every time the reader switches which
   * component they are previewing against), and if it lived in this effect's
   * dependencies, switching it mid-edit would re-run the effect and mint a
   * BRAND NEW empty workflow over whatever Stages had just been added --
   * exactly the reseed-wipes-an-edit failure this whole mechanism exists to
   * prevent, just reached from a different trigger than the one first found.
   *
   * `pendingSpaceId` resets in the same place: a Space chosen for one abandoned
   * draft has no business surviving into the next one.
   */
  const draftKeyRef = useRef(0);
  const [draftBase, setDraftBase] = useState<{ workflow: ReturnType<typeof emptyWorkflow>; key: string } | null>(
    null,
  );
  const [pendingSpaceId, setPendingSpaceId] = useState('');
  useEffect(() => {
    if (!draftMode) {
      setDraftBase(null);
      return;
    }
    draftKeyRef.current += 1;
    setDraftBase({ workflow: emptyWorkflow(), key: `draft-${draftKeyRef.current}` });
    setPendingSpaceId('');
  }, [draftMode]);

  const loaded: Workflow | null = draftMode
    ? draftBase
      ? { ...draftBase.workflow, component: component ?? '', governs: undefined }
      : null
    : detail.workflow
      ? { ...detail.workflow, component: component ?? '', governs: undefined }
      : null;

  const status: DetailStatus = detail.isLoading
    ? 'loading'
    : detail.notFound
      ? 'missing'
      : detail.forbidden
        ? 'forbidden'
        : detail.error !== undefined
          ? 'failed'
          : 'ready';

  const retry = detail.refetch;
  const api = useWorkflowBuilder(loaded, draftMode ? draftBase?.key : undefined);

  /**
   * The live draft's own Stages, not `detail.workflow`'s. `detail.workflow` is
   * the fetched snapshot that only ever SEEDS `api.workflow` -- it holds the
   * `where` a Stage was loaded with, never one since typed. Resolving against
   * it was a pre-existing bug: the preview looked live but was frozen at
   * whatever the page opened to, for both this editor and the raw textarea it
   * replaces. `api.workflow` is the value every edit actually lands in.
   */
  const spaces = useWorkflowSpaces(api.workflow?.stages ?? [], component ?? undefined);

  const writer = useWorkflowSave();

  /**
   * The one thing a create() success needs from outside itself: to stop being
   * a draft and become the workflow it just became. Named to match
   * `onOpenClone`'s shape below -- both are "a write produced a new id, now the
   * page has to navigate to it" -- rather than inventing a second pattern for
   * the same fact.
   */
  const onDraftCreated = useCallback(
    (newId: string) => {
      setDraftMode(false);
      setOpenId(newId);
    },
    [setOpenId],
  );

  /**
   * ⚠️ NOTHING HERE IS CLEARED IN A `finally`.
   *
   * A save refused for want of permission never settles: the base query answers a
   * 403 with a promise that neither resolves nor rejects while the app navigates
   * away. A `finally` would never run and the button would say `Saving...` for as
   * long as the page survived. So the flag is taken down on each arm of a result
   * that arrived, and the permission case simply never arrives.
   *
   * ⚠️ THE SPACE GATE IS THE BUTTON'S, NOT THIS HANDLER'S. `detail.identity`
   * being absent means this is a blank draft's first save, which needs a Space
   * nobody has been asked for yet -- but SummaryCard already disables Save
   * until `pendingSpaceId` is set, the same way it already disables Save while
   * `pc > 0`. So there is no branch here that reveals a picker and refuses to
   * write: by the time this runs at all for a first save, a Space is already
   * chosen, exactly as an unsolved structural fault already means this never
   * runs. A press that appears to do nothing is what that gate exists to rule
   * out everywhere else on this card; this keeps it true here too.
   */
  const onSave = useCallback(async () => {
    const draft = api.workflow;
    if (!draft || !api.dirty) return;
    api.setSaveNotice(null);
    api.setSaving(true);

    const outcome = detail.identity
      ? await writer.save(draft, detail.identity)
      : await writer.create(draft, pendingSpaceId);

    if (outcome.kind === 'saved') {
      if (detail.identity) {
        detail.noteSaved(outcome.identity);
      } else {
        onDraftCreated(outcome.identity.changeWorkflowId);
      }
      api.save();
      api.setSaving(false);
      return;
    }
    api.setSaveNotice({ kind: outcome.kind, message: outcome.message });
    api.setSaving(false);
  }, [api, detail, writer, pendingSpaceId, onDraftCreated]);

  /* Two different unknowns, kept as two names rather than one boolean: nobody
     having chosen a component is a question the reader can answer right here;
     a read that is loading or has failed for a component that WAS chosen is
     not. `isReady` is deliberately true before a component is chosen -- it
     answers whether the component LIST loaded, not whether an inventory was
     read for one -- so it cannot be asked at all until `component` is known,
     which is why that check comes first rather than being ANDed in. */
  const coverageStatus: Preview['status'] =
    component === null ? 'unasked' : spaces.isReady && spaces.error === undefined ? 'established' : 'unsettled';

  const preview: Preview = {
    component,
    resolutions: spaces.byStageId,
    inventory: spaces.inventory,
    status: coverageStatus,
  };
  const componentStatus = spaces.error !== undefined ? 'failed' : spaces.isReady ? 'ready' : 'loading';

  /* One element, held by reference rather than re-described at each call site:
     both `StageDetail` and `NoSelection` place it directly above their own
     coverage answer, and only one of the two is ever mounted at a time, so
     reusing the same node is not a second instance. */
  const componentField = (
    <ComponentPicker
      components={spaces.components}
      value={component ?? ''}
      onChange={setComponent}
      status={componentStatus}
    />
  );

  /* Asked only when nobody has chosen a component. An inventory that failed or
     has not landed is a different unknown, and pointing at the picker for it
     would invite an answer to a question that is not the one in the way. */
  const componentPrompt =
    component === null ? (
      <NoComponentChosen
        components={spaces.components}
        withoutComponent={spaces.spacesWithoutComponent}
      />
    ) : null;


  /* Counts are left off: no row displays one, and reading every change order in
     the organisation for a number nothing renders is a cost with no return. */

  /* Not a screen anyone switches to. Showing the list IS having asked for no
     workflow and not started a blank one, so the three cannot disagree and
     the builder cannot be reached without one or the other. */
  const showingList = openId === null && !draftMode;
  const list = useWorkflowList(!showingList);
  // Needed by both clone destinations -- the console's "start a new workflow"
  // and the open workflow's "Clone to another Space" -- so it is not skipped in
  // either screen, unlike `list`, which only the console's own rows and source
  // picker read.
  const writableSpaces = useWritableSpaces();
  const createFlow = useCreateWorkflowFlow(
    list.entities,
    writableSpaces.spaces,
    writer.create,
    showingList,
  );
  const cloneFlow = useCloneToSpace(api.saved, openId, writableSpaces.spaces, writer.create);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * Pointing at a prerequisite lights the hops that name it. The one open in the
   * column stays lit on its own, so the two are held separately and unioned --
   * taking the hover back must not unlight the selection.
   */
  const [hover, setHover] = useState<{ name: string; implicit: boolean } | null>(null);
  const onHover = useCallback((name: string | null, implicit: boolean) => {
    setHover(name ? { name, implicit } : null);
  }, []);

  const wf = api.workflow;
  const lit = useMemo(() => {
    if (!wf) return new Set<string>();
    const selected = api.cpSel ? customById(wf, api.cpSel) : undefined;
    const fromSelection = litStageNames(wf, selected?.name ?? null, false);
    litStageNames(wf, hover?.name ?? null, hover?.implicit ?? false).forEach((n) =>
      fromSelection.add(n),
    );
    return fromSelection;
  }, [wf, api.cpSel, hover]);

  /* `block: 'nearest'` so a detail already on screen does not shove the rail out
     of the way. Selecting from the rail should never move the rail. */
  useEffect(() => {
    if (!api.revealNonce) return;
    rootRef.current?.querySelector('#det')?.scrollIntoView({ block: 'nearest' });
  }, [api.revealNonce]);

  useEffect(() => {
    if (!api.customRevealNonce || !api.cpSel) return;
    rootRef.current?.querySelector(`#cp-${api.cpSel}`)?.scrollIntoView({ block: 'nearest' });
  }, [api.customRevealNonce, api.cpSel]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && api.selection) api.clearSelection();
  };

  return (
    <div className='wfb' ref={rootRef} onKeyDown={onKeyDown}>
      {showingList ? (
        <WorkflowsConsole
          api={api}
          entities={list.entities}
          isLoading={list.isLoading}
          failed={list.error !== undefined}
          unreadable={list.unreadableRows}
          onOpen={setOpenId}
          onRefresh={list.refetch}
          createFlow={createFlow}
          destinationSpaces={writableSpaces.spaces}
          destinationSpacesStatus={writableSpaces.status}
          onNewBlank={onNewBlank}
        />
      ) : !isLoaded(api) ? (
        <NoWorkflow status={status} onRetry={retry} />
      ) : (
        <div className='shell'>
          <button
            className='backlink'
            type='button'
            data-act='goconsole'
            onClick={leaveWorkflow}
          >
            &#8592; All workflows
          </button>

          <SummaryCard
            api={api}
            preview={preview}
            onSave={onSave}
            cloneFlow={cloneFlow}
            destinationSpaces={writableSpaces.spaces}
            destinationSpacesStatus={writableSpaces.status}
            onOpenClone={setOpenId}
            /* This branch only renders once `isLoaded(api)`, which for `openId
               === null` can only mean the seeded value was a draft -- the other
               way to reach "loaded with no id" (nothing asked for) is the
               console, a different branch entirely. Unambiguous here. */
            neverSaved={openId === null}
            pendingSpaceId={pendingSpaceId}
            onPendingSpaceChange={setPendingSpaceId}
          />

          <section className='card' role='region' aria-label='Stages'>
            <div className='cardhead follows'>
              <div className='cardtitle'>Stages</div>
              <div className='cardsub' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {plural(api.workflow.stages.length, 'Stage', 'Stages')}
                <RailKeyHelp />
              </div>
            </div>

            <StageRail api={api} lit={lit} preview={preview} />
            <ReorderWarning api={api} />
            <ProblemsBand api={api} />

            {/* The question goes inside the pane, not in place of it. Choosing a
                component is what makes coverage countable; it has no bearing on
                whether a Stage can be renamed, re-selected, re-gated or moved.
                Withholding the pane withheld the editor -- and said, in the copy
                that replaced it, that editing does not wait. */}
            {api.workflow.stages.length ? (
              <div className='detwrap'>
                <DetailPane
                  api={api}
                  preview={preview}
                  componentPrompt={componentPrompt}
                  componentField={componentField}
                />
                <PrereqColumn api={api} onHover={onHover} />
              </div>
            ) : (
              <DetailPane
                api={api}
                preview={preview}
                componentPrompt={componentPrompt}
                componentField={componentField}
              />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
