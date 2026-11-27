// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's probes: one row per probe, the check (an exec command cut at
// one line after a ">_" glyph, or `:port /path` for httpGet, the port never broken and the
// path cut at one line) and the timings in columns. A missing timing is a t4 dash. Cells are
// placed by the grid, so the drawn order stays the document order.
import { memo } from 'react';

import { FieldValue, ListValue } from '../FieldValue';
import { runsOf } from '../atomRuns';
import { useSheetOverlay } from '../sheetOverlay';
import type { SheetAtom } from '../specSheetModel';
import { Glyph } from './Glyph';
import { type ShapeProps, groupRuns, inContainer, joinSegs } from './shapeKit';
import { Dotted } from '../Dotted';

const TIMINGS: [string, string][] = [
  ['initialDelaySeconds', 'delay'],
  ['periodSeconds', 'period'],
  ['timeoutSeconds', 'timeout'],
  ['failureThreshold', 'failures'],
  ['successThreshold', 'successes'],
];
const TIMING_KEYS = new Set(TIMINGS.map(([k]) => k));
const CHECKS = new Set(['exec', 'httpGet', 'tcpSocket', 'grpc']);

const probeOf = (atom: SheetAtom) => String(inContainer(atom)[0] ?? '');
const inProbe = (atom: SheetAtom) => inContainer(atom).slice(1);

/** The check of one probe: the atoms under exec, httpGet, tcpSocket or grpc, in order. */
function Check({ atoms }: { atoms: SheetAtom[] }) {
  const kind = String(inProbe(atoms[0])[0]);
  return (
    <span className={`check ${kind}`}>
      <Glyph name={kind === 'exec' ? 'exec' : 'http'} label={kind} />
      {runsOf(atoms).map((run) => {
        if (run.kind === 'list') {
          return (
            <span className='cmd' key={run.path}>
              <ListValue items={run.items} lines={1} />
            </span>
          );
        }
        const atom = run.atom;
        const field = joinSegs(inProbe(atom).slice(1));
        if (field === 'port') {
          return (
            <span className='cport' key={atom.key}>
              <FieldValue atom={atom}>:{String(atom.value)}</FieldValue>
            </span>
          );
        }
        if (field === 'path') {
          return (
            <span className='cpath' key={atom.key}>
              <FieldValue atom={atom} lines={1} />
            </span>
          );
        }
        return (
          <span className='pair cother' key={atom.key}>
            <span className='k'><Dotted>{field}</Dotted></span>
            <FieldValue atom={atom} lines={1} />
          </span>
        );
      })}
    </span>
  );
}

export const ProbesShape = memo(function ProbesShape({ block }: ShapeProps) {
  // Incoming draws only the incoming fields: a cell left out there has a value, so no dash.
  const filtered = !!useSheetOverlay().incoming;
  const timingCols = TIMINGS.filter(([k]) =>
    block.atoms.some((a) => joinSegs(inProbe(a)) === k),
  );
  // No probe drawn has a check (Incoming draws only the changed timings): no check column, so
  // the values stand next to their probe's name.
  const hasChecks = block.atoms.some((a) => CHECKS.has(String(inProbe(a)[0] ?? '')));
  const firstTiming = hasChecks ? 3 : 2;
  const colOf = (key: string) => firstTiming + timingCols.findIndex(([k]) => k === key);
  const probes = groupRuns(block.atoms, probeOf);
  return (
    <div
      className='grid pgrid'
      style={{
        gridTemplateColumns: hasChecks
          ? `max-content minmax(0, 1fr)${' max-content'.repeat(timingCols.length)}`
          : `max-content${' max-content'.repeat(timingCols.length)}`,
      }}
    >
      {hasChecks && (
        <span className='h' style={{ gridRow: 1, gridColumn: 2 }}>
          check
        </span>
      )}
      {timingCols.map(([k, word], i) => (
        <span className='h num' key={k} style={{ gridRow: 1, gridColumn: i + firstTiming }}>
          {word}
        </span>
      ))}
      {probes.map(({ key: probe, atoms }) => {
        // Inside one probe: the check is one cell, each timing its cell, the rest below.
        const parts = groupRuns(atoms, (a) => {
          const first = String(inProbe(a)[0] ?? '');
          if (CHECKS.has(first)) return `check:${first}`;
          if (TIMING_KEYS.has(joinSegs(inProbe(a)))) return `t:${a.key}`;
          return `x:${a.key}`;
        });
        const timings = new Set(
          atoms.map((a) => joinSegs(inProbe(a))).filter((k) => TIMING_KEYS.has(k)),
        );
        const hasCheck = parts.some((p) => p.key.startsWith('check:'));
        return (
          <div className='srow' key={atoms[0].key}>
            <span className='rl' style={{ gridRow: 1, gridColumn: 1 }}>
              {probe.replace(/Probe$/, '')}
            </span>
            {parts.map(({ key, atoms: group }) => {
              if (key.startsWith('check:')) {
                return (
                  <span className='pcheck' key={key} style={{ gridRow: 1, gridColumn: 2 }}>
                    <Check atoms={group} />
                  </span>
                );
              }
              const atom = group[0];
              const field = joinSegs(inProbe(atom));
              if (key.startsWith('t:')) {
                return (
                  <span
                    className='num'
                    key={key}
                    style={{ gridRow: 1, gridColumn: colOf(field) }}
                  >
                    <FieldValue atom={atom} unit={field.endsWith('Seconds') && typeof atom.value === 'number' ? 's' : undefined} />
                  </span>
                );
              }
              return (
                <span className='pair pextra' key={key}>
                  <span className='k'><Dotted>{field || probe}</Dotted></span>
                  <FieldValue atom={atom} lines={2} />
                </span>
              );
            })}
            {!hasCheck && hasChecks && !filtered && (
              <span className='none' style={{ gridRow: 1, gridColumn: 2 }}>
                –
              </span>
            )}
            {timingCols
              .filter(([k]) => !filtered && !timings.has(k))
              .map(([k]) => (
                <span
                  className='num none'
                  key={k}
                  style={{ gridRow: 1, gridColumn: colOf(k) }}
                >
                  –
                </span>
              ))}
          </div>
        );
      })}
    </div>
  );
});
