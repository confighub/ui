// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The builder shell when there is no workflow to draw: it does not exist, it is
 * not readable, or reading it failed.
 *
 * ⚠️ `missing` AND `forbidden` SAY THE SAME TWO POSSIBILITIES, AND THAT REFLECTS
 * THE DATA RATHER THAN CONCEALING IT. A workflow is read out of the list of
 * workflows the reader may see, so one that does not exist and one that is in a
 * Space they cannot read are the same absent row. There is nothing here to
 * disclose, because nothing here can tell them apart.
 *
 * So the wording is careful BECAUSE that is true, not IN ORDER TO make it true.
 * Do not read the sentences as redundant on discovering the data is already safe:
 * they are what keeps the page honest if the read ever becomes narrower -- and
 * sharpening either into a definite answer would start disclosing what the shape
 * currently makes unknowable.
 *
 * Where both could somehow be reported at once, `missing` wins: it is the one
 * that says less.
 *
 * `failed` is the only kind that offers to try again, and it is for a read that
 * could succeed on a second attempt -- a transport error, or a server that was
 * briefly unable to answer. A workflow that is not there is `missing`: retrying a
 * 404 cannot work, and offering it says the failure was ours when it was not.
 */

type NoticeKind = 'missing' | 'forbidden' | 'failed';

type ShellNoticeProps =
  | { kind: 'failed'; onRetry: () => void }
  | { kind: Exclude<NoticeKind, 'failed'>; onRetry?: never };

const COPY: Record<NoticeKind, { title: string; detail: string }> = {
  missing: {
    title: 'No such workflow',
    detail:
      'This workflow does not exist, or it is in a Space you cannot read. Check the link, or pick one from the list.',
  },
  forbidden: {
    title: 'Not yours to read',
    detail:
      'This workflow does not exist, or it is in a Space you cannot read. Someone who administers the Space can grant access.',
  },
  failed: {
    title: 'Could not read the workflow',
    detail: 'Nothing has been changed. Trying again is safe.',
  },
};

export function ShellNotice(props: ShellNoticeProps) {
  const copy = COPY[props.kind];
  const onRetry = props.kind === 'failed' ? props.onRetry : undefined;
  return (
    <div className='shell'>
      <section className='card' role='region' aria-label='Change workflow'>
        <div className='cardbody'>
          <div className='blank'>
            <div className='t'>{copy.title}</div>
            <p className='d'>{copy.detail}</p>
            {onRetry ? (
              <button className='btn' type='button' data-act='retry' onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
