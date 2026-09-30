// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// Use the UI's actual validator, so plugin authors do not target a second schema.
import { readFile } from 'node:fs/promises';

import { parsePreview } from '../src/pages/plugin-explorer/model.ts';

try {
  if (process.argv.length !== 3)
    throw new Error('Usage: npm run check:preview -- preview.json');
  const preview = parsePreview(await readFile(process.argv[2], 'utf8'));
  console.log(
    JSON.stringify({
      valid: true,
      apiVersion: preview.apiVersion,
      producer: preview.producer,
      inventory: {
        nodes: preview.inventory.nodes.length,
        edges: preview.inventory.edges.length,
      },
      proposal: { nodes: preview.proposal.nodes.length, edges: preview.proposal.edges.length },
      issues: preview.issues.length,
    }),
  );
} catch (error) {
  console.error(String(error));
  process.exitCode = 1;
}
