// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Altitude 0: every change workflow in the organisation.
 *
 * ⚠️ THE CONSOLE NEVER RESOLVES A SELECTOR, AND NOT ONLY BECAUSE IT WOULD BE
 * EXPENSIVE. A row has no editing context to supply a component from, so a
 * definition in a list genuinely cannot say what it would match -- which is why
 * this does not become possible when the builder's own resolution arrives. What
 * a row can say is what the definition alone proves, and that is what it says.
 *
 * So `definitionFaults` is the whole of what shades a Stage. A Stage this cannot
 * fault is drawn the way any Stage is drawn: the legend says a plain segment is a
 * Stage, not a healthy one, which is what keeps an unshaded strip from claiming a
 * health nobody established.
 *
 * ⚠️ A FAULT IS SHOWN, NOT NAMED. The Problem column that spelled out the worst
 * fault per row was removed at the user's request; a faulted Stage still shades
 * red and the row's action still reads "Fix the definition", but nothing here
 * says WHICH gate is undeclared. Opening the workflow is where that is answered
 * now -- `ProblemsBand` on the builder lists every fault in full.
 */

import { useState } from 'react';

import { RefreshIcon } from '../icons';
import { definitionFaults, plural } from '../model';
import { CreateWorkflowPanel } from './CreateWorkflowPanel';
import type { CreateWorkflowFlow } from '../api/useCreateWorkflowFlow';
import type { MappedEntity } from '../api/mapping';
import type { SpaceOption } from './SpacePicker';
import type { BuilderApi } from '../useWorkflowBuilder';

interface Row {
  entity: MappedEntity;
  /** Indexes of Stages the definition itself faults. Never a claim about the rest. */
  badStages: number[];
  /** A fault, not a note: only the former makes a row read as wrong. */
  isBad: boolean;
}

function buildRow(entity: MappedEntity): Row {
  const faults = definitionFaults(entity.workflow);
  const problems = faults.filter((f) => f.sev === 'problem');

  const badStages: number[] = [];
  problems.forEach((f) => {
    const go = f.go;
    if (go?.kind !== 'stage') return;
    const i = entity.workflow.stages.findIndex((s) => s.id === go.id);
    if (i !== -1 && !badStages.includes(i)) badStages.push(i);
  });

  return { entity, badStages, isBad: problems.length > 0 };
}

function StageStrip({ row }: { row: Row }) {
  const stages = row.entity.workflow.stages;
  return (
    <span>
      <span className='strip'>
        {stages.map((s, i) => (
          <span
            key={s.id}
            className={`seg ${row.badStages.includes(i) ? 'bad' : 'ok'}`}
            title={s.name}
          />
        ))}
        <span className='seg fin' title='Final' />
      </span>
      <span className='stripnote'>{`${plural(stages.length, 'Stage', 'Stages')} + Final`}</span>
    </span>
  );
}

interface WorkflowsConsoleProps {
  api: BuilderApi;
  entities: readonly MappedEntity[];
  isLoading: boolean;
  failed: boolean;
  /**
   * Workflows the answer was meant to contain and does not: a row nothing could
   * make sense of, or one the server said it could not supply.
   *
   * ⚠️ A COUNT IS A COMPLETENESS CLAIM. Dropping such a row is right -- it is
   * already invisible, and withholding the readable ones helps nobody -- but a
   * list that then prints a number is saying that number is how many there are. A
   * reader searching for a workflow that is not in it concludes it does not exist,
   * and stops looking. So the shortfall is said rather than absorbed.
   *
   * Said against the number READ, not the number shown: filters hide rows too, and
   * that is a thing the reader did on purpose and can undo. This is not.
   */
  unreadable?: number;
  /** Which workflow to open. Held by the page, since the fetch is keyed on it. */
  onOpen: (changeWorkflowId: string) => void;
  onRefresh: () => void;
  /** Starting a new workflow from an existing one. Held by the page: it needs
      the write and the same `entities` this console already reads. */
  createFlow: CreateWorkflowFlow;
  destinationSpaces: readonly SpaceOption[];
  destinationSpacesStatus: 'loading' | 'ready' | 'failed';
  /**
   * Starting a new workflow with nothing carried over. Held by the page,
   * since it is what puts the builder into draft mode -- a fact the console
   * does not otherwise know about and has no reason to.
   */
  onNewBlank: () => void;
}

