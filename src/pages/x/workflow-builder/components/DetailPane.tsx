// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The one Stage the rail points at, enlarged.
 *
 * It lives inside the Stages card rather than in a card of its own, because it
 * is not a second subject -- it is the rail's selection. It reads in the order
 * `ChangeWorkflowStage` declares it: Name, then `WhereSpace` and what it
 * resolves to, then the Stage's own removal.
 *
 * With nothing selected the slot carries the one fact about the whole workflow
 * that no single Stage holds: which variants of the component no Stage reaches.
 */

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';

import { COMPLETE_KEY, COMPLETE_LABEL } from '../vocabulary';
import { FlagIcon } from '../icons';
import { coverage, plural, stageIndex } from '../model';
import { variantName } from '../fixtures';
import { Mono } from './Msg';
import { StageWhereEditor } from './StageWhereEditor';
import { VariantLists } from './VariantLists';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';
import type { Preview } from '../preview';
import type { Stage, Workflow } from '../types';

/**
 * The two reorder controls and Close, as one group. `st` is null for Complete,
 * which is not a Stage and has no position to move, so both arrows are refused
 * there rather than hidden: a control that vanishes teaches nothing, and the
 * reason is on the button and in the line below the row.
 */
function MoveActions({ api, st, i }: { api: LoadedBuilderApi; st: Stage | null; i: number }) {
  const first = !st || i === 0;
  const last = !st || i === api.workflow.stages.length - 1;

  const why = (dir: 'earlier' | 'later') => {
    if (!st) return `${COMPLETE_LABEL} is not a Stage. It has no position in the run, so it cannot move.`;
    return dir === 'earlier'
      ? `${st.name} is the first Stage, so nothing precedes it.`
      : `${st.name} is the last Stage, so nothing follows it.`;
  };

  const earlierBtn = (
    <button
      className='btn sm'
      type='button'
      data-act='moveleft'
      data-id={st ? st.id : ''}
      disabled={first}
      aria-label={first ? `Move earlier. ${why('earlier')}` : undefined}
      onClick={() => st && api.moveStage(st.id, -1)}
    >
      <span className='ar' aria-hidden='true'>
        &#8592;
      </span>
      {' Move earlier'}
    </button>
  );

  const laterBtn = (
    <button
      className='btn sm'
      type='button'
      data-act='moveright'
      data-id={st ? st.id : ''}
      disabled={last}
      aria-label={last ? `Move later. ${why('later')}` : undefined}
      onClick={() => st && api.moveStage(st.id, 1)}
    >
      {'Move later '}
      <span className='ar' aria-hidden='true'>
        &#8594;
      </span>
    </button>
  );

  return (
    <span className='detacts'>
      {/* A disabled `<button>` fires no hover/focus events, so `Tooltip` cannot
          attach to it directly -- it goes on a wrapping `<span>` instead, MUI's
          own documented way around this. */}
      {first ? <Tooltip title={why('earlier')}><span>{earlierBtn}</span></Tooltip> : earlierBtn}
      {last ? <Tooltip title={why('later')}><span>{laterBtn}</span></Tooltip> : laterBtn}
      <span className='sep' aria-hidden='true' />
      <button className='btn sm' type='button' data-act='clearsel' onClick={api.clearSelection}>
        Close
      </button>
    </span>
  );
}

/**
 * The count in the header row, when there is one.
 *
 * ⚠️ RENDERING NOTHING IS THE ANSWER HERE, NOT AN OVERSIGHT. This row also holds
 * Move earlier, Move later and Close, which the user asked for by name and asked
 * to be placed together. A "coverage not known yet" placeholder in this span
 * competes with them for the row and it is the controls that would be pushed
 * out. The pane below says it in words instead, where there is space to say it
 * properly.
 */
function CountText({ st, preview }: { st: Stage; preview: Preview }) {
  const res = preview.resolutions.get(st.id);
  if (res?.kind === 'invalid') return <span className='sbcount bad'>where is unreadable</span>;
  if (res?.kind !== 'matched') return null;
  if (res.spaces.length === 0) {
    return <span className='sbcount wait'>{`no variant of ${preview.component}`}</span>;
  }
  return <span className='sbcount'>{plural(res.spaces.length, 'variant', 'variants')}</span>;
}

