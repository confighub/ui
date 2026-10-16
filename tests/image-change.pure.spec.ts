// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// The image change a ChangeOrder makes, read off the server's diff: the bump
// size, the marked part of the new image tag, the monogram, and the mapping from
// `UnitDiff[]` to image moves and a field summary. Pure derivation, no page.

import { expect, test } from '@playwright/test';

import type { PathChange, PathSegment, ResourceDiff, UnitDiff } from '@confighub/rtk-query';

import { changeOrderChangesStatus } from '../src/pages/x/apps/change-order/changeOrderChanges';
import {
  bumpKindOf,
  fieldLabelOf,
  dotPathOfSegments,
  imageChangesForSource,
  imageChangesFromUnitDiffs,
  looksLikeVersion,
  markDelta,
  monogramNameOf,
  narrowUnitDiffsToPaths,
  monogramHueOf,
  shortDigest,
  versionPathOf,
  monogramOf,
} from '../src/pages/change-orders/imageChange';

const field = (name: string): PathSegment => ({ Field: name, FromIndex: -1, ToIndex: -1 });
const keyed = (name: string, index = 0): PathSegment => ({
  FromIndex: index,
  ToIndex: index,
  MergeKeys: [{ Key: 'name', Value: name }],
});
const podSpec = [field('spec'), field('template'), field('spec')];

function imageChange(list: string, container: string, from: string, to: string): PathChange {
  return {
    ChangeType: 'Update',
    DisplayPath: `spec.template.spec.${list}.?name=${container}.image`,
    Segments: [...podSpec, field(list), keyed(container), field('image')],
    FromValue: from,
    ToValue: to,
  };
}

function deployment(name: string, changes: PathChange[]): ResourceDiff {
  return {
    ChangeType: 'Update',
    Resource: { ResourceType: 'apps/v1/Deployment', ResourceName: `default/${name}`, ResourceNameWithoutScope: name },
    Changes: changes,
  };
}

// A Unit the ChangeOrder touched: a Revision on each side.
const unit = (id: string, resources: ResourceDiff[]): UnitDiff => ({
  UnitID: id,
  SpaceID: 'base',
  FromRevisionNum: 3,
  ToRevisionNum: 4,
  Diff: { Resources: resources },
});

test.describe('bumpKindOf', () => {
  test('names the first part that rises', () => {
    expect(bumpKindOf('4.2.0', '5.0.0')).toBe('major');
    expect(bumpKindOf('1.14.2', '1.15.0')).toBe('minor');
    expect(bumpKindOf('v1.29.1', 'v1.29.4')).toBe('patch');
  });
  test('a part that falls before any rises is a downgrade', () => {
    expect(bumpKindOf('5.3.0', '5.2.4')).toBe('downgrade');
    expect(bumpKindOf('2.0.0', '1.9.9')).toBe('downgrade');
  });
  test('a suffix is ignored when reading the version', () => {
    expect(bumpKindOf('1.29.4-alpine', '1.29.5-alpine')).toBe('patch');
    expect(bumpKindOf('1.29.4-alpine', '1.29.4-bookworm')).toBe('build');
  });
  test('an unreadable or equal version is a build', () => {
    expect(bumpKindOf('sha-3f9a1c2', 'sha-81bd04e')).toBe('build');
    expect(bumpKindOf('2026.10.14', '2026.10.15')).toBe('patch');
    expect(bumpKindOf('latest', 'stable')).toBe('build');
    expect(bumpKindOf(undefined, '1.0.0')).toBe('build');
  });
});

