// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
// One part of a resource (Metadata, Spec, Pod, a container, Volumes): its head always mounts;
// its blocks mount when the part comes within reach of the scroll area, and stay mounted. Its
// quiet Kubernetes defaults are not drawn: those that belong to a value are in that value's
// hover card, and the rest are in one fold line at the end of the part (kubeDefaults.ts).
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import { HEADING_SHAPES } from './headingShapes';
import { shapeFor } from './shapes/registry';
import { isQuiet, useSheetOverlay } from './sheetOverlay';
import { BlockIcon, PartIcon } from './sheetIcons';
import { PartFold } from './PartFold';
import { AddKeyEditor } from './AddKeyEditor';
import { Dotted } from './Dotted';
import { BlockActions } from './BlockActions';
import { STAGE_KEY_SEP } from '../diffTree';
import type { QuietDefaults } from './kubeDefaults';
import type { SheetBlock, SheetPart } from './specSheetModel';

/** How far below the visible area a part mounts its blocks, so a scroll never shows a gap. */
const MOUNT_MARGIN_PX = 1500;
/** The height a part takes before its blocks mount: about one line per field. */
const LINE_PX = 24;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
    node = node.parentElement;
  }
  return null;
}

/** True once the element has come within MOUNT_MARGIN_PX of its scroll area. */
function useMountedWhenNear(force: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (near || force) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { root: scrollParentOf(el), rootMargin: `${MOUNT_MARGIN_PX}px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [near, force]);
  return { ref, mounted: near || force };
}

export const Block = memo(function Block({
  block,
  full = block,
  part,
  resourceKind,
  hidden,
  lone,
}: {
  /** The block as drawn: its quiet defaults left out. */
  block: SheetBlock;
  /** The whole block, which its actions (Keep, Add a key) act on. */
  full?: SheetBlock;
  part: SheetPart;
  resourceKind?: string;
  hidden?: boolean;
  /** The only block of a card titled with its label: the label is not drawn again. */
  lone?: boolean;
}) {
  const overlay = useSheetOverlay();
  const edit = overlay.incoming ? undefined : overlay.edit;
  const { id: shapeId, Renderer } = shapeFor({ resourceKind, partKind: part.kind, blockKey: block.key });
  const heading = HEADING_SHAPES.has(shapeId);
  return (
    <div
      className={`blk${heading ? ' bhead' : ''}${lone ? ' lone' : ''}`}
      data-testid={`blk-${block.testKey}`}
      data-hidden={hidden ? 'true' : undefined}
    >
      <div className='blabel' data-testid={`blk-label-${block.testKey}`}>
        {heading && !lone && <BlockIcon shape={shapeId} />}
        {!lone && <Dotted>{block.label}</Dotted>}
        {edit && (
          <BlockActions
            keepable={keepableAtoms(full, edit).length}
            canAdd={isMapBlock(full) || !!envListOf(full, part)}
            onKeep={() => keepableAtoms(full, edit).forEach((a) => edit.setKeep(a.key, true, false))}
            onAdd={() => edit.openAdd(block.id)}
          />
        )}
      </div>
      <div className='bbody'>
        <Renderer block={block} part={part} resourceKind={resourceKind} />
        {edit?.addingBlockId === block.id && (() => {
          const env = envListOf(full, part);
          const keyOf = (path: string) => (block.docId ? `${block.docId}${STAGE_KEY_SEP}${path}` : path);
          return env ? (
            // An env var is an item of the env list: its name and its value, staged as one add.
            <AddKeyEditor
              block={full}
              validate={(name) => (env.names.has(name) ? `\`${name}\` already exists in \`env\`` : undefined)}
              onCancel={edit.close}
              onStage={(name, value) => {
                edit.stage(keyOf(`${env.path}.${env.next}.name`), name, true);
                edit.stage(keyOf(`${env.path}.${env.next}.value`), value, true);
              }}
            />
          ) : (
            <AddKeyEditor
              block={full}
              onCancel={edit.close}
              onStage={(key, value) => edit.stage(keyOf(`${block.prefix}.${key}`), value, true)}
            />
          );
        })()}
      </div>
    </div>
  );
});

interface PartProps {
  part: SheetPart;
  /** Mount the blocks now (a search matched in this part). */
  forceMount: boolean;
  /** Ids of the blocks a search hides; undefined when there is no search. */
  hiddenBlocks?: ReadonlySet<string>;
  hidden?: boolean;
  /** The resource's kind, which gates the Kubernetes shapes. */
  resourceKind?: string;
  /** Two columns: the card shows only this block of the part, titled with its label. */
  split?: SheetBlock;
  /** Two columns: the part's blocks that are cards of their own. */
  omit?: ReadonlySet<string>;
}

/** A block of one map (labels, annotations, ConfigMap data) takes new keys; a list does not. */
function isMapBlock(block: SheetBlock): boolean {
  if (!block.prefix) return false;
  return block.atoms.every((a) => a.path.startsWith(`${block.prefix}.`) && !/^\d+$/.test(a.path.slice(block.prefix.length + 1).split('.')[0]));
}

/**
 * The env list of a container's Env block (env is a list of name / value items, and Add a
 * key adds an item): its path, the index the new item takes, and the names it holds. Undefined
 * for any other block.
 */
