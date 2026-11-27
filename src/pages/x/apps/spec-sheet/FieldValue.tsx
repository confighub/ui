// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// One field's value: the atom a person hovers, focuses and (later) clicks to edit. Plain
// elements with class names, styled once by the sheet root, so a Unit of thousands of fields
// mounts no MUI component per value.
import { Fragment, type ReactNode, memo } from 'react';

import { FieldEditor } from './FieldEditor';
import { getInlineDiffPair } from '../inlineDiff';
import { InlineDiffSegments } from '../ValuePill';
import { IncomingField } from './IncomingField';
import { KeptMark, StagedMark, StateMark } from './StateMark';
import { editorKindOf } from './editors/validate';
import { originClass, useSheetOverlay } from './sheetOverlay';
import type { SheetAtom } from './specSheetModel';
import { atomText } from './specSheetModel';
import { isStagedDeleteSentinel } from './staging/types';

export type ValueLines = 1 | 2 | 'wrap';

/** The text of a value, with `""`, `null` and newlines written so they can be seen. */
export function ValueText({ atom }: { atom: SheetAtom }) {
  if (atom.emptyContainer) return <span className='lit'>{atomText(atom)}</span>;
  if (atom.value === null || atom.value === undefined)
    return <span className='lit'>null</span>;
  if (atom.value === '') return <span className='lit'>&quot;&quot;</span>;
  const text = atomText(atom);
  if (!text.includes('\n')) return <>{text}</>;
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {line}
          {i < lines.length - 1 && <span className='ret'>↵</span>}
        </Fragment>
      ))}
    </>
  );
}

interface FieldValueProps {
  atom: SheetAtom;
  lines?: ValueLines;
  /** Overrides the test id word (a list draws its items as one value). */
  testKey?: string;
  /** Draws the value another way (an image as repository and image tag); the atom stays the same. */
  children?: ReactNode;
  /**
   * Text after the value, such as "s" after a probe's seconds. It follows the value in every
   * state (as set, staged, incoming), so an incoming value reads as the sheet writes it.
   */
  unit?: string;
}

export const FieldValue = memo(function FieldValue({
  atom,
  lines = 'wrap',
  testKey,
  children,
  unit,
}: FieldValueProps) {
  const overlay = useSheetOverlay();
  const clamp = lines === 1 ? ' clamp1' : lines === 2 ? ' clamp2' : '';
  const word = testKey ?? atom.testKey;
  const stale = overlay.stale.has(atom.key);
  const unreleased = overlay.unreleased.has(atom.key);
  const edit = overlay.incoming ? undefined : overlay.edit;
  if (edit && edit.editingKey === atom.key) {
    const current = edit.edits.get(atom.key);
    return (
      <FieldEditor
        kind={editorKindOf(atom.path, atom.value)}
        initial={
          current !== undefined && !isStagedDeleteSentinel(current) ? current : atomText(atom)
        }
        onStage={(next) =>
          next === atomText(atom) ? edit.unstage(atom.key) : edit.stage(atom.key, next)
        }
        onCancel={edit.close}
      />
    );
  }
  const staged = edit?.edits.get(atom.key);
  const removed = staged !== undefined && isStagedDeleteSentinel(staged);
  const addedHere = staged !== undefined && !removed && !!edit?.adds.has(atom.key);
  const stagedClass = staged === undefined ? '' : removed ? ' removed' : addedHere ? ' added' : ' staged';
  const keepStaged = edit?.protection.get(atom.key);
  const kept = keepStaged ?? edit?.isKept(atom.path) ?? false;
  const openEditor = edit ? () => edit.open(atom.key) : undefined;
  // The value's span; Incoming draws it with what the field becomes in place of its value.
  const valueSpan = (content?: ReactNode, state?: string) => (
    <span
      className={`v${clamp}${originClass(overlay, atom.key)}${stagedClass}${state ? ` inc-${state}` : ''}`}
      data-testid={`field-value-${word}`}
      data-stage-key={atom.key}
      data-path={atom.path}
      tabIndex={0}
      title={lines === 'wrap' ? undefined : atomText(atom)}
      role={openEditor ? 'button' : undefined}
      onClick={openEditor}
      onKeyDown={
        openEditor
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openEditor();
              }
            }
          : undefined
      }
    >
      {content ??
        (staged !== undefined && !removed ? <StagedText from={atomText(atom)} to={staged} added={addedHere} /> : (children ?? <ValueText atom={atom} />))}
      {unit && !removed && state !== 'removed' ? unit : null}
    </span>
  );
  const value = valueSpan();
  if (overlay.incoming?.keys.has(atom.key)) {
    return (
      <IncomingField
        stageKey={atom.key}
        testKey={word}
        incoming={overlay.incoming}
        added={atom.added}
        currentText={atom.added ? undefined : atomText(atom)}
        unit={unit}
        renderValue={valueSpan}
      >
        {value}
      </IncomingField>
    );
  }
  if (!stale && !unreleased && staged === undefined && !kept) return value;
  // The value and its marks share one line; the marks follow the value's last line.
  return (
    <span className='vm'>
      {value}
      {staged !== undefined && (
        <StagedMark kind={removed ? 'delete' : addedHere ? 'add' : 'edit'} testId={`field-staged-${word}`} />
      )}
      {kept && <KeptMark staged={keepStaged === true} testId={`field-kept-${word}`} />}
      {stale && <StateMark kind='stale' testId={`field-state-${word}`} />}
      {unreleased && (
        <StateMark kind='unreleased' testId={stale ? undefined : `field-state-${word}`} />
      )}
    </span>
  );
});

