// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getLabelColors(key: string): { bg: string; fg: string; border: string } {
  const hue = hashKey(key) % 360;
  return {
    bg: `hsl(${hue}, 42%, 91%)`,
    fg: `hsl(${hue}, 65%, 22%)`,
    border: `hsl(${hue}, 30%, 80%)`,
  };
}
