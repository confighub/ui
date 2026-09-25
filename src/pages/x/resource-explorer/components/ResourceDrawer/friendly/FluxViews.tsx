// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { stringify } from 'yaml';

import {
  ChipList,
  CollapsibleValue,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  asArray,
  asRecord,
  asScalar,
  asStringMap,
  getPath,
} from './helpers';

/** "Kind name" or "Kind namespace/name" for Flux cross-resource references. */
function refLabel(ref: unknown): string | undefined {
  const rec = asRecord(ref);
  if (!rec) return undefined;
  const kind = asScalar(rec.kind) ?? '';
  const name = asScalar(rec.name) ?? '';
  const namespace = asScalar(rec.namespace);
  const qualified = namespace ? `${namespace}/${name}` : name;
  return `${kind} ${qualified}`.trim() || undefined;
}

/** helm.toolkit.fluxcd.io HelmRelease. */
export function HelmReleaseView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const chartSpec = asRecord(getPath(spec, 'chart', 'spec'));
  const valuesFrom = asArray(spec?.valuesFrom);
  const values = asRecord(spec?.values);
  const install = asRecord(spec?.install);
  const upgrade = asRecord(spec?.upgrade);

  return (
    <>
      <Section title='Helm Release'>
        <FieldList
          fields={[
            { label: 'Release Name', value: asScalar(spec?.releaseName) },
            { label: 'Target Namespace', value: asScalar(spec?.targetNamespace) },
            { label: 'Storage Namespace', value: asScalar(spec?.storageNamespace) },
            { label: 'Interval', value: asScalar(spec?.interval) },
            { label: 'Timeout', value: asScalar(spec?.timeout) },
            { label: 'Suspend', value: asScalar(spec?.suspend) },
            { label: 'Service Account', value: asScalar(spec?.serviceAccountName) },
            { label: 'Depends On', value: dependsOnLabel(spec?.dependsOn) },
          ]}
        />
      </Section>
      <Section title='Chart'>
        <FieldList
          fields={[
            { label: 'Chart', value: asScalar(chartSpec?.chart) },
            { label: 'Version', value: asScalar(chartSpec?.version) },
            { label: 'Source', value: refLabel(chartSpec?.sourceRef) },
            // Newer HelmReleases may reference an OCIRepository/HelmChart
            // directly via chartRef instead of an inline chart template.
            { label: 'Chart Ref', value: refLabel(spec?.chartRef) },
            {
              label: 'Reconcile Strategy',
              value: asScalar(chartSpec?.reconcileStrategy),
            },
          ]}
        />
      </Section>
      {(install || upgrade) && (
        <Section title='Remediation'>
          <FieldList
            fields={[
              {
                label: 'Install Retries',
                value: asScalar(getPath(install, 'remediation', 'retries')),
              },
              { label: 'Create Namespace', value: asScalar(install?.createNamespace) },
              {
                label: 'Upgrade Retries',
                value: asScalar(getPath(upgrade, 'remediation', 'retries')),
              },
              { label: 'Cleanup On Fail', value: asScalar(upgrade?.cleanupOnFail) },
            ]}
          />
        </Section>
      )}
      {(values || valuesFrom.length > 0) && (
        <Section title='Values'>
          {valuesFrom.length > 0 && (
            <MiniTable
              columns={['Kind', 'Name', 'Key']}
              rows={valuesFrom.map((v) => {
                const ref = asRecord(v);
                return [
                  asScalar(ref?.kind) ?? '',
                  asScalar(ref?.name) ?? '',
                  asScalar(ref?.valuesKey) ?? '',
                ];
              })}
            />
          )}
          {values && (
            <CollapsibleValue title='values' text={stringify(values).trimEnd()} />
          )}
        </Section>
      )}
    </>
  );
}

