// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The delivery graph: which Space is delivered by which resource in which
 * other Space. Pure (no React).
 *
 * A Space's Release is served as an OCI repository at
 * `oci://<registry>/space/<space slug>`. A GitOps controller's own resource
 * (an Argo CD Application, a Sveltos ClusterProfile, or the OCIRepository a
 * Flux Kustomization applies) names that address as its source, and that
 * resource is itself configuration held in a Unit of some Space. So the Unit's Space delivers the Space the
 * address names, and when the delivered Space holds such resources too the
 * result is a tree: Argo CD's "app of apps".
 *
 * Nothing stores these edges. They are read from the Resource entity, which the
 * server keeps in step with every Unit's configuration, so the graph is always
 * what the configuration says, including for resources nobody created with
 * `cub`.
 */

/** The resource types whose sources are read, as the Resource entity spells them. */
export const DELIVERY_RESOURCE_TYPES = [
  'argoproj.io/v1alpha1/Application',
  'source.toolkit.fluxcd.io/v1/OCIRepository',
  'source.toolkit.fluxcd.io/v1beta2/OCIRepository',
  'kustomize.toolkit.fluxcd.io/v1/Kustomization',
  'kustomize.toolkit.fluxcd.io/v1beta2/Kustomization',
  'config.projectsveltos.io/v1beta1/ClusterProfile',
  'config.projectsveltos.io/v1beta1/Profile',
] as const;

/** `where` selecting every resource that can deliver a Space. */
export const DELIVERY_RESOURCE_WHERE = `ResourceType IN (${DELIVERY_RESOURCE_TYPES.map((t) => `'${t}'`).join(', ')})`;

/** What a resource in a base holds where a clone gets its own value. */
const PLACEHOLDER = 'confighubplaceholder';

/** Argo CD's name for the cluster it runs in. */
const IN_CLUSTER_SERVER = 'https://kubernetes.default.svc';

const SPACE_PATH = '/space/';

const FLUX_SOURCE = 'source.toolkit.fluxcd.io/';
const FLUX_KUSTOMIZE = 'kustomize.toolkit.fluxcd.io/';

/**
 * The Space slug an OCI source names, or null when the URL is not a Space's
 * Release address. The slug is what follows the last `/space/`, without a
 * trailing `:tag` or `@digest`; it is a single path segment.
 *
 * The registry host is not checked. A cluster reaches the registry under an
 * address of its own (a local cluster through the Docker host, for one), so the
 * host a resource names need not be the one this page is served beside. A
 * resource pulling a Space of the same slug from another hub is therefore drawn
 * as delivering this organization's Space; its tooltip shows the full source.
 */
export function spaceSlugFromSourceUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith('oci://')) return null;
  const at = url.lastIndexOf(SPACE_PATH);
  if (at < 0) return null;
  let slug = url.slice(at + SPACE_PATH.length);
  const digest = slug.indexOf('@');
  if (digest >= 0) slug = slug.slice(0, digest);
  const tag = slug.indexOf(':');
  if (tag >= 0) slug = slug.slice(0, tag);
  if (slug === '' || slug.includes('/')) return null;
  return slug;
}

type Json = Record<string, unknown>;

