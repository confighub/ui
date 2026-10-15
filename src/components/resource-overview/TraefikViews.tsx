// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { stringify } from 'yaml';

import {
  ChipList,
  CollapsibleValue,
  EmptyHint,
  FieldList,
  FriendlyViewProps,
  MiniTable,
  Section,
  asArray,
  asRecord,
  asScalar,
  asStringArray,
  getPath,
} from './helpers';

/** traefik.io IngressRoute (HTTP). */
export function IngressRouteView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const entryPoints = asStringArray(spec?.entryPoints);
  const routes = asArray(spec?.routes);
  const tlsSecret = asScalar(getPath(spec, 'tls', 'secretName'));
  const certResolver = asScalar(getPath(spec, 'tls', 'certResolver'));

  return (
    <>
      <Section title='Ingress Route'>
        <FieldList
          fields={[
            {
              label: 'Entry Points',
              value: entryPoints.length > 0 ? <ChipList items={entryPoints} /> : undefined,
            },
            { label: 'TLS Secret', value: tlsSecret },
            { label: 'Cert Resolver', value: certResolver },
          ]}
        />
      </Section>
      <Section title='Routes'>
        {routes.length === 0 && <EmptyHint text='No routes defined.' />}
        <MiniTable
          columns={['Match', 'Services', 'Middlewares', 'Priority']}
          rows={routes.map((r) => {
            const route = asRecord(r);
            return [
              asScalar(route?.match) ?? '',
              serviceList(asArray(route?.services)),
              asArray(route?.middlewares)
                .map((m) => asScalar(getPath(m, 'name')))
                .filter(Boolean)
                .join(', '),
              asScalar(route?.priority) ?? '',
            ];
          })}
        />
      </Section>
    </>
  );
}

/** traefik.io IngressRouteTCP / IngressRouteUDP. */
export function IngressRouteTCPView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const entryPoints = asStringArray(spec?.entryPoints);
  const routes = asArray(spec?.routes);
  const passthrough = asScalar(getPath(spec, 'tls', 'passthrough'));

  return (
    <>
      <Section title='Ingress Route'>
        <FieldList
          fields={[
            {
              label: 'Entry Points',
              value: entryPoints.length > 0 ? <ChipList items={entryPoints} /> : undefined,
            },
            { label: 'TLS Secret', value: asScalar(getPath(spec, 'tls', 'secretName')) },
            { label: 'TLS Passthrough', value: passthrough },
          ]}
        />
      </Section>
      <Section title='Routes'>
        {routes.length === 0 && <EmptyHint text='No routes defined.' />}
        <MiniTable
          columns={['Match', 'Services']}
          rows={routes.map((r) => {
            const route = asRecord(r);
            return [asScalar(route?.match) ?? '', serviceList(asArray(route?.services))];
          })}
        />
      </Section>
    </>
  );
}

function serviceList(services: unknown[]): string {
  return services
    .map((s) => {
      const service = asRecord(s);
      const name = asScalar(service?.name) ?? '';
      const port = asScalar(service?.port);
      const weight = asScalar(service?.weight);
      let label = port !== undefined ? `${name}:${port}` : name;
      if (weight !== undefined) label += ` (w=${weight})`;
      return label;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * traefik.io Middleware: the spec contains exactly one key naming the
 * middleware type (stripPrefix, rateLimit, headers, …) whose value is its
 * configuration.
 */
export function MiddlewareView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  if (!spec) return <EmptyHint text='No middleware configuration.' />;
  const entries = Object.entries(spec);
  if (entries.length === 0) return <EmptyHint text='No middleware configuration.' />;

  return (
    <>
      {entries.map(([type, config]) => (
        <Section key={type} title={`Middleware: ${type}`}>
          <MiddlewareConfig config={config} />
        </Section>
      ))}
    </>
  );
}

function MiddlewareConfig({ config }: { config: unknown }) {
  const rec = asRecord(config);
  if (!rec || Object.keys(rec).length === 0) {
    return <EmptyHint text='No options set.' />;
  }
  const scalars: Array<{ label: string; value: string }> = [];
  const nested: Array<{ key: string; text: string }> = [];
  for (const [key, value] of Object.entries(rec)) {
    const scalar = asScalar(value);
    if (scalar !== undefined) scalars.push({ label: key, value: scalar });
    else if (value !== null && value !== undefined) {
      nested.push({ key, text: stringify(value).trimEnd() });
    }
  }
  return (
    <>
      <FieldList fields={scalars} />
      {nested.map(({ key, text }) => (
        <CollapsibleValue key={key} title={key} text={text} />
      ))}
    </>
  );
}

/** traefik.io TraefikService: weighted round-robin or mirroring. */
export function TraefikServiceView({ doc }: FriendlyViewProps) {
  const spec = asRecord(doc.spec);
  const weighted = asRecord(spec?.weighted);
  const mirroring = asRecord(spec?.mirroring);

  if (weighted) {
    return (
      <Section title='Weighted Service'>
        <MiniTable
          columns={['Service', 'Weight']}
          rows={asArray(weighted.services).map((s) => {
            const service = asRecord(s);
            const name = asScalar(service?.name) ?? '';
            const port = asScalar(service?.port);
            return [
              port !== undefined ? `${name}:${port}` : name,
              asScalar(service?.weight) ?? '',
            ];
          })}
        />
      </Section>
    );
  }

  if (mirroring) {
    return (
      <>
        <Section title='Mirroring Service'>
          <FieldList
            fields={[
              { label: 'Primary', value: asScalar(mirroring.name) },
              { label: 'Port', value: asScalar(mirroring.port) },
            ]}
          />
        </Section>
        <Section title='Mirrors'>
          <MiniTable
            columns={['Service', 'Percent']}
            rows={asArray(mirroring.mirrors).map((m) => {
              const mirror = asRecord(m);
              return [asScalar(mirror?.name) ?? '', asScalar(mirror?.percent) ?? ''];
            })}
          />
        </Section>
      </>
    );
  }

  return <EmptyHint text='No weighted or mirroring configuration found.' />;
}
