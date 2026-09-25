// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The words the builder writes, and the ones it only says.
 *
 * The three built-in gates are given as the server stores them. TitleCase is
 * not a style choice: these exact strings are what a `Prerequisites` array holds
 * (`internal/models/changeworkflow.go`), so anything the builder writes has to
 * match them character for character.
 *
 * `promoted` is held OUTSIDE that list on purpose. Having taken the change is
 * checked whatever a Stage declares, so it is not one of the names -- keeping it
 * out of `BUILTIN_NAMES` is what stops it from ever reaching a stored
 * `Prerequisites` array.
 */

export interface Builtin {
  name: string;
  /** `%s` is the Stage the check is evaluated over: the one ahead of the one being entered. */
  desc: string;
}

export const BUILTINS: readonly Builtin[] = [
  {
    name: 'Validated',
    desc: 'No Unit in %s has validation errors on the revision the change order’s end tag marks.',
  },
  { name: 'Released', desc: 'Every variant in %s has published a Release carrying the change.' },
  { name: 'Healthy', desc: 'Every variant in %s reports synced, succeeded and healthy.' },
] as const;

export const BUILTIN_NAMES: readonly string[] = BUILTINS.map((b) => b.name);

/**
 * The terminal node's human label. The stored field is `Final`
 * (`ChangeWorkflowFinalStage`) and the spec key and the CLI both say `final`, so
 * `final` is what gets quoted wherever the stored definition is shown, and
 * `COMPLETE_LABEL` is what a reader is told it is called. Two names for one thing
 * is a cost; teaching a word `cub` will not accept is a bigger one.
 */
export const COMPLETE_LABEL = 'Complete';
export const COMPLETE_KEY = 'final';

export const IMPLICIT_GATE = 'promoted';

/**
 * Every description names the Stage it is checked over. The first Stage has
 * none, so the clause that would have named one comes out rather than being
 * filled with nothing -- the same thing the `promoted` row does, which is why no
 * new wording is needed here.
 */
export function builtinDesc(name: string, over: string | null): string {
  const b = BUILTINS.find((x) => x.name === name);
  if (!b) return '';
  return over ? b.desc.replace('%s', over) : b.desc.replace(' in %s', '');
}
