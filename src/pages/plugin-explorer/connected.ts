// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { API_VERSION, type Preview, emptyGraph } from './model';

export interface HubSpace {
  Space?: {
    SpaceID?: string;
    Slug?: string;
    OrganizationID?: string;
    ComponentID?: string;
    Labels?: Record<string, string>;
    ReleaseTargetID?: string;
  };
}
export interface HubUnit {
  Unit?: {
    UnitID?: string;
    Slug?: string;
    SpaceID?: string;
    OrganizationID?: string;
    UpstreamUnitID?: string;
    HeadRevisionNum?: number;
  };
}
export interface ConnectedScope {
  instance: string;
  organizationId: string;
  componentId: string;
  componentName: string;
}
export function connectedPreview(
  scope: ConnectedScope,
  spaces: HubSpace[],
  units: HubUnit[],
  warnings: string[] = [],
  now = new Date().toISOString(),
): { preview: Preview; links: Record<string, string> } {
  const preview: Preview = {
    apiVersion: API_VERSION,
    kind: 'PluginPreview',
    producer: { name: 'ConfigHub', version: 'API' },
    exportedAt: now,
    scope: {
      description: `${scope.instance} · organization ${scope.organizationId} · component ${scope.componentName}. Only readable configuration records; source cluster inventory is not available here.`,
    },
    capabilities: ['preview'],
    inventory: emptyGraph(),
    proposal: emptyGraph(),
    issues: warnings.map((message) => ({
      severity: 'warning',
      code: 'partial-read',
      message,
    })),
  };
  const links: Record<string, string> = {};
  const ids = new Set<string>();
  for (const { Space: s } of spaces) {
    if (
      !s?.SpaceID ||
      !s.Slug ||
      s.OrganizationID !== scope.organizationId ||
      s.ComponentID !== scope.componentId
    ) {
      preview.issues.push({
        severity: 'warning',
        code: 'identity-mismatch',
        message: 'A space was omitted because its identity did not match the selected scope.',
      });
      continue;
    }
    const id = `Space/${s.SpaceID}`;
    if (ids.has(id)) throw new Error(`Duplicate server space ID ${s.SpaceID}`);
    ids.add(id);
    preview.inventory.nodes.push({
      id,
      kind: 'Space',
      name: s.Slug,
      details: {
        role: s.Labels?.Role ?? 'Not reported',
        stage: s.Labels?.Stage ?? 'Not reported',
        cluster: s.Labels?.Cluster ?? 'Not reported',
        health: 'Not assessed by this view',
      },
      hub: { spaceSlug: s.Slug },
    });
    links[id] = `/spaces/${encodeURIComponent(s.SpaceID)}`;
    if (s.ReleaseTargetID) {
      const target = `Target/${s.ReleaseTargetID}`;
      if (!ids.has(target)) {
        ids.add(target);
        preview.inventory.nodes.push({
          id: target,
          kind: 'Target',
          name: s.ReleaseTargetID,
          details: { identity: 'ReleaseTargetID from the space; target details not loaded' },
        });
      }
      preview.inventory.edges.push({ from: id, to: target, relation: 'targets' });
    }
  }
  const admitted = units.flatMap(({ Unit: u }) => {
    if (
      !u?.UnitID ||
      !u.SpaceID ||
      !u.Slug ||
      u.OrganizationID !== scope.organizationId ||
      !ids.has(`Space/${u.SpaceID}`)
    ) {
      preview.issues.push({
        severity: 'warning',
        code: 'unit-omitted',
        message: 'A unit lacked identity in the selected readable spaces.',
      });
      return [];
    }
    const id = `Unit/${u.UnitID}`;
    if (ids.has(id)) throw new Error(`Duplicate server unit ID ${u.UnitID}`);
    ids.add(id);
    preview.inventory.nodes.push({
      id,
      kind: 'Unit',
      name: u.Slug,
      details: {
        revision: u.HeadRevisionNum === undefined ? 'Not reported' : String(u.HeadRevisionNum),
      },
    });
    preview.inventory.edges.push({ from: `Space/${u.SpaceID}`, to: id, relation: 'contains' });
    links[id] = `/units/${encodeURIComponent(u.SpaceID)}/${encodeURIComponent(u.UnitID)}`;
    return [u];
  });
  for (const u of admitted)
    if (u.UpstreamUnitID) {
      if (ids.has(`Unit/${u.UpstreamUnitID}`))
        preview.inventory.edges.push({
          from: `Unit/${u.UnitID}`,
          to: `Unit/${u.UpstreamUnitID}`,
          relation: 'variantOf',
        });
      else
        preview.issues.push({
          severity: 'warning',
          code: 'upstream-omitted',
          message: `Upstream for ${u.Slug} is outside the readable component scope.`,
        });
    }
  preview.inventory.nodes.sort((a, b) => a.id.localeCompare(b.id));
  preview.inventory.edges.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { preview, links };
}
// A slug lookup is a candidate association, never proof of provenance/adoption.
export function matchProposedSpaces(
  preview: Preview,
  scope: ConnectedScope,
  spaces: HubSpace[],
) {
  return preview.proposal.nodes
    .filter((n) => n.kind === 'Space' && n.hub?.spaceSlug)
    .map((n) => {
      const matches = spaces.filter(
        ({ Space: s }) =>
          s?.Slug === n.hub!.spaceSlug &&
          s?.OrganizationID === scope.organizationId &&
          s?.ComponentID === scope.componentId &&
          s?.SpaceID,
      );
      return {
        name: n.name,
        state:
          matches.length === 1
            ? 'Candidate in selected component'
            : matches.length
              ? 'Ambiguous'
              : 'Not found in readable component',
        id: matches.length === 1 ? matches[0].Space!.SpaceID : undefined,
      };
    });
}
