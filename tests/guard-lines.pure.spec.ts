// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import type { PathAnnotationList, ResourcePathAnnotations } from '@confighub/rtk-query';
import { expect, test } from '@playwright/test';

import {
  GUARDED_LINES_MAX_LENGTH,
  guardOnLineText,
  guardedLines,
} from '../src/utility/guard-line-functions';

/**
 * Which lines of a Unit's YAML its guards are recorded on (`guardedLines`), for the configuration
 * editor's gutter: a path's key line, a list element found by merge key, a resource's first line,
 * a resource found by type and name in a stream of several, and nothing for a path that cannot
 * be placed.
 */

// Line numbers are noted on the right.
const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
  annotations:
    example.com/owner: platform
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: sidecar
          image: envoy:1.30
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
              protocol: TCP
            - containerPort: 80
              protocol: UDP
          args:
            - --verbose
`;
// 1 apiVersion, 9 replicas, 12 containers, 13 sidecar, 15 web, 16 web image, 18 port TCP,
// 20 port UDP, 22 args, 23 --verbose, 7 the annotation key with dots.

const SERVICE = `apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: default
spec:
  type: ClusterIP
`;

const DEPLOYMENT_RESOURCE = {
  ResourceType: 'apps/v1/Deployment',
  ResourceName: 'default/web',
  ResourceNameWithoutScope: 'web',
};
const SERVICE_RESOURCE = {
  ResourceType: 'v1/Service',
  ResourceName: 'default/web',
  ResourceNameWithoutScope: 'web',
};

const guard = (key: string, value: string, inherited = false) => ({
  Guard: { [key]: value },
  ...(inherited ? { GuardInherited: { [key]: '' } } : {}),
});

const entry = (
  resource: ResourcePathAnnotations['Resource'],
  paths: Record<string, ReturnType<typeof guard>>,
  resourceAnnotations?: ReturnType<typeof guard>,
): ResourcePathAnnotations => ({
  Resource: resource,
  PathAnnotationMap: paths,
  ResourceAnnotations: resourceAnnotations,
});

/** The lines marked, with their guards as the hover writes them. */
const marked = (data: string, annotations: PathAnnotationList) =>
  guardedLines(data, annotations).map(({ line, guards }) => [
    line,
    guards.map(guardOnLineText).join(', '),
  ]);

test.describe('guardedLines', () => {
  test('a plain path marks its key line; an inherited guard says so', () => {
    expect(
      marked(DEPLOYMENT, [
        entry(DEPLOYMENT_RESOURCE, {
          'spec.replicas': guard('Scale', 'RegionSpecific'),
          'spec.template.spec.containers': guard('Owner', 'Platform', true),
        }),
      ]),
    ).toEqual([
      [9, 'Scale=RegionSpecific'],
      [12, 'Owner=Platform (inherited)'],
    ]);
  });

  test('an associative segment finds its element by merge key, not position', () => {
    expect(
      marked(DEPLOYMENT, [
        entry(DEPLOYMENT_RESOURCE, {
          'spec.template.spec.containers.?name=web.image': guard('RunAsRoot', 'LegacyImage'),
          'spec.template.spec.containers.?name=sidecar': guard('Link', 'TransformPaths'),
          'spec.template.spec.containers.?name=web.ports.?containerPort=80,protocol=UDP':
            guard('HostNetwork', 'PacketMonitor'),
          // A recorded position that no longer names the element is passed over for the one
          // the merge key names.
          'spec.template.spec.containers.?name=web;@0.args': guard('Debug', 'Incident'),
          'spec.template.spec.containers.?name=web.args.0': guard('Flag', 'Required'),
        }),
      ]),
    ).toEqual([
      [13, 'Link=TransformPaths'],
      [16, 'RunAsRoot=LegacyImage'],
      [20, 'HostNetwork=PacketMonitor'],
      [22, 'Debug=Incident'],
      [23, 'Flag=Required'],
    ]);
  });

  test('a key holding dots is written with ~1', () => {
    expect(
      marked(DEPLOYMENT, [
        entry(DEPLOYMENT_RESOURCE, {
          'metadata.annotations.example~1com/owner': guard('Owner', 'Platform'),
        }),
      ]),
    ).toEqual([[7, 'Owner=Platform']]);
  });

  test('a guard on the resource marks its first line, merged with one on that line', () => {
    expect(
      marked(DEPLOYMENT, [
        entry(
          DEPLOYMENT_RESOURCE,
          { apiVersion: guard('Pinned', 'Api') },
          guard('Team', 'Payments', true),
        ),
      ]),
    ).toEqual([[1, 'Pinned=Api, Team=Payments (inherited)']]);
  });

  test('in a stream of several documents, each resource is found by type and name', () => {
    // The Service comes first, so a guard placed by position would land in it.
    const data = `${SERVICE}---\n${DEPLOYMENT}`;
    const offset = SERVICE.split('\n').length; // the Service's lines and the separator
    expect(
      marked(data, [
        entry(DEPLOYMENT_RESOURCE, { 'spec.replicas': guard('Scale', 'RegionSpecific') }),
        entry(SERVICE_RESOURCE, { 'spec.type': guard('Exposure', 'Internal') }),
      ]),
    ).toEqual([
      [7, 'Exposure=Internal'],
      [9 + offset, 'Scale=RegionSpecific'],
    ]);
    // A Deployment in another API version is the same resource.
    expect(
      marked(data, [
        entry(
          { ...DEPLOYMENT_RESOURCE, ResourceType: 'apps/v1beta1/Deployment' },
          { 'spec.replicas': guard('Scale', 'RegionSpecific') },
        ),
      ]),
    ).toEqual([[9 + offset, 'Scale=RegionSpecific']]);
    // Recorded in another namespace, it is found by its name alone when that names one.
    expect(
      marked(data, [
        entry(
          { ...DEPLOYMENT_RESOURCE, ResourceName: 'confighubplaceholder/web' },
          { 'spec.replicas': guard('Scale', 'RegionSpecific') },
        ),
      ]),
    ).toEqual([[9 + offset, 'Scale=RegionSpecific']]);
  });

  test('a resource no document holds, or that two hold, marks nothing', () => {
    const twice = `${DEPLOYMENT}---\n${DEPLOYMENT.replace('namespace: default', 'namespace: other')}`;
    expect(
      marked(twice, [
        entry(
          { ...DEPLOYMENT_RESOURCE, ResourceName: 'third/web' },
          { 'spec.replicas': guard('Scale', 'RegionSpecific') },
        ),
      ]),
    ).toEqual([]);
    expect(
      marked(DEPLOYMENT, [
        entry(
          { ResourceType: 'v1/ConfigMap', ResourceName: 'default/web' },
          { 'spec.replicas': guard('Scale', 'RegionSpecific') },
        ),
      ]),
    ).toEqual([]);
  });

  test('a path that cannot be placed marks nothing', () => {
    expect(
      marked(DEPLOYMENT, [
        entry(DEPLOYMENT_RESOURCE, {
          // Not there yet: a guard can cover a path before it exists.
          'spec.strategy': guard('Rollout', 'Slow'),
          // No element with that merge key.
          'spec.template.spec.containers.?name=missing.image': guard('A', 'B'),
          // An anchor names an element by a digest of its content.
          'spec.template.spec.containers.?name=web.args.?~h=9b1164c8,~l=1': guard('C', 'D'),
          // A pattern.
          'spec.template.spec.containers.*.image': guard('E', 'F'),
          // Past the end of a list.
          'spec.template.spec.containers.5': guard('G', 'H'),
          // Into a scalar.
          'spec.replicas.count': guard('I', 'J'),
        }),
      ]),
    ).toEqual([]);
  });

  test('nothing is worked out without guards, or for an oversized document', () => {
    const annotations = [
      entry(DEPLOYMENT_RESOURCE, { 'spec.replicas': guard('Scale', 'RegionSpecific') }),
    ];
    expect(marked(DEPLOYMENT, [])).toEqual([]);
    expect(
      marked(DEPLOYMENT, [{ Resource: DEPLOYMENT_RESOURCE, PathAnnotationMap: {} }]),
    ).toEqual([]);
    const padding = `# ${'x'.repeat(GUARDED_LINES_MAX_LENGTH)}\n`;
    expect(marked(padding + DEPLOYMENT, annotations)).toEqual([]);
    expect(marked('{not yaml: [', annotations)).toEqual([]);
  });
});
