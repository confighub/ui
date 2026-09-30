// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState } from 'react';

import { Explorer } from './Explorer';
import { type Preview, parsePreview } from './model';

export default function LocalExplorer() {
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [destination, setDestination] = useState('');
  const load = (text: string) => {
    try {
      setPreview(parsePreview(text));
      setError('');
    } catch (e) {
      setError(String(e));
      setPreview(undefined);
    }
  };
  const connect = () => {
    try {
      const url = new URL(destination);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('Enter an HTTP(S) UI address without credentials');
      url.pathname = '/plugins';
      url.search = '';
      url.hash = '';
      window.location.assign(url.href);
    } catch {
      setError(
        'Enter the address of your ConfigHub UI, for example https://hub.confighub.com',
      );
    }
  };
  return (
    <main className='pe'>
      <header className='pe-top'>
        <div>
          <span className='pe-eyebrow'>ConfigHub · Plugin explorer</span>
          <h1>Understand your fleet</h1>
        </div>
        <span>Local mode · files stay in this browser</span>
      </header>
      <div className='pe-actions'>
        <label className='pe-file'>
          Open preview{' '}
          <input
            aria-label='Open preview'
            type='file'
            accept='.json,application/json'
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 5 * 1024 * 1024) {
                setError('Preview exceeds 5 MiB');
                setPreview(undefined);
                return;
              }
              try {
                load(await f.text());
              } catch {
                setError('Could not read the file');
              }
            }}
          />
        </label>
        <button
          onClick={async () => {
            try {
              const response = await fetch('/examples/sveltos-preview.json');
              if (!response.ok) throw new Error('Sample unavailable');
              load(await response.text());
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Try Sveltos example
        </button>
        <button
          onClick={async () => {
            try {
              const response = await fetch('/examples/flux-preview.json');
              if (!response.ok) throw new Error('Sample unavailable');
              load(await response.text());
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Try Flux example
        </button>
      </div>
      {error && (
        <p role='alert' className='pe-error'>
          {error}
        </p>
      )}
      {preview ? (
        <Explorer preview={preview} />
      ) : (
        <section className='pe-welcome'>
          <span className='pe-eyebrow'>Explore first. Connect when ready.</span>
          <h2>See what you have and what comes next.</h2>
          <p>
            Open a plugin preview to explore profiles, clusters and their relationships, then
            inspect the proposed ConfigHub structure.
          </p>
          <code>cub sveltos plan fleet.yaml --format json &gt; preview.json</code>
          <p>
            No account needed. The preview describes supplied inputs, not a continuously
            observed cluster.
          </p>
        </section>
      )}
      <footer className='pe-actions'>
        <label>
          ConfigHub UI address{' '}
          <input
            aria-label='ConfigHub UI address'
            placeholder='https://hub.confighub.com'
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </label>
        <button onClick={connect}>Open connected mode ↗</button>
        <small>Your file is not transferred. Sign in and choose a component there.</small>
      </footer>
    </main>
  );
}
