// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// What the sheet draws over the values: origin (bold = set in this Unit) and the Stale and
// Unreleased marks. One context per sheet; a value reads its own key from it.
import { createContext, useContext } from 'react';

import type { QuietDefaults } from './kubeDefaults';
import type { AtomOrigin } from './sheetOrigin';
import type { SheetAtom, SheetPart } from './specSheetModel';

/** The Incoming scope: which fields are ticked, and how a tick toggles. */
export interface SheetIncoming {
  keys: ReadonlySet<string>;
  staged: ReadonlySet<string>;
  blocked: ReadonlySet<string>;
  guarded: ReadonlySet<string>;
  /** Whole-resource changes: stage key → whether the person can take it now. */
  whole: ReadonlyMap<string, boolean>;
  /** The guards that keep a guarded key, worded for its hover. */
  guardTitles: ReadonlyMap<string, string>;
  /** The upstream value of each incoming key. */
  upstream: ReadonlyMap<string, string>;
  /**
   * The keys that are part of another key's change, such as the name of an env var added or
   * deleted whole: they show as plain text, and the tick of the change is on its value.
   */
  secondary: ReadonlySet<string>;
  /** Ticks or unticks a change: every key of it, so a list element is staged whole. */
  onToggle: (key: string) => void;
  /** A ChangeSet view: the changes show with their upstream line and no tick. */
  readOnly?: boolean;
}

/** Editing: which value has its editor open, and what is staged. */
export interface SheetEdit {
  editingKey: string | null;
  open: (key: string) => void;
  close: () => void;
  stage: (key: string, value: string, add?: boolean) => void;
  /** Take a staged edit back (the value typed is the value the Unit holds). */
  unstage: (key: string) => void;
  /** Stage a Keep on merge change for one field (committed: what the Unit holds now). */
  setKeep: (key: string, keep: boolean, committed: boolean) => void;
  /** The block whose Add a key editor is open. */
  addingBlockId: string | null;
  openAdd: (blockId: string) => void;
  /** Staged edits: stage key → value, or the removal sentinel. */
  edits: ReadonlyMap<string, string>;
  /** The staged edits that add a key the Unit does not hold. */
  adds: ReadonlySet<string>;
  /** Staged Keep on merge changes: stage key → keep. */
  protection: ReadonlyMap<string, boolean>;
  /** Whether a bare path is kept on merge now (committed). */
  isKept: (path: string) => boolean;
}

/** What upstream has for a Stale field, for its hover card outside the Incoming scope. */
export interface UpstreamSide {
  kind: 'incoming' | 'removed' | 'held';
  /** The field's value now. */
  current: string;
  /** What the upgrade makes it: the upstream value, or "deleted upstream". */
  value: string;
  testKey: string;
}

export interface SheetOverlay {
  edit?: SheetEdit;
  /** Set in the Incoming scope only. */
  incoming?: SheetIncoming;
  /** Stage key → origin; undefined while Blame reads. */
  origins?: ReadonlyMap<string, AtomOrigin>;
  /** Fields with an upstream change waiting (the Incoming set, `fieldStates`). */
  stale: ReadonlySet<string>;
  /** Fields changed since the last Release, shown only where the Unit header shows Unreleased. */
  unreleased: ReadonlySet<string>;
  /** The Kubernetes defaults that are quiet now: not drawn on their line. */
  defaults?: QuietDefaults;
  /** Outside Incoming, what upstream has for each Stale field (Incoming draws its own). */
  upstream?: ReadonlyMap<string, UpstreamSide>;
}

const EMPTY: SheetOverlay = { stale: new Set(), unreleased: new Set() };

export const SheetOverlayContext = createContext<SheetOverlay>(EMPTY);

export function useSheetOverlay(): SheetOverlay {
  return useContext(SheetOverlayContext);
}

/** The origin class of a value: bold only when set here; dotted when not known (yet). */
export function originClass(overlay: SheetOverlay, key: string): string {
  if (!overlay.origins) return ' unk';
  const origin = overlay.origins.get(key);
  if (!origin) return ' unk';
  if (origin.kind === 'here') return ' here';
  if (origin.kind === 'unreadable' || origin.kind === 'unknown' || origin.kind === 'pending')
    return ' unk';
  return '';
}

/** Whether any of the atoms is Stale, and whether any is Unreleased. */
export function rollUp(
  overlay: SheetOverlay,
  atoms: Iterable<SheetAtom>,
): { stale: boolean; unreleased: boolean } {
  let stale = false;
  let unreleased = false;
  for (const a of atoms) {
    stale ||= overlay.stale.has(a.key);
    unreleased ||= overlay.unreleased.has(a.key);
    if (stale && unreleased) break;
  }
  return { stale, unreleased };
}

/** Nothing in the part is set here or changed: the fold of D10. Unknown until origin reads. */
export function isQuiet(overlay: SheetOverlay, part: SheetPart): boolean {
  if (!overlay.origins) return false;
  const atoms = part.titleAtom ? [part.titleAtom, ...part.blocks.flatMap((b) => b.atoms)] : part.blocks.flatMap((b) => b.atoms);
  for (const a of atoms) {
    if (overlay.origins.get(a.key)?.kind === 'here' || overlay.stale.has(a.key) || overlay.unreleased.has(a.key)) return false;
  }
  return true;
}
