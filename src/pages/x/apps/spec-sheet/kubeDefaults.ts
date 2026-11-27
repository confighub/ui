// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// The Kubernetes default of a field, where it has a fixed one, and which values of the sheet are
// quiet: the value is that default and nothing happened to it. A quiet default is not drawn on
// its line. One that belongs to a value (an image's pull policy, a port's protocol, a probe's
// timings) is said in that value's hover card; the rest fold into one line at the end of their
// section. Pure: the sheet reads it once per render.
import { parseImageRef } from '../imageRef';
import { fieldHasState } from './shapes/optionalMark';
import type { AtomOrigin } from './sheetOrigin';
import type { SheetOverlay } from './sheetOverlay';
import type { SheetAtom, SpecSheet } from './specSheetModel';

type Seg = string | number;

/** A field's Kubernetes default. */
export interface KubeDefault {
  /** The default as the sheet writes it: `{}` for an empty map, `null` for null. */
  text: string;
  /** The path of the value it belongs to, whose hover card says it. Absent: it stands alone. */
  host?: string;
  /** Its word in the host's card, as the shape writes it on the line. */
  label: string;
  /** Text after the value, as the shape writes it (`s` after seconds). */
  unit?: string;
  /**
   * The fields drawn as one column of a table (a probe timing): when one of them is on the line,
   * the others in the same table are too, so no cell of the column is left as a "not set" dash.
   */
  column?: string;
  /** Its place among the defaults of its host's card: a probe's timings in the table's order. */
  order?: number;
}

/** The kinds whose Pod is at `spec.template.spec`. */
const TEMPLATE_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
  'Job',
]);
/** The kinds whose Pods restart `Always` by default; a Job's Pods have no default. */
const RESTART_ALWAYS_KINDS = new Set([
  'Pod',
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
]);

const PROBES = new Set(['livenessProbe', 'readinessProbe', 'startupProbe']);
/** A probe's timings with a default: the default, and the word of its column in the probe table. */
const PROBE_TIMINGS: Record<
  string,
  { text: string; label: string; unit?: string; order: number }
> = {
  periodSeconds: { text: '10', label: 'period', unit: 's', order: 0 },
  timeoutSeconds: { text: '1', label: 'timeout', unit: 's', order: 1 },
  failureThreshold: { text: '3', label: 'failures', order: 2 },
  successThreshold: { text: '1', label: 'successes', order: 3 },
};
/** Where a probe's check is drawn, in the order the probe's card looks for its host. */
const PROBE_CHECKS = [
  'httpGet.path',
  'httpGet.port',
  'tcpSocket.port',
  'grpc.port',
  'exec.command.0',
];

/** The pod spec's segments for a kind: `spec.template.spec` for a Deployment. */
function podSpecOf(kind: string | undefined): Seg[] | undefined {
  if (kind === 'Pod') return ['spec'];
  if (kind && TEMPLATE_KINDS.has(kind)) return ['spec', 'template', 'spec'];
  if (kind === 'CronJob') return ['spec', 'jobTemplate', 'spec', 'template', 'spec'];
  return undefined;
}

function startsWith(s: readonly Seg[], prefix: readonly Seg[]): boolean {
  return prefix.every((p, i) => s[i] === p);
}

const join = (s: readonly Seg[]) => s.join('.');

/**
 * The default `imagePullPolicy` of an image: `Always` for the image tag `latest`, or for no image
 * tag and no digest (Kubernetes reads that as `latest`); `IfNotPresent` for any other image tag,
 * or a digest alone.
 */
export function defaultPullPolicy(image: unknown): string | undefined {
  if (typeof image !== 'string' || !image) return undefined;
  const ref = parseImageRef(image);
  if (!ref) return undefined;
  return ref.tag === 'latest' || (!ref.tag && !ref.digest) ? 'Always' : 'IfNotPresent';
}

/**
 * The Kubernetes default of the field at `segments` in a resource of `kind`, or undefined when
 * it has no fixed one. `valueAt` reads another field of the same resource by its bare path.
 */
