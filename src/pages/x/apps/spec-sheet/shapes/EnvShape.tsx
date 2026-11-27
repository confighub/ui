// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// A container's environment: a name / value table. A Secret or ConfigMap key
// reference is a key (or page) icon and the source name / key on one line (narrow: the key on
// its own line). Its `optional` is in the reference's hover card, and on the line only when
// something happened to it (`optionalOnLine`). Each `envFrom` source is one row. Over 12 rows
// the list folds.
import { visuallyHidden } from '@mui/utils';
import { type ReactNode, memo, useLayoutEffect, useRef, useState } from 'react';

import { FieldValue } from '../FieldValue';
import { type FoldItem, Folded } from '../FoldMore';
import { useSheetOverlay } from '../sheetOverlay';
import type { SheetAtom } from '../specSheetModel';

const NO_ADDS: ReadonlySet<string> = new Set();
import { Glyph } from './Glyph';
import { optionalOnLine } from './optionalMark';
import {
  type ShapeProps,
  afterListItem,
  groupRuns,
  idWord,
  joinSegs,
  nameOf,
} from './shapeKit';
import { BreakAfter, Dotted } from '../Dotted';

interface EnvItem {
  list: 'env' | 'envFrom' | '';
  rest: (string | number)[];
}

function envItemOf(atom: SheetAtom): EnvItem & { index: number } {
  const env = afterListItem(atom, 'env');
  if (env) return { list: 'env', ...env };
  const from = afterListItem(atom, 'envFrom');
  if (from) return { list: 'envFrom', ...from };
  return { list: '', index: -1, rest: atom.segments };
}

const REFS: Record<string, 'secret' | 'configMap'> = {
  secretKeyRef: 'secret',
  configMapKeyRef: 'configMap',
};

/**
 * Whether a key reference fits in the value column of its row. It is measured as one unit: the
 * widths of its parts, which never shrink, against the row's width less the name column. It does
 * not depend on where the reference is placed, so the answer is stable.
 */
function useFitsValueColumn() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [under, setUnder] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const row = el?.closest<HTMLElement>('.srow');
    if (!el || !row) return;
    const measure = () => {
      const parts = [...el.children] as HTMLElement[];
      const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
      const natural = parts.reduce((w, c) => w + c.getBoundingClientRect().width, 0) + gap * Math.max(0, parts.length - 1);
      const name = row.querySelector<HTMLElement>(':scope > .c1');
      // The row is a subgrid: its column gap is the table's.
      const table = row.closest<HTMLElement>('.env') ?? row;
      const rowGap = parseFloat(getComputedStyle(table).columnGap) || 0;
      const room = row.clientWidth - (name ? name.getBoundingClientRect().width + rowGap : 0);
      setUnder(natural > room + 0.5);
    };
    measure();
    // The row's width and the reference's own (it grows when the mono font arrives).
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, under };
}

/**
 * The value cell of a key reference: icon, source name / key, and the optional mark when it
 * shows, as one unit that is never split at the "/". Where it does not fit beside the name, the
 * whole reference goes on a line of its own under the name. `data-key-optional` gives the hover
 * card the value of `optional`.
 */
function KeyRef({ kind, atoms }: { kind: 'secret' | 'configMap'; atoms: SheetAtom[] }) {
  const overlay = useSheetOverlay();
  const { ref, under } = useFitsValueColumn();
  const field = (a: SheetAtom) => String(envItemOf(a).rest[envItemOf(a).rest.length - 1]);
  const optAtom = atoms.find((a) => field(a) === 'optional');
  const optShown = !!optAtom && optionalOnLine(overlay, optAtom, atoms);
  const hasKey = atoms.some((a) => field(a) === 'key');
  // A screen reader hears `optional` where the eye does not see it. Out of flow, inside the
  // key or the name, so the reference's measured parts stay the same.
  const spoken =
    optAtom && !optShown ? (
      <span style={visuallyHidden}>{optionalWords(optAtom)}</span>
    ) : null;
  const nodes: ReactNode[] = [];
  atoms.forEach((atom, i) => {
    const f = field(atom);
    if (f === 'name') {
      nodes.push(
        <span className='sname' key={atom.key}>
          <FieldValue atom={atom} />
          {!hasKey && spoken}
        </span>,
      );
    } else if (f === 'key') {
      const next = atoms[i + 1];
      const opt = optShown && next && field(next) === 'optional' ? next : undefined;
      nodes.push(
        <span className='skey' key={atom.key}>
          <FieldValue atom={atom} />
          {opt && <Optional atom={opt} />}
          {spoken}
        </span>,
      );
    } else if (f === 'optional') {
      if (!optShown) return;
      if (atoms[i - 1] && field(atoms[i - 1]) === 'key') return;
      nodes.push(<Optional key={atom.key} atom={atom} loose />);
    } else {
      nodes.push(
        <span className='pair sother' key={atom.key}>
          <span className='k'><Dotted>{f}</Dotted></span>
          <FieldValue atom={atom} lines={1} />
        </span>,
      );
    }
  });
  return (
    <span
      ref={ref}
      className={`ev secret c2${under ? ' under' : ''}`}
      data-testid='env-key-ref'
      data-key-optional={optAtom ? String(optAtom.value) : undefined}
    >
      <Glyph
        name={kind === 'secret' ? 'key' : 'configMap'}
        label={kind === 'secret' ? 'Secret' : 'ConfigMap'}
      />
      {nodes}
      <span className='sep' aria-hidden>
        /
      </span>
    </span>
  );
}

