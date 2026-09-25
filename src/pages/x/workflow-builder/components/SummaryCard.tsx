// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The rollout detail page's own head, in an authoring mode: what this definition
 * is, what state it is in, and the three things that can be done to it.
 *
 * ⚠️ TWO LAYOUTS, ONE PER SIDE OF THE FIRST SAVE. A workflow that exists gets
 * `.summary`: a slug, a state chip, five facts and a column of actions. A draft
 * that has never been saved gets `.band`: the slug, the Space it will be created
 * in, Save, Discard, and one sentence. The draft is not the full card with empty
 * values -- every fact in that row reports on a saved workflow, and "Clone to
 * another Space" copies one, so on a draft they are furniture that explains why
 * it does nothing. They return, unchanged, at the first save.
 *
 * The state chip is a button only when there is something to jump to -- a grey
 * count nobody can act on is a worse affordance than plain text.
 */

import { Fragment } from 'react';

import { ClonePanel } from './ClonePanel';
import { SaveNotice } from './SaveNotice';
import { SpacePicker } from './SpacePicker';
import { definitionState, plural, problemCount, summaryNote } from '../model';
import type { CloneToSpaceFlow } from '../api/useCloneToSpace';
import type { SpaceOption } from './SpacePicker';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';
import type { Preview } from '../preview';

/** Said on the control and beside it, because a refusal with no reason reads as a fault. */
const CLONE_BLOCKED =
  'A copy is made from the saved workflow, so save or discard your changes first.';

