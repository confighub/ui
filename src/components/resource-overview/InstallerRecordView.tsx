// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { ReactNode } from 'react';

import Box from '@mui/material/Box';
import { stringify } from 'yaml';

import {
  ChipList,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Mono,
  Section,
  UnknownRecord,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
  getPath,
} from './helpers';

/**
 * The record ConfigHub's installer keeps of a package it installed in a Space:
 * the package's definition, where it was pulled from, the base and package
 * components chosen, the answers to its inputs, the facts its collector found,
 * and the dependencies it locked. Its Unit is AppConfig/YAML, hidden with
 * HiddenReason InstallerRecord. Keep in step with `installer show`, which
 * renders the same record in a terminal.
 */
export function InstallerRecordView({ doc }: FriendlyViewProps) {
  const pkg = asRecord(doc.package);
  const spec = asRecord(pkg?.spec);
  const source = asRecord(doc.source);
  const selection = asRecord(doc.selection);
  const inputs = asRecord(doc.inputs);
  const base = asScalar(selection?.base);
  const selected = new Set(asStringArray(selection?.components));
  const groups = componentGroups(spec);

  const components = asArray(spec?.components).map(asRecord).filter(isRecord);
  const inputRows = inputTableRows(spec, asRecord(inputs?.values));
  const imageOverrides = Object.entries(asRecord(inputs?.imageOverrides) ?? {});
  const facts = Object.entries(asRecord(getPath(doc, 'facts', 'values')) ?? {});
  const locked = asArray(getPath(doc, 'lock', 'resolved'))
    .map(asRecord)
    .filter(isRecord);
  const declared = asArray(spec?.dependencies).map(asRecord).filter(isRecord);
  const requirements = withoutEmptyColumns(
    ['Kind', 'Name', 'Version', 'Required By'],
    requirementRows(spec, base, selected),
  );
  const transformers = functionGroupRows(spec, 'transformers', base, selected);
  const validators = functionGroupRows(spec, 'validators', base, selected);

  return (
    <>
      <Section title='Installed Package'>
        <FieldList
          fields={[
            { label: 'Package', value: asScalar(pkg?.name) },
            {
              label: 'Version',
              value: asScalar(getPath(pkg, 'installerMetadata', 'version')),
            },
            { label: 'Source', value: asScalar(source?.ref) },
            { label: 'Digest', value: asScalar(source?.digest) },
            { label: 'Namespace', value: asScalar(inputs?.namespace) },
            { label: 'Base', value: base },
            {
              label: 'Installer Version',
              value: asScalar(getPath(pkg, 'installerMetadata', 'installerVersion')),
            },
            {
              label: 'Kubernetes Version',
              value: asScalar(getPath(pkg, 'installerMetadata', 'kubeVersion')),
            },
          ]}
        />
      </Section>

      {components.length > 0 && (
        <Section title='Package Components'>
          <MiniTable
            columns={
              groups.size > 0
                ? ['Component', 'Selected', 'Group', 'Description']
                : ['Component', 'Selected', 'Description']
            }
            rows={components.map((c) => {
              const name = asScalar(c.name) ?? '';
              const cells: ReactNode[] = [
                <Name text={name} />,
                selected.has(name) ? 'yes' : '',
              ];
              if (groups.size > 0) cells.push(groups.get(name) ?? '');
              cells.push(<Prose text={asScalar(c.description)} />);
              return cells;
            })}
          />
        </Section>
      )}

      {(inputRows.length > 0 || imageOverrides.length > 0) && (
        <Section title='Inputs'>
          {inputRows.length > 0 && (
            <MiniTable columns={['Input', 'Value', 'Default']} rows={inputRows} />
          )}
          {imageOverrides.length > 0 && (
            <MiniTable
              columns={['Image', 'Override']}
              rows={imageOverrides.map(([name, ref]) => [name, displayValue(ref)])}
            />
          )}
        </Section>
      )}

      {facts.length > 0 && (
        <Section title='Facts'>
          <MiniTable
            columns={['Fact', 'Value']}
            rows={facts
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [<Name text={k} />, displayValue(v)])}
          />
        </Section>
      )}

      {locked.length > 0 ? (
        <Section title='Dependencies'>
          <MiniTable
            columns={['Dependency', 'Version', 'Reference', 'Requested By']}
            rows={locked.map((d) => [
              <Name text={asScalar(d.name) ?? ''} />,
              asScalar(d.version) ?? '',
              asScalar(d.ref) ?? '',
              asStringArray(d.requestedBy).join(', '),
            ])}
          />
        </Section>
      ) : (
        declared.length > 0 && (
          <Section title='Dependencies'>
            <MiniTable
              columns={['Dependency', 'Package', 'Version']}
              rows={declared.map((d) => [
                <Name text={asScalar(d.name) ?? ''} />,
                asScalar(d.package) ?? '',
                asScalar(d.version) ?? '',
              ])}
            />
          </Section>
        )
      )}

      {requirements.rows.length > 0 && (
        <Section title='Cluster Requirements'>
          <MiniTable
            columns={requirements.columns}
            rows={requirements.rows.map((row) => row.map((cell) => <Name text={cell} />))}
          />
        </Section>
      )}

      {transformers.length > 0 && (
        <Section title='Transformers'>
          <MiniTable
            columns={['From', 'Functions', 'Description']}
            rows={transformers.map((g) => [
              <Name text={g.from} />,
              <Names items={g.functions} />,
              <Prose text={g.description} />,
            ])}
          />
        </Section>
      )}

      {validators.length > 0 && (
        <Section title='Validators'>
          <ChipList items={[...new Set(validators.flatMap((g) => g.functions))]} />
        </Section>
      )}
    </>
  );
}