/** kustomize.toolkit.fluxcd.io Kustomization. */
export function FluxKustomizationView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const substitute = asStringMap(getPath(spec, 'postBuild', 'substitute'));
  const substituteFrom = asArray(getPath(spec, 'postBuild', 'substituteFrom'));
  const healthChecks = asArray(spec?.healthChecks);
  const images = asArray(spec?.images);
  const patches = asArray(spec?.patches);

  return (
    <>
      <Section title='Kustomization'>
        <FieldList
          fields={[
            { label: 'Source', value: refLabel(spec?.sourceRef) },
            { label: 'Path', value: asScalar(spec?.path) },
            { label: 'Interval', value: asScalar(spec?.interval) },
            { label: 'Prune', value: asScalar(spec?.prune) },
            { label: 'Suspend', value: asScalar(spec?.suspend) },
            { label: 'Target Namespace', value: asScalar(spec?.targetNamespace) },
            { label: 'Service Account', value: asScalar(spec?.serviceAccountName) },
            { label: 'Wait', value: asScalar(spec?.wait) },
            { label: 'Timeout', value: asScalar(spec?.timeout) },
            { label: 'Depends On', value: dependsOnLabel(spec?.dependsOn) },
            {
              label: 'Patches',
              value: patches.length > 0 ? String(patches.length) : undefined,
            },
          ]}
        />
      </Section>
      {images.length > 0 && (
        <Section title='Image Overrides'>
          <MiniTable
            columns={['Name', 'New Name', 'New Tag']}
            rows={images.map((i) => {
              const image = asRecord(i);
              return [
                asScalar(image?.name) ?? '',
                asScalar(image?.newName) ?? '',
                asScalar(image?.newTag) ?? asScalar(image?.digest) ?? '',
              ];
            })}
          />
        </Section>
      )}
      {(substitute || substituteFrom.length > 0) && (
        <Section title='Post-Build Substitutions'>
          {substitute && Object.keys(substitute).length > 0 && (
            <MiniTable
              columns={['Variable', 'Value']}
              rows={Object.entries(substitute).map(([k, v]) => [k, v])}
            />
          )}
          {substituteFrom.length > 0 && (
            <FieldList
              fields={[
                {
                  label: 'Substitute From',
                  value: substituteFrom
                    .map((s) => refLabel(s))
                    .filter(Boolean)
                    .join(', '),
                },
              ]}
            />
          )}
        </Section>
      )}
      {healthChecks.length > 0 && (
        <Section title='Health Checks'>
          <MiniTable
            columns={['Kind', 'Name', 'Namespace']}
            rows={healthChecks.map((h) => {
              const check = asRecord(h);
              return [
                asScalar(check?.kind) ?? '',
                asScalar(check?.name) ?? '',
                asScalar(check?.namespace) ?? '',
              ];
            })}
          />
        </Section>
      )}
    </>
  );
}

function dependsOnLabel(dependsOn: unknown): string | undefined {
  const deps = asArray(dependsOn)
    .map((d) => {
      const rec = asRecord(d);
      const name = asScalar(rec?.name) ?? '';
      const namespace = asScalar(rec?.namespace);
      return namespace ? `${namespace}/${name}` : name;
    })
    .filter(Boolean);
  return deps.length > 0 ? deps.join(', ') : undefined;
}

/**
 * source.toolkit.fluxcd.io sources (GitRepository, HelmRepository, HelmChart,
 * OCIRepository, Bucket). Their specs are similar enough — URL-ish locator,
 * interval, ref/version selector, auth secret — to share one view.
 */
export function FluxSourceView({ doc }: FriendlyViewProps) {
  const kind = asScalar(doc.kind) ?? 'Source';
  const spec = asRecord(doc.spec);
  const ref = asRecord(spec?.ref);

  return (
    <Section title={kind}>
      <FieldList
        fields={[
          { label: 'URL', value: asScalar(spec?.url) },
          // HelmRepository: "oci" for OCI registries, default is HTTP.
          { label: 'Type', value: asScalar(spec?.type) },
          // Bucket fields.
          { label: 'Bucket', value: asScalar(spec?.bucketName) },
          { label: 'Endpoint', value: asScalar(spec?.endpoint) },
          { label: 'Provider', value: asScalar(spec?.provider) },
          // HelmChart fields.
          { label: 'Chart', value: asScalar(spec?.chart) },
          { label: 'Version', value: asScalar(spec?.version) },
          { label: 'Source', value: refLabel(spec?.sourceRef) },
          // GitRepository / OCIRepository ref selectors.
          { label: 'Branch', value: asScalar(ref?.branch) },
          { label: 'Tag', value: asScalar(ref?.tag) },
          { label: 'SemVer', value: asScalar(ref?.semver) },
          { label: 'Commit', value: asScalar(ref?.commit) },
          { label: 'Digest', value: asScalar(ref?.digest) },
          { label: 'Interval', value: asScalar(spec?.interval) },
          { label: 'Timeout', value: asScalar(spec?.timeout) },
          { label: 'Suspend', value: asScalar(spec?.suspend) },
          {
            label: 'Auth Secret',
            value: asScalar(getPath(spec, 'secretRef', 'name')),
          },
          {
            label: 'Ignore Paths',
            value: ignoreSummary(asScalar(spec?.ignore)),
          },
        ]}
      />
    </Section>
  );
}

/** Collapse a multi-line .sourceignore-style value into one readable line. */
function ignoreSummary(ignore: string | undefined): string | undefined {
  if (ignore === undefined) return undefined;
  const patterns = ignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return patterns.length > 0 ? patterns.join(' ') : undefined;
}

/** notification.toolkit.fluxcd.io Alert / Provider. */
export function FluxAlertView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const eventSources = asArray(spec?.eventSources);
  return (
    <>
      <Section title='Alert'>
        <FieldList
          fields={[
            { label: 'Provider', value: refLabel(spec?.providerRef) },
            { label: 'Severity', value: asScalar(spec?.eventSeverity) },
            { label: 'Suspend', value: asScalar(spec?.suspend) },
          ]}
        />
      </Section>
      {eventSources.length > 0 && (
        <Section title='Event Sources'>
          <ChipList
            items={eventSources
              .map((s) => refLabel(s))
              .filter((s): s is string => s !== undefined)}
          />
        </Section>
      )}
    </>
  );
}