test.describe('markDelta', () => {
  test('semver: the change starts at the first part that differs', () => {
    expect(markDelta('1.14.2', '1.15.0')).toEqual({ keep: '1.', changed: '15.0' });
    expect(markDelta('3.8.4', '3.8.5')).toEqual({ keep: '3.8.', changed: '5' });
    expect(markDelta('4.2.0', '5.0.0')).toEqual({ keep: '', changed: '5.0.0' });
    expect(markDelta('v1.29.1', 'v1.29.4')).toEqual({ keep: 'v1.29.', changed: '4' });
  });
  test('a suffix rides with the part it is attached to', () => {
    expect(markDelta('1.29.4-alpine', '1.29.5-alpine')).toEqual({ keep: '1.29.', changed: '5-alpine' });
  });
  test('otherwise the common prefix, cut back to a separator', () => {
    expect(markDelta('sha-3f9a1c2', 'sha-81bd04e')).toEqual({ keep: 'sha-', changed: '81bd04e' });
    expect(markDelta('sha-3f9a1c2', 'sha-3e00000')).toEqual({ keep: 'sha-', changed: '3e00000' });
    expect(markDelta('1.29.4-alpine', '1.29.4-bookworm')).toEqual({ keep: '1.29.4-', changed: 'bookworm' });
  });
  test('a new image tag with fewer parts falls to the prefix rule', () => {
    expect(markDelta('1.2.3', '1.2')).toEqual({ keep: '1.', changed: '2' });
  });
  test('an unchanged image tag has nothing to mark', () => {
    expect(markDelta('7.2.4', '7.2.4')).toEqual({ keep: '7.2.4', changed: '' });
  });
});

test('shortDigest keeps the first and last four characters', () => {
  expect(shortDigest('sha256:9f2c7a10b4e6d2f8c31a5b9e0d7c64f2aa8e1b3c5d9f0e2a7b4c6d8e1f3a41ab')).toBe('@9f2c…41ab');
});

test.describe('monogramOf', () => {
  test('first letters of the first two words, else the first two letters', () => {
    expect(monogramOf('payments-api')).toBe('PA');
    expect(monogramOf('opentelemetry-collector-contrib')).toBe('OC');
    expect(monogramOf('envoy')).toBe('EN');
    expect(monogramOf('ledger_migrate')).toBe('LM');
  });
  test('the hue pair is stable for a name', () => {
    expect(monogramHueOf('payments-api')).toEqual(monogramHueOf('payments-api'));
  });
});

test.describe('fieldLabelOf', () => {
  test('drops the pod template prefix and a keyed element value', () => {
    expect(fieldLabelOf([...podSpec.slice(0, 1), field('replicas')], 'spec.replicas')).toBe('replicas');
    expect(
      fieldLabelOf([...podSpec, field('containers'), keyed('indexer'), field('env'), keyed('INDEX_SHARDS'), field('value')], 'x'),
    ).toBe('env.INDEX_SHARDS');
    expect(
      fieldLabelOf([...podSpec, field('containers'), keyed('indexer'), field('resources'), field('limits'), field('memory')], 'x'),
    ).toBe('resources.limits.memory');
  });
});

