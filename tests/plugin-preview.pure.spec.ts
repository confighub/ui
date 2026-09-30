import { expect, test } from '@playwright/test';

import { connectedPreview, matchProposedSpaces } from '../src/pages/plugin-explorer/connected';
import { API_VERSION, type Preview, parsePreview } from '../src/pages/plugin-explorer/model';

const fixture = (): Preview => ({
  apiVersion: API_VERSION,
  kind: 'PluginPreview',
  producer: { name: 'test', version: '1' },
  exportedAt: '2026-09-30T12:00:00Z',
  scope: { description: 'Supplied input only' },
  capabilities: ['preview'],
  inventory: { nodes: [{ id: 'c', kind: 'Cluster', name: 'prod' }], edges: [] },
  proposal: {
    nodes: [{ id: 's', kind: 'Space', name: 'prod', hub: { spaceSlug: 'prod' } }],
    edges: [],
  },
  issues: [],
});
const scope = {
  instance: 'https://hub.example',
  organizationId: 'org',
  componentId: 'cmp',
  componentName: 'demo',
};
const spaces = [
  {
    Space: {
      SpaceID: 'id',
      Slug: 'prod',
      OrganizationID: 'org',
      ComponentID: 'cmp',
      Labels: { Stage: 'prod' },
    },
  },
];
test('envelope accepts additive fields but refuses incompatible version', () => {
  expect(parsePreview(JSON.stringify({ ...fixture(), future: true })).producer.name).toBe(
    'test',
  );
  expect(() => parsePreview(JSON.stringify({ ...fixture(), apiVersion: 'v2' }))).toThrow(
    'Unsupported',
  );
});
test('invalid graphs cannot silently drop relationships', () => {
  const p = fixture();
  p.inventory.edges.push({ from: 'c', to: 'missing', relation: 'selects' });
  expect(() => parsePreview(JSON.stringify(p))).toThrow('missing node');
  p.inventory.edges = [];
  p.inventory.nodes.push(p.inventory.nodes[0]);
  expect(() => parsePreview(JSON.stringify(p))).toThrow('duplicate node');
});
test('rejects malformed metadata and large input', () => {
  expect(() => parsePreview(JSON.stringify({ ...fixture(), exportedAt: 'today' }))).toThrow(
    'export time',
  );
  expect(() => parsePreview(' '.repeat(5 * 1024 * 1024 + 1))).toThrow('5 MiB');
  const p = fixture();
  (p.inventory.nodes[0] as unknown as { details: unknown }).details = {
    secret: { value: 'x' },
  };
  expect(() => parsePreview(JSON.stringify(p))).toThrow('only strings');
});
test('actual IDs scope connected data; missing health stays unknown', () => {
  const r = connectedPreview(
    scope,
    spaces,
    [
      {
        Unit: {
          UnitID: 'u',
          Slug: 'app',
          SpaceID: 'id',
          OrganizationID: 'org',
          UpstreamUnitID: 'outside',
        },
      },
    ],
    ['units partial'],
  );
  expect(r.preview.inventory.nodes.map((n) => n.id)).toEqual(['Space/id', 'Unit/u']);
  expect(r.links['Space/id']).toBe('/spaces/id');
  expect(r.preview.inventory.nodes[0].details?.health).toBe('Not assessed by this view');
  expect(r.preview.issues.map((i) => i.code)).toContain('upstream-omitted');
});
test('cross-organization and cross-component entities are omitted explicitly', () => {
  const r = connectedPreview(
    scope,
    [
      { Space: { ...spaces[0].Space, OrganizationID: 'other' } },
      { Space: { ...spaces[0].Space, ComponentID: 'other' } },
    ],
    [],
  );
  expect(r.preview.inventory.nodes).toEqual([]);
  expect(r.preview.issues).toHaveLength(2);
});
test('local names give candidates, with ambiguity and absent states', () => {
  expect(matchProposedSpaces(fixture(), scope, spaces)[0].state).toContain('Candidate');
  expect(matchProposedSpaces(fixture(), scope, [...spaces, ...spaces])[0].state).toBe(
    'Ambiguous',
  );
  expect(matchProposedSpaces(fixture(), scope, [])[0].state).toContain('Not found');
});

test('shared command validates real preview files without changing them', async () => {
  const { execFileSync, spawnSync } = await import('node:child_process');
  const valid = execFileSync(
    'node',
    [
      '--experimental-strip-types',
      'scripts/check-plugin-preview.mjs',
      'public/examples/sveltos-preview.json',
    ],
    { encoding: 'utf8' },
  );
  expect(JSON.parse(valid).valid).toBe(true);
  const invalid = spawnSync(
    'node',
    ['--experimental-strip-types', 'scripts/check-plugin-preview.mjs', 'package.json'],
    { encoding: 'utf8' },
  );
  expect(invalid.status).toBe(1);
  expect(invalid.stdout).toBe('');
  expect(invalid.stderr).toContain('Unsupported preview');
});
