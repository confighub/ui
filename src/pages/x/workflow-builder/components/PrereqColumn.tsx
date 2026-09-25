// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Every prerequisite, in one column headed by the sentence.
 *
 * The Stage keeps its name and the variants it covers. What it costs to enter
 * lives here: the implicit gate, the three built in, every custom one, and
 * adding at the bottom.
 *
 * The sentence at the head is the load-bearing part. Prerequisites are evaluated
 * over the Stage AHEAD of the one being entered, and a list of tick boxes sitting
 * anywhere near a Stage's name invites the opposite reading. The sentence names
 * both Stages, rewrites on every tick, and is the largest type in the column.
 */

import { Fragment, useEffect, useRef } from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';

import {
  BUILTINS,
  BUILTIN_NAMES,
  COMPLETE_LABEL,
  IMPLICIT_GATE,
  builtinDesc,
} from '../vocabulary';
import {
  andJoin,
  andJoinText,
  declaredNames,
  isKnownGate,
  stageIndex,
  usedBy,
} from '../model';
import { Mono } from './Msg';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';
import type { CustomPrerequisite, FinalStage, Stage, Workflow } from '../types';

/** What the open target is called to a reader: `Complete`, or the Stage's own name. */
function targetLabel(api: LoadedBuilderApi): string | null {
  const sel = api.selection;
  if (sel?.kind === 'final') return COMPLETE_LABEL;
  if (sel?.kind === 'stage') return api.workflow.stages.find((s) => s.id === sel.id)?.name ?? null;
  return null;
}

/**
 * The Stage the open target's prerequisites are evaluated over: the one ahead of
 * it. Null for the first Stage, which has nothing ahead of it.
 */
function targetOver(api: LoadedBuilderApi): string | null {
  const wf = api.workflow;
  if (api.selection?.kind === 'final') {
    return wf.stages.length ? wf.stages[wf.stages.length - 1].name : null;
  }
  if (api.selection?.kind === 'stage') {
    const i = stageIndex(wf, api.selection.id);
    return i > 0 ? wf.stages[i - 1].name : null;
  }
  return null;
}

function gateTarget(api: LoadedBuilderApi): Stage | FinalStage | null {
  const sel = api.selection;
  if (sel?.kind === 'final') return api.workflow.final;
  if (sel?.kind === 'stage') return api.workflow.stages.find((s) => s.id === sel.id) ?? null;
  return null;
}

function GateWord({ wf, name }: { wf: Workflow; name: string }) {
  const cls =
    name === IMPLICIT_GATE ? 'g implicit' : isKnownGate(wf, name) ? 'g' : 'g bad';
  return <span className={cls}>{name}</span>;
}

/**
 * The sentence, rebuilt from the target's own array on every render. With nothing
 * ticked it still reads "must be promoted", because that one holds whatever a
 * Stage declares -- so the sentence is never empty and never a half-sentence
 * waiting for a word.
 */
function Sentence({ api }: { api: LoadedBuilderApi }) {
  const wf = api.workflow;
  const t = gateTarget(api);

  if (!t) return null;

  const over = targetOver(api);
  const label = targetLabel(api);

  if (!over) {
    return (
      <div className='cpsent none'>
        <p className='s'>
          Nothing precedes <strong>{label}</strong>, so entering it costs nothing.
        </p>
        <p className='over'>
          Prerequisites are evaluated over the Stage ahead of the one being entered, and there is no
          Stage ahead of this one: the change is already in the change order&rsquo;s base Space when
          the rollout opens.
        </p>
      </div>
    );
  }

  const order = [...BUILTIN_NAMES, ...declaredNames(wf)];
  const named = [...t.prereqs].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
  const words = [IMPLICIT_GATE, ...named];
  const isFinal = api.selection?.kind === 'final';

  const overExplained = isFinal ? (
    <>
      {'Checked over '}
      <Mono>{over}</Mono>
      {', the last Stage, the same way an entry gate is checked over the Stage ahead of the one being entered.'}
    </>
  ) : (
    <>
      {'Checked over '}
      <Mono>{over}</Mono>
      {', the Stage ahead of this one, not over '}
      <Mono>{label}</Mono>
      {'. They are what a promotion into '}
      <Mono>{label}</Mono>
      {' is refused on.'}
    </>
  );

  return (
    <div className='cpsent'>
      <p className='s' aria-live='polite'>
        {isFinal ? (
          <>
            {'For the rollout to read as '}
            <strong>complete</strong>
            {', every variant in '}
            <strong>{over}</strong>
            {' must be '}
          </>
        ) : (
          <>
            {'To enter '}
            <strong>{label}</strong>
            {', every variant in '}
            <strong>{over}</strong>
            {' must be '}
          </>
        )}
        {andJoin(words).map((w, i) =>
          w.sep !== undefined ? (
            <Fragment key={i}>{w.sep}</Fragment>
          ) : (
            <GateWord wf={wf} name={w.item} key={i} />
          ),
        )}
        {'. '}
        <Tooltip title={overExplained}>
          <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
        </Tooltip>
      </p>
    </div>
  );
}