export function SummaryCard({
  api,
  preview,
  onSave,
  cloneFlow,
  destinationSpaces,
  destinationSpacesStatus,
  onOpenClone,
  neverSaved,
  pendingSpaceId,
  onPendingSpaceChange,
}: {
  api: LoadedBuilderApi;
  preview: Preview;
  /** Writes the draft. The button only decides whether to offer it. */
  onSave: () => void;
  cloneFlow: CloneToSpaceFlow;
  destinationSpaces: readonly SpaceOption[];
  /** True for a blank draft that has never been given a server identity: there
      is no saved workflow yet for "Clone to another Space" to copy from, and no
      Space yet for a first Save to write into. */
  neverSaved: boolean;
  destinationSpacesStatus: 'loading' | 'ready' | 'failed';
  /** Which workflow to open. Held by the page, same as the console's own `onOpen`. */
  onOpenClone: (changeWorkflowId: string) => void;
  /** The Space a blank draft will be created in, chosen at first Save rather
      than upfront. Empty until picked; meaningless when `neverSaved` is false. */
  pendingSpaceId: string;
  onPendingSpaceChange: (spaceId: string) => void;
}) {
  const wf = api.workflow;
  const pc = problemCount(wf, preview.resolutions);
  const note = summaryNote(wf, api.dirty, neverSaved, Boolean(pendingSpaceId), preview.resolutions);

  /* `neverSaved && !pendingSpaceId` extends the save gate rather than adding a
     second kind of refusal: a blank draft with no Space picked is exactly as
     unsaveable as one with an unresolved problem.

     Gated on `dirty` so an unchanged workflow is never written. It is not that
     an unchanged save would be refused -- it succeeds, because the version is
     incremented after the conflict predicate is built, so the row always
     changes. It is that the write is pointless: a version bumped for nothing,
     and a console refetch behind it, since cache invalidation here is by entity
     type rather than by id.

     The gate is the button's own state rather than a refusal inside the
     handler, so there is no press that appears to do nothing. What there is to
     save, or why there is nothing, is said in the note. */
  const saveBlocked = !api.dirty || pc > 0 || api.saving || (neverSaved && !pendingSpaceId);

  /* The conflict slot is the one piece both layouts need: a first save can be
     refused for permission or lost to a race exactly as a later one can. */
  const saveNotice = (
    <SaveNotice
      kind={api.saveNotice?.kind ?? null}
      message={api.saveNotice?.message ?? ''}
      onReload={api.acceptStored}
      onOverwrite={onSave}
      onRetry={onSave}
      onDismiss={() => api.setSaveNotice(null)}
    />
  );

  if (neverSaved) {
    return (
      <section className='card' role='region' aria-label='Change workflow summary'>
        <div className='band'>
          <div className='bandrow'>
            <div className='bslug'>
              {/* Labelled, unlike a saved workflow's slug: `.sumslug` is a 21px
                  bold input with a transparent border until hovered, which on
                  an established workflow reads as its title and on an empty
                  draft reads as blank space. Dashed for the same reason, and
                  only while empty -- the same dashed-until-filled convention
                  `.blank` and `.addtile` already use on this page. */}
              <label className='flabel' htmlFor='wf-slug'>
                Slug
              </label>
              <input
                className={`sumslug${wf.slug ? '' : ' draft'}`}
                id='wf-slug'
                data-act='wfslug'
                value={wf.slug}
                placeholder='workflow-slug'
                onChange={(e) => api.setWorkflowSlug(e.target.value)}
              />
            </div>
            <div className='bspace'>
              {/* No `help` of its own: the sentence it would carry is the band's
                  note below, which is the only state readout this layout has. */}
              <SpacePicker
                id='wf-pending-space'
                label='Space'
                spaces={destinationSpaces}
                value={pendingSpaceId}
                onChange={onPendingSpaceChange}
                status={destinationSpacesStatus}
              />
            </div>
            <div className='bacts'>
              <button
                className='btn primary'
                type='button'
                data-act='save'
                disabled={saveBlocked}
                onClick={onSave}
              >
                {api.saving ? 'Saving…' : 'Save workflow'}
              </button>
              <button
                className='btn'
                type='button'
                data-act='discard'
                disabled={!api.dirty}
                onClick={api.discard}
              >
                Discard changes
              </button>
            </div>
          </div>
          <p className={`bandfoot savenote ${note.tone}`.trimEnd()} aria-live='polite'>
            {note.text}
          </p>
        </div>

        {saveNotice}
      </section>
    );
  }

  const st = definitionState(wf, api.dirty, preview.resolutions);
  const cloneBlocked = api.dirty ? CLONE_BLOCKED : null;

  /* Three readings, because there are three facts: a count, none, and no count.
     Rendering the third as the second would assert something nobody established. */
  let governs: React.ReactNode;
  if (wf.governs === undefined) governs = 'Not counted';
  else if (wf.governs === 0) governs = 'No change order yet';
  else {
    governs = (
      <button className='factlink' type='button' data-act='noop'>
        {plural(wf.governs, 'change order', 'change orders')}
      </button>
    );
  }

  return (
    <section className='card' role='region' aria-label='Change workflow summary'>
      <div className='summary'>
        <div className='sumleft'>
          <div className='sumtitle'>
            {/* An established workflow's slug reads as its name -- the label
                would be redundant next to a value the reader already knows. */}
            <div className='sumslugwrap'>
              <label className='srOnly' htmlFor='wf-slug'>
                Slug
              </label>
              <input
                className='sumslug'
                id='wf-slug'
                data-act='wfslug'
                value={wf.slug}
                placeholder='workflow-slug'
                size={Math.max(12, wf.slug.length)}
                onChange={(e) => api.setWorkflowSlug(e.target.value)}
              />
            </div>
            {st.tone === 'bad' ? (
              <button
                className='statechip bad'
                type='button'
                data-act='gotofirst'
                onClick={api.goToFirstProblem}
              >
                {st.label}
              </button>
            ) : (
              <span className={`statechip ${st.tone}`}>{st.label}</span>
            )}
          </div>

          <dl className='facts'>
            <div style={{ gridColumn: 'span 2' }}>
              <dt>Display name</dt>
              <dd>
                <label className='srOnly' htmlFor='wf-name'>
                  Display name
                </label>
                <input
                  className='titlefield'
                  id='wf-name'
                  data-act='wfname'
                  value={wf.displayName}
                  onChange={(e) => api.setWorkflowName(e.target.value)}
                />
              </dd>
            </div>
            <div>
              <dt>Space</dt>
              <dd>
                <button className='factlink' type='button' data-act='noop'>
                  {wf.space}
                </button>
              </dd>
            </div>
            <div>
              <dt>Labels</dt>
              <dd>
                {wf.labels.map((l, i) => (
                  <Fragment key={l[0]}>
                    {i > 0 ? ' ' : ''}
                    <span className='chip'>{`${l[0]} = ${l[1]}`}</span>
                  </Fragment>
                ))}
              </dd>
            </div>
            <div>
              <dt>Governs</dt>
              <dd>{governs}</dd>
            </div>
            <div>
              <dt>Stages</dt>
              {/* A count only. Coverage against a previewed component used to be
                  said here too, and again in the rail, and again per-Stage --
                  the same fact in four places, one of which could disagree with
                  the other three. It now lives once, beside the filter blocks
                  for the selected Stage, and nowhere else. */}
              <dd>{plural(wf.stages.length, 'Stage', 'Stages')}</dd>
            </div>
            <div>
              <dt>Last written</dt>
              <dd>{wf.updated}</dd>
            </div>
          </dl>
        </div>

        <div className='sumright'>
          <button
            className='btn primary wide'
            type='button'
            data-act='save'
            disabled={saveBlocked}
            onClick={onSave}
          >
            {api.saving ? 'Saving…' : 'Save workflow'}
          </button>
          <button
            className='btn wide'
            type='button'
            data-act='discard'
            disabled={!api.dirty}
            onClick={api.discard}
          >
            Discard changes
          </button>
          {/* A copy is made from the SAVED workflow, so making one while a draft is
              unsaved would put a shape into another Space that differs from the one
              on screen -- and the divergence would land where nobody would connect
              it back. Refused rather than silently copying either version, and the
              refusal says why and what to do, the way a refused Stage move does. */}
          <button
            className='btn wide'
            type='button'
            data-act='clone'
            disabled={cloneBlocked !== null}
            title={cloneBlocked ?? undefined}
            aria-label={cloneBlocked ? `Clone to another Space. ${cloneBlocked}` : undefined}
            onClick={cloneFlow.begin}
          >
            Clone to another Space
          </button>
          {cloneBlocked ? <span className='fhelp'>{cloneBlocked}</span> : null}
          <p
            className={`savenote ${note.tone}`.trimEnd()}
            aria-live='polite'
            style={{ margin: '2px 0 0' }}
          >
            {note.text}
          </p>
        </div>
      </div>

      <ClonePanel
        open={cloneFlow.open}
        spaces={destinationSpaces}
        spacesStatus={destinationSpacesStatus}
        destination={cloneFlow.destinationId}
        onDestination={cloneFlow.onDestination}
        saving={cloneFlow.saving}
        error={cloneFlow.error}
        clonedTo={
          cloneFlow.clonedTo
            ? { spaceSlug: cloneFlow.clonedTo.spaceSlug, open: () => onOpenClone(cloneFlow.clonedTo!.changeWorkflowId) }
            : null
        }
        onConfirm={cloneFlow.confirm}
        onCancel={cloneFlow.cancel}
      />

      {saveNotice}
    </section>
  );
}
