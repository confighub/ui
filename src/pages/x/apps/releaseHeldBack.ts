// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * What a publish says about the Units it held back. A Unit whose head is partway through a
 * ChangeSet is released at the Revision before that ChangeSet rather than at its head, and the
 * publish response's `HeldBack` names each one, also when nothing changed and no Release was
 * created, since the Units held back are then why.
 */
import type { ReleaseHeldBackUnit } from '@confighub/rtk-query';

/**
 * The message for a publish: its outcome, followed by the Units held back. One Unit is named, as
 * `space/unit` with its ChangeSet; more are counted, with their ChangeSets, since a ChangeSet
 * usually spans many Units and the message has one line to say it in.
 */
export function releaseOutcomeText(
  outcome: string,
  spaceSlug: string | undefined,
  heldBack: readonly ReleaseHeldBackUnit[] | undefined,
): string {
  const units = (heldBack ?? []).filter((unit) => unit.UnitSlug);
  if (units.length === 0) return outcome;
  const changeSets = [
    ...new Set(
      units.map((unit) => unit.ChangeSetSlug).filter((slug): slug is string => !!slug),
    ),
  ];
  const inChangeSets =
    changeSets.length === 0
      ? ''
      : ` (${changeSets.length === 1 ? 'ChangeSet' : 'ChangeSets'} ${changeSets.join(', ')})`;
  if (units.length === 1) {
    const name = spaceSlug ? `${spaceSlug}/${units[0].UnitSlug}` : `${units[0].UnitSlug}`;
    return `${outcome}; held back ${name}${inChangeSets}`;
  }
  return `${outcome}; held back ${units.length} Units${inChangeSets}`;
}
