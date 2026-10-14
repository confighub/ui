// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { generateSlug } from 'random-word-slugs';

export class RandomSlugGenerator {
  /**
   * Generates a readable slug using random-word-slugs
   * Examples: "brave-elephant", "swift-ocean"
   */
  static randomSlugName(): string {
    return generateSlug(2, { format: 'kebab' });
  }
}