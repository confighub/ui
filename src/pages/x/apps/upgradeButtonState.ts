// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** What the side pane's footer knows when it draws the Upgrade button. */
export interface UpgradeButtonInputs {
  /** Value changes staged across the node's Units. */
  totalStaged: number;
  /** Protection changes staged across the node's Units. */
  totalStagedProtection: number;
  /** Changes the node's upgrade previews offer to stage. */
  totalUpgradableFields: number;
  /** A Unit of the node is behind its upstream. */
  hasUpgradableUnits: boolean;
  /** An upgradable Unit's upgrade preview has not landed yet. */
  isPreviewPending: boolean;
  /** A commit is in flight. */
  isUpgrading: boolean;
  /** The pane shows a ChangeSet, which is read-only. */
  isChangeSetView: boolean;
}

export interface UpgradeButtonState {
  disabled: boolean;
  /**
   * Why the button is enabled with nothing staged, or disabled with something to
   * offer; undefined when the staged count says it all.
   */
  reason?: 'revision-gap' | 'preview-pending';
}

/**
 * Whether the Upgrade button commits anything, and why.
 *
 * With nothing staged, the button still advances a Unit behind its upstream whose
 * preview offers nothing to stage (the revision gap). Before the preview lands it
 * offers nothing either, but only because it is not known yet, and a Unit with no
 * entry gets no upgrade: a click then would do nothing. So it waits for the preview.
 */
export function upgradeButtonState({
  totalStaged,
  totalStagedProtection,
  totalUpgradableFields,
  hasUpgradableUnits,
  isPreviewPending,
  isUpgrading,
  isChangeSetView,
}: UpgradeButtonInputs): UpgradeButtonState {
  if (isUpgrading || isChangeSetView) return { disabled: true };
  if (totalStaged > 0 || totalStagedProtection > 0) return { disabled: false };
  if (!hasUpgradableUnits || totalUpgradableFields > 0) return { disabled: true };
  if (isPreviewPending) return { disabled: true, reason: 'preview-pending' };
  return { disabled: false, reason: 'revision-gap' };
}
