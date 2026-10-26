// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
/**
 * HOW THE CHANGE CARD NAMES A FIELD, AND WHAT IT SAYS WHEN IT HAS NOTHING TO SHOW.
 *
 * One label function serves every surface of the card, so a field reads the same
 * in a problem item as anywhere else; an image move shows its image tags. And the
 * card never says "writes no field" while the change is still being read, could
 * not be read, or has not reached the stage before.
 */
import { expect, test } from '@playwright/test';

import type { PathSegment } from '@confighub/rtk-query';

import { changeCardNotice, changeFieldLabel, imageValueText } from '../src/pages/change-orders/stage/stageChangeLines';
import type { ChangeOrderChangeGroup } from '../src/pages/x/apps/change-order/changeOrderTypes';

const IMAGE_SEGMENTS: PathSegment[] = [
  { Field: 'spec', FromIndex: -1, ToIndex: -1 },
  { Field: 'template', FromIndex: -1, ToIndex: -1 },
  { Field: 'spec', FromIndex: -1, ToIndex: -1 },
  { Field: 'containers', FromIndex: -1, ToIndex: -1 },
  { FromIndex: 0, ToIndex: 0, MergeKeys: [{ Key: 'name', Value: 'api' }] },
  { Field: 'image', FromIndex: -1, ToIndex: -1 },
];

const IMAGE_PATH = 'spec.template.spec.containers[name=api].image';

test.describe('field labels and image values', () => {
  test('image pills: a repository move keeps the name; a digest stands in for a tag that did not move', () => {
    expect(imageValueText('docker.io/library/nginx:1.26', 'ghcr.io/acme/nginx:1.25')).toBe('nginx:1.26');
    expect(imageValueText('api:v1@sha256:aaaabbbbccccdddd', 'api:v1@sha256:1111222233334444')).toBe('@aaaa…dddd');
    expect(imageValueText('api@sha256:aaaabbbbccccdddd', 'api@sha256:1111222233334444')).toBe('@aaaa…dddd');
  });

  test('one label function for every surface', () => {
    expect(changeFieldLabel(IMAGE_SEGMENTS, IMAGE_PATH)).toBe('image tag');
    expect(changeFieldLabel(null, 'spec.template.spec.containers.0.image')).toBe('image tag');
    expect(changeFieldLabel(null, 'spec.template.spec.containers.?name=api.image')).toBe('image tag');
    expect(changeFieldLabel(null, 'spec.replicas')).toBe('spec.replicas');
  });
});

test.describe('changeCardNotice', () => {
  const read: ChangeOrderChangeGroup = { unitId: 'a/api', resourceName: 'api', fieldDiffs: [], written: false, determinable: true };
  const unread: ChangeOrderChangeGroup = { ...read, determinable: false };

  test('while the change is read, it says so, never "writes no field"', () => {
    expect(changeCardNotice({ status: 'loading', fieldCount: 0, groups: [] })).toEqual({ kind: 'reading', text: 'Reading the change…' });
  });

  test('a stage the change has not reached says when it will show', () => {
    const notice = changeCardNotice({ status: 'resolved', fieldCount: 0, groups: [read], notReachedFrom: { stageId: 'staging', name: 'staging' }, sourceFieldCount: 5 });
    expect(notice?.kind).toBe('notReached');
    if (notice?.kind === 'notReached') {
      expect(notice.parts.map((p) => p.text).join('')).toBe('Shown once staging has the change. At the source it changes 5 fields.');
      expect(notice.parts[1]).toMatchObject({ kind: 'link', ref: { to: 'stage', stageId: 'staging' } });
    }
  });

  test('the first read is "reading" until it settles; a written stage is never "not reached"', () => {
    expect(changeCardNotice({ status: 'failed', fieldCount: 0, groups: [], settledOnce: false })?.kind).toBe('reading');
    expect(changeCardNotice({ status: 'resolved', fieldCount: 0, groups: [read], notReachedFrom: { stageId: 'dev', name: 'dev' }, written: true })?.kind).toBe('nothing');
    expect(changeCardNotice({ status: 'resolved', fieldCount: 3, groups: [read], notReachedFrom: { stageId: 'dev', name: 'dev' } })).toBeNull();
  });

  test('nothing read is not nothing written', () => {
    expect(changeCardNotice({ status: 'resolved', fieldCount: 0, groups: [unread] })?.kind).toBe('unreadable');
    expect(changeCardNotice({ status: 'failed', fieldCount: 0, groups: [read] })?.kind).toBe('unreadable');
    expect(changeCardNotice({ status: 'resolved', fieldCount: 0, groups: [read] })).toEqual({ kind: 'nothing', text: 'This change writes no field here.' });
    expect(changeCardNotice({ status: 'resolved', fieldCount: 2, groups: [read] })).toBeNull();
  });
});
