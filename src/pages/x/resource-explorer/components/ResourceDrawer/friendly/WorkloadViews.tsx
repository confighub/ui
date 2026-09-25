// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Mono,
  Section,
  SelectorChips,
  UnknownRecord,
  asArray,
  asRecord,
  asScalar,
  asString,
  asStringMap,
  getPath,
} from './helpers';

/**
 * Friendly views for pod-based workloads. They differ only in their
 * top-of-spec fields (replicas/strategy vs schedule vs completions); the pod
 * template rendering (containers, volumes, scheduling) is shared.
 */

export function DeploymentView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  return (
    <>
      <Section title='Deployment'>
        <FieldList
          fields={[
            { label: 'Replicas', value: asScalar(spec?.replicas) },
            { label: 'Strategy', value: asScalar(getPath(spec, 'strategy', 'type')) },
            {
              label: 'Max Surge',
              value: asScalar(getPath(spec, 'strategy', 'rollingUpdate', 'maxSurge')),
            },
            {
              label: 'Max Unavailable',
              value: asScalar(getPath(spec, 'strategy', 'rollingUpdate', 'maxUnavailable')),
            },
            {
              label: 'Selector',
              value: selectorChips(getPath(spec, 'selector', 'matchLabels')),
            },
          ]}
        />
      </Section>
      <PodTemplateSections template={asRecord(spec?.template)} />
    </>
  );
}

export function StatefulSetView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const claims = asArray(spec?.volumeClaimTemplates);
  return (
    <>
      <Section title='StatefulSet'>
        <FieldList
          fields={[
            { label: 'Replicas', value: asScalar(spec?.replicas) },
            { label: 'Service Name', value: asScalar(spec?.serviceName) },
            {
              label: 'Update Strategy',
              value: asScalar(getPath(spec, 'updateStrategy', 'type')),
            },
            {
              label: 'Pod Management',
              value: asScalar(spec?.podManagementPolicy),
            },
            {
              label: 'Selector',
              value: selectorChips(getPath(spec, 'selector', 'matchLabels')),
            },
          ]}
        />
      </Section>
      {claims.length > 0 && (
        <Section title='Volume Claim Templates'>
          <MiniTable
            columns={['Name', 'Storage Class', 'Access Modes', 'Storage']}
            rows={claims.map((c) => {
              const claim = asRecord(c);
              const claimSpec = asRecord(claim?.spec);
              return [
                asScalar(getPath(claim, 'metadata', 'name')) ?? '',
                asScalar(claimSpec?.storageClassName) ?? '',
                asArray(claimSpec?.accessModes).map(asScalar).filter(Boolean).join(', '),
                asScalar(getPath(claimSpec, 'resources', 'requests', 'storage')) ?? '',
              ];
            })}
          />
        </Section>
      )}
      <PodTemplateSections template={asRecord(spec?.template)} />
    </>
  );
}

export function DaemonSetView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  return (
    <>
      <Section title='DaemonSet'>
        <FieldList
          fields={[
            {
              label: 'Update Strategy',
              value: asScalar(getPath(spec, 'updateStrategy', 'type')),
            },
            {
              label: 'Max Unavailable',
              value: asScalar(
                getPath(spec, 'updateStrategy', 'rollingUpdate', 'maxUnavailable'),
              ),
            },
            {
              label: 'Selector',
              value: selectorChips(getPath(spec, 'selector', 'matchLabels')),
            },
          ]}
        />
      </Section>
      <PodTemplateSections template={asRecord(spec?.template)} />
    </>
  );
}

export function JobView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  return (
    <>
      <Section title='Job'>
        <JobSpecFields spec={spec} />
      </Section>
      <PodTemplateSections template={asRecord(spec?.template)} />
    </>
  );
}

export function CronJobView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const jobSpec = asRecord(getPath(spec, 'jobTemplate', 'spec'));
  return (
    <>
      <Section title='CronJob'>
        <FieldList
          fields={[
            { label: 'Schedule', value: asScalar(spec?.schedule) },
            { label: 'Time Zone', value: asScalar(spec?.timeZone) },
            { label: 'Suspend', value: asScalar(spec?.suspend) },
            { label: 'Concurrency', value: asScalar(spec?.concurrencyPolicy) },
            {
              label: 'History Limits',
              value: historyLimits(spec),
            },
            {
              label: 'Starting Deadline',
              value: asScalar(spec?.startingDeadlineSeconds),
            },
          ]}
        />
      </Section>
      {jobSpec && (
        <Section title='Job Template'>
          <JobSpecFields spec={jobSpec} />
        </Section>
      )}
      <PodTemplateSections template={asRecord(jobSpec?.template)} />
    </>
  );
}

function JobSpecFields({ spec }: { spec: UnknownRecord | undefined }) {
  return (
    <FieldList
      fields={[
        { label: 'Completions', value: asScalar(spec?.completions) },
        { label: 'Parallelism', value: asScalar(spec?.parallelism) },
        { label: 'Backoff Limit', value: asScalar(spec?.backoffLimit) },
        { label: 'Active Deadline', value: asScalar(spec?.activeDeadlineSeconds) },
        { label: 'TTL After Finished', value: asScalar(spec?.ttlSecondsAfterFinished) },
      ]}
    />
  );
}

