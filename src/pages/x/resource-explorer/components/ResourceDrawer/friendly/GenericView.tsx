// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { stringify } from 'yaml';

import {
  CollapsibleValue,
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  Section,
  asScalar,
} from './helpers';

/** Top-level keys that the drawer header / MetadataSection already cover. */
const SKIP_KEYS = new Set(['apiVersion', 'kind', 'metadata', 'status']);

/**
 * Fallback for resource types without a dedicated friendly view: scalar
 * top-level spec fields render as label/value rows; nested structures render
 * as collapsible YAML snippets.
 */
export function GenericView({ doc }: FriendlyViewProps) {
  const entries = Object.entries(doc).filter(([key]) => !SKIP_KEYS.has(key));
  if (entries.length === 0) {
    return <EmptyHint text='This resource has no fields beyond its metadata.' />;
  }

  const scalars: Array<{ label: string; value: string }> = [];
  const nested: Array<{ key: string; text: string }> = [];
  for (const [key, value] of entries) {
    const scalar = asScalar(value);
    if (scalar !== undefined) {
      scalars.push({ label: key, value: scalar });
    } else if (value !== null && value !== undefined) {
      nested.push({ key, text: stringify(value).trimEnd() });
    }
  }

  return (
    <Section title='Fields'>
      <FieldList fields={scalars} />
      {nested.map(({ key, text }) => (
        <CollapsibleValue key={key} title={key} text={text} />
      ))}
    </Section>
  );
}
