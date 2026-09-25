// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Moving a Stage silently re-points its gates and changes the meaning of the
 * Stage it passed. Both halves get said out loud, next to the rail that just
 * changed, for as long as the move is unsaved.
 */

import { Fragment } from 'react';

import { WarnIcon } from '../icons';
import type { LoadedBuilderApi } from '../useWorkflowBuilder';

export function ReorderWarning({ api }: { api: LoadedBuilderApi }) {
  if (!api.reorder) return null;

  return (
    <div className='reorder' role='status'>
      <span className='rw' aria-hidden='true'>
        <WarnIcon />
      </span>
      <div className='rt'>
        {api.reorder.parts.map((sentence, i) => (
          <p key={i}>
            {sentence.map((run, j) => {
              if (run.strong) return <strong key={j}>{run.text}</strong>;
              if (run.gate)
                return (
                  <span className='gn' key={j}>
                    {run.text}
                  </span>
                );
              return <Fragment key={j}>{run.text}</Fragment>;
            })}
          </p>
        ))}
      </div>
      <div className='ra'>
        <button className='btn sm' type='button' data-act='undomove' onClick={api.undoMove}>
          Undo
        </button>
        <button
          className='iconbtn'
          type='button'
          aria-label='Dismiss the reorder warning'
          data-act='dropmove'
          onClick={api.dropMove}
        >
          &#215;
        </button>
      </div>
    </div>
  );
}
