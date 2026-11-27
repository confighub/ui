// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Which renderer draws a block: the ordered matchers of `shapeMatch.ts` (first match wins,
// KeyValueShape last), each with its renderer.
//
// A new shape is one file in this folder, one matcher and one renderer line, and one match test.
import type { ComponentType } from 'react';

import { CommandShape } from './CommandShape';
import { EnvShape } from './EnvShape';
import { FlagsShape } from './FlagsShape';
import { ImageShape } from './ImageShape';
import { KeyValueShape } from './KeyValueShape';
import { MountsShape } from './MountsShape';
import { PairsShape } from './PairsShape';
import { PortsShape } from './PortsShape';
import { ProbesShape } from './ProbesShape';
import { ResourcesShape } from './ResourcesShape';
import { TokensShape } from './TokensShape';
import { VolumesShape } from './VolumesShape';
import type { ShapeProps } from './shapeKit';
import { SHAPE_MATCHERS, type ShapeContext, type ShapeId, shapeIdFor } from './shapeMatch';

export type { ShapeProps } from './shapeKit';
export type { ShapeContext, ShapeId } from './shapeMatch';

export interface ShapeEntry {
  id: ShapeId;
  match: (ctx: ShapeContext) => boolean;
  Renderer: ComponentType<ShapeProps>;
}

const RENDERERS: Record<ShapeId, ComponentType<ShapeProps>> = {
  image: ImageShape,
  command: CommandShape,
  ports: PortsShape,
  env: EnvShape,
  resources: ResourcesShape,
  probes: ProbesShape,
  mounts: MountsShape,
  security: FlagsShape,
  volumes: VolumesShape,
  tokens: TokensShape,
  pairs: PairsShape,
  'key-value': KeyValueShape,
};

export const SHAPES: readonly ShapeEntry[] = SHAPE_MATCHERS.map((m) => ({
  ...m,
  Renderer: RENDERERS[m.id],
}));

const BY_ID = new Map(SHAPES.map((s) => [s.id, s]));

/** The entry that draws a block: the first that matches. */
export function shapeFor(ctx: ShapeContext): ShapeEntry {
  return BY_ID.get(shapeIdFor(ctx))!;
}
