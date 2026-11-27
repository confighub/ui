// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Which common tiles a resource has, and how a tile cuts its value.

import { parseImageRef } from '../imageRef';
import type { SheetAtom, SheetResource } from './specSheetModel';

/** Cut in the middle: the end of a digest or an image tag carries the meaning. */
export function middleCut(text: string, max: number): string {
  if (text.length <= max) return text;
  const tail = Math.max(3, Math.floor((max - 1) / 2));
  return `${text.slice(0, max - 1 - tail)}…${text.slice(-tail)}`;
}

export function imageTagOf(image: string): string {
  const ref = parseImageRef(image);
  return ref?.digest ?? ref?.tag ?? image;
}

export interface Tile {
  id: 'image' | 'replicas' | 'limits';
  label: string;
  atoms: SheetAtom[];
}

/** The tiles of one resource: its first container's image and limits, and its replicas. */
export function tilesOf(resource: SheetResource): Tile[] {
  const container = resource.parts.find((p) => p.kind === 'container');
  const spec = resource.parts.find((p) => p.kind === 'spec');
  const containerAtom = (rel: string) => {
    const prefix = container?.titleAtom ? container.titleAtom.path.replace(/\.name$/, '') : undefined;
    if (!container || !prefix) return undefined;
    for (const b of container.blocks) for (const a of b.atoms) if (a.path === `${prefix}.${rel}`) return a;
    return undefined;
  };
  const tiles: Tile[] = [];
  const image = containerAtom('image');
  if (image) tiles.push({ id: 'image', label: 'Image tag', atoms: [image] });
  const replicas = spec?.blocks.flatMap((b) => b.atoms).find((a) => a.path === 'spec.replicas');
  if (replicas) tiles.push({ id: 'replicas', label: 'Replicas', atoms: [replicas] });
  const cpu = containerAtom('resources.limits.cpu');
  const memory = containerAtom('resources.limits.memory');
  if (cpu || memory) tiles.push({ id: 'limits', label: 'Limits', atoms: [cpu, memory].filter((a): a is SheetAtom => !!a) });
  return tiles;
}