test.describe('imageChangesFromUnitDiffs', () => {
  test('a single minor bump, grouped across Units', () => {
    const diff = [
      unit('u1', [deployment('payments-api', [imageChange('containers', 'payments-api', 'ghcr.io/acme/payments-api:1.14.2', 'ghcr.io/acme/payments-api:1.15.0')])]),
      unit('u2', [deployment('payments-api-canary', [imageChange('containers', 'payments-api', 'ghcr.io/acme/payments-api:1.14.2', 'ghcr.io/acme/payments-api:1.15.0')])]),
      unit('u3', []),
    ];
    const result = imageChangesFromUnitDiffs(diff);
    expect(result.status).toBe('some');
    expect(result.unitCount).toBe(2);
    expect(result.images).toHaveLength(1);
    const [img] = result.images;
    expect(img).toMatchObject({
      containerName: 'payments-api',
      role: null,
      repository: 'payments-api',
      registryPath: 'ghcr.io/acme',
      from: { tag: '1.14.2' },
      to: { tag: '1.15.0' },
      bump: 'minor',
      unitCount: 2,
    });
    // The two Units hold the move in different workloads, so the line names none.
    expect(img?.workload).toBeNull();
    expect(img?.from.digest).toBeUndefined();
  });

  test('init container and native sidecar, from restartPolicy context', () => {
    const restartPolicy: PathChange = {
      ChangeType: 'None',
      Segments: [...podSpec, field('initContainers'), keyed('envoy', 1), field('restartPolicy')],
      ToValue: 'Always',
    };
    const diff = [
      unit('u1', [
        deployment('ledger', [
          imageChange('containers', 'ledger', 'ecr.example.com/fin/ledger:2.0.9', 'ecr.example.com/fin/ledger:2.1.0'),
          imageChange('initContainers', 'migrate', 'ecr.example.com/fin/ledger-migrate:2.0.9', 'ecr.example.com/fin/ledger-migrate:2.1.0'),
          restartPolicy,
          imageChange('initContainers', 'envoy', 'docker.io/envoyproxy/envoy:v1.29.1', 'docker.io/envoyproxy/envoy:v1.29.4'),
        ]),
      ]),
    ];
    const images = imageChangesFromUnitDiffs(diff).images;
    // App containers first, then sidecars, then init containers.
    expect(images.map((i) => [i.containerName, i.role])).toEqual([
      ['ledger', null],
      ['envoy', 'sidecar'],
      ['migrate', 'init'],
    ]);
  });

  test('a registry move, a sha build, and an -alpine suffix', () => {
    const diff = [
      unit('u1', [
        deployment('web', [
          imageChange('containers', 'web', 'docker.io/acme/web:3.8.5', 'ghcr.io/acme/web:3.8.5'),
          imageChange('containers', 'auth', 'ghcr.io/acme/auth-gateway:sha-3f9a1c2', 'ghcr.io/acme/auth-gateway:sha-81bd04e'),
          imageChange('containers', 'proxy', 'nginx:1.29.4-alpine', 'nginx:1.29.5-alpine'),
        ]),
      ]),
    ];
    const byName = Object.fromEntries(imageChangesFromUnitDiffs(diff).images.map((i) => [i.containerName, i]));
    expect(byName.web?.bump).toBe('registry');
    expect(byName.auth?.bump).toBe('build');
    expect(byName.proxy?.bump).toBe('patch');
    expect(byName.proxy?.registryPath).toBe('docker.io/library');
  });

  test('a digest-only change keeps the digest, and is a digest move', () => {
    const diff = [
      unit('u1', [
        deployment('redis', [
          imageChange('containers', 'redis', 'redis:7.2.4@sha256:9f2c7a10', 'redis:7.2.4@sha256:77e0c4d1'),
        ]),
      ]),
    ];
    const [img] = imageChangesFromUnitDiffs(diff).images;
    expect(img?.bump).toBe('digest');
    expect(img?.from.digest).toBe('sha256:9f2c7a10');
    expect(img?.to.digest).toBe('sha256:77e0c4d1');
  });

  test('field changes are counted and sampled; context is not', () => {
    const diff = [
      unit('u1', [
        deployment('notifier', [
          { ChangeType: 'Update', DisplayPath: 'spec.replicas', Segments: [field('spec'), field('replicas')], FromValue: '2', ToValue: '4' },
          { ChangeType: 'None', DisplayPath: 'spec.selector', Segments: [field('spec'), field('selector')], ToValue: 'x' },
          {
            ChangeType: 'Update',
            DisplayPath: 'spec.template.spec.containers.?name=notifier.resources.limits.memory',
            Segments: [...podSpec, field('containers'), keyed('notifier'), field('resources'), field('limits'), field('memory')],
            FromValue: '512Mi',
            ToValue: '1Gi',
          },
        ]),
      ]),
    ];
    const result = imageChangesFromUnitDiffs(diff);
    expect(result.status).toBe('none');
    expect(result.fieldChanges.count).toBe(2);
    expect(result.fieldChanges.sample).toEqual(['replicas', 'resources.limits.memory']);
    expect(result.fieldChanges.details[0]).toMatchObject({ from: '2', to: '4' });
  });

  test('a Unit error makes the result unavailable, never "none"', () => {
    const result = imageChangesFromUnitDiffs([{ UnitID: 'u1', Error: { Type: 'Unexpected', Message: 'boom' } }]);
    expect(result.status).toBe('unavailable');
  });

  test('nothing changed in any Unit is none', () => {
    expect(imageChangesFromUnitDiffs([unit('u1', [])]).status).toBe('none');
  });

  test('no Revision on either side in any Unit is unavailable, never "none"', () => {
    const untouched: UnitDiff = { UnitID: 'u1', SpaceID: 'base', FromRevisionNum: 0, ToRevisionNum: 0, Diff: { Resources: [] } };
    expect(imageChangesFromUnitDiffs([untouched, { ...untouched, UnitID: 'u2' }]).status).toBe('unavailable');
    expect(imageChangesFromUnitDiffs([]).status).toBe('unavailable');
  });

  test('one move across two workloads is one line that names no workload', () => {
    const change = imageChange('containers', 'app', 'ghcr.io/acme/app:1.0.0', 'ghcr.io/acme/app:1.1.0');
    const images = imageChangesFromUnitDiffs([unit('u1', [deployment('web', [change])]), unit('u2', [deployment('worker', [change])])]).images;
    expect(images).toHaveLength(1);
    expect(images[0]?.workload).toBeNull();
    expect(images[0]?.unitCount).toBe(2);
  });
});

