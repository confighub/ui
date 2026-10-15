// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  ChipList,
  CollapsibleValue,
  FieldList,
  FriendlyViewProps,
  Section,
  UnknownRecord,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
  getPath,
} from './helpers';

/** argoproj.io Application. */
export function ArgoCDApplicationView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const destination = asRecord(spec?.destination);
  const syncPolicy = asRecord(spec?.syncPolicy);
  const automated = asRecord(syncPolicy?.automated);
  const syncOptions = asStringArray(syncPolicy?.syncOptions);
  const retry = asRecord(syncPolicy?.retry);
  const ignoreDifferences = asArray(spec?.ignoreDifferences);

  // Single-source apps use spec.source; multi-source apps use spec.sources.
  const sources = asRecord(spec?.source)
    ? [asRecord(spec?.source) as UnknownRecord]
    : asArray(spec?.sources).map(asRecord).filter((s): s is UnknownRecord => s !== undefined);

  return (
    <>
      <Section title='Application'>
        <FieldList
          fields={[
            { label: 'Project', value: asScalar(spec?.project) },
            {
              label: 'Destination',
              value:
                asScalar(destination?.name) ?? asScalar(destination?.server),
            },
            { label: 'Dest Namespace', value: asScalar(destination?.namespace) },
            {
              label: 'Revision History',
              value: asScalar(spec?.revisionHistoryLimit),
            },
          ]}
        />
      </Section>
      {sources.map((source, i) => (
        <Section key={i} title={sources.length > 1 ? `Source ${i + 1}` : 'Source'}>
          <SourceFields source={source} />
        </Section>
      ))}
      {syncPolicy && (
        <Section title='Sync Policy'>
          <FieldList
            fields={[
              {
                label: 'Automated',
                value: automated ? 'yes' : 'no (manual sync)',
              },
              { label: 'Prune', value: asScalar(automated?.prune) },
              { label: 'Self Heal', value: asScalar(automated?.selfHeal) },
              {
                label: 'Retry Limit',
                value: asScalar(retry?.limit),
              },
              {
                label: 'Sync Options',
                value:
                  syncOptions.length > 0 ? <ChipList items={syncOptions} /> : undefined,
              },
            ]}
          />
        </Section>
      )}
      {ignoreDifferences.length > 0 && (
        <Section title='Ignore Differences'>
          <FieldList
            fields={ignoreDifferences.map((d, i) => {
              const diff = asRecord(d);
              const kind = asScalar(diff?.kind) ?? '';
              const name = asScalar(diff?.name);
              const paths = [
                ...asStringArray(diff?.jsonPointers),
                ...asStringArray(diff?.jqPathExpressions),
              ];
              return {
                label: name ? `${kind} ${name}` : kind || `#${i + 1}`,
                value: paths.join(', '),
              };
            })}
          />
        </Section>
      )}
    </>
  );
}

function SourceFields({ source }: { source: UnknownRecord }) {
  const helm = asRecord(source.helm);
  const kustomize = asRecord(source.kustomize);
  const valueFiles = asStringArray(helm?.valueFiles);
  const valuesInline = asScalar(helm?.values);

  return (
    <>
      <FieldList
        fields={[
          { label: 'Repo URL', value: asScalar(source.repoURL) },
          { label: 'Chart', value: asScalar(source.chart) },
          { label: 'Path', value: asScalar(source.path) },
          { label: 'Target Revision', value: asScalar(source.targetRevision) },
          { label: 'Ref', value: asScalar(source.ref) },
          { label: 'Release Name', value: asScalar(helm?.releaseName) },
          {
            label: 'Value Files',
            value: valueFiles.length > 0 ? valueFiles.join(', ') : undefined,
          },
          {
            label: 'Kustomize Images',
            value: asStringArray(kustomize?.images).join(', ') || undefined,
          },
          {
            label: 'Name Prefix',
            value: asScalar(kustomize?.namePrefix),
          },
          {
            label: 'Recurse',
            value: asScalar(getPath(source, 'directory', 'recurse')),
          },
        ]}
      />
      {valuesInline !== undefined && (
        <CollapsibleValue title='helm values' text={valuesInline} />
      )}
    </>
  );
}
