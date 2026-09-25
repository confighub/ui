// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a save that did not save has to say.
 *
 * Three outcomes reach here and they are three different situations, so they are
 * never collapsed: the content is wrong and needs an edit; the stored copy moved
 * and someone has to decide whose version survives; or nothing is known and the
 * thing to do is try again. Telling someone to fix a workflow that was never
 * wrong is worse than the state it would be hiding.
 *
 * ⚠️ WHOSE WORDS EACH ONE CARRIES DIFFERS, AND THAT IS NOT AN INCONSISTENCY.
 * A refusal arrives already attributed and specific -- `stage 'prod' has an
 * invalid WhereSpace: unrecognized attribute name ...` -- and is better than
 * anything written here, so it is rendered verbatim and unframed. A conflict
 * arrives as `entity data changed since last read`, which names no actor, no
 * time and no action, so it is written here instead. Carry the server's words
 * where the server has something to say.
 *
 * The slot is reserved rather than inserted: it sits in the tree collapsed, so an
 * outcome expands one element instead of pushing the page down. It is at the foot
 * of the summary card because a slot between two cards would break the rule that
 * spaces them.
 */

import { useState } from 'react';

import { WarnIcon } from '../icons';

export type SaveNoticeKind = 'rejected' | 'conflict' | 'failed';

interface SaveNoticeProps {
  kind: SaveNoticeKind | null;
  /** The server's own words. Shown only for a refusal, where they are worth more than ours. */
  message: string;
  /** Read the stored copy, discarding this draft. */
  onReload: () => void;
  /** Write this draft over the stored copy. */
  onOverwrite: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function SaveNotice({
  kind,
  message,
  onReload,
  onOverwrite,
  onRetry,
  onDismiss,
}: SaveNoticeProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`cfslot${kind ? ' on' : ''}`} aria-hidden={kind ? undefined : true}>
      <div className={`conflict${kind === 'rejected' ? ' bad' : ''}`} role='status'>
        <span className='cw' aria-hidden='true'>
          <WarnIcon />
        </span>

        <div className='ct'>
          {kind === 'conflict' ? (
            <>
              <p>
                {'Someone else saved this workflow after you opened it. Nothing you have typed here is lost.'}
              </p>
              <p>
                {confirming
                  ? 'Reloading replaces what you have typed with their version. There is no undo.'
                  : 'Reload to read their version, which discards your changes, or save again to write over theirs.'}
              </p>
            </>
          ) : kind === 'rejected' ? (
            <>
              <p>{'This workflow was not saved. Nothing you have typed here is lost.'}</p>
              <p>{message}</p>
            </>
          ) : (
            <>
              <p>{'The workflow could not be saved. Nothing you have typed here is lost.'}</p>
              <p>{'Nothing was written, so trying again is safe.'}</p>
            </>
          )}
        </div>

        <div className='ca'>
          {kind === 'conflict' ? (
            confirming ? (
              <>
                <button
                  className='btn sm danger'
                  type='button'
                  data-act='conflictreload'
                  onClick={onReload}
                >
                  Discard mine and reload
                </button>
                <button className='btn sm' type='button' onClick={() => setConfirming(false)}>
                  Keep editing
                </button>
              </>
            ) : (
              <>
                <button className='btn sm' type='button' onClick={() => setConfirming(true)}>
                  Reload theirs
                </button>
                <button
                  className='btn sm'
                  type='button'
                  data-act='conflictoverwrite'
                  onClick={onOverwrite}
                >
                  Save again
                </button>
              </>
            )
          ) : kind === 'failed' ? (
            <button className='btn sm' type='button' data-act='retrysave' onClick={onRetry}>
              Try again
            </button>
          ) : null}
          <button
            className='iconbtn'
            type='button'
            aria-label='Dismiss'
            data-act='dismisssave'
            onClick={onDismiss}
          >
            &#215;
          </button>
        </div>
      </div>
    </div>
  );
}
