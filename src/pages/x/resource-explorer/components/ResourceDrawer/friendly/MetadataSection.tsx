// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import {
  CollapsibleValue,
  FieldList,
  FriendlyViewProps,
  Section,
  SelectorChips,
  asRecord,
  asScalar,
  asStringMap,
  getPath,
} from './helpers';

/**
 * Common metadata shown at the top of every Overview: name, namespace,
 * labels, and annotations. Annotations are individually collapsible since
 * values like `kubectl.kubernetes.io/last-applied-configuration` can be huge.
 */
export function MetadataSection({ doc }: FriendlyViewProps) {
  const metadata = asRecord(doc.metadata);
  const labels = asStringMap(getPath(doc, 'metadata', 'labels'));
  // ConfigHub's own bookkeeping annotations are noise here — the drawer
  // header already shows the Unit/Space provenance.
  const annotations = Object.fromEntries(
    Object.entries(asStringMap(getPath(doc, 'metadata', 'annotations')) ?? {}).filter(
      ([key]) => !key.startsWith('confighub.com/'),
    ),
  );

  return (
    <>
      <Section title='Metadata'>
        <FieldList
          fields={[
            { label: 'Name', value: asScalar(metadata?.name) },
            { label: 'Namespace', value: asScalar(metadata?.namespace) },
            { label: 'API Version', value: asScalar(doc.apiVersion) },
            { label: 'Kind', value: asScalar(doc.kind) },
          ]}
        />
      </Section>
      {labels && Object.keys(labels).length > 0 && (
        <Section title='Labels'>
          <SelectorChips map={labels} />
        </Section>
      )}
      {Object.keys(annotations).length > 0 && (
        <Section title='Annotations'>
          {Object.entries(annotations).map(([k, v]) => (
            <CollapsibleValue key={k} title={k} text={v} />
          ))}
        </Section>
      )}
    </>
  );
}
