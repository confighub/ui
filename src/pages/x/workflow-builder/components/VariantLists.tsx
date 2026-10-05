// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The two named groups a Stage's selector splits the previewed Component's
 * variants into: which it runs against, and which it does not. Always open --
 * no Show/Hide -- because this is the answer the blocks above it exist to
 * produce.
 *
 * ⚠️ NO PER-ROW REASON. Saying why a particular variant is left out would need
 * a client-side `where` matcher, which this codebase does not build. A row
 * names the variant; it does not explain the filter.
 *
 * `StageRail` keeps its own mini `where`/count readout, which this duplicates.
 * That duplication is accepted, not fixed here.
 */

import { stageCoverage } from '../model';
import { hasVariantLabel, variantName } from '../fixtures';
import type { SpaceRow } from '../api/resolution/stageResolution';
import type { Preview } from '../preview';

function VariantRow({ sp }: { sp: SpaceRow }) {
  const lbl = Object.keys(sp.labels)
    .filter((k) => k !== 'Variant' && k !== 'Component')
    .map((k) => `${k}=${sp.labels[k]}`)
    .join('  ');
  return (
    <div className='mrow'>
      <span className='msl' title={hasVariantLabel(sp) ? undefined : 'No Variant label, so its Space slug.'}>
        {variantName(sp)}
      </span>
      <span className='mlb' title={lbl || undefined}>
        {lbl}
      </span>
    </div>
  );
}

function VariantGroup({
  heading,
  rows,
  total,
  out,
  empty,
}: {
  heading: string;
  rows: SpaceRow[];
  total: number;
  out?: boolean;
  empty: string;
}) {
  return (
    <div className={out ? 'vgroup out' : 'vgroup'}>
      <div className='vhead'>
        <span>{heading}</span>
        <span>{`${rows.length} of ${total}`}</span>
      </div>
      {rows.length === 0 ? (
        <p className='vempty'>{empty}</p>
      ) : (
        <div className='rows'>
          {rows.map((sp) => (
            <VariantRow sp={sp} key={sp.spaceId} />
          ))}
        </div>
      )}
    </div>
  );
}

export function VariantLists({ stageId, preview }: { stageId: string; preview: Preview }) {
  if (!preview.component) return null;
  const cov = stageCoverage(preview.resolutions.get(stageId), preview.inventory);

  if (cov.kind === 'unresolved') {
    return (
      <p className='fhelp'>
        {'What this Stage runs against is not known yet. The server has not answered.'}
      </p>
    );
  }

  if (cov.kind === 'invalid') {
    return (
      <p className='ferr'>
        <span className='bang'>!</span>
        <span>
          {'Cannot be previewed. '}
          {cov.message}
          {' The server will refuse this expression rather than return a set of variants.'}
        </span>
      </p>
    );
  }

  const total = preview.inventory.length;

  return (
    <div className='vgroups'>
      <VariantGroup
        heading='Will run against'
        rows={cov.runs}
        total={total}
        empty={`No variant of ${preview.component} matches these filters.`}
      />
      <VariantGroup
        heading='Will not run against'
        rows={cov.skips}
        total={total}
        out
        empty={`Nothing left out. This Stage runs against every variant of ${preview.component}.`}
      />
    </div>
  );
}
