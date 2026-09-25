// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Everything the builder needs to know about Spaces: what may be previewed against, what
 * the chosen component covers, and what each Stage reaches within it.
 *
 * ONE ORG-WIDE READ SERVES TWO ANSWERS, and that is the whole reason this is one hook
 * rather than two. There is no aggregate for distinct label values -- as there is no
 * aggregate for anything else on this API -- so the set of components has to be collected
 * from Spaces. Having read them, the chosen component's Spaces are a local equality
 * filter on rows already held rather than a second request.
 *
 * To be exact about what that is NOT: filtering `Labels.Component === chosen` here is not
 * a second `where` grammar. It is equality on one field of rows in hand, and the field is
 * a label the server writes. Every Stage SELECTOR still resolves server-side, with the
 * component conjoined -- that is `useStageResolutions`, and nothing about it changed.
 *
 * THE COMPONENT IS PREVIEW STATE. It is never stored on the workflow and never sent: a
 * ChangeWorkflow has no component of its own, and the one a promotion uses comes from the
 * ChangeOrder's Space at the time. So this answers "show me what this definition would do
 * for payments", which is a question about a hypothetical rollout rather than a fact about
 * the definition -- and the difference is what makes a Stage matching nothing a warning
 * here rather than a defect.
 */

import { useMemo } from 'react';

import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { useListSpacesQuery } from '@confighub/rtk-query';
import { SerializedError } from '@reduxjs/toolkit';
import { FetchBaseQueryError } from '@reduxjs/toolkit/query';

import { MALFORMED_RESPONSE } from './mapping';
import { useStageResolutions } from './resolution/useStageResolutions';
import type { SpaceRow, StageResolution, StageSelector } from './resolution/stageResolution';

/** Only what the picker and the denominator read. `summary` is absent deliberately: it costs ~18 COUNT queries per Space. */
const SPACE_SELECT = 'SpaceID,Slug,Labels,ComponentID';

/** Stable empty references, so a consumer's `useMemo` does not churn on every render. */
const NO_COMPONENTS: string[] = [];
const NO_SPACES: SpaceRow[] = [];
const NO_STAGES: StageSelector[] = [];

export interface WorkflowSpaces {
  /**
   * The components that can be previewed against, sorted.
   *
   * LEGITIMATELY EMPTY, and that is not an error: an organisation whose Spaces carry no
   * `Component` label has nothing to pick. Distinguished from a failed read by `error`,
   * so a caller can say "there are none" rather than "we could not tell".
   */
  components: string[];
  /**
   * The chosen component's Spaces -- the denominator for coverage, and every variant a
   * Stage could possibly reach. Empty until a component is chosen.
   */
  inventory: SpaceRow[];
  /**
   * How many readable Spaces carry no `Component` label at all.
   *
   * They belong to no component, so no preview can reach them and they are in no
   * denominator. Reported because that is a real state rather than an empty one: an
   * author asking why a Space never appears under any component is owed the fact that it
   * is in none, and this layer knows it. Not an error and not a fault.
   */
  spacesWithoutComponent: number;
  byStageId: ReadonlyMap<string, StageResolution>;
  /**
   * The gate: Spaces read AND every Stage's first resolution finished.
   *
   * Both, because gating on the inventory alone lifts while every Stage is still in
   * flight -- which is the mount case for every real workflow, not a rare one, and would
   * paint every rail tile without a count and fill them in a moment later.
   */
  isReady: boolean;
  error: FetchBaseQueryError | SerializedError | undefined;
}

/** The scope a Stage's selector is narrowed by, in the form the server builds itself. */
function componentWhere(componentId: string | undefined): string | undefined {
  if (!componentId) return undefined;
  return `ComponentID = '${componentId}'`;
}

export function useWorkflowSpaces(
  stages: StageSelector[],
  component: string | undefined,
): WorkflowSpaces {
  const { data, isLoading, error } = useListSpacesQuery({ select: SPACE_SELECT });
  const { slugById, idBySlug, isLoaded: componentsLoaded } = useComponentSlugs();

  const { components, inventory, spacesWithoutComponent, unreadable } = useMemo(() => {
    const nothing = {
      components: NO_COMPONENTS,
      inventory: NO_SPACES,
      spacesWithoutComponent: 0,
      unreadable: false,
    };
    if (data === undefined) return nothing;
    // Typed as an array and not guaranteed to be one; see `useWorkflowList` for why.
    if (!Array.isArray(data)) return { ...nothing, unreadable: true };

    const names = new Set<string>();
    const owned: SpaceRow[] = [];
    let unlabelled = 0;
    for (const extended of data) {
      const space = extended?.Space;
      if (!space?.Slug) continue;
      const labels = space.Labels ?? {};
      // A Space with no Component belongs to no component. It is not a component
      // called "", and it is not a member of whichever one is being previewed -- so it is
      // counted rather than silently skipped.
      if (!space.ComponentID) {
        unlabelled += 1;
        continue;
      }
      const name = spaceComponentSlug(space, slugById);
      if (!name) continue;
      names.add(name);
      if (name === component) {
        owned.push({ spaceId: space.SpaceID ?? '', slug: space.Slug, labels });
      }
    }

    return {
      components: [...names].sort((a, b) => a.localeCompare(b)),
      inventory: owned,
      spacesWithoutComponent: unlabelled,
      unreadable: false,
    };
  }, [data, component, slugById]);

  const componentId = component === undefined ? undefined : idBySlug.get(component);
  const scopeWhere = useMemo(() => componentWhere(componentId), [componentId]);

  /*
   * NOTHING RESOLVES UNTIL A COMPONENT IS CHOSEN.
   *
   * `useStageResolutions` treats its scope as optional and conjoins it when present, so
   * handing it an undefined scope would resolve each Stage's bare selector across EVERY
   * Space in the organisation. That is wrong and expensive at once: wrong because a
   * selector means "within this component" and unscoped it answers a question nobody
   * asked, expensive because it is one org-wide query per Stage.
   *
   * Withholding the Stages is how that is said, rather than teaching the resolver about
   * components -- it has no business knowing what the scope expresses.
   */
  const stagesToResolve = componentId === undefined ? NO_STAGES : stages;
  const { byStageId, isInitiallyResolved } = useStageResolutions(stagesToResolve, scopeWhere);

  return {
    components,
    inventory,
    spacesWithoutComponent,
    byStageId,
    // A component that has not been chosen resolves nothing, so nothing is pending and
    // the page is as ready as it can be. Waiting on a request nobody made would gate the
    // picker behind a choice only the picker can supply.
    isReady: !isLoading && componentsLoaded && (component === undefined || isInitiallyResolved),
    error: error ?? (unreadable ? MALFORMED_RESPONSE : undefined),
  };
}
