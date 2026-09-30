// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
export const API_VERSION = 'confighub.com/plugin-preview/v1';
export interface PreviewNode {
  id: string;
  kind: string;
  name: string;
  namespace?: string;
  details?: Record<string, string>;
  hub?: { spaceSlug?: string; unitSlug?: string; targetSlug?: string; targetsSpace?: string };
}
export interface PreviewGraph {
  nodes: PreviewNode[];
  edges: { from: string; to: string; relation: string }[];
}
export interface Preview {
  apiVersion: string;
  kind: 'PluginPreview';
  producer: { name: string; version: string };
  exportedAt: string;
  scope: { description: string };
  capabilities: string[];
  inventory: PreviewGraph;
  proposal: PreviewGraph;
  issues: { severity: 'warning' | 'error'; code: string; message: string }[];
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function validateGraph(value: unknown, name: string): void {
  assert(
    record(value) && Array.isArray(value.nodes) && Array.isArray(value.edges),
    `${name}: nodes and edges must be arrays`,
  );
  assert(
    value.nodes.length <= 10000 && value.edges.length <= 50000,
    `${name}: preview exceeds graph limits`,
  );
  const ids = new Set<string>();
  for (const n of value.nodes) {
    assert(
      record(n) && text(n.id) && text(n.kind) && text(n.name),
      `${name}: node needs id, kind and name`,
    );
    assert(!ids.has(n.id), `${name}: duplicate node ${n.id}`);
    ids.add(n.id);
    assert(
      n.namespace === undefined || typeof n.namespace === 'string',
      `${name}: invalid namespace`,
    );
    for (const key of ['details', 'hub']) {
      assert(
        n[key] === undefined ||
          (record(n[key]) && Object.values(n[key]).every((v) => typeof v === 'string')),
        `${name}: ${key} must contain only strings`,
      );
    }
  }
  const edges = new Set<string>();
  for (const e of value.edges) {
    assert(
      record(e) && text(e.from) && text(e.to) && text(e.relation),
      `${name}: invalid edge`,
    );
    assert(ids.has(e.from) && ids.has(e.to), `${name}: edge references a missing node`);
    const key = JSON.stringify([e.from, e.to, e.relation]);
    assert(!edges.has(key), `${name}: duplicate edge`);
    edges.add(key);
  }
}
export function parsePreview(input: string): Preview {
  assert(input.length <= 5 * 1024 * 1024, 'Preview exceeds 5 MiB');
  const p: unknown = JSON.parse(input);
  assert(
    record(p) && p.apiVersion === API_VERSION && p.kind === 'PluginPreview',
    'Unsupported preview version or kind',
  );
  assert(
    record(p.producer) && text(p.producer.name) && text(p.producer.version),
    'Producer name and version required',
  );
  assert(
    typeof p.exportedAt === 'string' &&
      /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(p.exportedAt) &&
      Number.isFinite(Date.parse(p.exportedAt)),
    'Invalid export time',
  );
  assert(record(p.scope) && text(p.scope.description), 'Scope description required');
  assert(
    Array.isArray(p.capabilities) && p.capabilities.every(text),
    'Capabilities must be strings',
  );
  assert(
    Array.isArray(p.issues) &&
      p.issues.every(
        (i) =>
          record(i) &&
          ['warning', 'error'].includes(String(i.severity)) &&
          text(i.code) &&
          text(i.message),
      ),
    'Invalid issues',
  );
  validateGraph(p.inventory, 'Inventory');
  validateGraph(p.proposal, 'Proposal');
  return p as unknown as Preview;
}
export function emptyGraph(): PreviewGraph {
  return { nodes: [], edges: [] };
}