const optionalWords = (atom: SheetAtom) =>
  atom.value === true ? 'optional' : `optional ${String(atom.value)}`;

function Optional({ atom, loose }: { atom: SheetAtom; loose?: boolean }) {
  return (
    <span className={`sopt${loose ? ' loose' : ''}`} aria-label={`optional: ${String(atom.value)}`}>
      <FieldValue atom={atom}>
        {atom.value === true ? <Glyph name='optional' label='Optional' /> : optionalWords(atom)}
      </FieldValue>
    </span>
  );
}

function ValueCell({ atoms }: { atoms: SheetAtom[] }) {
  const rest = atoms.map((a) => envItemOf(a).rest);
  // One key reference, alone in the item: the reference cell.
  const ref = rest[0]?.[0] === 'valueFrom' ? REFS[String(rest[0][1])] : undefined;
  if (ref && rest.every((r) => r[0] === 'valueFrom' && r[1] === rest[0][1])) {
    return <KeyRef kind={ref} atoms={atoms} />;
  }
  return (
    <span className='ev c2'>
      {atoms.map((atom, i) => {
        const r = rest[i];
        if (r.length === 1 && r[0] === 'value')
          return <FieldValue key={atom.key} atom={atom} lines={2} />;
        const label = joinSegs(r[0] === 'valueFrom' ? r.slice(1) : r);
        return (
          <span className='pair' key={atom.key}>
            <span className='k'><Dotted>{label}</Dotted></span>
            <FieldValue atom={atom} lines={2} />
          </span>
        );
      })}
    </span>
  );
}

function FromCell({ atoms }: { atoms: SheetAtom[] }) {
  return (
    <span className='ev c2'>
      {atoms.map((atom) => {
        const r = envItemOf(atom).rest;
        const source = String(r[0]);
        const isRef = (source === 'secretRef' || source === 'configMapRef') && r[1] === 'name';
        if (isRef) {
          return (
            <span className='pair' key={atom.key}>
              <Glyph
                name={source === 'secretRef' ? 'key' : 'configMap'}
                label={source === 'secretRef' ? 'Secret' : 'ConfigMap'}
              />
              <FieldValue atom={atom} lines={2} />
            </span>
          );
        }
        return (
          <span className='pair' key={atom.key}>
            <span className='k'><Dotted>{joinSegs(r)}</Dotted></span>
            <FieldValue atom={atom} lines={2} />
          </span>
        );
      })}
    </span>
  );
}

export const EnvShape = memo(function EnvShape({ block, part }: ShapeProps) {
  const overlay = useSheetOverlay();
  const addedNames = overlay.incoming ? NO_ADDS : (overlay.edit?.adds ?? NO_ADDS);
  const groups = groupRuns(block.atoms, (a) => {
    const it = envItemOf(a);
    return it.list ? `${it.list}.${it.index}` : a.key;
  });
  const items: FoldItem[] = groups.map(({ key, atoms }) => {
    const list = envItemOf(atoms[0]).list;
    if (list === 'envFrom') {
      const secret = atoms.some((a) => envItemOf(a).rest[0] === 'secretRef');
      return {
        key,
        atoms,
        node: (
          <div className='srow'>
            <span className='en c1'>{secret ? 'from Secret' : 'from ConfigMap'}</span>
            <FromCell atoms={atoms} />
          </div>
        ),
      };
    }
    if (list === '') {
      // `env: []` or `envFrom: []`: the key and its empty value.
      return {
        key,
        atoms,
        node: (
          <div className='srow'>
            <span className='en c1'>
              {String(atoms[0].segments[atoms[0].segments.length - 1])}
            </span>
            <span className='ev c2'>
              <FieldValue atom={atoms[0]} />
            </span>
          </div>
        ),
      };
    }
    const { name, place, rest } = nameOf(atoms, (a) => joinSegs(envItemOf(a).rest) === 'name');
    const nameText = name ? String(name.value ?? '') : '';
    const nameCell = name ? (
      <span
        className='en c1'
        data-testid={`field-env-name-${part.testKey}-${idWord(nameText)}`}
        title={nameText}
      >
        {/* The name of an env var this person adds is the row's label, not a value of its own.
            A long name wraps after an underscore and is never cut. */}
        {addedNames.has(name.key) ? (
          <BreakAfter after='_'>{nameText}</BreakAfter>
        ) : (
          <FieldValue atom={name}>{nameText ? <BreakAfter after='_'>{nameText}</BreakAfter> : undefined}</FieldValue>
        )}
      </span>
    ) : (
      <span className='en c1 none'>–</span>
    );
    const value =
      rest.length > 0 ? <ValueCell atoms={rest} /> : <span className='ev c2 none'>–</span>;
    return {
      key,
      atoms,
      node: (
        <div className='srow'>
          {place !== 'last' && nameCell}
          {value}
          {place === 'last' && nameCell}
        </div>
      ),
    };
  });
  return (
    <div className='env'>
      <Folded items={items} />
    </div>
  );
});
