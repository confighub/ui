// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One value, in one deployment's column.
 *
 * ONE VOCABULARY, AT EVERY N. Agreement is muted, divergence takes `variation`
 * blue, and red is spent only on absence. There is no reference column, so no
 * cell is ever "plain" the way a baseline cell used to be — every cell is read
 * against the others. Two deployments read exactly the way five do.
 *
 * NO STROKE CARRIES STATE HERE. In the shipped configuration tree a solid
 * `borderEdge` box means "kept on merge" and a dashed one means "differs from
 * upstream". Both meanings travel with the reader, so this grid does not spend
 * that channel on anything: state is carried by colour and by the printed word,
 * and the one border drawn — the tinted hairline around a diverging or absent
 * value — is the same hue as its own wash rather than the achromatic stroke
 * those two claims use.
 */

import { type ReactElement } from 'react';

import Box from '@mui/material/Box';

import { componentTheme } from '../componentTheme';
import type { CompareCell as CompareCellModel, CompareCellKind } from './deploymentCompareModel';
import { UNANSWERABLE, unanswerableReason, type ColumnUnavailable } from './unanswerable';
import { EDIT_BLOCK_EXPLANATION, type EditBlockReason } from './compareEditing';
import { COMPARE_STAGED_TOKENS, type CompareStagedKind } from './rowTypeTokens';

export type { ColumnUnavailable };

export interface CompareCellProps {
  cell: CompareCellModel;
  unavailable: ColumnUnavailable;
  /** The deployment this column is, for the cell's own description. */
  columnLabel: string;
  /** A pending change to this cell. Its colour REPLACES the diff colour. */
  staged?: { kind: CompareStagedKind; after: string };
  /** Why this cell cannot be edited, when it cannot. */
  blockReason?: EditBlockReason | null;
  /** True when this cell can take a click to edit — drives the hover affordance only. */
  editable?: boolean;
}

const PILL_BASE_SX = {
  display: 'inline-block',
  // Border-box, or the declared minimum is a CONTENT minimum and the padding and
  // border are added to it — which painted a 20px pill at 26px and a 22px row at
  // 29px. The same mistake the key cells made, one layer down.
  boxSizing: 'border-box',
  lineHeight: '16px',
  minHeight: 20,
  textAlign: 'right',
  padding: '1px 4px',
  borderRadius: '4px',
  border: '1px solid transparent',
  fontFamily: componentTheme.fontMono,
  fontSize: 12,
  fontWeight: 500,
  color: componentTheme.fgDefault,
  background: 'transparent',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
} as const;

const ABSENT_BASE_SX = {
  display: 'inline-block',
  boxSizing: 'border-box',
  minHeight: 20,
  lineHeight: '16px',
  fontFamily: componentTheme.fontSans,
  fontStyle: 'italic',
  fontSize: 10.5,
  fontWeight: 600,
  color: componentTheme.fgSubtle,
  padding: '1px 4px',
  border: '1px dashed transparent',
  borderRadius: '4px',
  whiteSpace: 'nowrap',
  verticalAlign: 'middle',
} as const;

const KIND_SX: Partial<Record<CompareCellKind, Record<string, unknown>>> = {
  same: { color: componentTheme.fgMuted },
  differs: {
    color: componentTheme.variationEmphasis,
    background: componentTheme.variationMuted,
    borderColor: componentTheme.variationEdge,
  },
  absent: {
    color: componentTheme.danger,
    background: componentTheme.dangerTint,
    borderColor: componentTheme.dangerEdge,
  },
};

const KIND_WORD: Record<CompareCellKind, string> = {
  same: 'agrees with every other deployment',
  differs: 'differs between deployments',
  absent: 'not set here, where another deployment sets it',
  unknown: 'this deployment cannot answer yet',
  'no-document': 'this deployment holds no resource of this kind',
};

/**
 * The empty string's own description.
 *
 * The two quote marks are the whole difference between "somebody set this to
 * nothing" and "nobody set this", and at 12px mono they are four pixels wide.
 * So they are not left to carry it alone: the cell is kept at full contrast
 * even when it agrees with the others, it takes a dotted underline that marks
 * it as explainable, and the explanation is on the cell itself.
 */
const EMPTY_STRING_TITLE = 'empty string — this deployment sets the field, to no characters at all';

const EMPTY_STRING_SX = {
  color: componentTheme.fgDefault,
  fontWeight: 700,
  textDecoration: 'underline dotted',
  textUnderlineOffset: '2px',
  textDecorationColor: componentTheme.fgSubtle,
} as const;

/**
 * The shipped tree's own edit affordance: a dotted underline on hover, nothing
 * at rest. Repeated rather than imported because the shipped one is welded into
 * a 4,000-line row renderer, and this is the whole of it.
 */
const EDITABLE_SX = {
  cursor: 'text',
  '&:hover': {
    textDecoration: 'underline dotted',
    textUnderlineOffset: '2px',
    textDecorationColor: componentTheme.accent,
  },
} as const;

/**
 * A blocked cell is silent until hovered.
 *
 * Most cells are not blocked, so a mark at rest would be noise on almost every
 * row. The refusal shows up where the user asks for it — by pointing at the
 * cell — and says why in one line.
 */
