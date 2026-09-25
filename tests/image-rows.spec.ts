// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { test, expect } from './fixtures/test';

import { isRemovalSentinel } from '../src/pages/x/apps/componentValues';
import {
  IMAGE_CLASS_WORD,
  IMAGE_METER_LEVEL,
  buildImageRows,
  classifyImageChange,
  parseImagePath,
  parseImageRef,
} from '../src/pages/x/apps/imageRef';

/**
 * Unit coverage for the release diff's container image rows.
 *
 * The row model decides what a reader is told about each container: what it is
 * called, whether it moved, and how far. Every one of those is derived rather
 * than given — the name comes from a sibling field on whichever side has it, the
 * "did it move" answer comes from which of two lists the path appeared in, and
 * the magnitude comes from parsing a tag that has no guaranteed shape.
 *
 * Runs as part of the normal suite (`npm run playwright:test`); needs no browser
 * or server, drives the pure model builders directly.
 */

const CONTAINERS = 'spec.template.spec.containers';
const INIT = 'spec.template.spec.initContainers';

/** A field diff as `computeFieldDiffs` emits it. */
const diff = (path: string, oldValue: string, newValue: string) => ({ path, oldValue, newValue });
/** An old-side path as the panel already holds it. */
const path = (p: string, value: string) => ({ path: p, value });