export function kubeDefaultOf(
  kind: string | undefined,
  segments: readonly Seg[],
  valueAt: (path: string) => unknown,
): KubeDefault | undefined {
  const last = segments[segments.length - 1];
  // `creationTimestamp: null` is not a default: it is the empty time kubectl writes, and it has
  // no effect, so it folds with them.
  if (last === 'creationTimestamp' && segments[segments.length - 2] === 'metadata') {
    return { text: 'null', label: 'creationTimestamp' };
  }
  if (kind === 'Deployment') {
    const deployment: Record<string, string> = {
      'spec.revisionHistoryLimit': '10',
      'spec.progressDeadlineSeconds': '600',
      'spec.strategy.type': 'RollingUpdate',
      'spec.strategy.rollingUpdate.maxSurge': '25%',
      'spec.strategy.rollingUpdate.maxUnavailable': '25%',
    };
    const text = deployment[join(segments)];
    if (text !== undefined) return { text, label: String(last) };
  }
  if (kind === 'Service') return serviceDefault(segments, valueAt);
  const pod = podSpecOf(kind);
  if (!pod || !startsWith(segments, pod)) return undefined;
  const rest = segments.slice(pod.length);
  if (rest.length === 1) {
    const podDefaults: Record<string, string> = {
      dnsPolicy: 'ClusterFirst',
      schedulerName: 'default-scheduler',
      terminationGracePeriodSeconds: '30',
      securityContext: '{}',
    };
    if (rest[0] === 'restartPolicy') {
      return kind && RESTART_ALWAYS_KINDS.has(kind)
        ? { text: 'Always', label: 'restartPolicy' }
        : undefined;
    }
    const text = podDefaults[String(rest[0])];
    return text === undefined ? undefined : { text, label: String(rest[0]) };
  }
  if (
    rest[0] === 'volumes' &&
    typeof rest[1] === 'number' &&
    rest.length === 4 &&
    rest[3] === 'defaultMode'
  ) {
    const source = String(rest[2]);
    if (!['configMap', 'secret', 'projected', 'downwardAPI'].includes(source))
      return undefined;
    const name =
      source === 'configMap' ? 'name' : source === 'secret' ? 'secretName' : undefined;
    return {
      text: '420',
      label: 'defaultMode',
      host: name ? join([...pod, ...rest.slice(0, 3), name]) : undefined,
    };
  }
  if (
    (rest[0] === 'containers' || rest[0] === 'initContainers') &&
    typeof rest[1] === 'number'
  ) {
    return containerDefault([...pod, ...rest.slice(0, 2)], rest.slice(2), valueAt);
  }
  return undefined;
}

function containerDefault(
  base: readonly Seg[],
  rest: readonly Seg[],
  valueAt: (path: string) => unknown,
): KubeDefault | undefined {
  const at = (...s: Seg[]) => join([...base, ...s]);
  const field = join(rest);
  if (field === 'imagePullPolicy') {
    const text = defaultPullPolicy(valueAt(at('image')));
    return text ? { text, label: 'pull', host: at('image') } : undefined;
  }
  if (field === 'terminationMessagePath')
    return { text: '/dev/termination-log', label: field };
  if (field === 'terminationMessagePolicy') return { text: 'File', label: field };
  if (
    rest[0] === 'ports' &&
    typeof rest[1] === 'number' &&
    rest[2] === 'protocol' &&
    rest.length === 3
  ) {
    return { text: 'TCP', label: 'protocol', host: at('ports', rest[1], 'containerPort') };
  }
  if (
    rest[0] === 'env' &&
    typeof rest[1] === 'number' &&
    join(rest.slice(2)) === 'valueFrom.fieldRef.apiVersion'
  ) {
    return {
      text: 'v1',
      label: 'apiVersion',
      host: at('env', rest[1], 'valueFrom', 'fieldRef', 'fieldPath'),
    };
  }
  const probe = String(rest[0]);
  if (!PROBES.has(probe)) return undefined;
  const checkHost = () => {
    const found = PROBE_CHECKS.map((c) => at(probe, c)).find((p) => valueAt(p) !== undefined);
    return found;
  };
  if (rest.length === 2) {
    const timing = PROBE_TIMINGS[String(rest[1])];
    if (!timing) return undefined;
    return { ...timing, host: checkHost(), column: String(rest[1]) };
  }
  if (join(rest.slice(1)) === 'httpGet.scheme') {
    const path = at(probe, 'httpGet', 'path');
    return {
      text: 'HTTP',
      label: 'scheme',
      host: valueAt(path) !== undefined ? path : at(probe, 'httpGet', 'port'),
      order: 4,
    };
  }
  return undefined;
}

function serviceDefault(
  segments: readonly Seg[],
  valueAt: (path: string) => unknown,
): KubeDefault | undefined {
  const field = join(segments);
  // `type` stays on the line though ClusterIP is its default: it says what the Service is.
  // `ipFamilies` is set by the cluster's network, so it is not a fixed default.
  const service: Record<string, string> = {
    'spec.sessionAffinity': 'None',
    'spec.internalTrafficPolicy': 'Cluster',
    'spec.ipFamilyPolicy': 'SingleStack',
  };
  if (service[field] !== undefined)
    return { text: service[field], label: String(segments[1]) };
  if (
    segments[0] === 'spec' &&
    segments[1] === 'ports' &&
    typeof segments[2] === 'number' &&
    segments.length === 4
  ) {
    const port = join(['spec', 'ports', segments[2], 'port']);
    if (segments[3] === 'protocol') return { text: 'TCP', label: 'protocol', host: port };
    if (segments[3] === 'targetPort') {
      const value = valueAt(port);
      return value === undefined
        ? undefined
        : { text: String(value), label: 'targetPort', host: port };
    }
  }
  return undefined;
}

