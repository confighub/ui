// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The fault band.
 *
 * The rail tile says which Stage is wrong in three words; this says why, in a
 * sentence, and takes you there. Without the Stage list there is nowhere else a
 * fault on an unselected Stage can be read in full, so it hugs the rail rather
 * than sitting in a card of its own -- it is about the rail.
 */

import { problems } from '../model';
import { Msg } from './Msg';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';

export function ProblemsBand({ api }: { api: LoadedBuilderApi }) {
  const list = problems(api.workflow);
  if (!list.length) return null;

  const worst = list.some((x) => x.sev === 'problem') ? 'lvbad' : 'lvnote';

  return (
    <div className={`probband ${worst}`} role='region' aria-label='Problems'>
      {list.map((it, i) => {
        let action: React.ReactNode = null;
        if (it.fix) {
          action = (
            <button
              className='btn sm'
              type='button'
              data-act='fixprefix'
              data-id={it.fix}
              onClick={() => api.fixPrefix(it.fix!)}
            >
              Add the prefix
            </button>
          );
        } else if (it.go) {
          const go = it.go;
          action = (
            <button
              className='linkbtn'
              type='button'
              data-act={
                go.kind === 'stage' ? 'selstage' : go.kind === 'final' ? 'selfinal' : 'selcustom'
              }
              data-id={go.kind === 'final' ? '' : go.id}
              onClick={() => {
                if (go.kind === 'stage') api.selectStage(go.id);
                else if (go.kind === 'final') api.selectFinal();
                else api.selectCustom(go.id);
              }}
            >
              Go to it
            </button>
          );
        }

        return (
          <div className='issue' key={i}>
            <span className={`sev ${it.sev}`}>{it.sev === 'problem' ? 'problem' : 'note'}</span>
            <span className='imsg'>
              <Msg parts={it.msg} />
            </span>
            <span className='iact'>{action}</span>
          </div>
        );
      })}
    </div>
  );
}
