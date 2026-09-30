// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useRef, useState } from 'react';

import { useAuth, useConfigHub } from '@confighub/react-auth';

import { apiBaseUrl } from '../../auth/config';
import { Explorer } from './Explorer';
import {
  type ConnectedScope,
  type HubSpace,
  connectedPreview,
  matchProposedSpaces,
} from './connected';
import { type Preview, parsePreview } from './model';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export default function ConnectedExplorer() {
  const api = useConfigHub();
  const { user } = useAuth();
  const [components, setComponents] = useState<{ id: string; name: string; org: string }[]>(
    [],
  );
  const [component, setComponent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, refresh] = useState(0);
  const [result, setResult] = useState<ReturnType<typeof connectedPreview>>();
  const [spaces, setSpaces] = useState<HubSpace[]>([]);
  const [local, setLocal] = useState<Preview>();
  const request = useRef(0);
  const org = user?.organizationId ?? '';
  const canonicalOrg = components.find((c) => c.id === component)?.org ?? '';
  const scope: ConnectedScope = {
    instance: apiBaseUrl(),
    organizationId: canonicalOrg,
    componentId: component,
    componentName: components.find((c) => c.id === component)?.name ?? component,
  };
  useEffect(() => {
    let active = true;
    setComponents([]);
    setComponent('');
    setResult(undefined);
    setSpaces([]);
    setError('');
    void api
      .GET('/component', { params: { query: { select: 'ComponentID,Slug,OrganizationID' } } })
      .then((r) => {
        if (!active) return;
        if (r.error || !r.data)
          throw new Error(
            `Could not read components (${r.response.status}). Check your session and permissions.`,
          );
        setComponents(
          r.data
            .flatMap((x) =>
              x.Component?.ComponentID && x.Component.Slug && x.Component.OrganizationID
                ? [
                    {
                      id: x.Component.ComponentID,
                      name: x.Component.Slug,
                      org: x.Component.OrganizationID,
                    },
                  ]
                : [],
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [api, org, generation]);
  useEffect(() => {
    const token = ++request.current;
    setResult(undefined);
    setSpaces([]);
    setBusy(false);
    if (!UUID.test(component) || !canonicalOrg) return;
    const abort = new AbortController();
    setBusy(true);
    setError('');
    void (async () => {
      const read = await api.GET('/space', {
        signal: abort.signal,
        params: {
          query: {
            where: `ComponentID = '${component}'`,
            select: 'SpaceID,Slug,OrganizationID,ComponentID,Labels,ReleaseTargetID',
          },
        },
      });
      if (read.error || !read.data)
        throw new Error(
          `Could not read spaces (${read.response.status}). No empty-fleet claim is made.`,
        );
      const all = read.data;
      const selected = all.slice(0, 100);
      const warnings =
        all.length > 100
          ? ['Showing the first 100 returned spaces. This component is only partially loaded.']
          : [];
      const spaceIds = selected.flatMap((x) =>
        x.Space?.SpaceID && UUID.test(x.Space.SpaceID) ? [x.Space.SpaceID] : [],
      );
      const units = spaceIds.length
        ? await api.GET('/unit', {
            signal: abort.signal,
            params: {
              query: {
                where: `SpaceID IN (${spaceIds.map((id) => `'${id}'`).join(',')})`,
                select: 'UnitID,Slug,SpaceID,OrganizationID,UpstreamUnitID,HeadRevisionNum',
              },
            },
          })
        : undefined;
      if (units?.error)
        warnings.push(
          `Units unreadable (${units.response.status}); space records remain available.`,
        );
      if (token !== request.current || abort.signal.aborted) return;
      setSpaces(selected);
      setResult(
        connectedPreview(
          {
            instance: apiBaseUrl(),
            organizationId: canonicalOrg,
            componentId: component,
            componentName: components.find((c) => c.id === component)?.name ?? component,
          },
          selected,
          units?.data ?? [],
          warnings,
        ),
      );
    })()
      .catch((e) => {
        if (token === request.current && !abort.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (token === request.current && !abort.signal.aborted) setBusy(false);
      });
    return () => {
      abort.abort();
    };
  }, [api, canonicalOrg, component, components]);
  return (
    <main className='pe'>
      <header className='pe-top'>
        <div>
          <span className='pe-eyebrow'>ConfigHub · Plugin explorer</span>
          <h1>Explore connected configuration</h1>
        </div>
        <a href='/local'>Open local mode ↗</a>
      </header>
      <p>
        Select the component your plugin onboarded. Controller identity is not inferred from a
        name. Source profiles and selector matches require a local export.
      </p>
      <div className='pe-actions'>
        <label>
          Component{' '}
          <select
            aria-label='Component'
            value={component}
            onChange={(e) => setComponent(e.target.value)}
          >
            <option value=''>Choose a component</option>
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => refresh((n) => n + 1)} disabled={busy}>
          Reload components
        </button>
        <a href='/rollouts'>Review rollouts ↗</a>
      </div>
      {error && (
        <p className='pe-error' role='alert'>
          {error}
        </p>
      )}
      {busy && <p role='status'>Reading the selected component…</p>}
      {result && (
        <>
          <Explorer preview={result.preview} connected links={result.links} />
          <div className='pe-actions'>
            <label>
              Compare proposed space names{' '}
              <input
                aria-label='Compare local preview'
                type='file'
                accept='.json'
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    if (f.size > 5 * 1024 * 1024) throw new Error('Preview exceeds 5 MiB');
                    setLocal(parsePreview(await f.text()));
                    setError('');
                  } catch (e) {
                    setLocal(undefined);
                    setError(String(e));
                  }
                }}
              />
            </label>
            <small>
              Read locally; not uploaded. A matching name is a candidate, not proof of
              adoption.
            </small>
          </div>
          {local && (
            <ul>
              {matchProposedSpaces(local, scope, spaces).map((m, i) => (
                <li key={i}>
                  {m.name}: {m.state}{' '}
                  {m.id && <a href={`/spaces/${encodeURIComponent(m.id)}`}>Inspect ↗</a>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
