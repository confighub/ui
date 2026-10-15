// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// A Unit has unreleased changes when its head revision is past the one last published in a
// Release, and only a Unit with a Target can have any: one with no Target has nowhere to be
// released. A Unit whose ProviderType takes no Target cannot have one. The server's per-Space
// UnreleasedUnitCount counts the same Units.

/** The fields of a Unit that decide whether it has unreleased changes. */
export interface UnitReleaseFields {
  HeadRevisionNum?: number;
  LastReleasedRevisionNum?: number;
  TargetID?: string;
}

/** The where expression that selects the Units `hasUnreleasedChanges` reports. */
export const UNRELEASED_CHANGES_WHERE =
  "HeadRevisionNum > LastReleasedRevisionNum AND TargetID IS NOT NULL";

export function hasUnreleasedChanges(unit: UnitReleaseFields | undefined): boolean {
  if (!unit?.TargetID) return false;
  return (unit.HeadRevisionNum ?? 0) > (unit.LastReleasedRevisionNum ?? 0);
}
