// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A Stage's `WhereSpace`, edited as filter blocks -- the same chip row the
 * Space list page uses -- with an explicit door to raw text for the few
 * expressions blocks cannot hold.
 *
 * ⚠️ THERE IS NO CLIENT-SIDE `where` GRAMMAR HERE. The blocks are read and
 * written entirely through the query-builder's own parser and builder, the
 * same ones the Space list page already trusts; this component adds no
 * matcher, evaluator, or validator of its own. Round-tripping the current
 * text through that parser and builder is how the text door knows whether
 * returning to blocks would change the expression -- it is a fidelity check
 * on the existing grammar, not a second one.
 *
 * Two presentations, one write path. Blocks and text are never on screen
 * together, and both call `onChange` -- which is `setStageWhere`, unchanged --
 * with nothing else holding a second copy of the string.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Tooltip from '@mui/material/Tooltip';

import {
  QueryBuilder,
  buildWhereClauses,
  extractLabelOptions,
  getAvailableFieldsForEntity,
  parseWhereClausesToFilters,
} from '@/components/query-builder';
import type { FilterCondition } from '@/components/query-builder';

import type { SpaceRow } from '../api/resolution/stageResolution';

const SPACE_FIELDS = getAvailableFieldsForEntity('Space');

/** Said once, on the field's own label, rather than repeated in a paragraph under it. */
const FIELD_HELP = 'Selects Spaces by label. The Component is added for you — do not filter on it.';

/** Parsed fresh each call: the seed for the blocks, and the input to the round-trip check. */
function parse(where: string): FilterCondition[] {
  return parseWhereClausesToFilters(where, '', '', [], undefined, SPACE_FIELDS);
}

/**
 * Whether switching from text back to blocks would read back the same
 * `where` this component was given. A fragment the parser cannot place in a
 * field becomes one raw chip holding it verbatim, so most text survives this
 * unchanged; what does not survive is text the parser only partially
 * recognises -- a leading fragment it matches followed by something it
 * silently stops reading, such as anything after an `OR` the grammar has no
 * block for. Comparing the rebuilt string catches that without a second
 * grammar: it reuses the same parser and builder the blocks already trust.
 */
function roundTrips(where: string): boolean {
  return buildWhereClauses(parse(where)).where === where.trim();
}

const CANNOT_REPRESENT_REASON =
  'This expression does not read back the same once it is split into filter blocks and rejoined, so switching would change it. Filter blocks are terms joined only by AND; this most often means the terms are combined some other way.';

function StageWhereBlocks({
  where,
  onChange,
  inventory,
  onEditAsText,
}: {
  where: string;
  onChange: (next: string) => void;
  inventory: readonly SpaceRow[];
  onEditAsText: () => void;
}) {
  const [filters, setFilters] = useState<FilterCondition[]>(() => parse(where));
  const lastEmitted = useRef(where);

  /* Adjusts state to a changed prop rather than re-parsing on every render --
     re-parsing on every keystroke would re-split a raw chip mid-edit and steal
     focus from whatever the user is typing into. This only fires when `where`
     has moved out from under the blocks: an external change (a re-select of
     the Stage, `key={st.id}` notwithstanding, or `where` set some other way)
     or the round trip this same component just emitted. */
  if (where !== lastEmitted.current) {
    lastEmitted.current = where;
    setFilters(parse(where));
  }

  const onFiltersChange = useCallback(
    (next: FilterCondition[]) => {
      setFilters(next);
      const built = buildWhereClauses(next).where;
      lastEmitted.current = built;
      onChange(built);
    },
    [onChange],
  );

  const labelOptions = useMemo(
    () => extractLabelOptions(inventory.map((sp) => ({ Labels: sp.labels }))),
    [inventory],
  );
  const slugs = useMemo(
    () => inventory.map((sp) => ({ slug: sp.slug, spaceName: '' })),
    [inventory],
  );

  return (
    <div className='qbrow'>
      <div className='qbhost'>
        <QueryBuilder
          filters={filters}
          onFiltersChange={onFiltersChange}
          entityType='Space'
          labelOptions={labelOptions}
          slugs={slugs}
        />
      </div>
      <button className='linkbtn qbedit' type='button' data-act='stcovtotext' onClick={onEditAsText}>
        Edit as text
      </button>
    </div>
  );
}

function StageWhereText({
  where,
  onChange,
  onBack,
}: {
  where: string;
  onChange: (next: string) => void;
  onBack: () => void;
}) {
  const canReturn = roundTrips(where);

  return (
    <>
      <div className='rawhead'>
        <span className='flabel'>Text mode</span>
        <button
          className='linkbtn'
          type='button'
          data-act='stcovtoblocks'
          disabled={!canReturn}
          title={canReturn ? undefined : CANNOT_REPRESENT_REASON}
          onClick={() => canReturn && onBack()}
        >
          {canReturn ? 'Back to filters' : 'Replace with filters'}
        </button>
      </div>
      <textarea
        className='ta mono'
        rows={2}
        data-act='stcovtext'
        value={where}
        onChange={(e) => onChange(e.target.value)}
      />
      {!canReturn && (
        <span className='ferr'>
          <span className='bang'>!</span>
          <span>{CANNOT_REPRESENT_REASON}</span>
        </span>
      )}
      <span className='fhelp'>
        {'A '}
        <span className='mono'>where</span>
        {' expression over Spaces, edited as text. The server is the only judge of whether it is valid; nothing here checks its grammar.'}
      </span>
    </>
  );
}

export function StageWhereEditor({
  where,
  onChange,
  inventory,
}: {
  where: string;
  onChange: (next: string) => void;
  inventory: readonly SpaceRow[];
}) {
  const [mode, setMode] = useState<'blocks' | 'text'>('blocks');

  /* A `<label>` associates its text with exactly one form control. The blocks
     are several -- selects, inputs, buttons -- so this is a plain field group
     with a caption, not a label wrapping the controls it names. */
  return (
    <div className='field'>
      <span className='flabel'>
        {'Variants this Stage covers '}
        <Tooltip title={FIELD_HELP}>
          <InfoOutlinedIcon fontSize='inherit' className='infoicon' />
        </Tooltip>
      </span>
      {mode === 'text' ? (
        <StageWhereText where={where} onChange={onChange} onBack={() => setMode('blocks')} />
      ) : (
        <StageWhereBlocks
          where={where}
          onChange={onChange}
          inventory={inventory}
          onEditAsText={() => setMode('text')}
        />
      )}
    </div>
  );
}
