// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  ChipList,
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  UnknownRecord,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
  getPath,
} from './helpers';

/** cert-manager.io Certificate. */
export function CertificateView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const issuerRef = asRecord(spec?.issuerRef);
  const dnsNames = asStringArray(spec?.dnsNames);
  const ipAddresses = asStringArray(spec?.ipAddresses);
  const uris = asStringArray(spec?.uris);
  const usages = asStringArray(spec?.usages);
  const privateKey = asRecord(spec?.privateKey);

  return (
    <>
      <Section title='Certificate'>
        <FieldList
          fields={[
            { label: 'Secret Name', value: asScalar(spec?.secretName) },
            {
              label: 'Issuer',
              value: issuerRef
                ? `${asScalar(issuerRef.kind) ?? 'Issuer'} ${asScalar(issuerRef.name) ?? ''}`.trim()
                : undefined,
            },
            { label: 'Common Name', value: asScalar(spec?.commonName) },
            { label: 'Duration', value: asScalar(spec?.duration) },
            { label: 'Renew Before', value: asScalar(spec?.renewBefore) },
            { label: 'Is CA', value: asScalar(spec?.isCA) },
            {
              label: 'Revision Limit',
              value: asScalar(spec?.revisionHistoryLimit),
            },
          ]}
        />
      </Section>
      {dnsNames.length > 0 && (
        <Section title='DNS Names'>
          <ChipList items={dnsNames} />
        </Section>
      )}
      {(ipAddresses.length > 0 || uris.length > 0) && (
        <Section title='Other Subjects'>
          <FieldList
            fields={[
              {
                label: 'IP Addresses',
                value: ipAddresses.length > 0 ? ipAddresses.join(', ') : undefined,
              },
              { label: 'URIs', value: uris.length > 0 ? uris.join(', ') : undefined },
            ]}
          />
        </Section>
      )}
      {(usages.length > 0 || privateKey) && (
        <Section title='Key'>
          <FieldList
            fields={[
              { label: 'Usages', value: usages.length > 0 ? usages.join(', ') : undefined },
              { label: 'Algorithm', value: asScalar(privateKey?.algorithm) },
              { label: 'Size', value: asScalar(privateKey?.size) },
              { label: 'Rotation Policy', value: asScalar(privateKey?.rotationPolicy) },
              { label: 'Encoding', value: asScalar(privateKey?.encoding) },
            ]}
          />
        </Section>
      )}
    </>
  );
}

/** cert-manager.io Issuer / ClusterIssuer: summarize whichever backend is set. */
export function IssuerView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  if (!spec) return <EmptyHint text='No issuer spec found.' />;

  const acme = asRecord(spec.acme);
  if (acme) return <AcmeIssuerSections acme={acme} />;

  const ca = asRecord(spec.ca);
  if (ca) {
    return (
      <Section title='CA Issuer'>
        <FieldList
          fields={[
            { label: 'Secret Name', value: asScalar(ca.secretName) },
            {
              label: 'CRL Distribution',
              value: asStringArray(ca.crlDistributionPoints).join(', ') || undefined,
            },
          ]}
        />
      </Section>
    );
  }

  if (asRecord(spec.selfSigned)) {
    return (
      <Section title='Self-Signed Issuer'>
        <EmptyHint text='Issues self-signed certificates; no further configuration.' />
      </Section>
    );
  }

  const vault = asRecord(spec.vault);
  if (vault) {
    return (
      <Section title='Vault Issuer'>
        <FieldList
          fields={[
            { label: 'Server', value: asScalar(vault.server) },
            { label: 'Path', value: asScalar(vault.path) },
            { label: 'Namespace', value: asScalar(vault.namespace) },
          ]}
        />
      </Section>
    );
  }

  const venafi = asRecord(spec.venafi);
  if (venafi) {
    return (
      <Section title='Venafi Issuer'>
        <FieldList fields={[{ label: 'Zone', value: asScalar(venafi.zone) }]} />
      </Section>
    );
  }

  return <EmptyHint text='Unrecognized issuer backend.' />;
}

function AcmeIssuerSections({ acme }: { acme: UnknownRecord }) {
  const solvers = asArray(acme.solvers);
  return (
    <>
      <Section title='ACME Issuer'>
        <FieldList
          fields={[
            { label: 'Server', value: asScalar(acme.server) },
            { label: 'Email', value: asScalar(acme.email) },
            {
              label: 'Account Secret',
              value: asScalar(getPath(acme, 'privateKeySecretRef', 'name')),
            },
            {
              label: 'Skip TLS Verify',
              value: asScalar(acme.skipTLSVerify),
            },
          ]}
        />
      </Section>
      {solvers.length > 0 && (
        <Section title='Solvers'>
          <MiniTable
            columns={['Type', 'Detail', 'Selector']}
            rows={solvers.map((s) => {
              const solver = asRecord(s);
              const http01 = asRecord(solver?.http01);
              const dns01 = asRecord(solver?.dns01);
              let type = '';
              let detail = '';
              if (http01) {
                type = 'HTTP-01';
                const ingress = asRecord(http01.ingress);
                detail = ingress
                  ? `ingress class ${
                      asScalar(ingress.ingressClassName) ?? asScalar(ingress.class) ?? 'default'
                    }`
                  : (Object.keys(http01)[0] ?? '');
              } else if (dns01) {
                type = 'DNS-01';
                detail = Object.keys(dns01)[0] ?? '';
              }
              const dnsZones = asStringArray(getPath(solver, 'selector', 'dnsZones'));
              return [type, detail, dnsZones.join(', ')];
            })}
          />
        </Section>
      )}
    </>
  );
}
