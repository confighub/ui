// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import './explorer.css';
import type { Preview, PreviewGraph, PreviewNode } from './model';

export function GraphView({
  graph,
  links = {},
}: {
  graph: PreviewGraph;
  links?: Record<string, string>;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const nodes = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph]);
  const filtered = graph.nodes.filter((n) =>
    `${n.kind} ${n.name} ${n.namespace ?? ''} ${Object.values(n.details ?? {}).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const node: PreviewNode | undefined = nodes.get(selected ?? '') ?? filtered[0];
  const related = graph.edges.filter((e) => e.from === node?.id || e.to === node?.id);
  return (
    <>
      <div className='pe-tools'>
        <input
          aria-label='Filter resources'
          placeholder='Find a cluster, profile, chart or stage…'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span>
          {filtered.length} of {graph.nodes.length} objects · {graph.edges.length}{' '}
          relationships
        </span>
      </div>
      <div className='pe-columns'>
        <div className='pe-list' aria-label='Resources'>
          {filtered.map((n) => (
            <button
              key={n.id}
              className={n.id === node?.id ? 'selected' : ''}
              onClick={() => setSelected(n.id)}
            >
              <span>{n.kind}</span>
              <strong>{n.name}</strong>
              {n.namespace && <small>{n.namespace}</small>}
            </button>
          ))}
          {!filtered.length && <p>No objects match this view.</p>}
        </div>
        <article className='pe-detail'>
          {node ? (
            <>
              <span className='pe-eyebrow'>{node.kind}</span>
              <h2>{node.name}</h2>
              <code>{node.id}</code>
              <dl>
                {Object.entries(node.details ?? {}).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {links[node.id] && <a href={links[node.id]}>Open in ConfigHub ↗</a>}
              <h3>Relationships</h3>
              {related.length ? (
                <ul className='pe-relations'>
                  {related.map((e) => {
                    const other = e.from === node.id ? e.to : e.from;
                    return (
                      <li key={JSON.stringify(e)}>
                        <span>
                          {e.from === node.id ? '→' : '←'} {e.relation}
                        </span>
                        <button onClick={() => setSelected(other)}>
                          {nodes.get(other)?.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>No relationships recorded for this object.</p>
              )}
            </>
          ) : (
            <p>No objects supplied.</p>
          )}
        </article>
      </div>
    </>
  );
}
export function Explorer({
  preview,
  connected = false,
  links,
}: {
  preview: Preview;
  connected?: boolean;
  links?: Record<string, string>;
}) {
  const [section, setSection] = useState<'inventory' | 'proposal'>('inventory');
  return (
    <section>
      <div className='pe-summary'>
        <div>
          <span className='pe-eyebrow'>
            {preview.producer.name} · {preview.producer.version}
          </span>
          <h2>{connected ? 'Connected configuration' : 'Your fleet, before the next step'}</h2>
          <p>{preview.scope.description}</p>
        </div>
        <div className='pe-stamp'>
          {connected ? 'Read' : 'Exported'} {new Date(preview.exportedAt).toLocaleString()}
          <br />
          <small>
            {connected
              ? 'ConfigHub records; not a live cluster scan'
              : 'Export time is not observation time'}
          </small>
        </div>
      </div>
      {preview.issues.length > 0 && (
        <div className='pe-issues' role='status'>
          {preview.issues.map((i, n) => (
            <p key={n}>
              <strong>
                {i.severity === 'error' ? 'Problem' : 'Note'} · {i.code}
              </strong>{' '}
              — {i.message}
            </p>
          ))}
        </div>
      )}
      {!connected && (
        <div className='pe-tabs' aria-label='Evidence source'>
          <button
            aria-pressed={section === 'inventory'}
            onClick={() => setSection('inventory')}
          >
            From your export
          </button>
          <button aria-pressed={section === 'proposal'} onClick={() => setSection('proposal')}>
            Proposed in ConfigHub
          </button>
        </div>
      )}
      <GraphView
        key={`${preview.exportedAt}:${section}:${preview.producer.name}`}
        graph={connected ? preview.inventory : preview[section]}
        links={links}
      />
    </section>
  );
}
