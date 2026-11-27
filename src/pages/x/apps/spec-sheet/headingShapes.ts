// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import type { ShapeId } from './shapes/registry';

/**
 * The blocks that group fields under one label (Image, Command, Env, Resources...): their
 * labels are a level of their own, between the section heading and a plain field's label.
 */
export const HEADING_SHAPES: ReadonlySet<ShapeId> = new Set<ShapeId>([
  'image',
  'command',
  'ports',
  'env',
  'resources',
  'probes',
  'mounts',
  'security',
  'volumes',
]);
