// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The server answers the stage-card specs stub, as JSON templates.
//
// A template names the ids it needs as `{{name}}` inside its strings, because the
// Spaces and the ChangeOrder are made fresh for each run. `stub()` fills them in and
// parses the result, so a spec reads `stub('dry-run-space', { spaceId, slug })` and
// gets an object, never a string it has to splice.
import { readFileSync } from 'fs';

/** Where the templates live, relative to `ui/`, which Playwright runs from. */
const DIR = 'tests/fixtures/stage-card';

/** The parsed template `name`, with each `{{key}}` replaced by `vars[key]`. */
export function stub<T = Record<string, unknown>>(name: string, vars: Record<string, string | number> = {}): T {
  const text = readFileSync(`${DIR}/${name}.json`, 'utf8').replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`stub ${name}: no value for {{${key}}}`);
    // Escaped as the inside of a JSON string, since every placeholder sits in one.
    return JSON.stringify(String(value)).slice(1, -1);
  });
  return JSON.parse(text) as T;
}