// A Helm-values-style document: no containers, only maps with a `tag` in them.
function valuesDoc(name: string, changes: PathChange[]): ResourceDiff {
  return {
    ChangeType: 'Update',
    Resource: { ResourceType: 'AppConfig/YAML', ResourceName: name, ResourceNameWithoutScope: name },
    Changes: changes,
  };
}
const leaf = (path: string[], from: string, to: string, type: 'Update' | 'None' = 'Update'): PathChange => ({
  ChangeType: type,
  DisplayPath: path.join('.'),
  Segments: path.map(field),
  FromValue: type === 'None' ? undefined : from,
  ToValue: to,
});

test.describe('version fields', () => {
  test('looksLikeVersion: digits.digits(.digits), optional v and suffix', () => {
    for (const ok of ['v0.8.21', '1.4.2-rc1', '2.0.0+build5', '1.2', '0.109.0']) expect(looksLikeVersion(ok), ok).toBe(true);
    for (const no of ['latest', 'v3', '3', 'apps/v1', '1234', 'sha-3f9a1c2', '1.2.3.4', '', '1.']) expect(looksLikeVersion(no), no).toBe(false);
  });

  test('streams.stable.tag in two Units is ONE version change in 2 Units, and no field change', () => {
    const change = leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23');
    const result = imageChangesFromUnitDiffs([
      unit('confighubai-confighub', [valuesDoc('values', [change])]),
      unit('confighubai-confighub-ui', [valuesDoc('values-ui', [change])]),
    ]);
    expect(result.status).toBe('some');
    expect(result.images).toHaveLength(1);
    const [v] = result.images;
    expect(v).toMatchObject({
      kind: 'version',
      repository: 'streams.stable',
      leafKey: 'tag',
      registryPath: '',
      role: null,
      from: { ref: 'v0.8.21', tag: 'v0.8.21' },
      to: { ref: 'v0.8.23', tag: 'v0.8.23' },
      bump: 'patch',
      unitCount: 2,
    });
    expect(monogramNameOf(v!)).toBe('stable');
    expect(result.fieldChanges.count).toBe(0);
  });

  test('every version key counts, exactly and case-sensitively', () => {
    for (const key of ['tag', 'imageTag', 'version', 'appVersion', 'chartVersion']) {
      const r = imageChangesFromUnitDiffs([unit('u', [valuesDoc('v', [leaf(['app', key], '1.0.0', '1.1.0')])])]);
      expect(r.images.map((i) => [i.kind, i.leafKey, i.bump]), key).toEqual([['version', key, 'minor']]);
      expect(r.fieldChanges.count, key).toBe(0);
    }
    for (const key of ['Tag', 'TAG', 'Version', 'versionTag', 'app.kubernetes.io/version']) {
      const r = imageChangesFromUnitDiffs([unit('u', [valuesDoc('v', [leaf(['app', key], '1.0.0', '1.1.0')])])]);
      expect(r.images, key).toHaveLength(0);
      expect(r.fieldChanges.count, key).toBe(1);
    }
  });

  test('a version in a labels, annotations or selector map stays a field change', () => {
    const doc = valuesDoc('v', [
      leaf(['metadata', 'labels', 'version'], '1.4.2', '1.5.0'),
      leaf(['spec', 'template', 'metadata', 'labels', 'version'], '1.4.2', '1.5.0'),
      leaf(['metadata', 'annotations', 'version'], '1.4.2', '1.5.0'),
      leaf(['spec', 'selector', 'matchLabels', 'version'], '1.4.2', '1.5.0'),
      leaf(['spec', 'selector', 'version'], '1.4.2', '1.5.0'),
    ]);
    const result = imageChangesFromUnitDiffs([unit('u', [doc])]);
    expect(result.images).toHaveLength(0);
    expect(result.fieldChanges.count).toBe(5);
    // The same key outside those maps still matches.
    const ok = imageChangesFromUnitDiffs([unit('u', [valuesDoc('v', [leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23')])])]);
    expect(ok.images.map((i) => i.kind)).toEqual(['version']);
  });

  test('negatives stay field changes: apiVersion, resourceVersion, a port, a non-version value', () => {
    const doc = valuesDoc('v', [
      leaf(['apiVersion'], 'apps/v1', 'apps/v2'),
      leaf(['metadata', 'resourceVersion'], '1234', '1235'),
      leaf(['service', 'port'], '1.2', '1.3'),
      leaf(['app', 'version'], 'latest', 'stable'),
      leaf(['app', 'version'], 'v3', 'v4'),
      leaf(['app', 'tag'], 'sha-3f9a1c2', 'sha-81bd04e'),
      leaf(['app', 'tag'], '1.2.3', 'latest'),
    ]);
    const result = imageChangesFromUnitDiffs([unit('u', [doc])]);
    expect(result.images).toHaveLength(0);
    expect(result.status).toBe('none');
    expect(result.fieldChanges.count).toBe(7);
  });

  test('a Helm image {repository, tag} pair is a normal image bump, and the repository is not a field change', () => {
    const doc = valuesDoc('values', [
      leaf(['image', 'repository'], '', 'ghcr.io/acme/payments-api', 'None'),
      leaf(['image', 'tag'], '1.14.2', '1.15.0'),
      leaf(['replicas'], '3', '5'),
    ]);
    const result = imageChangesFromUnitDiffs([unit('u', [doc])]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      kind: 'image',
      repository: 'payments-api',
      registryPath: 'ghcr.io/acme',
      from: { ref: 'ghcr.io/acme/payments-api:1.14.2', tag: '1.14.2' },
      to: { ref: 'ghcr.io/acme/payments-api:1.15.0', tag: '1.15.0' },
      bump: 'minor',
    });
    expect(result.images[0]?.leafKey).toBeUndefined();
    expect(result.fieldChanges.count).toBe(1);
    expect(result.fieldChanges.sample).toEqual(['replicas']);
  });

  test('a registry sibling is prefixed; a repository with no host names no registry', () => {
    const withRegistry = valuesDoc('v', [
      leaf(['image', 'registry'], '', 'ghcr.io', 'None'),
      leaf(['image', 'repository'], '', 'acme/web', 'None'),
      leaf(['image', 'tag'], 'v1.0.0', 'v1.0.1'),
    ]);
    const [a] = imageChangesFromUnitDiffs([unit('u', [withRegistry])]).images;
    expect(a).toMatchObject({ kind: 'image', repository: 'web', registryPath: 'ghcr.io/acme', bump: 'patch' });
    const bare = valuesDoc('v', [leaf(['image', 'repository'], '', 'payments-api', 'None'), leaf(['image', 'tag'], '1.0.0', '1.1.0')]);
    const [b] = imageChangesFromUnitDiffs([unit('u', [bare])]).images;
    expect(b).toMatchObject({ kind: 'image', repository: 'payments-api', registryPath: '' });
  });

  test('a changed repository is folded into the image and does not also count as a field', () => {
    const doc = valuesDoc('values', [
      leaf(['image', 'repository'], 'docker.io/acme/web', 'ghcr.io/acme/web'),
      leaf(['image', 'tag'], '3.8.5', '3.8.6'),
    ]);
    const result = imageChangesFromUnitDiffs([unit('u', [doc])]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]?.bump).toBe('registry');
    expect(result.fieldChanges.count).toBe(0);
  });

  test('a repository sibling that carries its own tag is not an image: a version change', () => {
    const doc = valuesDoc('values', [leaf(['image', 'repository'], '', 'acme/web:1.0.0', 'None'), leaf(['image', 'tag'], '1.0.0', '1.0.1')]);
    expect(imageChangesFromUnitDiffs([unit('u', [doc])]).images.map((i) => i.kind)).toEqual(['version']);
  });

  test('the container flag: true for a container entry, false for a Helm pair and a version change', () => {
    const result = imageChangesFromUnitDiffs([
      unit('u', [
        deployment('web', [imageChange('containers', 'web', 'ghcr.io/acme/web:1.0.0', 'ghcr.io/acme/web:1.1.0')]),
        valuesDoc('values', [
          leaf(['image', 'repository'], '', 'ghcr.io/acme/api', 'None'),
          leaf(['image', 'tag'], '1.0.0', '1.1.0'),
          leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23'),
        ]),
      ]),
    ]);
    expect(result.images.map((i) => [i.kind, i.container])).toEqual([
      ['image', true],
      ['image', false],
      ['version', false],
    ]);
  });

  test('versionPathOf is the full field path, and a top-level field is just its key', () => {
    const [v] = imageChangesFromUnitDiffs([unit('u', [valuesDoc('v', [leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23')])])]).images;
    expect(versionPathOf(v!)).toBe('streams.stable.tag');
    const [top] = imageChangesFromUnitDiffs([unit('u', [valuesDoc('v', [leaf(['appVersion'], '1.0.0', '1.0.1')])])]).images;
    expect(top).toMatchObject({ repository: 'appVersion', leafKey: 'appVersion' });
    expect(versionPathOf(top!)).toBe('appVersion');
  });

  test('a Unit with no resource of its own names no workload', () => {
    const placeholder = (changes: PathChange[]): ResourceDiff => ({
      ChangeType: 'Update',
      Resource: { ResourceType: 'NoSchema', ResourceName: 'NoName', ResourceNameWithoutScope: 'NoName' },
      Changes: changes,
    });
    const [v] = imageChangesFromUnitDiffs([unit('u', [placeholder([leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23')])])]).images;
    expect(v?.workload).toBeNull();
  });

  test('a container image and a version change together: images first, each counted once', () => {
    const result = imageChangesFromUnitDiffs([
      unit('u', [
        deployment('web', [imageChange('containers', 'web', 'ghcr.io/acme/web:1.0.0', 'ghcr.io/acme/web:1.1.0')]),
        valuesDoc('values', [leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23'), leaf(['port'], '80', '8080')]),
      ]),
    ]);
    expect(result.images.map((i) => i.kind)).toEqual(['image', 'version']);
    expect(result.fieldChanges.count).toBe(1);
  });
});

// A fan-out (TransformPaths) or Invoke ChangeOrder makes its change outside its own Space, where the server's
// base-Space diff sees nothing. The page already holds each source Unit's server diff, read with Context.
test.describe('source Unit diffs the page holds', () => {
  const tag = leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23');
  const group = (unitId: string, changes: PathChange[] = [tag]) => ({
    unitId,
    diff: { Resources: [valuesDoc('facts', changes)] },
  });

  test('the registry-facts case: streams.stable.tag in two source Units is one version change in 2 Units', () => {
    const result = imageChangesForSource('resolved', [group('confighubai-confighub'), group('confighubai-confighub-ui')]);
    expect(result.status).toBe('some');
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      kind: 'version',
      repository: 'streams.stable',
      leafKey: 'tag',
      from: { tag: 'v0.8.21' },
      to: { tag: 'v0.8.23' },
      bump: 'patch',
      unitCount: 2,
    });
    expect(result.fieldChanges.count).toBe(0);
  });

  test('a sibling `image` that is a full reference makes it an image bump with a name and a registry', () => {
    const image = (type: 'Update' | 'None') =>
      leaf(['streams', 'stable', 'image'], 'ghcr.io/confighub/cubbychat:v0.8.21', 'ghcr.io/confighub/cubbychat:v0.8.23', type);
    const result = imageChangesForSource('resolved', [group('facts', [tag, image('Update')])]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({
      kind: 'image',
      repository: 'cubbychat',
      registryPath: 'ghcr.io/confighub',
      from: { tag: 'v0.8.21' },
      to: { tag: 'v0.8.23' },
      bump: 'patch',
    });
    expect(result.fieldChanges.count).toBe(0);
    // Narrowed to the Links' path, the image sibling is only context: it names the image for the new side only,
    // so the old side cannot be built and it stays a version change.
    const narrowed = imageChangesForSource('resolved', [group('facts', [tag, image('None')])]);
    expect(narrowed.images.map((i) => i.kind)).toEqual(['version']);
  });

  test('other changed fields are counted once; labels and the like never match', () => {
    const result = imageChangesForSource('resolved', [
      group('u', [tag, leaf(['metadata', 'labels', 'version'], '1.0.0', '1.1.0'), leaf(['replicas'], '1', '2')]),
    ]);
    expect(result.images.map((i) => i.kind)).toEqual(['version']);
    expect(result.fieldChanges.count).toBe(2);
  });

  test('a container image is read by its container name, in whichever document of the Unit it is', () => {
    const result = imageChangesForSource('resolved', [
      {
        unitId: 'u',
        diff: {
          Resources: [
            valuesDoc('facts', []),
            deployment('web', [imageChange('containers', 'web', 'ghcr.io/acme/web:1.0.0', 'ghcr.io/acme/web:1.1.0')]),
          ],
        },
      },
    ]);
    expect(result.images[0]).toMatchObject({ kind: 'image', container: true, containerName: 'web', repository: 'web', bump: 'minor' });
  });

  test('status follows the source: loading, failed is unavailable, and an empty diff is none', () => {
    expect(imageChangesForSource('loading', []).status).toBe('loading');
    expect(imageChangesForSource('failed', []).status).toBe('unavailable');
    expect(imageChangesForSource('resolved', [{ unitId: 'u', diff: { Resources: [] } }]).status).toBe('none');
  });

  test('a Unit whose change could not be established adds nothing', () => {
    const result = imageChangesForSource('resolved', [group('u'), { unitId: 'unknown' }]);
    expect(result.images).toHaveLength(1);
    expect(result.images[0].unitCount).toBe(1);
  });
});

// A list row for a fan-out ChangeOrder reads the source Units' server diff, narrowed to what the Links read.
test.describe('fan-out source diff narrowed to the Links paths', () => {
  const sourceDoc = (changes: PathChange[]): ResourceDiff => ({
    ChangeType: 'Update',
    Resource: { ResourceType: 'registrybot.confighub.com/v1alpha3', ResourceName: 'cubbychat' },
    Changes: changes,
  });
  const fact = (id: string): UnitDiff =>
    unit(id, [
      sourceDoc([
        leaf(['streams', 'stable', 'tag'], 'v0.8.21', 'v0.8.23'),
        leaf(['streams', 'stable', 'image'], 'ghcr.io/confighub/cubbychat:v0.8.21', 'ghcr.io/confighub/cubbychat:v0.8.23'),
        leaf(['streams', 'beta', 'tag'], 'v0.9.0-rc1', 'v0.9.0-rc2'),
        leaf(['repository'], '', 'ghcr.io/confighub/cubbychat', 'None'),
      ]),
    ]);

  test('dotPathOfSegments names an array element by its index', () => {
    expect(dotPathOfSegments([field('spec'), field('containers'), keyed('web', 0), field('image')])).toBe('spec.containers.0.image');
    expect(dotPathOfSegments(undefined)).toBe('');
  });

  test('only the changes at or under a linked path remain; context rows stay', () => {
    const narrowed = narrowUnitDiffsToPaths([fact('u1')], new Map([['u1', ['streams.stable.tag']]]));
    const changes = narrowed[0]?.Diff?.Resources?.[0]?.Changes ?? [];
    expect(changes.map((c) => [c.DisplayPath, c.ChangeType])).toEqual([
      ['streams.stable.tag', 'Update'],
      ['repository', 'None'],
    ]);
    const result = imageChangesFromUnitDiffs(narrowed);
    // Narrowed away: the beta stream (not read by any Link) and the image sibling.
    expect(result.images.map((i) => [i.kind, i.repository, i.to.tag])).toEqual([['version', 'streams.stable', 'v0.8.23']]);
    expect(result.fieldChanges.count).toBe(0);
  });

  test('a path prefix keeps everything under it, and not a sibling that only shares its start', () => {
    const doc = unit('u1', [
      sourceDoc([leaf(['streams', 'stable', 'tag'], 'v1.0.0', 'v1.0.1'), leaf(['streams', 'stableX', 'tag'], 'v1.0.0', 'v1.0.1')]),
    ]);
    const changes = narrowUnitDiffsToPaths([doc], new Map([['u1', ['streams.stable']]]))[0]?.Diff?.Resources?.[0]?.Changes ?? [];
    expect(changes.map((c) => c.DisplayPath)).toEqual(['streams.stable.tag']);
  });

  test('a Unit with no narrowing (no Links, or a Link that reads the whole Unit) is left whole', () => {
    const whole = narrowUnitDiffsToPaths([fact('u1'), fact('u2')], new Map([['u1', undefined]]));
    expect(whole[0]?.Diff?.Resources?.[0]?.Changes).toHaveLength(4);
    expect(whole[1]?.Diff?.Resources?.[0]?.Changes).toHaveLength(4);
  });

  test('two source Units that moved the same field are one version line in 2 Units', () => {
    const narrowed = narrowUnitDiffsToPaths([fact('u1'), fact('u2')], new Map([['u1', ['streams.stable.tag']], ['u2', ['streams.stable.tag']]]));
    const result = imageChangesFromUnitDiffs(narrowed);
    expect(result.images).toHaveLength(1);
    expect(result.images[0]).toMatchObject({ kind: 'version', unitCount: 2 });
  });

  test('a Unit whose diff failed is unavailable even when narrowed', () => {
    const failed: UnitDiff = { UnitID: 'u1', Error: { Type: 'Unexpected', Message: 'boom' } };
    expect(imageChangesFromUnitDiffs(narrowUnitDiffsToPaths([failed], new Map([['u1', ['a']]]))).status).toBe('unavailable');
  });
});

test.describe('the status of a stage\'s changes (the Invoke dry run)', () => {
  test('pending is loading, whatever else is known', () => {
    expect(changeOrderChangesStatus({ pending: true, dryRunFailed: false, groups: [] })).toBe('loading');
    expect(changeOrderChangesStatus({ pending: true, dryRunFailed: true, groups: [{ determinable: false }] })).toBe('loading');
  });
  test('a refused dry run, or a Unit with nothing to diff, is failed: an empty diff is not "no change"', () => {
    expect(changeOrderChangesStatus({ pending: false, dryRunFailed: true, groups: [] })).toBe('failed');
    expect(changeOrderChangesStatus({ pending: false, dryRunFailed: false, groups: [{ determinable: true }, { determinable: false }] })).toBe('failed');
  });
  test('settled with every Unit determinable (or no Unit at all) is resolved', () => {
    expect(changeOrderChangesStatus({ pending: false, dryRunFailed: false, groups: [{ determinable: true }] })).toBe('resolved');
    expect(changeOrderChangesStatus({ pending: false, dryRunFailed: false, groups: [] })).toBe('resolved');
  });
});
