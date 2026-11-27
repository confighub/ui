// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The fold rule of a long list: over 12 items, the first 10 show in order and a "+N"
// button, with the state marks of the hidden fields, opens the rest in place. The hidden
// items stay mounted (hidden by CSS), so every field is drawn once and in document order.
import { Fragment, type ReactNode, memo, useState } from 'react';

import { StateMarks } from './StateMark';
import { rollUp, useSheetOverlay } from './sheetOverlay';
import type { SheetAtom } from './specSheetModel';

/** A list folds when it has more items than this. */
export const FOLD_OVER = 12;
/** How many items a folded list shows. */
export const FOLD_SHOWN = 10;

export interface FoldItem {
  key: string;
  atoms: SheetAtom[];
  node: ReactNode;
}

/** Draws the items, folded when there are more than FOLD_OVER. */
export function Folded({ items }: { items: FoldItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length <= FOLD_OVER) {
    return (
      <>
        {items.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </>
    );
  }
  const shown = items.slice(0, FOLD_SHOWN);
  const rest = items.slice(FOLD_SHOWN);
  return (
    <>
      {shown.map((item) => (
        <Fragment key={item.key}>{item.node}</Fragment>
      ))}
      <span className='rest' data-open={open ? 'true' : undefined}>
        {rest.map((item) => (
          <Fragment key={item.key}>{item.node}</Fragment>
        ))}
      </span>
      {!open && (
        <span className='morewrap'>
          <FoldMore
            count={rest.length}
            hiddenAtoms={rest.flatMap((i) => i.atoms)}
            onOpen={() => setOpen(true)}
          />
        </span>
      )}
    </>
  );
}

/** The "+N" button of a folded list, with the marks of the fields it hides. */
export const FoldMore = memo(function FoldMore({
  count,
  hiddenAtoms,
  onOpen,
}: {
  count: number;
  hiddenAtoms: SheetAtom[];
  onOpen: () => void;
}) {
  const marks = rollUp(useSheetOverlay(), hiddenAtoms);
  return (
    <button
      type='button'
      className='more'
      data-testid='fold-more'
      aria-expanded={false}
      aria-label={`Show ${count} more`}
      onClick={onOpen}
    >
      +{count}
      <StateMarks {...marks} />
    </button>
  );
});