/** A staged value, its changed tokens marked in the edit hue (flat for an add, or when too long). */
function StagedText({ from, to, added }: { from: string; to: string; added: boolean }) {
  if (added) return <>{to}</>;
  const diff = getInlineDiffPair(from, to);
  return diff.truncated ? <>{to}</> : <InlineDiffSegments segments={diff.new} changeType='edit' />;
}

/**
 * A list of plain values (`command`, `args`, `drop`) drawn as one value: its items joined by
 * spaces, each item its own element with its own stage key.
 */
export const ListValue = memo(function ListValue({
  items,
  lines = 'wrap',
}: {
  items: SheetAtom[];
  lines?: ValueLines;
}) {
  const overlay = useSheetOverlay();
  const first = items[0];
  const word = first.list?.testKey ?? first.testKey;
  const clamp = lines === 1 ? ' clamp1' : lines === 2 ? ' clamp2' : '';
  const title = items.map(atomText).join(' ');
  const stale = items.some((i) => overlay.stale.has(i.key));
  const unreleased = items.some((i) => overlay.unreleased.has(i.key));
  const value = (
    <span
      className={`v list${clamp}`}
      data-testid={`field-value-${word}`}
      title={lines === 'wrap' ? undefined : title}
    >
      {items.map((item, i) => (
        <Fragment key={item.key}>
          {i > 0 && ' '}
          <span
            className={`item${originClass(overlay, item.key)}`}
            data-stage-key={item.key}
            data-path={item.path}
            tabIndex={0}
          >
            {typeof item.value === 'string' &&
            /\s/.test(item.value) &&
            !item.value.includes('\n') ? (
              <>&apos;{item.value}&apos;</>
            ) : (
              <ValueText atom={item} />
            )}
          </span>
        </Fragment>
      ))}
    </span>
  );
  if (!stale && !unreleased) return value;
  return (
    <span className='vm'>
      {value}
      {stale && <StateMark kind='stale' testId={`field-state-${word}`} />}
      {unreleased && (
        <StateMark kind='unreleased' testId={stale ? undefined : `field-state-${word}`} />
      )}
    </span>
  );
});