function StageDetail({
  api,
  st,
  preview,
  componentPrompt,
  componentField,
}: {
  api: LoadedBuilderApi;
  st: Stage;
  preview: Preview;
  componentPrompt: React.ReactNode;
  componentField: React.ReactNode;
}) {
  const wf = api.workflow;
  const i = stageIndex(wf, st.id);
  const dupe = wf.stages.some((s) => s.name.trim() === st.name.trim() && s.id !== st.id);

  return (
    <div className='detail' id='det'>
      <div className='dethead'>
        <span className='sbord'>{i + 1}</span>
        <span className='sbname'>{st.name || 'unnamed'}</span>
        <CountText st={st} preview={preview} />
        <MoveActions api={api} st={st} i={i} />
      </div>

      <div className='detbody'>
        {/* Name, Component and the blocks are one group: Component is scratch
            preview state, not part of the Stage, but reading it as a SEPARATE
            Stage field -- which a divider between it and Name would say -- is
            the wrong error to invite. The divider goes above Name instead, so
            it marks the edge of this whole group rather than a seam inside it. */}
        <div className='sec firstsec'>
          <label className='field'>
            <span className='flabel'>
              {'Name '}
              <Tooltip
                title={`Unique within the workflow, and taken verbatim on the command line: cub variant promote --target-stage ${st.name || '<name>'}`}
              >
                <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
              </Tooltip>
            </span>
            <input
              className='input mono'
              data-act='stname'
              value={st.name}
              aria-invalid={dupe || undefined}
              onChange={(e) => api.setStageName(e.target.value)}
            />
            {dupe ? (
              <span className='ferr'>
                <span className='bang'>!</span>
                <span>
                  {'Another Stage is already named '}
                  <Mono>{st.name}</Mono>
                  {'. A Stage name is unique within the workflow.'}
                </span>
              </span>
            ) : null}
          </label>
          {componentField}
          <StageWhereEditor
            key={st.id}
            where={st.where}
            onChange={api.setStageWhere}
            inventory={preview.inventory}
          />
          <VariantLists stageId={st.id} preview={preview} />
          {/* VariantLists has nothing to draw until a component is chosen, so the
              question goes where its answer would be -- beside the selector it
              is about, not in a pane the reader has to leave this one to find. */}
          {componentPrompt}
        </div>

        <div className='sec'>
          <div className='rowbtns'>
            <button
              className='btn sm danger'
              type='button'
              data-act='rmstage'
              data-id={st.id}
              onClick={() => api.removeStage(st.id)}
            >
              Remove this Stage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FinalDetail({ api }: { api: LoadedBuilderApi }) {
  const wf = api.workflow;
  const last = wf.stages[wf.stages.length - 1];
  if (!last) return null;

  return (
    <div className='detail' id='det'>
      <div className='dethead'>
        <span className='sbflag' aria-hidden='true'>
          <FlagIcon />
        </span>
        <span className='sbname'>{COMPLETE_LABEL}</span>
        <span className='sbcount'>not a Stage</span>
        <MoveActions api={api} st={null} i={-1} />
      </div>

      <div className='detbody'>
        <div className='sec'>
          <p className='prose'>
            {`Nothing is promoted into ${COMPLETE_LABEL}. A Stage\u2019s prerequisites gate entry to the Stage after it, so the last Stage gates nothing: there is no hop left. These checks are what say the change has landed everywhere it was going, and a rollout reads as completed when they hold.`}
          </p>
          <p className='prose' style={{ marginTop: 8 }}>
            {'It covers the same variants as '}
            <Mono>{last.name}</Mono>
            {', the last Stage, because that is what it is checked over. It selects none of its own.'}
          </p>
        </div>
        <div className='sec'>
          <p className='fhelp' style={{ marginTop: 0 }}>
            {'In the stored definition this is '}
            <span className='mono'>{`spec.${COMPLETE_KEY}`}</span>
            {', and '}
            <span className='mono'>cub</span>
            {' takes '}
            <span className='mono'>{COMPLETE_KEY}</span>
            {`. ${COMPLETE_LABEL} is what it is called here.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function NoSelection({
  wf,
  preview,
  componentPrompt,
  componentField,
}: {
  wf: Workflow;
  preview: Preview;
  componentPrompt: React.ReactNode;
  componentField: React.ReactNode;
}) {
  if (!wf.stages.length) return null;
  const c = coverage(wf, preview.resolutions, preview.inventory);

  return (
    <div className='detail' id='det'>
      <div className='detempty'>
        {componentField}
        <h3>Nothing selected</h3>
        <p className='lede'>
          Pick a Stage on the rail to read the variants it covers and what must hold to enter it. A
          connector opens the same Stage at its prerequisites.
        </p>
        {/* 'unasked' and 'unsettled' are handled as separate arms, not folded
            into one check, so neither can silently stand in for the other --
            the first is a question this block can answer itself, the second is
            not. */}
        {preview.status === 'unasked' ? (
          componentPrompt
        ) : preview.status === 'unsettled' ? (
          <p className='lede'>{'What each Stage covers is not known yet.'}</p>
        ) : !c.uncovered.length ? (
          <p className='lede'>
            {`All ${plural(c.all.length, 'variant', 'variants')} of `}
            <Mono>{preview.component}</Mono>
            {' covered.'}
          </p>
        ) : (
          <>
            <p className='lede'>
              {`${c.covered.length} of ${plural(c.all.length, 'variant', 'variants')} of `}
              <Mono>{preview.component}</Mono>
              {' covered.'}
            </p>
            <div className='covchips'>
              {c.uncovered.map((sp) => (
                <span className='chip' key={sp.spaceId}>
                  {variantName(sp)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function DetailPane({
  api,
  preview,
  componentPrompt,
  componentField,
}: {
  api: LoadedBuilderApi;
  preview: Preview;
  /** Asked where coverage would be answered. `null` once a component is chosen. */
  componentPrompt: React.ReactNode;
  /** The Component picker itself. Reused as one element in whichever of the two
      panes below is showing -- never both, since only one ever mounts. */
  componentField: React.ReactNode;
}) {
  const sel = api.selection;
  if (sel?.kind === 'stage') {
    const st = api.workflow.stages.find((s) => s.id === sel.id);
    if (st) {
      return (
        <StageDetail
          api={api}
          st={st}
          preview={preview}
          componentPrompt={componentPrompt}
          componentField={componentField}
        />
      );
    }
  }
  // Complete is not a Stage. It has no selector, so there is no coverage to ask about.
  if (sel?.kind === 'final') return <FinalDetail api={api} />;
  return (
    <NoSelection
      wf={api.workflow}
      preview={preview}
      componentPrompt={componentPrompt}
      componentField={componentField}
    />
  );
}
