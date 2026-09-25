// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The rail is the only list of Stages.
 *
 * Each tile carries its own `where` expression: with no Stage list below it,
 * this is the only place an unselected Stage's selector can be read, and the
 * selector is the thing most likely to be wrong.
 *
 * The rail wraps rather than scrolls, so the last Stage is on screen at the
 * width the first one is.
 */

import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined';
import Tooltip from '@mui/material/Tooltip';

import { COMPLETE_LABEL } from '../vocabulary';
import { CheckIcon, FlagIcon, GateIcon, OpenIcon, WarnIcon } from '../icons';
import { isKnownGate, plural } from '../model';
import { definitionFaults } from '../model';
import type { Preview } from '../preview';
import { Mono } from './Msg';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';
import type { Stage, Workflow } from '../types';

/** The rail's own keys, read once by a reader who asks rather than said to every reader. */
export function RailKeyHelp() {
  return (
    <Tooltip
      placement='top'
      title={
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span>
            <kbd>&#8592;</kbd> <kbd>&#8594;</kbd> move along the rail
          </span>
          <span>
            <kbd>enter</kbd> open a Stage to edit it
          </span>
          <span>
            <kbd>alt</kbd> + <kbd>&#8592;</kbd> <kbd>&#8594;</kbd> move earlier or later, the same
            way the arrows on a Stage do
          </span>
          <span>
            <kbd>esc</kbd> clear the selection
          </span>
        </span>
      }
    >
      <button className='railkbd' type='button' aria-label='Keyboard shortcuts for the rail'>
        <KeyboardOutlinedIcon fontSize='inherit' />
      </button>
    </Tooltip>
  );
}

interface GateLinkProps {
  wf: Workflow;
  /** The Stage being entered, or a stand-in carrying Complete's own prerequisites. */
  into: { name: string; prereqs: string[] };
  /** The Stage the prerequisites are evaluated over: the one ahead of the one being entered. */
  over: string;
  selected: boolean;
  lit: boolean;
  isFinal: boolean;
  /** The Stage the connector opens. Empty for Complete, which has no id. */
  stageId?: string;
  onSelect: () => void;
}

function GateLink({ wf, into, over, selected, lit, isFinal, stageId, onSelect }: GateLinkProps) {
  const n = into.prereqs.length;
  const undeclared = into.prereqs.filter((p) => !isKnownGate(wf, p)).length;
  const tone = undeclared ? 'bad' : n ? 'req' : 'none';
  const glyph = undeclared ? <WarnIcon /> : n ? <GateIcon /> : <OpenIcon />;
  const text = undeclared
    ? plural(undeclared, 'undeclared', 'undeclared')
    : n
      ? plural(n, 'gate', 'gates')
      : 'no gate';
  const label = isFinal
    ? `Prerequisites for the rollout to read as complete, evaluated over every variant in ${over}`
    : `Prerequisites for entering ${into.name}, evaluated over every variant in ${over}`;

  return (
    <button
      className={`gatelink${lit ? ' lit' : ''}`}
      type='button'
      data-act={isFinal ? 'selfinal' : 'selgate'}
      {...(stageId ? { 'data-id': stageId } : {})}
      aria-pressed={selected}
      aria-label={label}
      onClick={onSelect}
    >
      <span className={`gatedot ${tone}`} aria-hidden='true'>
        {glyph}
      </span>
      <span className={`gatecount ${tone}`}>{text}</span>
      <span className='gatecap'>
        {isFinal ? (
          'to read as complete'
        ) : (
          <>
            to enter <Mono>{into.name}</Mono>
          </>
        )}
      </span>
    </button>
  );
}

interface NodeProps {
  wf: Workflow;
  st: Stage;
  preview: Preview;
  selected: boolean;
  lit: boolean;
  onSelect: () => void;
}

