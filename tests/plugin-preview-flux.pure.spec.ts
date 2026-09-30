import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { convertFluxPlan } from '../scripts/plugin-preview-flux.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(here, 'fixtures/plugin-ui/cub-flux-expert-fleet.plan.json');
const examplePath = path.join(here, '../public/examples/flux-preview.json');
const exportedAt = '2026-09-30T00:00:00Z';

async function sourcePlan() {
  return JSON.parse(await readFile(sourcePath, 'utf8')) as Record<string, unknown>;
}

test.describe('Flux plugin preview adapter', () => {
  test('converts the checked-in real cub flux plan to the published v1 example', async () => {
    const actual = convertFluxPlan(await sourcePlan(), exportedAt);
    const published = JSON.parse(await readFile(examplePath, 'utf8'));

    expect(actual).toEqual(published);
    expect(actual.apiVersion).toBe('confighub.com/plugin-preview/v1');
    expect(actual.capabilities).toEqual(['preview']);
    expect(actual.scope.description).toContain('not live cluster discovery');
    expect(actual.scope.description).toContain('or proof of delivery');
  });

  test('preserves fleet identity and deterministic graph links without asserting live state', async () => {
    const preview = convertFluxPlan(await sourcePlan(), exportedAt);
    const clusters = preview.inventory.nodes.filter((item) => item.kind === 'FluxCluster');
    const layerInputs = preview.inventory.nodes.filter((item) => item.kind === 'FluxKustomization');
    const proposalUnits = preview.proposal.nodes.filter((item) => item.kind === 'Unit');

    expect(clusters.map((item) => item.name)).toEqual(['dev-1', 'prod-1', 'staging-1']);
    expect(layerInputs).toHaveLength(10);
    expect(layerInputs.every((item) => item.details.evidence.includes('not proof of live'))).toBe(true);
    expect(proposalUnits.filter((item) => item.details.role === 'base')).toHaveLength(4);
    expect(proposalUnits.filter((item) => item.details.role === 'variant')).toHaveLength(10);

    for (const graph of [preview.inventory, preview.proposal]) {
      expect(graph.nodes.map((item) => item.id)).toEqual([...graph.nodes.map((item) => item.id)].sort());
      const ids = new Set(graph.nodes.map((item) => item.id));
      expect(new Set(ids).size).toBe(ids.size);
      expect(graph.edges.every((item) => ids.has(item.from) && ids.has(item.to))).toBe(true);
    }
    expect(preview.proposal.edges.filter((item) => item.relation === 'variantOf')).toHaveLength(10);
    expect(preview.issues).toEqual([]);
  });

  test('surfaces skipped inputs and plan problems as errors and ignores credential-shaped unknown fields', () => {
    const plan = {
      clusters: [{ name: 'dev', dir: 'dev', stage: 'dev', path: 'clusters/dev' }],
      components: [],
      inputs: { skipped: ['not a supported file'] },
      problems: ['layer path is missing'],
      credentials: { token: 'DO_NOT_EXPORT' },
    };

    const preview = convertFluxPlan(plan, exportedAt);
    expect(preview.issues).toEqual([
      { severity: 'warning', code: 'flux-input-skipped', message: 'not a supported file' },
      { severity: 'error', code: 'flux-plan-problem', message: 'layer path is missing' },
    ]);
    expect(JSON.stringify(preview)).not.toContain('DO_NOT_EXPORT');
    expect(JSON.stringify(preview)).not.toContain('credentials');
  });

  test('rejects a shape that is not a machine-readable Flux plan', () => {
    expect(() => convertFluxPlan({})).toThrow('clusters and components arrays');
  });
});