function historyLimits(spec: UnknownRecord | undefined): string | undefined {
  const ok = asScalar(spec?.successfulJobsHistoryLimit);
  const failed = asScalar(spec?.failedJobsHistoryLimit);
  if (ok === undefined && failed === undefined) return undefined;
  return `${ok ?? 'default'} successful / ${failed ?? 'default'} failed`;
}

function selectorChips(matchLabels: unknown) {
  const map = asStringMap(matchLabels);
  if (!map || Object.keys(map).length === 0) return undefined;
  return <SelectorChips map={map} />;
}

/**
 * Shared pod-template sections: containers (incl. init containers), volumes,
 * and scheduling/identity settings.
 */
function PodTemplateSections({ template }: { template: UnknownRecord | undefined }) {
  const podSpec = asRecord(template?.spec);
  if (!podSpec) return null;

  const initContainers = asArray(podSpec.initContainers);
  const containers = asArray(podSpec.containers);
  const volumes = asArray(podSpec.volumes);
  const nodeSelector = asStringMap(podSpec.nodeSelector);
  const tolerations = asArray(podSpec.tolerations);
  const imagePullSecrets = asArray(podSpec.imagePullSecrets)
    .map((s) => asScalar(getPath(s, 'name')))
    .filter((s): s is string => s !== undefined);

  return (
    <>
      {initContainers.length > 0 && (
        <Section title='Init Containers'>
          <ContainerTable containers={initContainers} />
        </Section>
      )}
      {containers.length > 0 && (
        <Section title='Containers'>
          <ContainerTable containers={containers} />
        </Section>
      )}
      {volumes.length > 0 && (
        <Section title='Volumes'>
          <MiniTable
            columns={['Name', 'Source']}
            rows={volumes.map((v) => {
              const vol = asRecord(v);
              return [asScalar(vol?.name) ?? '', volumeSource(vol)];
            })}
          />
        </Section>
      )}
      <Section title='Pod Settings'>
        <FieldList
          fields={[
            { label: 'Service Account', value: asScalar(podSpec.serviceAccountName) },
            { label: 'Restart Policy', value: asScalar(podSpec.restartPolicy) },
            { label: 'Priority Class', value: asScalar(podSpec.priorityClassName) },
            { label: 'Host Network', value: asScalar(podSpec.hostNetwork) },
            {
              label: 'Node Selector',
              value:
                nodeSelector && Object.keys(nodeSelector).length > 0 ? (
                  <SelectorChips map={nodeSelector} />
                ) : undefined,
            },
            {
              label: 'Tolerations',
              value: tolerations.length > 0 ? String(tolerations.length) : undefined,
            },
            {
              label: 'Image Pull Secrets',
              value: imagePullSecrets.length > 0 ? imagePullSecrets.join(', ') : undefined,
            },
          ]}
        />
      </Section>
    </>
  );
}

function ContainerTable({ containers }: { containers: unknown[] }) {
  return (
    <MiniTable
      columns={['Name', 'Image', 'Ports', 'CPU', 'Memory']}
      rows={containers.map((c) => {
        const container = asRecord(c);
        const ports = asArray(container?.ports)
          .map((p) => {
            const port = asRecord(p);
            const num = asScalar(port?.containerPort);
            const name = asString(port?.name);
            return name ? `${name}:${num ?? '?'}` : (num ?? '');
          })
          .filter(Boolean)
          .join(', ');
        return [
          asScalar(container?.name) ?? '',
          <Mono key='image'>{asScalar(container?.image) ?? ''}</Mono>,
          ports,
          resourceRange(container, 'cpu'),
          resourceRange(container, 'memory'),
        ];
      })}
    />
  );
}

/** "request → limit" for one resource name, omitting absent halves. */
function resourceRange(container: UnknownRecord | undefined, name: string): string {
  const request = asScalar(getPath(container, 'resources', 'requests', name));
  const limit = asScalar(getPath(container, 'resources', 'limits', name));
  if (request === undefined && limit === undefined) return '';
  if (request !== undefined && limit !== undefined) return `${request} → ${limit}`;
  return request !== undefined ? `${request} (req)` : `${limit} (limit)`;
}

function volumeSource(vol: UnknownRecord | undefined): string {
  if (!vol) return '';
  const name = asScalar(getPath(vol, 'configMap', 'name'));
  if (name !== undefined) return `ConfigMap ${name}`;
  const secret = asScalar(getPath(vol, 'secret', 'secretName'));
  if (secret !== undefined) return `Secret ${secret}`;
  const claim = asScalar(getPath(vol, 'persistentVolumeClaim', 'claimName'));
  if (claim !== undefined) return `PVC ${claim}`;
  if (asRecord(vol.emptyDir)) return 'EmptyDir';
  if (asRecord(vol.hostPath)) return `HostPath ${asScalar(getPath(vol, 'hostPath', 'path')) ?? ''}`;
  if (asRecord(vol.projected)) return 'Projected';
  if (asRecord(vol.downwardAPI)) return 'Downward API';
  // Unknown source type: show the first key that isn't `name`.
  const key = Object.keys(vol).find((k) => k !== 'name');
  return key ?? '';
}
