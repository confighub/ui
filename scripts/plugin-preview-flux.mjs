#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const API_VERSION = 'confighub.com/plugin-preview/v1';
const PRODUCER = { name: 'cub-flux', version: 'dev' };

function text(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function node(id, kind, name, namespace, details = {}, hub) {
  const result = { id, kind, name };
  if (namespace) result.namespace = namespace;
  if (Object.keys(details).length) result.details = details;
  if (hub) result.hub = hub;
  return result;
}

function edge(from, to, relation) {
  return { from, to, relation };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableGraph(nodes, edges) {
  nodes.sort((a, b) => compareText(a.id, b.id));
  edges.sort((a, b) => compareText(`${a.from}\0${a.to}\0${a.relation}`, `${b.from}\0${b.to}\0${b.relation}`));
  return { nodes, edges };
}

/** Convert the real `cub flux plan --json` structure to the frozen v1 UI envelope. */
export function convertFluxPlan(plan, exportedAt = new Date().toISOString()) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.clusters) || !Array.isArray(plan.components)) {
    throw new TypeError('expected cub flux plan JSON with clusters and components arrays');
  }

  const inventoryNodes = [];
  const inventoryEdges = [];
  const proposalNodes = [];
  const proposalEdges = [];
  const issues = [];
  const baseSpaces = new Set();
  const targetSpaces = new Map();
  const targets = new Map();
  const clusters = new Map(plan.clusters.map((cluster) => [cluster.name, cluster]));

  for (const cluster of plan.clusters) {
    const id = `flux-cluster/${cluster.name}`;
    inventoryNodes.push(node(id, 'FluxCluster', cluster.name, undefined, {
      stage: text(cluster.stage),
      sourcePath: text(cluster.path),
      evidence: 'Git plan input',
    }));
  }

  for (const component of plan.components) {
    for (const stage of component.stages ?? []) {
      for (const variant of stage.variants ?? []) {
        const cluster = clusters.get(variant.cluster);
        const kustomizationName = text(variant.kustomization).split('/').at(-1) || component.name;
        const kustomizationId = `flux-kustomization/${variant.cluster}/${kustomizationName}`;
        inventoryNodes.push(node(kustomizationId, 'FluxKustomization', kustomizationName, 'flux-system', {
          component: text(component.name),
          stage: text(stage.name),
          sourcePath: text(variant.path),
          departures: text((variant.departures ?? []).join('; ')),
          evidence: 'Git plan input; not proof of live reconciliation',
        }));
        if (cluster) inventoryEdges.push(edge(`flux-cluster/${cluster.name}`, kustomizationId, 'declares'));

        if (!baseSpaces.has(component.base)) {
          baseSpaces.add(component.base);
          const baseSpaceId = `proposal-space/${component.base}`;
          proposalNodes.push(node(baseSpaceId, 'Space', component.base, undefined, { role: 'base' }, { spaceSlug: component.base }));
          const baseUnitId = `proposal-unit/${component.base}/${component.name}`;
          proposalNodes.push(node(baseUnitId, 'Unit', component.name, undefined, {
            role: 'base',
            sourcePath: text(component.baseDir),
          }, { spaceSlug: component.base, unitSlug: component.name }));
          proposalEdges.push(edge(baseSpaceId, baseUnitId, 'contains'));
        }

        const variantSpace = text(variant.space);
        const targetsSpace = text(variant.target).split('/')[0] || 'flux-targets';
        const targetSlug = text(variant.target).split('/').at(-1) || text(variant.cluster);
        const variantSpaceId = `proposal-space/${variantSpace}`;
        if (!proposalNodes.some((item) => item.id === variantSpaceId)) {
          proposalNodes.push(node(variantSpaceId, 'Space', variantSpace, undefined, {
            role: 'variant',
            cluster: text(variant.cluster),
            stage: text(stage.name),
          }, { spaceSlug: variantSpace, targetSlug, targetsSpace }));
        }
        const targetSpaceId = `proposal-space/${targetsSpace}`;
        if (!targetSpaces.has(targetsSpace)) {
          targetSpaces.set(targetsSpace, targetSpaceId);
          proposalNodes.push(node(targetSpaceId, 'Space', targetsSpace, undefined, { role: 'targets' }, { spaceSlug: targetsSpace }));
        }
        const targetId = `proposal-target/${targetsSpace}/${targetSlug}`;
        if (!targets.has(targetId)) {
          targets.set(targetId, true);
          proposalNodes.push(node(targetId, 'Target', targetSlug, undefined, { cluster: text(variant.cluster) }, {
            spaceSlug: targetsSpace,
            targetSlug,
          }));
          proposalEdges.push(edge(targetSpaceId, targetId, 'targets'));
        }
        const variantUnitId = `proposal-unit/${variantSpace}/${component.name}`;
        proposalNodes.push(node(variantUnitId, 'Unit', text(component.name), undefined, {
          role: 'variant',
          cluster: text(variant.cluster),
          stage: text(stage.name),
          sourcePath: text(variant.path),
        }, { spaceSlug: variantSpace, unitSlug: text(component.name) }));
        proposalEdges.push(edge(variantSpaceId, variantUnitId, 'contains'));
        proposalEdges.push(edge(variantUnitId, `proposal-unit/${component.base}/${component.name}`, 'variantOf'));
        proposalEdges.push(edge(variantSpaceId, targetId, 'targets'));
      }
    }
  }

  for (const skipped of plan.inputs?.skipped ?? []) {
    issues.push({ severity: 'warning', code: 'flux-input-skipped', message: text(skipped) });
  }
  for (const problem of plan.problems ?? []) {
    issues.push({ severity: 'warning', code: 'flux-plan-problem', message: text(problem) });
  }
  issues.sort((a, b) => compareText(`${a.code}\0${a.message}`, `${b.code}\0${b.message}`));

  return {
    apiVersion: API_VERSION,
    kind: 'PluginPreview',
    producer: PRODUCER,
    exportedAt,
    scope: {
      description: 'Static cub flux plan derived from the supplied Git fleet repository. Inventory nodes describe plan inputs only; this is not live cluster discovery, rendered Kubernetes inventory, or proof of delivery.',
    },
    capabilities: ['preview'],
    inventory: stableGraph(inventoryNodes, inventoryEdges),
    proposal: stableGraph(proposalNodes, proposalEdges),
    issues,
  };
}

async function main(args) {
  const [inputPath, ...rest] = args;
  if (!inputPath || inputPath.startsWith('--')) {
    throw new Error('usage: node scripts/plugin-preview-flux.mjs <cub-flux-plan.json> [--exported-at RFC3339]');
  }
  let exportedAt = new Date().toISOString();
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] === '--exported-at' && rest[index + 1]) exportedAt = rest[++index];
    else throw new Error(`unknown argument: ${rest[index]}`);
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(exportedAt)) {
    throw new Error('--exported-at must be an RFC3339 UTC timestamp');
  }
  const plan = JSON.parse(await readFile(inputPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(convertFluxPlan(plan, exportedAt), null, 2)}\n`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