/** Which Stages name a prerequisite today, by the label a reader sees. */
function NamedBy({ api, name }: { api: LoadedBuilderApi; name: string }) {
  const used = usedBy(api.workflow, name);
  const label = targetLabel(api);

  if (name === IMPLICIT_GATE) {
    return <span className='cpmeta'>Checked on every hop, whatever a Stage declares.</span>;
  }
  if (label && used.includes(label)) {
    const others = used.filter((u) => u !== label);
    return (
      <span className='cpmeta here'>
        {`named by ${label}, the one open${others.length ? `, and by ${andJoinText(others)}` : ''}`}
      </span>
    );
  }
  if (used.length) return <span className='cpmeta'>{`named by ${andJoinText(used)}`}</span>;
  return <span className='cpmeta none'>named by no Stage</span>;
}

/** The 13px slot a tick box occupies, kept even where there is nothing to tick. */
function TickSlot() {
  return <span style={{ width: 13, flex: 'none' }} aria-hidden='true' />;
}

/**
 * `promoted` is not one of the stored names, so it is not one of the rows you can
 * change. It sits on the inset ground with its box checked and disabled and the
 * word "always" beside it, which reads as a fact rather than as a control
 * somebody switched off.
 */
function ImplicitRow({
  target,
  over,
  onHover,
}: {
  target: string | null;
  over: string | null;
  onHover: (name: string | null, implicit: boolean) => void;
}) {
  return (
    <div
      className='cprow implicit first'
      data-cplight={IMPLICIT_GATE}
      onMouseEnter={() => onHover(IMPLICIT_GATE, true)}
      onMouseLeave={() => onHover(null, false)}
    >
      <span className='cptop'>
        {target ? (
          <input type='checkbox' checked disabled readOnly aria-label='promoted, always checked' />
        ) : (
          <TickSlot />
        )}
        <span className='cpfix'>{IMPLICIT_GATE}</span>
        <span className='tagmini cptag'>always</span>
        <Tooltip
          title={
            over
              ? `Every variant in ${over} has taken the change. Checked whatever a Stage declares, so it is never one of the names stored on it.`
              : 'Checked whatever a Stage declares, so it is never one of the names stored on it.'
          }
        >
          <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
        </Tooltip>
      </span>
    </div>
  );
}

function BuiltinRow({
  api,
  name,
  target,
  over,
  onHover,
}: {
  api: LoadedBuilderApi;
  name: string;
  target: string | null;
  over: string | null;
  onHover: (name: string | null, implicit: boolean) => void;
}) {
  const t = gateTarget(api);
  const on = t ? t.prereqs.includes(name) : false;
  /* A Stage with nothing ahead of it has no hop to gate, so the boxes are
     refused rather than hidden. */
  const noPrev = Boolean(target) && !over;

  return (
    <div
      className={`cprow${on ? ' on' : ''}`}
      data-cplight={name}
      onMouseEnter={() => onHover(name, false)}
      onMouseLeave={() => onHover(null, false)}
    >
      <span className='cptop'>
        {target ? (
          <input
            type='checkbox'
            data-act='togglegate'
            data-gate={name}
            checked={on}
            disabled={noPrev}
            aria-label={`${on ? 'Stop' : 'Have'} ${target} ${on ? 'naming' : 'name'} ${name}`}
            onChange={(e) => api.toggleGate(name, e.target.checked)}
          />
        ) : (
          <TickSlot />
        )}
        <span className='cpfix'>{name}</span>
        <span className='tagmini cptag'>built in</span>
        {target ? (
          <Tooltip title={builtinDesc(name, over)}>
            <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
          </Tooltip>
        ) : null}
      </span>
      {target ? null : <NamedBy api={api} name={name} />}
    </div>
  );
}

