// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useState } from 'react';

import { guardText } from '@/utility/clearance-functions';
import type { WithheldGuard } from '@confighub/rtk-query';

/**
 * Which of a set of guards the person has acknowledged, reset each time `open` turns on, and
 * whether every one is.
 */
export function useGuardAcknowledgements(guards: readonly WithheldGuard[], open: boolean) {
  const [acknowledged, setAcknowledged] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (open) setAcknowledged(new Set());
  }, [open]);
  const toggle = (text: string, checked: boolean) =>
    setAcknowledged((previous) => {
      const next = new Set(previous);
      if (checked) next.add(text);
      else next.delete(text);
      return next;
    });
  const all = guards.every((guard) => acknowledged.has(guardText(guard)));
  return { acknowledged, toggle, all };
}