function isRecord(v: UnknownRecord | undefined): v is UnknownRecord {
  return v !== undefined;
}

/** A name in a table's first column, kept on one line so the column fits it. */
function Name({ text }: { text: string }) {
  return (
    <Box component='span' sx={{ whiteSpace: 'nowrap' }}>
      <Mono>{text}</Mono>
    </Box>
  );
}

/** A list of names that wraps between names, never within one. */
function Names({ items }: { items: string[] }) {
  return (
    <>
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && ', '}
          <Name text={item} />
        </span>
      ))}
    </>
  );
}

/** Leave out the columns no row has a value in, such as Version when no requirement pins one. */
function withoutEmptyColumns(
  columns: string[],
  rows: string[][],
): { columns: string[]; rows: string[][] } {
  const keep = columns.map((_, j) => rows.some((row) => row[j] !== ''));
  return {
    columns: columns.filter((_, j) => keep[j]),
    rows: rows.map((row) => row.filter((_, j) => keep[j])),
  };
}

/**
 * Descriptions in installer.yaml are hand-wrapped paragraphs; rejoin each
 * paragraph's lines so the table wraps them to its own width.
 */
function Prose({ text }: { text: string | undefined }) {
  if (!text) return null;
  return (
    <>
      {text
        .trim()
        .split(/\n\s*\n/)
        .map((paragraph, i) => (
          <span key={i} style={{ display: 'block', fontSize: '0.8rem' }}>
            {paragraph.replace(/\s*\n\s*/g, ' ')}
          </span>
        ))}
    </>
  );
}

/** An input or fact value: scalars as written, an empty string quoted, structures as YAML. */
function displayValue(v: unknown): ReactNode {
  if (v === undefined || v === null) return '';
  if (v === '') return '""';
  const scalar = asScalar(v);
  if (scalar !== undefined) return scalar;
  return stringify(v).trimEnd();
}

/** Package component name → the group it is one of. */
function componentGroups(spec: UnknownRecord | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of asArray(spec?.componentGroups)) {
    const group = asRecord(g);
    const name = asScalar(group?.name);
    if (!name) continue;
    for (const member of asStringArray(group?.components)) out.set(member, name);
  }
  return out;
}

/**
 * One row per declared input, with the recorded answer, then any answers to
 * inputs the package no longer declares.
 */
function inputTableRows(
  spec: UnknownRecord | undefined,
  values: UnknownRecord | undefined,
): ReactNode[][] {
  const rows: ReactNode[][] = [];
  const declared = new Set<string>();
  for (const i of asArray(spec?.inputs)) {
    const input = asRecord(i);
    const name = asScalar(input?.name);
    if (!name) continue;
    declared.add(name);
    rows.push([
      <Name text={name} />,
      displayValue(values?.[name]),
      displayValue(input?.default),
    ]);
  }
  for (const [name, value] of Object.entries(values ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (!declared.has(name)) rows.push([<Name text={name} />, displayValue(value), '']);
  }
  return rows;
}

/** What the package, the chosen base and the selected package components each contribute. */
function contributors(
  spec: UnknownRecord | undefined,
  base: string | undefined,
  selected: Set<string>,
): Array<{ from: string; rec: UnknownRecord }> {
  const out: Array<{ from: string; rec: UnknownRecord }> = [];
  if (spec) out.push({ from: 'package', rec: spec });
  for (const b of asArray(spec?.bases)) {
    const rec = asRecord(b);
    if (rec && base && asScalar(rec.name) === base) out.push({ from: `base ${base}`, rec });
  }
  for (const c of asArray(spec?.components)) {
    const rec = asRecord(c);
    const name = asScalar(rec?.name);
    if (rec && name && selected.has(name)) out.push({ from: name, rec });
  }
  return out;
}

function requirementRows(
  spec: UnknownRecord | undefined,
  base: string | undefined,
  selected: Set<string>,
): string[][] {
  return contributors(spec, base, selected).flatMap(({ from, rec }) =>
    asArray(rec.externalRequires).map((r) => {
      const req = asRecord(r);
      const capability = asScalar(req?.capability);
      return [
        asScalar(req?.kind) ?? '',
        asScalar(req?.name) ?? (capability ? `capability ${capability}` : ''),
        asScalar(req?.version) ?? '',
        from,
      ];
    }),
  );
}

interface FunctionGroupRow {
  from: string;
  functions: string[];
  description: string | undefined;
}

function functionGroupRows(
  spec: UnknownRecord | undefined,
  key: 'transformers' | 'validators',
  base: string | undefined,
  selected: Set<string>,
): FunctionGroupRow[] {
  return contributors(spec, base, selected)
    .filter(({ from }) => !from.startsWith('base '))
    .flatMap(({ from, rec }) =>
      asArray(rec[key]).map((g) => {
        const group = asRecord(g);
        return {
          from,
          functions: asArray(group?.invocations).map((inv) => {
            const invocation = asRecord(inv);
            const name = asScalar(invocation?.name) ?? '';
            // Validator arguments say what is checked ("restricted"); a
            // transformer's are expressions, which its description explains.
            const args = key === 'validators' ? asStringArray(invocation?.args) : [];
            return [name, ...args].join(' ');
          }),
          description: asScalar(group?.description),
        };
      }),
    );
}