function CustomRow({
  api,
  c,
  target,
  onHover,
}: {
  api: LoadedBuilderApi;
  c: CustomPrerequisite;
  target: string | null;
  onHover: (name: string | null, implicit: boolean) => void;
}) {
  const wf = api.workflow;
  const t = gateTarget(api);
  const on = t ? t.prereqs.includes(c.name) : false;
  const missing = !c.expression.trim().startsWith('cel:');
  const sel = api.cpSel === c.id;
  const noPrev = Boolean(target) && !targetOver(api);
  const used = usedBy(wf, c.name);

  const nameRef = useRef<HTMLInputElement | null>(null);
  const shouldFocus = api.focusCustomId === c.id;
  useEffect(() => {
    if (!shouldFocus) return;
    nameRef.current?.focus();
    nameRef.current?.select();
    api.clearFocusCustom();
  }, [shouldFocus, api]);

  const cls = `cprow${missing ? ' bad' : sel ? ' sel' : on ? ' on' : ''}`;

  return (
    <div className={cls} id={`cp-${c.id}`}>
      <span className='cptop'>
        {target ? (
          <input
            type='checkbox'
            data-act='togglegate'
            data-gate={c.name}
            checked={on}
            disabled={noPrev}
            aria-label={`${on ? 'Stop' : 'Have'} ${target} ${on ? 'naming' : 'name'} ${c.name}`}
            onChange={(e) => api.toggleGate(c.name, e.target.checked)}
          />
        ) : (
          <TickSlot />
        )}
        <button
          className='cpname'
          type='button'
          data-act='selcp'
          data-id={c.id}
          data-cplight={c.name}
          aria-expanded={sel}
          onClick={() => api.toggleCustom(c.id)}
          onMouseEnter={() => onHover(c.name, false)}
          onMouseLeave={() => onHover(null, false)}
        >
          {c.name}
        </button>
        <span className='tagmini cptag'>cel</span>
      </span>

      <NamedBy api={api} name={c.name} />

      {missing ? (
        <span className='cpwhat missing'>
          No <span className='mono'>cel:</span> prefix, so this cannot be saved.
        </span>
      ) : target || sel ? (
        <span
          className='cpwhat clamp'
          title={c.description || undefined}
        >
          {c.description || 'No description, so a promotion it holds up reports nothing but the name.'}
        </span>
      ) : null}

      {sel ? (
        <div className='cpedit'>
          {used.length ? (
            <p className='cpglobal'>
              <span className='bang'>!</span>
              <span>
                {'Declared once, named wherever it applies: editing this changes it for '}
                {andJoin(used).map((u, i) =>
                  u.sep !== undefined ? (
                    <Fragment key={i}>{u.sep}</Fragment>
                  ) : (
                    <span className='mono' key={i}>
                      {u.item}
                    </span>
                  ),
                )}
                .
              </span>
            </p>
          ) : (
            <p className='cpglobal quiet'>
              <span className='bang'>i</span>
              <span>Named by nothing yet, so editing it changes nothing that runs.</span>
            </p>
          )}

          <label className='field'>
            <span className='flabel'>Name</span>
            <input
              className='input mono'
              ref={nameRef}
              data-act='cpname'
              data-id={c.id}
              value={c.name}
              onChange={(e) => api.setCustomName(c.id, e.target.value)}
            />
          </label>

          <label className='field'>
            <span className='flabel'>Expression</span>
            <textarea
              className='ta mono'
              rows={4}
              data-act='cpexpr'
              data-id={c.id}
              value={c.expression}
              aria-invalid={missing || undefined}
              onChange={(e) => api.setCustomExpression(c.id, e.target.value)}
            />
            {missing ? (
              <>
                <span className='ferr'>
                  <span className='bang'>!</span>
                  <span>
                    The expression must carry the <span className='mono'>cel:</span> prefix, which is
                    what says the value is an expression and not a literal.
                  </span>
                </span>
                <button
                  className='btn sm'
                  style={{ marginTop: 7 }}
                  type='button'
                  data-act='fixprefix'
                  data-id={c.id}
                  onClick={() => api.fixPrefix(c.id)}
                >
                  Add the prefix
                </button>
              </>
            ) : (
              <span className='fhelp'>
                Evaluated against the Space under consideration, the change order being promoted, and
                that Space&rsquo;s Release. Compiled when the workflow is written, not at the
                promotion it would hold up.
              </span>
            )}
          </label>

          <label className='field'>
            <span className='flabel'>Description</span>
            <input
              className='input'
              data-act='cpdesc'
              data-id={c.id}
              value={c.description}
              placeholder='What this gate checks, in your words'
              onChange={(e) => api.setCustomDescription(c.id, e.target.value)}
            />
            <span className='fhelp'>
              A promotion it holds up reports it by name, and a name is short enough to be cryptic.
              This is where the reason lives.
            </span>
          </label>

          <div className='cpfoot'>
            <button
              className='linkbtn'
              type='button'
              data-act='selcp'
              data-id=''
              onClick={() => api.toggleCustom('')}
            >
              Done
            </button>
            <button
              className='linkbtn'
              style={{ color: 'var(--bad)' }}
              type='button'
              data-act='rmcustom'
              data-id={c.id}
              onClick={() => api.removeCustom(c.id)}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A name a Stage carries that nothing declares. It has no row of its own to sit
 * in, so it gets one here, where the tick that clears it is.
 */
function OrphanRows({
  api,
  target,
  onHover,
}: {
  api: LoadedBuilderApi;
  target: string | null;
  onHover: (name: string | null, implicit: boolean) => void;
}) {
  const t = gateTarget(api);
  if (!t || !target) return null;

  return (
    <>
      {t.prereqs
        .filter((g) => !isKnownGate(api.workflow, g))
        .map((g) => (
          <div
            className='cprow bad'
            key={g}
            data-cplight={g}
            onMouseEnter={() => onHover(g, false)}
            onMouseLeave={() => onHover(null, false)}
          >
            <span className='cptop'>
              <input
                type='checkbox'
                data-act='togglegate'
                data-gate={g}
                checked
                aria-label={`${g}, named but not declared`}
                onChange={(e) => api.toggleGate(g, e.target.checked)}
              />
              <span className='cpfix'>{g}</span>
              <span className='tagmini bad cptag'>not declared</span>
            </span>
            <span className='cpwhat missing'>
              Nothing declares this name, so the workflow cannot be saved. Declare one below under
              this name, or clear it here.
            </span>
          </div>
        ))}
    </>
  );
}

export function PrereqColumn({
  api,
  onHover,
}: {
  api: LoadedBuilderApi;
  onHover: (name: string | null, implicit: boolean) => void;
}) {
  const wf = api.workflow;
  const target = targetLabel(api);
  const over = targetOver(api);

  return (
    <div className='cpcol' role='region' aria-label='Prerequisites'>
      <div className='cphead'>
        <span className='t'>Prerequisites</span>
        <span className='n'>{target ? `for ${target}` : 'across the workflow'}</span>
      </div>

      <Sentence api={api} />

      <div className='cplist'>
        <ImplicitRow target={target} over={over} onHover={onHover} />
        {BUILTINS.map((b) => (
          <BuiltinRow key={b.name} api={api} name={b.name} target={target} over={over} onHover={onHover} />
        ))}
        <OrphanRows api={api} target={target} onHover={onHover} />

        {wf.custom.length ? (
          <>
            <div className='cpgroup'>
              Custom prerequisites, declared once and named wherever they apply
            </div>
            {wf.custom.map((c) => (
              <CustomRow key={c.id} api={api} c={c} target={target} onHover={onHover} />
            ))}
          </>
        ) : null}
      </div>

      {/* Adding is at the foot of the column, and only a custom one can be added. */}
      <div className='cpadd'>
        {wf.custom.length ? (
          <button className='btn sm' type='button' data-act='addcustom' onClick={api.addCustom}>
            + Declare a custom prerequisite
          </button>
        ) : (
          <Tooltip
            title={
              <>
                Anything beyond <Mono>Validated</Mono>, <Mono>Released</Mono> and <Mono>Healthy</Mono>{' '}
                is a named cel expression, declared once and gated on by name. Soak time, freeze
                windows and external signals all take this shape: write the signal to an annotation,
                then read it here.
              </>
            }
          >
            <button className='btn sm' type='button' data-act='addcustom' onClick={api.addCustom}>
              + Declare a custom prerequisite
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
