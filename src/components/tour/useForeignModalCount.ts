// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { TOUR_MODAL_CLASS } from './constants';

/** Modal roots that belong to the app, i.e. everything except the tour's own. */
const FOREIGN_MODAL_SELECTOR = `body > .MuiModal-root:not(.${TOUR_MODAL_CLASS})`;

const countForeignModals = (): number =>
  document.querySelectorAll(FOREIGN_MODAL_SELECTOR).length;

/**
 * How many app modals are currently mounted on `document.body`.
 *
 * `ModalManager` stacks strictly by registration order, and the tour registers
 * long before the user opens a Dialog. The tour therefore ends up *underneath*
 * every Dialog opened after it: aria-hidden, and with the Dialog's focus trap
 * enabled against it. Callers use this count as a remount key so the tour
 * re-registers — and returns to the top of the stack — whenever an app modal
 * opens or closes.
 *
 * The tour's own modal is excluded from the count on purpose: including it
 * would make the remount change the count that triggered it, and the component
 * would remount forever.
 */
export const useForeignModalCount = (): number => {
  const [count, setCount] = useState(countForeignModals);

  useEffect(() => {
    const sync = () =>
      setCount((previous) => {
        const next = countForeignModals();
        return previous === next ? previous : next;
      });

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true });
    return () => observer.disconnect();
  }, []);

  return count;
};
