// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { useState } from 'react';

import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import Button from '@mui/material/Button';

import {
  CollapsibleValue,
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  SelectorChips,
  asArray,
  asRecord,
  asScalar,
  asStringMap,
  getPath,
} from './helpers';

export function NamespaceView({ doc }: FriendlyViewProps) {
  const finalizers = asArray(getPath(doc, 'spec', 'finalizers'))
    .map(asScalar)
    .filter((s): s is string => s !== undefined);
  if (finalizers.length === 0) {
    return <EmptyHint text='Namespaces carry no spec beyond their metadata.' />;
  }
  return (
    <Section title='Namespace'>
      <FieldList fields={[{ label: 'Finalizers', value: finalizers.join(', ') }]} />
    </Section>
  );
}

export function ServiceView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const selector = asStringMap(spec?.selector);
  const ports = asArray(spec?.ports);
  return (
    <>
      <Section title='Service'>
        <FieldList
          fields={[
            { label: 'Type', value: asScalar(spec?.type) ?? 'ClusterIP' },
            { label: 'Cluster IP', value: asScalar(spec?.clusterIP) },
            { label: 'External Name', value: asScalar(spec?.externalName) },
            { label: 'Load Balancer IP', value: asScalar(spec?.loadBalancerIP) },
            { label: 'Session Affinity', value: asScalar(spec?.sessionAffinity) },
            {
              label: 'Selector',
              value:
                selector && Object.keys(selector).length > 0 ? (
                  <SelectorChips map={selector} />
                ) : undefined,
            },
          ]}
        />
      </Section>
      {ports.length > 0 && (
        <Section title='Ports'>
          <MiniTable
            columns={['Name', 'Port', 'Target Port', 'Protocol', 'Node Port']}
            rows={ports.map((p) => {
              const port = asRecord(p);
              return [
                asScalar(port?.name) ?? '',
                asScalar(port?.port) ?? '',
                asScalar(port?.targetPort) ?? '',
                asScalar(port?.protocol) ?? 'TCP',
                asScalar(port?.nodePort) ?? '',
              ];
            })}
          />
        </Section>
      )}
    </>
  );
}

export function ConfigMapView({ doc }: FriendlyViewProps) {
  const data = asStringMap(doc.data) ?? {};
  const binaryKeys = Object.keys(asRecord(doc.binaryData) ?? {});
  const immutable = asScalar(doc.immutable);
  const hasContent = Object.keys(data).length > 0 || binaryKeys.length > 0;
  return (
    <>
      {immutable !== undefined && (
        <Section title='ConfigMap'>
          <FieldList fields={[{ label: 'Immutable', value: immutable }]} />
        </Section>
      )}
      <Section title='Data'>
        {!hasContent && <EmptyHint text='No data entries.' />}
        {Object.entries(data).map(([k, v]) => (
          <CollapsibleValue key={k} title={k} text={v} />
        ))}
        {binaryKeys.length > 0 && (
          <FieldList
            fields={[{ label: 'Binary Keys', value: binaryKeys.join(', ') }]}
          />
        )}
      </Section>
    </>
  );
}

/**
 * Secrets are desired state stored in ConfigHub, so the values are present in
 * the document — but we keep them hidden until the user explicitly reveals
 * them, mirroring the caution of `kubectl get secret -o yaml` vs dashboards.
 */
export function SecretView({ doc }: FriendlyViewProps) {
  const [revealed, setRevealed] = useState(false);
  const data = asStringMap(doc.data) ?? {};
  const stringData = asStringMap(doc.stringData) ?? {};
  const keys = [...Object.keys(data), ...Object.keys(stringData)];
  return (
    <>
      <Section title='Secret'>
        <FieldList
          fields={[
            { label: 'Type', value: asScalar(doc.type) ?? 'Opaque' },
            { label: 'Immutable', value: asScalar(doc.immutable) },
            { label: 'Keys', value: keys.length > 0 ? keys.join(', ') : undefined },
          ]}
        />
      </Section>
      {keys.length > 0 && (
        <Section title='Values'>
          <Button
            size='small'
            variant='outlined'
            startIcon={revealed ? <VisibilityOffIcon /> : <VisibilityIcon />}
            onClick={() => setRevealed((r) => !r)}
            sx={{ mb: 1 }}
          >
            {revealed ? 'Hide values' : 'Reveal values'}
          </Button>
          {revealed && (
            <>
              {Object.entries(data).map(([k, v]) => (
                <CollapsibleValue key={k} title={k} text={tryBase64Decode(v)} />
              ))}
              {Object.entries(stringData).map(([k, v]) => (
                <CollapsibleValue key={`string:${k}`} title={k} text={v} />
              ))}
            </>
          )}
        </Section>
      )}
    </>
  );
}

