// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  SelectorChips,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
  asStringMap,
  getPath,
} from './helpers';

export function IngressView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const rules = asArray(spec?.rules);
  const tls = asArray(spec?.tls);
  const defaultBackend = backendLabel(asRecord(spec?.defaultBackend));

  // Flatten host × path into one row per path so the table reads like the
  // routing decisions the controller will actually make.
  const pathRows: string[][] = [];
  for (const r of rules) {
    const rule = asRecord(r);
    const host = asScalar(rule?.host) ?? '*';
    const paths = asArray(getPath(rule, 'http', 'paths'));
    for (const p of paths) {
      const path = asRecord(p);
      pathRows.push([
        host,
        asScalar(path?.path) ?? '/',
        asScalar(path?.pathType) ?? '',
        backendLabel(asRecord(path?.backend)),
      ]);
    }
  }

  return (
    <>
      <Section title='Ingress'>
        <FieldList
          fields={[
            { label: 'Ingress Class', value: asScalar(spec?.ingressClassName) },
            { label: 'Default Backend', value: defaultBackend || undefined },
          ]}
        />
      </Section>
      <Section title='Routing'>
        {pathRows.length === 0 && <EmptyHint text='No HTTP rules defined.' />}
        <MiniTable columns={['Host', 'Path', 'Path Type', 'Backend']} rows={pathRows} />
      </Section>
      {tls.length > 0 && (
        <Section title='TLS'>
          <MiniTable
            columns={['Hosts', 'Secret']}
            rows={tls.map((t) => {
              const entry = asRecord(t);
              return [
                asStringArray(entry?.hosts).join(', '),
                asScalar(entry?.secretName) ?? '',
              ];
            })}
          />
        </Section>
      )}
    </>
  );
}

/** "service-name:port" for an IngressBackend. */
function backendLabel(backend: Record<string, unknown> | undefined): string {
  const service = asRecord(backend?.service);
  if (!service) return '';
  const name = asScalar(service.name) ?? '';
  const port =
    asScalar(getPath(service, 'port', 'number')) ??
    asScalar(getPath(service, 'port', 'name')) ??
    '';
  return port ? `${name}:${port}` : name;
}

export function NetworkPolicyView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const podSelector = asStringMap(getPath(spec, 'podSelector', 'matchLabels'));
  const policyTypes = asStringArray(spec?.policyTypes);
  const ingress = asArray(spec?.ingress);
  const egress = asArray(spec?.egress);

  return (
    <>
      <Section title='Network Policy'>
        <FieldList
          fields={[
            {
              label: 'Pod Selector',
              value:
                podSelector && Object.keys(podSelector).length > 0 ? (
                  <SelectorChips map={podSelector} />
                ) : (
                  'all pods in namespace'
                ),
            },
            {
              label: 'Policy Types',
              value: policyTypes.length > 0 ? policyTypes.join(', ') : undefined,
            },
          ]}
        />
      </Section>
      {ingress.length > 0 && (
        <Section title='Ingress Rules'>
          <MiniTable
            columns={['From', 'Ports']}
            rows={ingress.map((r) => {
              const rule = asRecord(r);
              return [
                peerSummary(asArray(rule?.from)),
                portSummary(asArray(rule?.ports)),
              ];
            })}
          />
        </Section>
      )}
      {egress.length > 0 && (
        <Section title='Egress Rules'>
          <MiniTable
            columns={['To', 'Ports']}
            rows={egress.map((r) => {
              const rule = asRecord(r);
              return [peerSummary(asArray(rule?.to)), portSummary(asArray(rule?.ports))];
            })}
          />
        </Section>
      )}
    </>
  );
}

function peerSummary(peers: unknown[]): string {
  if (peers.length === 0) return 'any';
  return peers
    .map((p) => {
      const peer = asRecord(p);
      const cidr = asScalar(getPath(peer, 'ipBlock', 'cidr'));
      if (cidr !== undefined) return `cidr ${cidr}`;
      const parts: string[] = [];
      const ns = asStringMap(getPath(peer, 'namespaceSelector', 'matchLabels'));
      if (ns) parts.push(`ns(${mapSummary(ns)})`);
      const pod = asStringMap(getPath(peer, 'podSelector', 'matchLabels'));
      if (pod) parts.push(`pods(${mapSummary(pod)})`);
      return parts.join(' ') || 'any';
    })
    .join('; ');
}

function mapSummary(map: Record<string, string>): string {
  const entries = Object.entries(map);
  if (entries.length === 0) return 'all';
  return entries.map(([k, v]) => `${k}=${v}`).join(',');
}

function portSummary(ports: unknown[]): string {
  if (ports.length === 0) return 'all';
  return ports
    .map((p) => {
      const port = asRecord(p);
      const num = asScalar(port?.port) ?? '';
      const end = asScalar(port?.endPort);
      const protocol = asScalar(port?.protocol) ?? 'TCP';
      return end !== undefined ? `${protocol}/${num}-${end}` : `${protocol}/${num}`;
    })
    .join(', ');
}
