// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// What Incoming shows that the Unit's own document does not hold: keys only upstream has, and
// resources upstream adds or deletes whole. Pure: the sheet model stays the Unit's document.

import type { WholeResourceChange } from '../componentTypes';
import { STAGE_KEY_SEP, stageKeyDocId, stageKeyPath } from '../diffTree';
import { buildSpecSheet, type SheetAtom, type SheetBlock, type SheetPart, type SheetResource, type SpecSheet } from './specSheetModel';

const kebab = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The parts of a resource upstream adds whole, read from its YAML, to draw it muted under its
 * head. Its atoms get keys of their own (the change's key and the path), so no overlay of the
 * Unit's own fields applies to them.
 */
function wholeResourceParts(data: string, changeKey: string, index: number): { parts: SheetPart[]; atoms: SheetAtom[] } | undefined {
  const resource = buildSpecSheet(data, { scopedWritesSupported: true }).resources[0];
  if (!resource) return undefined;
  const remap = (atom: SheetAtom): SheetAtom => ({ ...atom, key: `${changeKey}${STAGE_KEY_SEP}${atom.path}`, resource: index });
  const atoms: SheetAtom[] = [];
  const parts = resource.parts.map((part) => ({
    ...part,
    titleAtom: part.titleAtom ? remap(part.titleAtom) : undefined,
    blocks: part.blocks.map((block) => {
      const blockAtoms = block.atoms.map(remap);
      atoms.push(...blockAtoms);
      return { ...block, atoms: blockAtoms };
    }),
  }));
  return { parts, atoms };
}

const segmentsOf = (path: string): (string | number)[] =>
  path.split('.').map((s) => (/^\d+$/.test(s) ? Number(s) : s));

/**
 * The block that draws the list a key added upstream is an element of, such as the Env of a
 * container for an env var upstream adds: the block with an atom in the same list.
 */
function listBlockOf(resource: SheetResource, path: string): { block: SheetBlock; partKey: string; list: string; element: string } | undefined {
  const segments = path.split('.');
  for (let i = segments.length - 1; i > 0; i--) {
    if (!/^\d+$/.test(segments[i])) continue;
    const list = segments.slice(0, i).join('.');
    for (const part of resource.parts) {
      for (const block of part.blocks) {
        if (block.atoms.some((a) => a.path.startsWith(`${list}.`) && /^\d+(\.|$)/.test(a.path.slice(list.length + 1)))) {
          return { block, partKey: part.testKey, list, element: segments.slice(0, i + 1).join('.') };
        }
      }
    }
  }
  return undefined;
}

/**
 * `sheet` plus the keys this person adds and has not written yet, each in the block it
 * goes into: a key of a map after the block's last key, an item of a list (an env var) after
 * the list's last item. A key with no such block is left out until it is written.
 */
export function withStagedAdds(sheet: SpecSheet, adds: ReadonlySet<string>, edits: ReadonlyMap<string, string>): SpecSheet {
  const drawn = new Set(sheet.atoms.map((a) => a.key));
  const missing = [...adds].filter((k) => !drawn.has(k) && edits.has(k));
  if (missing.length === 0) return sheet;
  const byBlock = new Map<SheetBlock, SheetAtom[]>();
  for (const key of missing) {
    const docId = stageKeyDocId(key);
    const resource = sheet.resources.find((r) => r.docId === docId) ?? (docId === undefined ? sheet.resources[0] : undefined);
    if (!resource) continue;
    const path = stageKeyPath(key);
    const prefix = key.slice(0, key.length - path.length);
    const inList = listBlockOf(resource, path);
    let block: SheetBlock | undefined;
    let testKey: string;
    if (inList) {
      block = inList.block;
      const name = edits.get(`${prefix}${inList.element}.name`);
      const rest = path.slice(inList.element.length + 1);
      testKey = [inList.partKey, kebab(inList.list.split('.').pop() ?? ''), name ? kebab(name) : kebab(inList.element.split('.').pop() ?? ''), rest === 'value' ? '' : kebab(rest)].filter(Boolean).join('-');
    } else {
      const parent = path.slice(0, path.lastIndexOf('.'));
      block = resource.parts.flatMap((p) => p.blocks).find((b) => b.atoms.some((a) => a.path.slice(0, a.path.lastIndexOf('.')) === parent));
      testKey = `${block?.testKey ?? resource.id}-${kebab(path.split('.').pop() ?? '')}`;
    }
    if (!block) continue;
    const atom: SheetAtom = { key, path, segments: segmentsOf(path), value: edits.get(key) ?? '', resource: resource.index, testKey };
    byBlock.set(block, [...(byBlock.get(block) ?? []), atom]);
  }
  if (byBlock.size === 0) return sheet;
  let atoms = [...sheet.atoms];
  for (const [block, added] of byBlock) {
    const at = atoms.indexOf(block.atoms[block.atoms.length - 1]);
    atoms = [...atoms.slice(0, at + 1), ...added, ...atoms.slice(at + 1)];
  }
  const resources = sheet.resources.map((resource) => ({
    ...resource,
    parts: resource.parts.map((part) =>
      part.blocks.some((b) => byBlock.has(b))
        ? {
            ...part,
            blocks: part.blocks.map((b) => (byBlock.has(b) ? { ...b, atoms: [...b.atoms, ...(byBlock.get(b) ?? [])] } : b)),
            atomCount: part.atomCount + part.blocks.reduce((n, b) => n + (byBlock.get(b)?.length ?? 0), 0),
          }
        : part,
    ),
  }));
  return { resources, atoms };
}

/**
 * `sheet` plus the incoming keys it does not draw. A key of a list element upstream adds goes
 * into the block that draws the list, after its last element; any other goes into a part
 * "Added upstream" at the end of its resource. Each whole-resource change is a head-only
 * resource. `upstream` gives an added element its name, for its row and its test id.
 */
export function withIncomingAdditions(
  sheet: SpecSheet,
  incomingKeys: ReadonlySet<string>,
  wholeChanges: readonly WholeResourceChange[],
  availableWholeKeys: ReadonlySet<string>,
  upstream: ReadonlyMap<string, string> = new Map(),
): SpecSheet {
  const drawn = new Set(sheet.atoms.map((a) => a.key));
  const wholeKeys = new Set(wholeChanges.map((c) => c.key));
  const missing = [...incomingKeys].filter((k) => !drawn.has(k) && !wholeKeys.has(k));
  if (missing.length === 0 && wholeChanges.length === 0) return sheet;

  const byResource = new Map<SheetResource, SheetAtom[]>();
  const byBlock = new Map<SheetBlock, SheetAtom[]>();
  for (const key of missing) {
    const docId = stageKeyDocId(key);
    const resource = sheet.resources.find((r) => r.docId === docId) ?? (docId === undefined ? sheet.resources[0] : undefined);
    if (!resource) continue;
    const path = stageKeyPath(key);
    const inList = listBlockOf(resource, path);
    if (inList) {
      // Named as the sheet names a list element: by the value of its `name`.
      const name = upstream.get(key.slice(0, key.length - path.length) + `${inList.element}.name`);
      const rest = path.slice(inList.element.length + 1);
      const listWord = kebab(inList.list.split('.').pop() ?? '');
      const elementWord = name ? kebab(name) : kebab(inList.element.split('.').pop() ?? '');
      const atom: SheetAtom = {
        key,
        path,
        segments: segmentsOf(path),
        value: upstream.get(key) ?? '',
        resource: resource.index,
        testKey: [inList.partKey, listWord, elementWord, rest === 'value' ? '' : kebab(rest)].filter(Boolean).join('-'),
        added: true,
      };
      byBlock.set(inList.block, [...(byBlock.get(inList.block) ?? []), atom]);
      continue;
    }
    const atom: SheetAtom = {
      key,
      path,
      segments: path.split('.'),
      value: '',
      resource: resource.index,
      testKey: `${resource.id}-added-${kebab(path)}`,
      added: true,
    };
    byResource.set(resource, [...(byResource.get(resource) ?? []), atom]);
  }

  let atoms = [...sheet.atoms];
  for (const [block, added] of byBlock) {
    // After the block's last atom, in the block and in the sheet's document order.
    const last = block.atoms[block.atoms.length - 1];
    const at = atoms.indexOf(last);
    atoms = [...atoms.slice(0, at + 1), ...added, ...atoms.slice(at + 1)];
  }
  const withBlocks = (resource: SheetResource): SheetResource =>
    byBlock.size === 0
      ? resource
      : {
          ...resource,
          parts: resource.parts.map((part) =>
            part.blocks.some((b) => byBlock.has(b))
              ? {
                  ...part,
                  blocks: part.blocks.map((b) => (byBlock.has(b) ? { ...b, atoms: [...b.atoms, ...(byBlock.get(b) ?? [])] } : b)),
                  atomCount: part.atomCount + part.blocks.reduce((n, b) => n + (byBlock.get(b)?.length ?? 0), 0),
                }
              : part,
          ),
        };
  const resources: SheetResource[] = sheet.resources.map((original) => {
    const resource = withBlocks(original);
    const added = byResource.get(original);
    if (!added) return resource;
    const partKey = `${resource.id}-added`;
    const block: SheetBlock = { id: `${partKey}-values`, testKey: `${partKey}-values`, key: 'added', label: 'Added', atoms: added, prefix: '' };
    const part: SheetPart = { id: partKey, testKey: partKey, kind: 'section', title: 'Added upstream', blocks: [block], atomCount: added.length };
    atoms.push(...added);
    return { ...resource, parts: [...resource.parts, part] };
  });

  for (const change of wholeChanges) {
    const added = change.data ? wholeResourceParts(change.data, change.key, resources.length) : undefined;
    if (added) atoms.push(...added.atoms);
    const type = change.resource?.ResourceType ?? '';
    const [apiVersion, kind] = type.includes('/') ? [type.slice(0, type.lastIndexOf('/')), type.slice(type.lastIndexOf('/') + 1)] : [undefined, type || undefined];
    const name = change.resource?.ResourceNameWithoutScope ?? change.resource?.ResourceName?.split('/').pop();
    let id = kebab([kind, name].filter(Boolean).join(' ')) || `whole-${resources.length + 1}`;
    while (resources.some((r) => r.id === id)) id = `${id}-2`;
    resources.push({
      id,
      index: resources.length,
      kind,
      name,
      apiVersion,
      parts: added?.parts ?? [],
      structured: true,
      whole: { key: change.key, change: change.wholeResource, available: availableWholeKeys.has(change.key) },
    });
  }
  return { resources, atoms };
}
