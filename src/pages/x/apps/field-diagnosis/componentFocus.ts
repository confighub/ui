// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The field diagnosis focus in the Component view URL (PLAN.md U3): which Unit card, which field
// and which gate the side pane shows. Pure; AppsComponentLayout is the one writer.
import { ROUTE_COMPONENTS, type ViewParamsPatch, applyViewParamsPatch } from '../appTypes';

export interface ComponentFocus {
  unit?: string;
  field?: string;
  fres?: string;
  tab?: 'gates';
  gate?: string;
}

const FOCUS_KEYS = ['unit', 'field', 'fres', 'tab', 'gate'] as const;

export function readFocus(params: URLSearchParams): ComponentFocus {
  const focus: ComponentFocus = {};
  for (const key of FOCUS_KEYS) {
    const value = params.get(key);
    if (!value) continue;
    if (key === 'tab') {
      if (value === 'gates') focus.tab = 'gates';
    } else {
      focus[key] = value;
    }
  }
  return focus;
}

// `fres` is `ResourceType|ResourceName`. A `|` or `\` inside a part is escaped with `\`, so any
// pair round-trips; a plain pair reads as it is written.
const escapePart = (part: string) => part.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

export function encodeFres(resourceType: string | undefined, resourceName: string | undefined): string | undefined {
  if (!resourceType && !resourceName) return undefined;
  return `${escapePart(resourceType ?? '')}|${escapePart(resourceName ?? '')}`;
}

export function decodeFres(fres: string | undefined): { ResourceType?: string; ResourceName?: string } {
  if (!fres) return {};
  const parts: string[] = [''];
  for (let i = 0; i < fres.length; i += 1) {
    const char = fres[i];
    if (char === '\\' && i + 1 < fres.length) {
      i += 1;
      parts[parts.length - 1] += fres[i];
    } else if (char === '|' && parts.length === 1) {
      parts.push('');
    } else {
      parts[parts.length - 1] += char;
    }
  }
  const [type, name] = parts;
  return { ResourceType: type || undefined, ResourceName: name || undefined };
}

/** Open a field's details (REPLACE). */
export function openFieldPatch(unit: string, field: string, fres: string | undefined): ViewParamsPatch {
  return { unit, field, fres: fres ?? null, tab: null, gate: null };
}

/** Close the details (REPLACE); the Unit card stays open. */
export const CLOSE_FIELD_PATCH: ViewParamsPatch = { field: null, fres: null };

/** Go to a field in another Unit or Space (PUSH). */
export function jumpPatch(target: { space: string; unit: string; field?: string; fres?: string }): ViewParamsPatch {
  return { space: target.space, unit: target.unit, field: target.field ?? null, fres: target.fres ?? null, tab: null, gate: null };
}

/** Open a gate in the pane's Gates tab (PUSH). */
export function gatePatch(triggerId: string): ViewParamsPatch {
  return { tab: 'gates', gate: triggerId, field: null, fres: null };
}

/**
 * The patch as it is written: a Space change that names no Unit (a graph click, the picker,
 * closing the pane) also clears the focus, which names a Unit of the old Space. In the same
 * write, since two writes do not compose (components.md). A jump names its Unit and keeps it.
 */
export function withSpaceChangeClears(live: URLSearchParams, patch: ViewParamsPatch): ViewParamsPatch {
  if (patch.space === undefined || patch.space === live.get('space') || patch.unit !== undefined) return patch;
  return { ...patch, unit: null, field: null, fres: null, tab: null, gate: null };
}

/** The Component view address with `patch` written over `search`, for a link's href. */
export function componentFocusHref(search: string, patch: ViewParamsPatch): string {
  const live = new URLSearchParams(search);
  const params = applyViewParamsPatch(new URLSearchParams(live), withSpaceChangeClears(live, patch));
  return `${ROUTE_COMPONENTS}?${params.toString()}`;
}