export function WorkflowsConsole({
  api,
  entities,
  isLoading,
  failed,
  unreadable = 0,
  onOpen,
  onRefresh,
  createFlow,
  destinationSpaces,
  destinationSpacesStatus,
  onNewBlank,
}: WorkflowsConsoleProps) {
  /* Which of the two ways to start counts as "starting" is not decided until
     one is picked, so the button opens a choice rather than a flow -- neither
     `createFlow.begin` nor `onNewBlank` should fire on the same click that
     reveals them. */
  const [choosingNew, setChoosingNew] = useState(false);

  const all = entities.map(buildRow);

  const rows = all.filter((r) => {
    if (api.spaceFilter !== null && r.entity.workflow.space !== api.spaceFilter) return false;
    const q = api.search.trim().toLowerCase();
    if (!q) return true;
    const { displayName, slug } = r.entity.workflow;
    return displayName.toLowerCase().includes(q) || slug.toLowerCase().includes(q);
  });

  /* Empty is excluded rather than offered: it is not a Space anyone chose to
     name, it is what an unexpanded join reads back as today, and putting it in
     this list would render a blank, unlabelled option standing in for rows
     whose Space this page could not determine -- offering to filter BY the
     absence rather than saying the absence exists. */
  const spaces: string[] = [];
  all.forEach((r) => {
    if (r.entity.workflow.space && !spaces.includes(r.entity.workflow.space)) {
      spaces.push(r.entity.workflow.space);
    }
  });

  const filtersActive = api.spaceFilter !== null || api.search !== '';

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <>
        {Array.from({ length: 4 }, (_, i) => (
          <div className='row grid4' key={i} aria-hidden='true'>
            <span>
              <div className='skelline' style={{ width: 180 }} />
              <div className='skelline sm' style={{ width: 240 }} />
            </span>
            <span>
              <div className='skelline sm' style={{ width: 96 }} />
              <div className='skelline sm' style={{ width: 110 }} />
            </span>
            <div className='skelline sm hide1150' style={{ width: 28 }} />
            <span className='raction hide860'>
              <div className='skelbtn sm' style={{ width: 128, marginLeft: 'auto' }} />
            </span>
          </div>
        ))}
      </>
    );
  } else if (failed) {
    body = (
      <div className='cardbody'>
        <div className='blank'>
          <div className='t'>Could not read the workflows</div>
          <p className='d'>Nothing has been changed. Trying again is safe.</p>
          <button className='btn' type='button' data-act='retry' onClick={onRefresh}>
            Try again
          </button>
        </div>
      </div>
    );
  } else if (!all.length) {
    body = (
      <div className='cardbody'>
        <div className='blank'>
          <div className='t'>No change workflows yet</div>
          <p className='d'>
            A change workflow declares the Stages a change moves through and what must hold to enter
            each one. It is the definition; a change order is one change moving through it, and a
            rollout is that change order in motion.
          </p>
        </div>
      </div>
    );
  } else if (!rows.length) {
    body = (
      <div className='cardbody'>
        <div className='blank'>
          <div className='t'>Nothing matches these filters</div>
          <p className='d'>
            {`${plural(all.length, 'workflow is', 'workflows are')} hidden by the filters above.`}
          </p>
          <button className='btn' type='button' data-act='clearfilters' onClick={api.clearFilters}>
            Clear the filters
          </button>
        </div>
      </div>
    );
  } else {
    body = rows.map((r) => {
      const wf = r.entity.workflow;
      const isBad = r.isBad;
      return (
        <button
          className='row grid4'
          type='button'
          key={r.entity.identity.changeWorkflowId}
          data-act='openwf'
          data-id={r.entity.identity.changeWorkflowId}
          onClick={() => onOpen(r.entity.identity.changeWorkflowId)}
        >
          <span>
            <span className='rname'>{wf.displayName}</span>
            <span className='rslug'>{`${wf.slug} · ${wf.space}`}</span>
          </span>
          <StageStrip row={r} />
          <span className='rage hide1150'>{wf.age}</span>
          <span className='raction hide860'>
            <span className='btn sm' aria-hidden='true'>
              {isBad ? 'Fix the definition' : 'Open the definition'}
            </span>
          </span>
        </button>
      );
    });
  }

  return (
    <div className='shell'>
      <div className='conhead'>
        <h1 className='conh1'>Change workflows</h1>
        <span className='concount'>{isLoading || failed ? '' : rows.length}</span>
        <div className='conright'>
          {/* Not a fault: nothing is wrong with these workflows and there is nothing
              to fix. It is the list declining to claim it is the whole list. */}
          {unreadable > 0 ? (
            <span className='confresh'>
              {all.length + unreadable === 1
                ? 'The one workflow could not be read'
                : `${unreadable} of ${plural(all.length + unreadable, 'workflow', 'workflows')} could not be read`}
            </span>
          ) : null}
          <button className='btn quiet' type='button' data-act='refresh' onClick={onRefresh}>
            <RefreshIcon />
            Refresh
          </button>
        </div>
      </div>

      <p className='conintro'>
        The definitions a change order is promoted under: the Stages a change moves through, and what
        must hold before it enters each one. One workflow governs many change orders, and a rollout
        is one of them in motion. Cloning a workflow into another Space is how a second component
        gets the same shape.
      </p>

      <div className='filterbar'>
        <label className='srOnly' htmlFor='cf-search'>
          Search workflows
        </label>
        <input
          className='input search'
          id='cf-search'
          data-act='search'
          placeholder='Search by name or slug'
          value={api.search}
          onChange={(e) => api.setSearch(e.target.value)}
        />
        <label className='srOnly' htmlFor='cf-space'>
          Space
        </label>
        <select
          className='sel'
          id='cf-space'
          data-act='spacefilter'
          /* The empty string is the DOM's sentinel for "no Space chosen", never
             the app's. A Space cannot be slugged the empty string, so this is
             safe in a way `'all'` was not -- and it is translated back to
             `null` on change rather than carried past this one control. */
          value={api.spaceFilter ?? ''}
          onChange={(e) => api.setSpaceFilter(e.target.value || null)}
        >
          <option value=''>Every Space</option>
          {spaces.map((s) => (
            <option value={s} key={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          className='btn'
          type='button'
          data-act='clearfilters'
          disabled={!filtersActive}
          onClick={api.clearFilters}
        >
          Clear
        </button>
        {choosingNew ? (
          <div className='newchoice' role='group' aria-label='Start a new workflow'>
            <button
              className='btn primary'
              type='button'
              data-act='newblank'
              onClick={() => {
                setChoosingNew(false);
                onNewBlank();
              }}
            >
              Blank
            </button>
            <button
              className='btn'
              type='button'
              data-act='newfromexisting'
              onClick={() => {
                setChoosingNew(false);
                createFlow.begin();
              }}
            >
              From existing
            </button>
            <button
              className='iconbtn'
              type='button'
              aria-label='Cancel starting a new workflow'
              data-act='newcancel'
              onClick={() => setChoosingNew(false)}
            >
              &#215;
            </button>
          </div>
        ) : (
          <button
            className='btn primary'
            type='button'
            data-act='newworkflow'
            onClick={() => setChoosingNew(true)}
          >
            + New workflow
          </button>
        )}
      </div>

      <CreateWorkflowPanel
        flow={createFlow}
        sourceStatus={failed ? 'failed' : isLoading ? 'loading' : 'ready'}
        spaces={destinationSpaces}
        spacesStatus={destinationSpacesStatus}
        onOpenClone={onOpen}
      />

      {/* A plain segment is a Stage, not a healthy one. The console faults what the
          definition proves and looks no further, so the legend must not offer a
          reading the page cannot support. */}
      <div className='legend' aria-hidden='true'>
        <span className='li'>
          <span className='seg ok' />
          Stage
        </span>
        <span className='li'>
          <span className='seg bad' />
          Names a gate nothing declares
        </span>
        <span className='li'>
          <span className='seg fin' />
          Final, which is not a Stage
        </span>
      </div>

      <div className='table'>
        {isLoading || failed ? null : (
          <div className='colhead grid4' role='row'>
            <span>Workflow</span>
            <span>Stages</span>
            <span className='hide1150 al-r'>Age</span>
            <span className='hide860 al-r'>Next action</span>
          </div>
        )}
        {body}
      </div>
    </div>
  );
}
