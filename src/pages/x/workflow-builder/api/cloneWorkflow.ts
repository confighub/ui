// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Shaping a copied workflow, before it is written.
 *
 * A workflow's slug is unique within a Space, not across the organisation
 * (`20260914120003_create_change_workflows.tx.up.sql:38`) -- so cloning into the
 * SAME Space the source lives in, which the destination picker allows, needs a
 * slug that is not the source's own.
 *
 * The suffix and the DisplayName rule below both mirror
 * `ChangeWorkflowBulkCreateFunc`'s own `applyNamePrefix`
 * (`internal/views/changeworkflow.go:404-417`), which is the server's own answer
 * to this exact question for its own clone path. Carrying its reasoning rather
 * than inventing a second one: `-copy` where the server uses a caller-supplied
 * prefix, and DisplayName renamed only when it still equals the original slug --
 * which is the server's own signal that nobody had customised it.
 *
 * A slug collision is not defended against further than this. If `-copy`
 * collides too -- a second clone of the same workflow into the same Space -- the
 * server refuses and says so in its own words, through the same path every other
 * write refusal takes. No local uniqueness check duplicates the server's; that is
 * the class of thing this feature spent a long night removing.
 */

import type { MappedWorkflow } from './mapping';

const CLONE_SUFFIX = '-copy';

export function buildClonedWorkflow(source: MappedWorkflow): MappedWorkflow {
  const slug = source.slug + CLONE_SUFFIX;
  return {
    ...source,
    slug,
    displayName: source.displayName === source.slug ? slug : source.displayName,
  };
}