/** Decode a base64 secret value, falling back to the raw text if not valid base64. */
function tryBase64Decode(value: string): string {
  try {
    const decoded = atob(value);
    // Binary payloads decode but aren't printable; keep base64 for those.
    for (const ch of decoded) {
      const code = ch.charCodeAt(0);
      const isControl = code < 32 && code !== 9 && code !== 10 && code !== 13;
      if (isControl) return value;
    }
    return decoded;
  } catch {
    return value;
  }
}

export function ServiceAccountView({ doc }: FriendlyViewProps) {
  const imagePullSecrets = asArray(doc.imagePullSecrets)
    .map((s) => asScalar(getPath(s, 'name')))
    .filter((s): s is string => s !== undefined);
  const secrets = asArray(doc.secrets)
    .map((s) => asScalar(getPath(s, 'name')))
    .filter((s): s is string => s !== undefined);
  const automount = asScalar(doc.automountServiceAccountToken);
  if (imagePullSecrets.length === 0 && secrets.length === 0 && automount === undefined) {
    return <EmptyHint text='This ServiceAccount has no settings beyond its metadata.' />;
  }
  return (
    <Section title='Service Account'>
      <FieldList
        fields={[
          { label: 'Automount Token', value: automount },
          {
            label: 'Image Pull Secrets',
            value: imagePullSecrets.length > 0 ? imagePullSecrets.join(', ') : undefined,
          },
          { label: 'Secrets', value: secrets.length > 0 ? secrets.join(', ') : undefined },
        ]}
      />
    </Section>
  );
}

export function PersistentVolumeClaimView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  return (
    <Section title='Persistent Volume Claim'>
      <FieldList
        fields={[
          { label: 'Storage Class', value: asScalar(spec?.storageClassName) },
          {
            label: 'Access Modes',
            value: asArray(spec?.accessModes).map(asScalar).filter(Boolean).join(', '),
          },
          {
            label: 'Requested Storage',
            value: asScalar(getPath(spec, 'resources', 'requests', 'storage')),
          },
          { label: 'Volume Mode', value: asScalar(spec?.volumeMode) },
          { label: 'Volume Name', value: asScalar(spec?.volumeName) },
        ]}
      />
    </Section>
  );
}

export function HorizontalPodAutoscalerView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const target = asRecord(spec?.scaleTargetRef);
  const metrics = asArray(spec?.metrics);
  return (
    <>
      <Section title='Autoscaler'>
        <FieldList
          fields={[
            {
              label: 'Target',
              value: target
                ? `${asScalar(target.kind) ?? ''} ${asScalar(target.name) ?? ''}`.trim()
                : undefined,
            },
            { label: 'Min Replicas', value: asScalar(spec?.minReplicas) },
            { label: 'Max Replicas', value: asScalar(spec?.maxReplicas) },
          ]}
        />
      </Section>
      {metrics.length > 0 && (
        <Section title='Metrics'>
          <MiniTable
            columns={['Type', 'Metric', 'Target']}
            rows={metrics.map((m) => {
              const metric = asRecord(m);
              const type = asScalar(metric?.type) ?? '';
              // The detail object key matches the lowercased type
              // (resource/pods/object/external/containerResource).
              const detail = asRecord(
                metric?.[type.charAt(0).toLowerCase() + type.slice(1)],
              );
              const name = asScalar(detail?.name) ?? asScalar(getPath(detail, 'metric', 'name')) ?? '';
              const targetSpec = asRecord(detail?.target);
              const targetValue =
                asScalar(targetSpec?.averageUtilization) !== undefined
                  ? `${asScalar(targetSpec?.averageUtilization)}%`
                  : (asScalar(targetSpec?.averageValue) ?? asScalar(targetSpec?.value) ?? '');
              return [type, name, targetValue];
            })}
          />
        </Section>
      )}
    </>
  );
}
