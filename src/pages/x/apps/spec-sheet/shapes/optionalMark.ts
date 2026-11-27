// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// When the `optional` of a Secret or ConfigMap key reference has a mark of its own on the line.
import type { SheetOverlay } from '../sheetOverlay';
import type { SheetAtom } from '../specSheetModel';

type AtomRef = Pick<SheetAtom, 'key' | 'path'>;

/**
 * Whether `optional` shows on the line. It rarely matters, so the reference's hover card says
 * it. It shows when something happened to it: its editor is open, it is staged or kept on
 * merge, it is Stale, Unreleased or incoming, or this Unit set it where the rest of the
 * reference comes from upstream (a Variant that made one key optional).
 */
export function optionalOnLine(
  overlay: SheetOverlay,
  opt: AtomRef,
  reference: readonly AtomRef[],
): boolean {
  if (fieldHasState(overlay, opt)) return true;
  const k = opt.key;
  const here = (a: AtomRef) => overlay.origins?.get(a.key)?.kind === 'here';
  return here(opt) && reference.some((a) => a.key !== k && !here(a));
}

/**
 * Whether something happened to a field that the sheet can hide while it is quiet: its editor is
 * open, it is staged or kept on merge, or it is Stale, Unreleased or incoming.
 */
export function fieldHasState(overlay: SheetOverlay, atom: AtomRef): boolean {
  const k = atom.key;
  if (overlay.stale.has(k) || overlay.unreleased.has(k)) return true;
  if (overlay.incoming?.keys.has(k)) return true;
  const edit = overlay.incoming ? undefined : overlay.edit;
  return (
    !!edit &&
    (edit.editingKey === k ||
      edit.edits.has(k) ||
      edit.protection.has(k) ||
      edit.isKept(atom.path))
  );
}