function RailNode({ wf, st, preview, selected, lit, onSelect }: NodeProps) {
  /* A definition fault reddens; a resolution note does not. A Stage that selects
     nothing for the component being previewed is not a defect in the definition. */
  const defFault = definitionFaults(wf).find(
    (f) => f.sev === 'problem' && f.go?.kind === 'stage' && f.go.id === st.id,
  );
  const res = preview.resolutions.get(st.id);
  /* Only a fault reddens a tile. A Stage that selects nothing for the component
     being previewed is worth saying and is not a defect in the definition, so it
     reads in the waiting colour rather than the fault one. */
  const faulted = Boolean(defFault);

  let label: string;
  let labelCls = '';
  if (defFault) {
    label = 'Cannot be saved';
    labelCls = ' bad';
  } else if (res?.kind === 'invalid') {
    label = 'where is unreadable';
    labelCls = ' bad';
  } else if (res?.kind === 'matched') {
    label = res.spaces.length
      ? plural(res.spaces.length, 'variant', 'variants')
      : 'No variant here';
    labelCls = res.spaces.length ? '' : ' wait';
  } else {
    /* Nothing chosen to resolve against, or no answer yet. Not knowing is not a
       finding, so the tile says nothing rather than guessing at a count. */
    label = '';
  }

  const where = (st.where || '').trim();

  return (
    <button
      className={`node${faulted ? ' problem' : ''}${lit ? ' lit' : ''}`}
      type='button'
      data-railnode='rail'
      data-act='selstage'
      data-id={st.id}
      data-stagename={st.name}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className='nodetop'>
        <span className={`nodedot ${faulted ? 'bad' : 'ok'}`} aria-hidden='true'>
          {faulted ? <WarnIcon /> : <CheckIcon />}
        </span>
        <span className='nodename'>{st.name || 'unnamed'}</span>
      </span>
      {label ? <span className={`nodelabel${labelCls}`}>{label}</span> : null}
      <span className={`nodewhere${where ? '' : ' plain'}`}>
        {where || 'every variant of the component'}
      </span>
    </button>
  );
}

interface StageRailProps {
  api: LoadedBuilderApi;
  /** Stage names whose tile and connector are lit while a prerequisite is pointed at. */
  lit: Set<string>;
  preview: Preview;
}

export function StageRail({ api, lit, preview }: StageRailProps) {
  const wf = api.workflow;
  const sel = api.selection;

  if (!wf.stages.length) {
    return (
      <div className='cardbody'>
        <div className='blank'>
          <div className='t'>This workflow has no Stages</div>
          <p className='d'>
            A change order created from it would have nowhere to go. Add the first Stage: it is the
            one the change starts in, and it has no entry gates, because nothing precedes it.
          </p>
          <button className='btn primary' type='button' data-act='addstage' onClick={api.addStage}>
            Add the first Stage
          </button>
        </div>
      </div>
    );
  }

  const last = wf.stages[wf.stages.length - 1];

  /** Arrow keys walk the rail; alt plus an arrow moves the Stage the same way its buttons do. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const node = (e.target as HTMLElement).closest?.('[data-railnode]') as HTMLElement | null;
    if (!node) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const dir = e.key === 'ArrowRight' ? 1 : -1;
    if (e.altKey) {
      const id = node.getAttribute('data-id');
      if (id) {
        e.preventDefault();
        api.moveStage(id, dir);
      }
      return;
    }
    e.preventDefault();
    const nodes = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>('[data-railnode]'),
    );
    const next = nodes[nodes.indexOf(node) + dir];
    if (next) next.focus();
  };

  return (
    <>
      <div className='railbody'>
        <div className='rail' role='group' aria-label='Stage rail' onKeyDown={onKeyDown}>
          {wf.stages.map((st, i) => {
            const node = (
              <RailNode
                wf={wf}
                st={st}
                preview={preview}
                selected={sel?.kind === 'stage' && sel.id === st.id}
                lit={lit.has(st.name)}
                onSelect={() => api.selectStage(st.id)}
              />
            );
            if (i === 0) {
              return (
                <div className='hop first' key={st.id}>
                  {node}
                </div>
              );
            }
            return (
              <div className='hop' key={st.id}>
                <GateLink
                  wf={wf}
                  into={st}
                  over={wf.stages[i - 1].name}
                  selected={sel?.kind === 'stage' && sel.id === st.id}
                  lit={lit.has(st.name)}
                  isFinal={false}
                  stageId={st.id}
                  onSelect={() => api.selectStage(st.id)}
                />
                {node}
              </div>
            );
          })}

          {/* Nothing can be added after the end, so Add sits between the last Stage
              and the hop into Complete rather than trailing the rail. */}
          <button className='addtile' type='button' data-act='addstage' onClick={api.addStage}>
            + Add Stage
          </button>

          <div className='hop'>
            <GateLink
              wf={wf}
              into={{ name: COMPLETE_LABEL, prereqs: wf.final.prereqs }}
              over={last.name}
              selected={sel?.kind === 'final'}
              lit={lit.has(COMPLETE_LABEL)}
              isFinal
              onSelect={api.selectFinal}
            />
            <button
              className={`node fin${lit.has(COMPLETE_LABEL) ? ' lit' : ''}`}
              type='button'
              data-railnode='rail'
              data-act='selfinal'
              data-stagename={COMPLETE_LABEL}
              aria-pressed={sel?.kind === 'final'}
              onClick={api.selectFinal}
            >
              <span className='nodetop'>
                <span className='nodedot fin' aria-hidden='true'>
                  <FlagIcon />
                </span>
                <span className='nodename'>{COMPLETE_LABEL}</span>
              </span>
              <span className='nodelabel'>
                Not a Stage, checked over <Mono>{last.name}</Mono>
              </span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
