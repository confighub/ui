// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  asArray,
  asRecord,
  asScalar,
  getPath,
} from './helpers';

/** external-secrets.io ExternalSecret. */
export function ExternalSecretView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const storeRef = asRecord(spec?.secretStoreRef);
  const target = asRecord(spec?.target);
  const data = asArray(spec?.data);
  const dataFrom = asArray(spec?.dataFrom);

  return (
    <>
      <Section title='External Secret'>
        <FieldList
          fields={[
            {
              label: 'Secret Store',
              value: storeRef
                ? `${asScalar(storeRef.kind) ?? 'SecretStore'} ${asScalar(storeRef.name) ?? ''}`.trim()
                : undefined,
            },
            { label: 'Refresh Interval', value: asScalar(spec?.refreshInterval) },
            { label: 'Target Secret', value: asScalar(target?.name) },
            { label: 'Creation Policy', value: asScalar(target?.creationPolicy) },
            { label: 'Deletion Policy', value: asScalar(target?.deletionPolicy) },
            {
              label: 'Template Type',
              value: asScalar(getPath(target, 'template', 'type')),
            },
          ]}
        />
      </Section>
      {data.length > 0 && (
        <Section title='Data Mappings'>
          <MiniTable
            columns={['Secret Key', 'Remote Key', 'Property', 'Version']}
            rows={data.map((d) => {
              const entry = asRecord(d);
              const remote = asRecord(entry?.remoteRef);
              return [
                asScalar(entry?.secretKey) ?? '',
                asScalar(remote?.key) ?? '',
                asScalar(remote?.property) ?? '',
                asScalar(remote?.version) ?? '',
              ];
            })}
          />
        </Section>
      )}
      {dataFrom.length > 0 && (
        <Section title='Data From'>
          <MiniTable
            columns={['Source', 'Key / Pattern']}
            rows={dataFrom.map((d) => {
              const entry = asRecord(d);
              const extract = asRecord(entry?.extract);
              if (extract) return ['extract', asScalar(extract.key) ?? ''];
              const find = asRecord(entry?.find);
              if (find) {
                return [
                  'find',
                  asScalar(getPath(find, 'name', 'regexp')) ??
                    JSON.stringify(find.tags ?? ''),
                ];
              }
              return ['', ''];
            })}
          />
        </Section>
      )}
    </>
  );
}

/**
 * external-secrets.io SecretStore / ClusterSecretStore: identify the provider
 * (exactly one key is set under spec.provider) and show its salient fields.
 */
export function SecretStoreView({ doc }: FriendlyViewProps) {
  const provider = asRecord(getPath(doc, 'spec', 'provider'));
  if (!provider) return <EmptyHint text='No provider configured.' />;
  const providerName = Object.keys(provider)[0];
  if (!providerName) return <EmptyHint text='No provider configured.' />;
  const config = asRecord(provider[providerName]);

  // Salient fields per provider; anything unlisted falls back to scalar dump.
  const fields = [
    { label: 'Provider', value: providerName },
    { label: 'Region', value: asScalar(config?.region) },
    { label: 'Service', value: asScalar(config?.service) },
    { label: 'Server', value: asScalar(config?.server) },
    { label: 'URL', value: asScalar(config?.url) },
    { label: 'Path', value: asScalar(config?.path) },
    { label: 'Project ID', value: asScalar(config?.projectID) },
    { label: 'Vault URL', value: asScalar(config?.vaultUrl) },
    { label: 'Tenant ID', value: asScalar(config?.tenantId) },
    { label: 'Auth Type', value: asScalar(config?.authType) },
    {
      label: 'Refresh Interval',
      value: asScalar(getPath(doc, 'spec', 'refreshInterval')),
    },
  ];

  return (
    <Section title='Secret Store'>
      <FieldList fields={fields} />
    </Section>
  );
}