function envListOf(block: SheetBlock, part: SheetPart): { path: string; next: number; names: Set<string> } | undefined {
  if (block.key !== 'env' || (part.kind !== 'container' && part.kind !== 'init')) return undefined;
  let path: string | undefined;
  let next = 0;
  const names = new Set<string>();
  for (const atom of block.atoms) {
    const s = atom.segments;
    const at = s.findIndex((seg, i) => (seg === 'env' || seg === 'envFrom') && (typeof s[i + 1] === 'number' || i === s.length - 1));
    if (at < 0) continue;
    path ??= [...s.slice(0, at), 'env'].join('.');
    if (s[at] !== 'env' || typeof s[at + 1] !== 'number') continue;
    next = Math.max(next, (s[at + 1] as number) + 1);
    if (s[at + 2] === 'name' && s.length === at + 3) names.add(String(atom.value));
  }
  return path === undefined ? undefined : { path, next, names };
}

/** The keys of the block "Keep this block" would stage: not array-indexed, not kept already. */
function keepableAtoms(block: SheetBlock, edit: NonNullable<ReturnType<typeof useSheetOverlay>['edit']>) {
  return block.atoms.filter(
    (a) => !a.emptyContainer && !/\.\d+(\.|$)/.test(a.path) && !(edit.protection.get(a.key) ?? edit.isKept(a.path)),
  );
}

const KIND_WORD: Partial<Record<SheetPart['kind'], string>> = {
  container: 'container',
  init: 'init container',
};

export const Part = memo(function Part({
  part,
  forceMount,
  hiddenBlocks,
  hidden,
  resourceKind,
  split,
  omit,
}: PartProps) {
  const overlay = useSheetOverlay();
  const [opened, setOpened] = useState(false);
  // An init container with nothing set here and nothing changed folds to one line.
  const folded = !split && !opened && !forceMount && part.kind === 'init' && isQuiet(overlay, part);
  const { ref, mounted } = useMountedWhenNear(forceMount);
  const blocks = useMemo(
    () => (split ? [split] : omit ? part.blocks.filter((b) => !omit.has(b.id)) : part.blocks),
    [split, omit, part.blocks],
  );
  const atomCount = split || omit ? blocks.reduce((n, b) => n + b.atoms.length, 0) : part.atomCount;
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const drawn = useDrawnBlocks(blocks, overlay.defaults, defaultsOpen);
  const testKey = split ? split.testKey : part.testKey;
  // A split card is titled with its block and names the section it comes from.
  const kindWord = split ? part.title : KIND_WORD[part.kind];
  const title = split ? split.label : part.title;
  return (
    <section
      className={split ? 'part split' : 'part'}
      data-testid={split ? `card-${split.testKey}` : `part-${part.testKey}`}
      data-hidden={hidden ? 'true' : undefined}
    >
      <div className='phead'>
        <PartIcon kind={part.kind} />
        <span
          className='pname'
          data-testid={split ? undefined : `part-title-${part.testKey}`}
          data-stage-key={split ? undefined : part.titleAtom?.key}
          data-path={split ? undefined : part.titleAtom?.path}
          title={title}
        >
          {title}
        </span>
        {kindWord && <span className='pkind'>{kindWord}</span>}
      </div>
      {folded ? (
        <PartFold part={part} onOpen={() => setOpened(true)} />
      ) : (
        <div className='pbody' ref={ref} style={mounted ? undefined : { minHeight: atomCount * LINE_PX }}>
          {mounted &&
            drawn.blocks.map(({ block, full }) => (
              <Block
                key={block.id}
                block={block}
                full={full}
                part={part}
                resourceKind={resourceKind}
                hidden={hiddenBlocks?.has(block.id)}
                lone={!!split}
              />
            ))}
          {mounted && drawn.alone > 0 && (
            <div className='dfoot'>
              <button
                type='button'
                className={`dfold${defaultsOpen ? ' open' : ''}`}
                data-testid={`defaults-fold-${testKey}`}
                aria-expanded={defaultsOpen}
                onClick={() => setDefaultsOpen((o) => !o)}
              >
                <svg viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='2' aria-hidden>
                  <path d='M6 4l4 4-4 4' />
                </svg>
                {drawn.alone} Kubernetes {drawn.alone === 1 ? 'default' : 'defaults'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
});

/**
 * The blocks as drawn: the quiet defaults said in a value's card left out, and those that stand
 * alone left out while the part's fold line is closed. A block with nothing left is not drawn.
 * `alone` counts the fields the fold line holds.
 */
function useDrawnBlocks(
  blocks: SheetBlock[],
  defaults: QuietDefaults | undefined,
  open: boolean,
): { blocks: { block: SheetBlock; full: SheetBlock }[]; alone: number } {
  return useMemo(() => {
    if (!defaults || (defaults.hosted.size === 0 && defaults.alone.size === 0)) {
      return { blocks: blocks.map((b) => ({ block: b, full: b })), alone: 0 };
    }
    let alone = 0;
    const out: { block: SheetBlock; full: SheetBlock }[] = [];
    for (const b of blocks) {
      const atoms = b.atoms.filter((a) => {
        if (defaults.hosted.has(a.key)) return false;
        if (!defaults.alone.has(a.key)) return true;
        alone++;
        return open;
      });
      if (atoms.length === 0) continue;
      out.push({ block: atoms.length === b.atoms.length ? b : { ...b, atoms }, full: b });
    }
    return { blocks: out, alone };
  }, [blocks, defaults, open]);
}
