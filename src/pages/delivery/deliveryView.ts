// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// What the Delivery page's tree, list and side pane say about one Space, and the
// words and colours they share for it.

import { consoleTokens as T } from '../change-orders/consoleStyle';
import { unitConfigHref } from '../unit-detail/unitDetailHrefs';
import { ROUTE_COMPONENTS } from '../x/apps/appTypes';
import type { Delivery, DeliveryNode } from './deliveryGraph';

/** How a Space's Release is running, or why there is nothing to say: no such Space, or no release Target. */
export type Status = 'ok' | 'progress' | 'attention' | 'danger' | 'neutral' | 'missing' | 'none';

interface StatusStyle {
  /** The card's label, and the word a roll-up counts by. */
  label: string;
  rollup: string;
  color: string;
  hollow?: boolean;
}

export const STATUS: Record<Exclude<Status, 'none'>, StatusStyle> = {
  danger: { label: 'Degraded or failed', rollup: 'degraded or failed', color: T.bad },
  attention: { label: 'Out of sync', rollup: 'out of sync', color: T.wait },
  progress: { label: 'Progressing', rollup: 'progressing', color: T.progress },
  missing: { label: 'No such Space', rollup: 'with no Space', color: T.bad, hollow: true },
  neutral: { label: 'Not reported', rollup: 'not reported', color: T.ink3, hollow: true },
  ok: { label: 'Synced and healthy', rollup: 'synced and healthy', color: T.ok },
};

/** The cards, and the order a roll-up names what is wrong in: worst first. */
export const STATUS_KEYS = ['danger', 'attention', 'progress', 'missing', 'neutral', 'ok'] as const;

/** One Space of the graph, with everything a view shows for it. */
export interface NodeView {
  node: DeliveryNode;
  /** What the Space is called: `<component> / <variant>` for a Variant, and otherwise its slug. */
  title: string;
  /** "the Variant payments / prod" or "the Space hub-apps", for a sentence. */
  named: string;
  status: Status;
  statusText: string;
  targetSlug?: string;
  /** The Target the Space releases to, when it is not the Target its tree is shown under. */
  otherTarget?: string;
  /** How many Spaces it delivers, at any depth, and what is wrong among them. */
  below: number;
  rollup: string;
}

/** A Target, as far as the page shows it. */
export interface TargetInfo {
  /** `<space>/<target>`: a Target's slug alone does not identify it. */
  name: string;
  /** The Target's `URL-TargetUI` annotation: its controller's page for a Space, with `{slug}` for the Space's slug. */
  uiTemplate?: string;
}

/** The address of the controller's own UI, from a Target's `URL-TargetUI`, or undefined when it is not a URL. */
export function controllerUiHome(uiTemplate: string | undefined): string | undefined {
  if (!uiTemplate) return undefined;
  try {
    const url = new URL(uiTemplate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const ONE_LINE = { display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } as const;
export const SUB_SX = { ...ONE_LINE, fontSize: 11.5, lineHeight: T.lh, color: T.ink3 } as const;
export const LINK_SX = {
  color: T.ink,
  textDecoration: 'none',
  '&:hover': { color: T.action, textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 2, borderRadius: '2px' },
} as const;

/** A node's `title` and `named`. */
export function nodeNames(node: DeliveryNode): Pick<NodeView, 'title' | 'named'> {
  const componentSlug = node.space?.componentSlug;
  if (!componentSlug) return { title: node.slug, named: `the Space ${node.slug}` };
  const title = `${componentSlug} / ${node.space?.variant ?? node.slug}`;
  return { title, named: `the Variant ${title}` };
}

/** The Components page, open on the Component with this Space's Variant selected. */
export function componentHref(componentSlug: string, spaceId: string): string {
  return `${ROUTE_COMPONENTS}?${new URLSearchParams({ app: componentSlug, space: spaceId }).toString()}`;
}

/** The resource delivering a Space, in words; it is named when its name is not the Space's slug. */
export function deliveryText(delivery: Delivery): string {
  return delivery.name === delivery.toSlug ? delivery.kind : `${delivery.kind} ${delivery.name}`;
}

/** The controller a delivering resource belongs to: "Argo CD", "Flux", "Sveltos". */
export function controllerName(delivery: Delivery): string {
  return delivery.kind.startsWith('Argo CD') ? 'Argo CD' : delivery.kind.split(' ')[0];
}

/** The configuration of the Unit holding a delivering resource. */
export function deliveryUnitHref(delivery: Delivery): string {
  return unitConfigHref(delivery.fromSpaceId, delivery.unitId);
}