function asObject(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** A short word for the kind of resource, for people. */
export function deliveryKindLabel(resourceType: string): string {
  if (resourceType.startsWith('argoproj.io/')) return 'Argo CD Application';
  if (resourceType.startsWith(FLUX_SOURCE)) return 'Flux OCIRepository';
  if (resourceType.startsWith(FLUX_KUSTOMIZE)) return 'Flux Kustomization';
  if (resourceType.startsWith('config.projectsveltos.io/')) {
    return resourceType.endsWith('/Profile') ? 'Sveltos Profile' : 'Sveltos ClusterProfile';
  }
  return resourceType;
}

/** The source URLs a delivering resource names, in the order it names them. */
export function sourceUrls(resourceType: string, data: unknown): string[] {
  const spec = asObject(asObject(data)?.spec);
  if (!spec) return [];
  const urls: unknown[] = [];
  if (resourceType.startsWith('argoproj.io/')) {
    urls.push(asObject(spec.source)?.repoURL);
    for (const source of asArray(spec.sources)) urls.push(asObject(source)?.repoURL);
  } else if (resourceType.startsWith(FLUX_SOURCE)) {
    urls.push(spec.url);
  } else if (resourceType.startsWith('config.projectsveltos.io/')) {
    for (const ref of [...asArray(spec.policyRefs), ...asArray(spec.kustomizationRefs)]) {
      urls.push(asObject(asObject(ref)?.remoteURL)?.url);
    }
  }
  return urls.filter((u): u is string => typeof u === 'string' && u !== '');
}

/**
 * Where a resource applies what it pulls, as "cluster spoke-1, namespace
 * payments", or undefined for a resource that does not say. It is an Argo CD
 * Application's `spec.destination`, without the cluster when that is the one
 * Argo CD runs in, and a Flux Kustomization's `spec.targetNamespace`.
 */
export function destinationLabel(resourceType: string, data: unknown): string | undefined {
  if (resourceType.startsWith(FLUX_KUSTOMIZE)) {
    const namespace = asString(asObject(asObject(data)?.spec)?.targetNamespace);
    return namespace ? `namespace ${namespace}` : undefined;
  }
  if (!resourceType.startsWith('argoproj.io/')) return undefined;
  const destination = asObject(asObject(asObject(data)?.spec)?.destination);
  if (!destination) return undefined;
  const server = asString(destination.server);
  const cluster = asString(destination.name) ?? (server && server !== IN_CLUSTER_SERVER ? server : undefined);
  const namespace = asString(destination.namespace);
  const parts = [cluster ? `cluster ${cluster}` : undefined, namespace ? `namespace ${namespace}` : undefined];
  return parts.filter(Boolean).join(', ') || undefined;
}

/** A Space, as far as the graph needs it. */
export interface DeliverySpace {
  spaceId: string;
  slug: string;
  releaseTargetId?: string | null;
  /** Slug of the Component the Space is a Variant of, when it is one. */
  componentSlug?: string;
  /** The Space's `Variant` label: its name among the Component's Variants. */
  variant?: string;
}

/** A resource that may deliver a Space: one row of the Resource entity. */
export interface DeliveryResource {
  resourceId: string;
  spaceId: string;
  unitId: string;
  unitSlug?: string;
  resourceType: string;
  /** `<namespace>/<name>`, as the Resource entity names a Kubernetes resource. */
  resourceName: string;
  data: unknown;
}

/** One resource delivering one Space. */
export interface Delivery {
  resourceId: string;
  /** The Space holding the delivering resource's Unit. */
  fromSpaceId: string;
  unitId: string;
  unitSlug?: string;
  kind: string;
  /** The resource's own name, without its namespace. */
  name: string;
  sourceUrl: string;
  /** The slug the source names. */
  toSlug: string;
  /** The Space of that slug, or undefined when there is none. */
  toSpaceId?: string;
  destination?: string;
  /**
   * The resources whose configuration is shown for it: the resource itself,
   * after the OCIRepository it applies when it is a Flux Kustomization.
   */
  documentIds: string[];
}

/** A node id for a slug that names no Space. */
export function missingNodeId(slug: string): string {
  return `missing:${slug}`;
}

export interface DeliveryNode {
  id: string;
  slug: string;
  /** Undefined for a slug a source names that no Space has. */
  space?: DeliverySpace;
  /** The deliveries of this Space by resources in other Spaces. */
  deliveredBy: Delivery[];
  /** The resource in this Space that delivers this Space itself: an app of apps' root. */
  root?: Delivery;
  /** Node ids this node is laid out above: Spaces its resources deliver, each under one parent. */
  children: string[];
  depth: number;
}

export interface DeliveryGraph {
  nodes: Map<string, DeliveryNode>;
  /** Ids of the nodes nothing else delivers, in slug order. */
  roots: string[];
  /** Every delivery from one Space to another, including those the tree does not lay out as parent and child. */
  deliveries: Delivery[];
  /** Spaces with a release Target that no resource delivers and that deliver nothing, in slug order. */
  undelivered: DeliverySpace[];
}

function shortName(resourceName: string): string {
  const slash = resourceName.lastIndexOf('/');
  return slash >= 0 ? resourceName.slice(slash + 1) : resourceName;
}

function namespaceOf(resourceName: string): string {
  const slash = resourceName.lastIndexOf('/');
  return slash >= 0 ? resourceName.slice(0, slash) : '';
}

/**
 * The OCIRepository a Flux Kustomization applies (`spec.sourceRef`), looked for
 * in the Kustomization's own Space, or undefined when it applies something
 * else. A `sourceRef` with no namespace names the Kustomization's.
 */
function repositoryOf(kustomization: DeliveryResource, repositories: ReadonlyMap<string, DeliveryResource>): DeliveryResource | undefined {
  const ref = asObject(asObject(asObject(kustomization.data)?.spec)?.sourceRef);
  const name = asString(ref?.name);
  if (!ref || ref.kind !== 'OCIRepository' || !name) return undefined;
  const namespace = asString(ref.namespace) ?? namespaceOf(kustomization.resourceName);
  return repositories.get(`${kustomization.spaceId} ${namespace}/${name}`);
}

/**
 * Every delivery the resources make. A resource naming two Spaces makes two.
 *
 * With Flux, the Kustomization is what deploys and the OCIRepository it applies
 * holds the address, so the delivery is the Kustomization's, with the
 * OCIRepository's source. An OCIRepository no Kustomization in its Space
 * applies is a delivery of its own.
 */
export function deliveriesOf(resources: readonly DeliveryResource[], spaces: readonly DeliverySpace[]): Delivery[] {
  const spaceIdBySlug = new Map(spaces.map((s) => [s.slug, s.spaceId]));
  const repositories = new Map<string, DeliveryResource>();
  for (const r of resources) if (r.resourceType.startsWith(FLUX_SOURCE)) repositories.set(`${r.spaceId} ${r.resourceName}`, r);
  const applied = new Set<string>();
  for (const r of resources) {
    const repository = r.resourceType.startsWith(FLUX_KUSTOMIZE) ? repositoryOf(r, repositories) : undefined;
    if (repository) applied.add(repository.resourceId);
  }
  const deliveries: Delivery[] = [];
  for (const resource of resources) {
    if (applied.has(resource.resourceId)) continue;
    const repository = resource.resourceType.startsWith(FLUX_KUSTOMIZE) ? repositoryOf(resource, repositories) : undefined;
    const source = repository ?? resource;
    const documentIds = repository ? [repository.resourceId, resource.resourceId] : [resource.resourceId];
    const seen = new Set<string>();
    for (const url of sourceUrls(source.resourceType, source.data)) {
      const toSlug = spaceSlugFromSourceUrl(url);
      if (!toSlug || toSlug === PLACEHOLDER || seen.has(toSlug)) continue;
      seen.add(toSlug);
      deliveries.push({
        resourceId: resource.resourceId,
        fromSpaceId: resource.spaceId,
        unitId: resource.unitId,
        unitSlug: resource.unitSlug,
        kind: deliveryKindLabel(resource.resourceType),
        name: shortName(resource.resourceName),
        sourceUrl: url,
        toSlug,
        toSpaceId: spaceIdBySlug.get(toSlug),
        destination: destinationLabel(resource.resourceType, resource.data),
        documentIds,
      });
    }
  }
  return deliveries;
}

/**
 * Build the graph. Each delivered Space is laid out under one parent, the first
 * in slug order that reaches it without a cycle; its other deliveries stay in
 * `deliveredBy`, so nothing is hidden when two Spaces deliver the same one.
 */
export function buildDeliveryGraph(
  resources: readonly DeliveryResource[],
  spaces: readonly DeliverySpace[],
): DeliveryGraph {
  const spaceById = new Map(spaces.map((s) => [s.spaceId, s]));
  const nodes = new Map<string, DeliveryNode>();
  const nodeFor = (id: string, slug: string, space?: DeliverySpace): DeliveryNode => {
    let node = nodes.get(id);
    if (!node) {
      node = { id, slug, space, deliveredBy: [], children: [], depth: 0 };
      nodes.set(id, node);
    }
    return node;
  };

  const all = deliveriesOf(resources, spaces);
  const deliveries: Delivery[] = [];
  const outgoing = new Map<string, Set<string>>();
  for (const delivery of all) {
    const fromSpace = spaceById.get(delivery.fromSpaceId);
    if (!fromSpace) continue;
    const from = nodeFor(fromSpace.spaceId, fromSpace.slug, fromSpace);
    if (delivery.toSpaceId === delivery.fromSpaceId) {
      from.root ??= delivery;
      continue;
    }
    const toId = delivery.toSpaceId ?? missingNodeId(delivery.toSlug);
    const to = nodeFor(toId, delivery.toSlug, delivery.toSpaceId ? spaceById.get(delivery.toSpaceId) : undefined);
    to.deliveredBy.push(delivery);
    deliveries.push(delivery);
    let targets = outgoing.get(from.id);
    if (!targets) outgoing.set(from.id, (targets = new Set()));
    targets.add(toId);
  }

  const bySlug = (a: string, b: string) => {
    const left = nodes.get(a)?.slug ?? a;
    const right = nodes.get(b)?.slug ?? b;
    return left < right ? -1 : left > right ? 1 : 0;
  };

  // Lay each node out under the first parent that reaches it, breadth first from the roots, so
  // a Space delivered at two depths sits at the shallower one. A cycle has no root of its own:
  // once everything reachable is placed, the first unplaced node in slug order starts a tree.
  const placed = new Set<string>();
  const roots: string[] = [];
  const place = (start: string[]) => {
    let frontier = start;
    while (frontier.length > 0) {
      const next: string[] = [];
      for (const id of frontier) {
        const node = nodes.get(id);
        if (!node) continue;
        for (const childId of [...(outgoing.get(id) ?? [])].sort(bySlug)) {
          if (placed.has(childId)) continue;
          placed.add(childId);
          const child = nodes.get(childId);
          if (!child) continue;
          child.depth = node.depth + 1;
          node.children.push(childId);
          next.push(childId);
        }
      }
      frontier = next;
    }
  };
  const ids = [...nodes.keys()].sort(bySlug);
  const top = ids.filter((id) => (nodes.get(id)?.deliveredBy.length ?? 0) === 0);
  for (const id of top) placed.add(id);
  roots.push(...top);
  place(top);
  for (const id of ids) {
    if (placed.has(id)) continue;
    placed.add(id);
    roots.push(id);
    place([id]);
  }

  const undelivered = spaces
    .filter((s) => s.releaseTargetId && !nodes.has(s.spaceId))
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

  return { nodes, roots, deliveries, undelivered };
}

/** The ids of every node below this one, at any depth. */
export function descendantIds(graph: DeliveryGraph, id: string): string[] {
  const ids: string[] = [];
  const below = [...(graph.nodes.get(id)?.children ?? [])];
  while (below.length > 0) {
    const next = below.pop() as string;
    ids.push(next);
    below.push(...(graph.nodes.get(next)?.children ?? []));
  }
  return ids;
}

/** Each node's parent in the tree, by the child's id. */
export function parentIds(graph: DeliveryGraph): Map<string, string> {
  const parentOf = new Map<string, string>();
  for (const node of graph.nodes.values()) for (const childId of node.children) parentOf.set(childId, node.id);
  return parentOf;
}

/** The given nodes and every node on their way up to a root, so that a match is shown in its place in the tree. */
export function withAncestors(graph: DeliveryGraph, ids: Iterable<string>): Set<string> {
  const parentOf = parentIds(graph);
  const kept = new Set<string>();
  for (const id of ids) {
    for (let at: string | undefined = id; at && !kept.has(at) && graph.nodes.has(at); at = parentOf.get(at)) kept.add(at);
  }
  return kept;
}

/** One row of the tree drawn as a list. */
export interface TreeRow {
  id: string;
  depth: number;
  /** Whether the row's children are drawn under it. */
  open: boolean;
}

/**
 * The tree as rows, top to bottom: each node, then its children when it is
 * open. With `only`, the rows are those nodes alone, each open, which is how a
 * search shows its matches under the Spaces that deliver them.
 */
export function treeRows(
  graph: DeliveryGraph,
  isOpen: (id: string) => boolean,
  only?: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const visit = (id: string) => {
    const node = graph.nodes.get(id);
    if (!node || (only && !only.has(id))) return;
    const open = only ? true : isOpen(id);
    rows.push({ id, depth: node.depth, open });
    if (open) node.children.forEach(visit);
  };
  graph.roots.forEach(visit);
  return rows;
}

/** The id of the node for the Space of this slug, or undefined when the graph has none. */
export function nodeIdOfSlug(graph: DeliveryGraph, slug: string): string | undefined {
  for (const node of graph.nodes.values()) if (node.slug === slug) return node.id;
  return undefined;
}

/** The GitOps page's address, focused on the Space of this slug. */
export function deliveryHref(slug: string): string {
  return `/gitops?space=${encodeURIComponent(slug)}`;
}

/** A Space with this many synced and healthy siblings that deliver nothing is drawn with them as one stack. */
export const STACK_FROM = 5;

/**
 * A Space's children as the tree draws them: `cards` one by one, and `stacked`
 * as a single card. The stackable children are stacked when there are at least
 * `from` of them, and otherwise every child is a card.
 */
export function stackChildren(
  children: readonly string[],
  stackable: (id: string) => boolean,
  from = STACK_FROM,
): { cards: string[]; stacked: string[] } {
  const stacked = children.filter(stackable);
  if (stacked.length < from) return { cards: [...children], stacked: [] };
  return { cards: children.filter((id) => !stackable(id)), stacked };
}

/** The trees that release to one Target. */
export interface DeliveryGroup {
  /** Undefined for trees in which no Space has a release Target. */
  targetId?: string;
  /** Ids of the trees' roots, in slug order. */
  roots: string[];
  /** Spaces released to the Target that no resource delivers and that deliver nothing. */
  undelivered: DeliverySpace[];
}

/**
 * The trees by the Target they release to: the release Target of a tree's root,
 * or of the first Space below it that has one. A Space released to a Target
 * with no tree is in no group.
 */
export function groupByTarget(graph: DeliveryGraph): DeliveryGroup[] {
  const groups = new Map<string, DeliveryGroup>();
  for (const rootId of graph.roots) {
    const ids = [rootId, ...treeRows({ ...graph, roots: [rootId] }, () => true).slice(1).map((row) => row.id)];
    const targetId = ids.map((id) => graph.nodes.get(id)?.space?.releaseTargetId).find(Boolean) ?? undefined;
    const key = targetId ?? '';
    let group = groups.get(key);
    if (!group) groups.set(key, (group = { targetId, roots: [], undelivered: [] }));
    group.roots.push(rootId);
  }
  for (const space of graph.undelivered) {
    if (space.releaseTargetId) groups.get(space.releaseTargetId)?.undelivered.push(space);
  }
  return [...groups.values()];
}