const BLOCKED_SX = { cursor: 'default' } as const;

/**
 * Kept on merge — the shipped tree's solid `borderEdge` box, same meaning.
 *
 * Achromatic on purpose: it says "a merge must not overwrite this", not
 * "warning", and it must not be mistaken for the compare vocabulary's colours.
 * It is the ONE stroke this grid spends, and it is spent on the claim the
 * shipped tree already spends it on.
 */
const KEPT_ON_MERGE_SX = {
  borderStyle: 'solid',
  borderColor: componentTheme.borderEdge,
} as const;

export function CompareCell({
  cell,
  unavailable,
  columnLabel,
  staged,
  blockReason,
  editable,
}: CompareCellProps): ReactElement {
  if (cell.kind === 'unknown' || cell.kind === 'no-document') {
    // The model stated the reason; the column prop is only a fallback for a
    // hand-built cell, which real data never produces.
    const reason = cell.reason ?? unanswerableReason(cell.kind, unavailable);
    const spoken = UNANSWERABLE[reason];
    const explanation = spoken.why(columnLabel);
    return (
      <Box
        component="span"
        data-fidelity={spoken.transient ? 'value-loading' : 'value-unanswerable'}
        data-cell-kind={cell.kind}
        data-reason={reason}
        title={explanation}
        aria-label={explanation}
        sx={{ ...ABSENT_BASE_SX, borderColor: componentTheme.borderMuted }}
      >
        {spoken.word}
      </Box>
    );
  }

  // BEFORE the not-set branch, deliberately. It used to come after, so setting a
  // field nothing had set staged silently: the footer counted it, the cell still
  // read "not set", and Apply would have written a change the user could not see.
  // A staged cell must look staged whatever it held before.
  if (staged) {
    const tokens = COMPARE_STAGED_TOKENS[staged.kind];
    const word = staged.kind === 'add' ? 'staged as an addition' : `staged, was ${cell.literal ?? 'not set'}`;
    return (
      <Box
        component="span"
        data-fidelity="value-staged"
        data-cell-kind={cell.kind}
        data-staged={staged.kind}
        data-change-type={staged.kind}
        data-protected={cell.isProtected ? 'true' : 'false'}
        title={`${columnLabel}: ${word}. Nothing is written until you apply.`}
        aria-label={`${columnLabel}: ${word}`}
        sx={{
          ...PILL_BASE_SX,
          // The staged fill REPLACES the diff colour: while a change is pending,
          // what the cell says about the other columns is out of date by definition.
          color: componentTheme.fgDefault,
          background: tokens.tint,
          borderColor: tokens.fill,
          // Kept-on-merge survives, and it needs its own channel to do it.
          // Thickening the staged border was not enough: the amber simply
          // overdrew the achromatic box, so at the exact moment the user is
          // changing a kept value the signal saying it is kept disappeared. An
          // INSET ring keeps both — the staged colour on the outside, the
          // protection stroke just inside it — which is what `components.md`
          // means by two signals on purpose.
          ...(cell.isProtected
            ? { boxShadow: `inset 0 0 0 1px ${componentTheme.borderEdge}`, padding: '0 3px' }
            : {}),
        }}
      >
        {staged.after === '' ? '""' : staged.after}
      </Box>
    );
  }

  if (cell.literal === undefined) {
    return (
      <Box
        component="span"
        data-fidelity="value-absent"
        data-cell-kind={cell.kind}
        title={`${columnLabel}: ${KIND_WORD[cell.kind]}`}
        sx={{ ...ABSENT_BASE_SX, ...(KIND_SX[cell.kind] ?? {}) }}
      >
        not set
      </Box>
    );
  }

  const elided = cell.display !== cell.literal;
  const base = cell.isEmptyString
    ? `${columnLabel}: ${EMPTY_STRING_TITLE}`
    : elided
      ? `${columnLabel}: ${cell.literal} — ${KIND_WORD[cell.kind]}`
      : `${columnLabel}: ${KIND_WORD[cell.kind]}`;
  // The refusal leads, because it is the answer to the question a pointing user
  // is actually asking.
  const description = blockReason ? `${EDIT_BLOCK_EXPLANATION[blockReason]} ${base}` : base;

  return (
    <Box
      component="span"
      data-fidelity={cell.isEmptyString ? 'value-empty-string' : 'value'}
      data-cell-kind={cell.kind}
      data-elided={elided ? 'true' : undefined}
      data-edit-blocked={blockReason ?? undefined}
      data-protected={cell.isProtected ? 'true' : 'false'}
      data-editable={editable && !blockReason ? 'true' : undefined}
      title={description}
      aria-label={description}
      sx={{
        ...PILL_BASE_SX,
        ...(KIND_SX[cell.kind] ?? {}),
        ...(cell.isEmptyString ? EMPTY_STRING_SX : {}),
        ...(cell.isProtected ? KEPT_ON_MERGE_SX : {}),
        ...(blockReason ? BLOCKED_SX : editable ? EDITABLE_SX : {}),
      }}
    >
      {cell.display ?? cell.literal}
    </Box>
  );
}