test.describe('container image row model', () => {
  test.describe('naming a container', () => {
    /**
     * `allPaths` is the OLD side. A container added in this release is not in it
     * at all, so a name index built only from there has nothing to call it and
     * falls back to its slot — which is a position, not a name, and changes
     * meaning when a neighbour is inserted.
     */
    test('an added container is named from the new side, not from its slot', () => {
      const rows = buildImageRows(
        [
          diff(`${CONTAINERS}.3.name`, '-', 'log-shipper'),
          diff(`${CONTAINERS}.3.image`, '-', 'ghcr.io/acme/log-shipper:v1.0.0'),
        ],
        [],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].containerName).toBe('log-shipper');
      expect(rows[0].containerName).not.toBe('containers.3');
      expect(rows[0].from).toBeNull();
      expect(rows[0].to).toBe('ghcr.io/acme/log-shipper:v1.0.0');
    });

    /**
     * A rename leaves the former name on the old side and the current one in the
     * change list. The row names what the container is called now, because that
     * is what the reader will find if they go looking for it.
     */
    test('a renamed container takes its new name', () => {
      const rows = buildImageRows(
        [
          diff(`${CONTAINERS}.0.name`, 'api', 'gateway'),
          diff(`${CONTAINERS}.0.image`, 'ghcr.io/acme/api:v1.0.0', 'ghcr.io/acme/api:v1.1.0'),
        ],
        [path(`${CONTAINERS}.0.name`, 'api')],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].containerName).toBe('gateway');
    });

    /**
     * A removed container has no new name to take, so the one it had stands —
     * naming it by slot would make the row describe a position the reader can no
     * longer see.
     */
    test('a removed container keeps the name it had', () => {
      const rows = buildImageRows(
        [
          diff(`${CONTAINERS}.1.name`, 'sidecar', '-'),
          diff(`${CONTAINERS}.1.image`, 'ghcr.io/acme/sidecar:v2.0.0', '-'),
        ],
        [path(`${CONTAINERS}.1.name`, 'sidecar')],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].containerName).toBe('sidecar');
      expect(rows[0].to).toBeNull();
    });

    test('a container with no name field anywhere falls back to its slot', () => {
      const rows = buildImageRows(
        [diff(`${CONTAINERS}.2.image`, 'redis:7.0', 'redis:7.2')],
        [],
      );
      expect(rows[0].containerName).toBe('containers.2');
    });
  });

  test.describe('the removal sentinel', () => {
    /**
     * Both forms are the sentinel: some toolchains normalise a deleted key to an
     * empty string rather than to a dash. Treating only the dash as removal
     * makes an added container's old side render as a literal empty value
     * instead of as absent.
     */
    test('both the dash and the empty string mean absent', () => {
      expect(isRemovalSentinel('-')).toBe(true);
      expect(isRemovalSentinel('')).toBe(true);
      expect(isRemovalSentinel('nginx:1.0')).toBe(false);
    });

    for (const sentinel of ['-', '']) {
      test(`an added container reads as absent when the old side is ${JSON.stringify(sentinel)}`, () => {
        const rows = buildImageRows(
          [diff(`${CONTAINERS}.0.image`, sentinel, 'nginx:1.27')],
          [],
        );
        expect(rows[0].from).toBeNull();
        expect(rows[0].to).toBe('nginx:1.27');
      });

      test(`a removed container reads as absent when the new side is ${JSON.stringify(sentinel)}`, () => {
        const rows = buildImageRows(
          [diff(`${CONTAINERS}.0.image`, 'nginx:1.27', sentinel)],
          [],
        );
        expect(rows[0].from).toBe('nginx:1.27');
        expect(rows[0].to).toBeNull();
      });
    }

    /**
     * A name field whose new side is the sentinel is a removal, not a rename to
     * nothing — it must not overwrite the name the container had. A removed
     * container is by definition still on the old side, so `allPaths` is where
     * that name survives.
     */
    test('a name removed does not blank the name the row shows', () => {
      const rows = buildImageRows(
        [
          diff(`${CONTAINERS}.0.name`, 'api', ''),
          diff(`${CONTAINERS}.0.image`, 'ghcr.io/acme/api:v1.0.0', '-'),
        ],
        [
          path(`${CONTAINERS}.0.name`, 'api'),
          path(`${CONTAINERS}.0.image`, 'ghcr.io/acme/api:v1.0.0'),
        ],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].containerName).toBe('api');
      expect(rows[0].to).toBeNull();
      // The container left; that is a change, not context.
      expect(rows[0].unchanged).toBe(false);
    });
  });

  test.describe('an unchanged container is context, not a change', () => {
    /**
     * A container that stayed behind while its neighbours moved is worth seeing,
     * so it gets a row — but it must not enter the change model, or every count
     * and filter derived from the change list starts lying.
     */
    test('an image present only on the old side is flagged unchanged', () => {
      const rows = buildImageRows(
        [diff(`${CONTAINERS}.0.image`, 'ghcr.io/acme/api:v1.0.0', 'ghcr.io/acme/api:v1.1.0')],
        [
          path(`${CONTAINERS}.0.name`, 'api'),
          path(`${CONTAINERS}.0.image`, 'ghcr.io/acme/api:v1.0.0'),
          path(`${CONTAINERS}.1.name`, 'log-shipper'),
          path(`${CONTAINERS}.1.image`, 'ghcr.io/acme/log-shipper:v2.3.1'),
        ],
      );
      const byName = Object.fromEntries(rows.map((r) => [r.containerName, r]));
      expect(byName['api'].unchanged).toBe(false);
      expect(byName['log-shipper'].unchanged).toBe(true);
      // Identical on both sides, so nothing about the row can read as a move.
      expect(byName['log-shipper'].from).toBe(byName['log-shipper'].to);
    });

    /**
     * The path appears in BOTH lists when it changed. It must be taken from the
     * change list once, not counted again as unchanged from the old side.
     */
    test('a changed image is never also emitted as an unchanged row', () => {
      const rows = buildImageRows(
        [diff(`${CONTAINERS}.0.image`, 'redis:7.0', 'redis:7.2')],
        [path(`${CONTAINERS}.0.image`, 'redis:7.0')],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].unchanged).toBe(false);
    });
  });

  test.describe('ordering', () => {
    /**
     * Rows follow the shape of a pod spec — the containers that serve, then the
     * ones that run first, then the debug ones — rather than the order the diff
     * happened to emit changes in.
     */
    test('containers precede init containers, and each list runs in index order', () => {
      const rows = buildImageRows(
        [
          diff(`${INIT}.1.image`, 'a:1', 'a:2'),
          diff(`${CONTAINERS}.2.image`, 'b:1', 'b:2'),
          diff(`${INIT}.0.image`, 'c:1', 'c:2'),
          diff(`${CONTAINERS}.0.image`, 'd:1', 'd:2'),
        ],
        [],
      );
      expect(rows.map((r) => r.containerPrefix)).toEqual([
        `${CONTAINERS}.0`,
        `${CONTAINERS}.2`,
        `${INIT}.0`,
        `${INIT}.1`,
      ]);
      expect(rows.map((r) => r.isInit)).toEqual([false, false, true, true]);
    });
  });

  test.describe('classification drives the magnitude glyph', () => {
    const ref = (s: string) => parseImageRef(s);

    /**
     * The repository is compared before the tag: a registry or namespace move at
     * an identical tag is a real change, and it is the one an image row is least
     * able to show by itself. Reading the tag first reports it as unchanged.
     */
    test('a registry move at an identical tag is not "unchanged"', () => {
      const cls = classifyImageChange(
        ref('ghcr.io/acme/envoy:v1.30.0'),
        ref('quay.io/acme/envoy:v1.30.0'),
      );
      expect(cls).toBe('repo');
      expect(cls).not.toBe('other');
      // It carries a word precisely because the meter cannot rank it: a flat
      // glyph is also what a calendar tag and a commit sha get.
      expect(IMAGE_METER_LEVEL[cls]).toBe('flat');
      expect(IMAGE_CLASS_WORD[cls]).toBeTruthy();
    });

    test('a digest move at an identical tag classifies as digest', () => {
      const cls = classifyImageChange(
        ref('redis:7.4.1-alpine@sha256:4f2ad1c9e0b37a5c8d1e6f04b2c9a7e3'),
        ref('redis:7.4.1-alpine@sha256:9c81b4ef2d60a7139f5c2b8ae04d16b7'),
      );
      expect(cls).toBe('digest');
      expect(IMAGE_METER_LEVEL[cls]).toBe('digest');
    });

    test('semver bumps rank major above minor above patch', () => {
      expect(classifyImageChange(ref('a:v1.9.2'), ref('a:v2.0.0'))).toBe('major');
      expect(classifyImageChange(ref('a:0.104.0'), ref('a:0.112.0'))).toBe('minor');
      expect(classifyImageChange(ref('a:v0.4.15'), ref('a:v0.4.16'))).toBe('patch');
      const rank = { flat: 0, digest: 0, low: 1, mid: 2, high: 3 };
      expect(rank[IMAGE_METER_LEVEL['major']]).toBeGreaterThan(rank[IMAGE_METER_LEVEL['minor']]);
      expect(rank[IMAGE_METER_LEVEL['minor']]).toBeGreaterThan(rank[IMAGE_METER_LEVEL['patch']]);
    });

    /**
     * Only a registry move carries a word. A magnitude the meter can already
     * rank does not need one, and a second label on the loudest row says the
     * same thing twice.
     */
    test('only the classes the meter cannot rank carry a word', () => {
      for (const cls of ['major', 'minor', 'patch', 'build'] as const) {
        expect(IMAGE_CLASS_WORD[cls]).toBeUndefined();
      }
    });
  });

  test.describe('recognising an image path', () => {
    test('the three container lists are recognised and others are not', () => {
      expect(parseImagePath(`${CONTAINERS}.0.image`)?.list).toBe('containers');
      expect(parseImagePath(`${INIT}.0.image`)?.list).toBe('initContainers');
      expect(parseImagePath('spec.template.spec.ephemeralContainers.0.image')?.list).toBe(
        'ephemeralContainers',
      );
      // A field that merely ends in `image`, or a container field that is not
      // the image, must not become an image row.
      expect(parseImagePath(`${CONTAINERS}.0.imagePullPolicy`)).toBeNull();
      expect(parseImagePath('spec.template.spec.image')).toBeNull();
      expect(parseImagePath('metadata.annotations.image')).toBeNull();
    });
  });
});
