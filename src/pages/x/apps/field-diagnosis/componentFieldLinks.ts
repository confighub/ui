// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Where a reference in the field details goes, in the Component side pane (PLAN.md R4,
// decision 8, U4). A Unit whose Space is a Deployment of this Component is "in view": a plain
// click jumps to the field there, in place, and PUSHES history (a gate opens the pane's Gates
// tab the same way). Otherwise the reference links to the thing's own page; while the pane holds
// staged changes, such a link opens a new tab, so they are not lost (owner answer Q2, D10).
// Every reference is an <a href>, so cmd-click opens a new tab. A person is plain text.
import { createContext } from 'react';

import type { FieldRef } from '@/components/field-diagnosis/fieldDiagnosis.types';
import type { ResolvedRef } from '@/components/field-diagnosis/fieldLinks';

import { changeOrderPath } from '../../../change-orders/changeOrderAddress';
import { unitConfigHref, unitLinksHref, unitRevisionHref } from '../../../unit-detail/unitDetailHrefs';
import type { ViewParamsPatch } from '../appTypes';
import { gatePatch, jumpPatch } from './componentFocus';

/** The Spaces of the Component's Deployments: a Unit in one of them is in view. */
export const PaneSpacesContext = createContext<ReadonlySet<string>>(new Set());

/** How many changes the pane holds staged: links that would lose them open a new tab. */
export const PaneStagedContext = createContext<number>(0);

export interface PaneLinkContext {
  inViewSpaceIds: ReadonlySet<string>;
  /** The open field and its Unit. A Unit reference names the same field unless it says another. */
  field: { path: string; fres?: string; spaceId: string; unitId: string };
  /** Changes staged in the pane. */
  staged: number;
  hrefFor: (patch: ViewParamsPatch) => string;
  go: (patch: ViewParamsPatch, options?: { push?: boolean }) => void;
}

const plural = (n: number) => `${n} staged change${n === 1 ? '' : 's'}`;

/**
 * A jump in place, pushing history. A jump to another Space while changes are staged opens a new
 * tab instead (team-lead decision (b), as D10): the Space switch would drop them. A jump inside
 * the same Space keeps them, so it always stays in place.
 */
const jumpTo = (patch: ViewParamsPatch, ctx: PaneLinkContext): ResolvedRef => {
  const href = ctx.hrefFor(patch);
  const crossSpace = patch.space !== undefined && patch.space !== ctx.field.spaceId;
  if (crossSpace && ctx.staged > 0) return { href, newTab: true, note: `Opens in a new tab: ${plural(ctx.staged)}` };
  return { href, jump: () => ctx.go(patch, { push: true }) };
};

/** A link that leaves the Components page: a new tab while changes are staged (D10). */
const away = (href: string, ctx: PaneLinkContext): ResolvedRef =>
  ctx.staged > 0 ? { href, newTab: true, note: `Opens in a new tab: ${plural(ctx.staged)}` } : { href };

export function resolveComponentFieldRef(ref: FieldRef, ctx: PaneLinkContext): ResolvedRef {
  switch (ref.kind) {
    case 'unit':
      if (!ref.spaceId || !ref.unitId) return {};
      if (ctx.inViewSpaceIds.has(ref.spaceId)) {
        return jumpTo(
          jumpPatch({ space: ref.spaceId, unit: ref.unitId, field: ref.field ?? ctx.field.path, fres: ref.fres ?? ctx.field.fres }),
          ctx,
        );
      }
      return away(unitConfigHref(ref.spaceId, ref.unitId), ctx);
    case 'gate':
      if (!ref.triggerId) return {};
      // A gate on this field validates its own Unit, whose Space is the one the pane is open on.
      if (ctx.inViewSpaceIds.has(ctx.field.spaceId)) return jumpTo(gatePatch(ref.triggerId), ctx);
      return away(`/validation/${ref.triggerId}`, ctx);
    case 'link':
      if (ref.providerUnitId && ref.spaceId && ctx.inViewSpaceIds.has(ref.spaceId)) {
        // A NeedsProvides resource-name attribute is the provider's metadata.name.
        const named = ref.attribute === 'resource-name';
        return jumpTo(
          jumpPatch({
            space: ref.spaceId,
            unit: ref.providerUnitId,
            field: named ? 'metadata.name' : undefined,
            fres: named ? `${ref.resourceType ?? ''}|` : undefined,
          }),
          ctx,
        );
      }
      return away(unitLinksHref(ctx.field.spaceId, ctx.field.unitId), ctx);
    case 'revision':
      if (!ref.spaceId || !ref.unitId) return {};
      return away(unitRevisionHref(ref.spaceId, ref.unitId, ref.num), ctx);
    case 'changeOrder':
      return away(changeOrderPath(ref.space, ref.slug), ctx);
    case 'user':
      return {};
  }
}
