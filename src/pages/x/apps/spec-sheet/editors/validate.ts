// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// What kind of value a field holds, for its editor and its check. An invalid value keeps the
// editor open with a short error.

import { parseImageRef } from '../../imageRef';

export type EditorKind = 'image' | 'quantity' | 'integer' | 'boolean' | 'line' | 'multiline';

const QUANTITY_PATH = /(^|\.)resources\.(requests|limits)\.[^.]+$/;
const INTEGER_KEYS = new Set([
  'replicas',
  'containerPort',
  'hostPort',
  'port',
  'targetPort',
  'nodePort',
  'initialDelaySeconds',
  'periodSeconds',
  'timeoutSeconds',
  'failureThreshold',
  'successThreshold',
  'terminationGracePeriodSeconds',
  'revisionHistoryLimit',
  'minReadySeconds',
  'progressDeadlineSeconds',
  'runAsUser',
  'runAsGroup',
  'fsGroup',
]);

/** The editor a field gets, from its path and its current value. */
export function editorKindOf(path: string, value: unknown): EditorKind {
  const last = path.split('.').pop() ?? '';
  if (last === 'image' && /(^|\.)(containers|initContainers)\.\d+\.image$/.test(path)) return 'image';
  if (QUANTITY_PATH.test(path)) return 'quantity';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
  if (INTEGER_KEYS.has(last) && (typeof value === 'number' || value === undefined)) return 'integer';
  if (typeof value === 'string' && value.includes('\n')) return 'multiline';
  return 'line';
}

const QUANTITY = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+|Ki|Mi|Gi|Ti|Pi|Ei|n|u|m|k|M|G|T|P|E)?$/;
const IMAGE_TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const DIGEST = /^[A-Za-z][A-Za-z0-9]*([-_+.][A-Za-z][A-Za-z0-9]*)*:[0-9a-fA-F]{32,}$/;

/**
 * The short error of an invalid value, or undefined when it is valid. For an image,
 * `imagePrefix` is the part the editor keeps (`imagePrefixOf`): what is typed must fit the
 * separator it ends with, a digest after `@` and an image tag after `:`, or the reference the
 * editor joins is broken (`nginx@1.25.3`).
 */
export function validateValue(kind: EditorKind, text: string, imagePrefix?: string): string | undefined {
  switch (kind) {
    case 'quantity':
      return QUANTITY.test(text.trim()) ? undefined : 'Not a quantity: try 4Gi';
    case 'integer':
      return /^-?\d+$/.test(text.trim()) ? undefined : 'Not a whole number';
    case 'boolean':
      return text === 'true' || text === 'false' ? undefined : 'Not true or false';
    case 'image':
      if (imagePrefix?.endsWith('@')) return DIGEST.test(text) ? undefined : 'Not a digest';
      if (imagePrefix !== undefined) return IMAGE_TAG.test(text) ? undefined : 'Not an image tag';
      return IMAGE_TAG.test(text) || DIGEST.test(text) ? undefined : 'Not an image tag';
    default:
      return undefined;
  }
}

/** The part of an image the editor keeps: everything before the image tag or digest. */
export function imagePrefixOf(image: string): { prefix: string; tag: string } {
  const ref = parseImageRef(image);
  const tail = ref?.digest ? `@${ref.digest}` : ref?.tag ? `:${ref.tag}` : '';
  if (!tail || !image.endsWith(tail)) return { prefix: `${image}:`, tag: '' };
  return { prefix: image.slice(0, image.length - tail.length + 1), tag: tail.slice(1) };
}