/** Whether the atom holds its default. */
export function holdsDefault(
  atom: Pick<SheetAtom, 'value' | 'emptyContainer'>,
  d: KubeDefault,
): boolean {
  if (d.text === '{}') return atom.emptyContainer === 'map';
  if (atom.emptyContainer) return false;
  return String(atom.value) === d.text;
}

/** A field of the sheet with a Kubernetes default, and whether it holds it. */
export interface DefaultField {
  atom: SheetAtom;
  def: KubeDefault;
  isDefault: boolean;
  /** The stage key of the value whose card says it, when that value is in the sheet. */
  hostKey?: string;
}

/** Every field of the sheet that has a Kubernetes default, by stage key. It depends on the data only. */
export function defaultFieldsOf(sheet: SpecSheet): Map<string, DefaultField> {
  const out = new Map<string, DefaultField>();
  for (const resource of sheet.resources) {
    const blocks = resource.parts.flatMap((p) => p.blocks);
    const byPath = new Map(blocks.flatMap((b) => b.atoms).map((a) => [a.path, a] as const));
    const valueAt = (path: string) => byPath.get(path)?.value;
    for (const block of blocks) {
      for (const atom of block.atoms) {
        const def = kubeDefaultOf(resource.kind, atom.segments, valueAt);
        if (!def) continue;
        out.set(atom.key, {
          atom,
          // A table is one block: its columns are the block's.
          def: def.column ? { ...def, column: `${block.id}|${def.column}` } : def,
          isDefault: holdsDefault(atom, def),
          hostKey: def.host ? byPath.get(def.host)?.key : undefined,
        });
      }
    }
  }
  return out;
}

/** What the sheet draws of the defaults now. */
export interface QuietDefaults {
  /** Every field with a Kubernetes default, quiet or not, by stage key. */
  fields: ReadonlyMap<string, DefaultField>;
  /** Stage keys of the quiet defaults said in a value's card: never on the line while quiet. */
  hosted: ReadonlySet<string>;
  /** Stage keys of the quiet defaults that stand alone: in the fold line of their section. */
  alone: ReadonlySet<string>;
  /** A value's stage key → the quiet defaults its card says, in document order. */
  byHost: ReadonlyMap<string, DefaultField[]>;
}

export const NO_QUIET_DEFAULTS: QuietDefaults = {
  fields: new Map(),
  hosted: new Set(),
  alone: new Set(),
  byHost: new Map(),
};

const upstreamKinds: ReadonlySet<AtomOrigin['kind']> = new Set(['inherited', 'link']);

/**
 * Which defaults are quiet. A default is on the line when something happened to it (its editor
 * is open, it is staged or kept on merge, Stale, Unreleased or incoming), or when this Unit set
 * it in a resource that comes from upstream: a Variant that set a value back to the default. In
 * a Unit with no upstream every value is "Set in this Unit", so that alone does not count. A
 * search shows every field, so nothing is quiet while one is typed.
 */
export function quietDefaultsOf(
  fields: ReadonlyMap<string, DefaultField>,
  sheet: SpecSheet,
  overlay: SheetOverlay,
  searching: boolean,
): QuietDefaults {
  if (searching || fields.size === 0) return { ...NO_QUIET_DEFAULTS, fields };
  const origins = overlay.origins;
  const fromUpstream = new Set<number>();
  if (origins) {
    for (const a of sheet.atoms) {
      const kind = origins.get(a.key)?.kind;
      if (kind && upstreamKinds.has(kind)) fromUpstream.add(a.resource);
    }
  }
  const quiet = new Set<string>();
  for (const [key, f] of fields) {
    if (!f.isDefault || fieldHasState(overlay, f.atom)) continue;
    if (fromUpstream.has(f.atom.resource) && origins?.get(key)?.kind === 'here') continue;
    quiet.add(key);
  }
  // A table column comes back whole.
  const loud = new Set<string>();
  for (const [key, f] of fields) if (f.def.column && !quiet.has(key)) loud.add(f.def.column);
  for (const [key, f] of fields) if (f.def.column && loud.has(f.def.column)) quiet.delete(key);

  const hosted = new Set<string>();
  const alone = new Set<string>();
  const byHost = new Map<string, DefaultField[]>();
  for (const key of quiet) {
    const f = fields.get(key)!;
    // A host that is itself quiet, or not in the sheet, cannot say it: it folds.
    if (f.hostKey && !quiet.has(f.hostKey)) {
      hosted.add(key);
      const list = byHost.get(f.hostKey) ?? [];
      list.push(f);
      byHost.set(f.hostKey, list);
    } else {
      alone.add(key);
    }
  }
  for (const list of byHost.values())
    list.sort((a, b) => (a.def.order ?? 0) - (b.def.order ?? 0));
  return { fields, hosted, alone, byHost };
}
