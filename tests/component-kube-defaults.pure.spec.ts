// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
//
// Kubernetes defaults in the spec sheet: which fields have a fixed default, and which values
// are quiet (not drawn on their line) for a given state of the sheet.
import { expect, test } from '@playwright/test';

import {
  defaultFieldsOf,
  defaultPullPolicy,
  kubeDefaultOf,
  quietDefaultsOf,
} from '../src/pages/x/apps/spec-sheet/kubeDefaults';
import type { AtomOrigin } from '../src/pages/x/apps/spec-sheet/sheetOrigin';
import type { SheetEdit, SheetOverlay } from '../src/pages/x/apps/spec-sheet/sheetOverlay';
import { buildSpecSheet } from '../src/pages/x/apps/spec-sheet/specSheetModel';

const DEPLOYMENT = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  revisionHistoryLimit: 10
  template:
    spec:
      dnsPolicy: ClusterFirst
      containers:
      - name: web
        image: ghcr.io/acme/web:1.2.3
        imagePullPolicy: IfNotPresent
        livenessProbe:
          httpGet:
            path: /healthz
            port: 8080
          periodSeconds: 10
          timeoutSeconds: 3
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          periodSeconds: 10
          timeoutSeconds: 1
      volumes:
      - name: all
        projected:
          defaultMode: 420
          sources: []
`;

const sheet = buildSpecSheet(DEPLOYMENT, { scopedWritesSupported: true });
const fields = defaultFieldsOf(sheet);
const keyOf = (path: string) => {
  const atom = sheet.atoms.find((a) => a.path === path);
  if (!atom) throw new Error(`no atom at ${path}`);
  return atom.key;
};
const C = 'spec.template.spec.containers.0';

function edit(over: Partial<SheetEdit> = {}): SheetEdit {
  const none = () => {};
  return {
    editingKey: null,
    open: none,
    close: none,
    stage: none,
    unstage: none,
    setKeep: none,
    addingBlockId: null,
    openAdd: none,
    edits: new Map(),
    adds: new Set(),
    protection: new Map(),
    isKept: () => false,
    ...over,
  };
}
const overlay = (over: Partial<SheetOverlay> = {}): SheetOverlay => ({
  stale: new Set(),
  unreleased: new Set(),
  edit: edit(),
  ...over,
});
const quiet = (o: SheetOverlay, searching = false) => {
  const q = quietDefaultsOf(fields, sheet, o, searching);
  return new Set([...q.hosted, ...q.alone]);
};

test('the default pull policy follows the image tag', () => {
  expect(defaultPullPolicy('nginx:1.25')).toBe('IfNotPresent');
  expect(defaultPullPolicy('nginx@sha256:abc')).toBe('IfNotPresent');
  expect(defaultPullPolicy('nginx')).toBe('Always');
  expect(defaultPullPolicy('nginx:latest')).toBe('Always');
  expect(defaultPullPolicy('nginx:latest@sha256:abc')).toBe('Always');
  expect(defaultPullPolicy('registry.local:5000/nginx')).toBe('Always');
});

test('fields that say what a resource is, or that the cluster sets, have no default here', () => {
  const none = () => undefined;
  expect(kubeDefaultOf('Deployment', ['spec', 'replicas'], none)).toBeUndefined();
  expect(kubeDefaultOf('Service', ['spec', 'type'], none)).toBeUndefined();
  expect(kubeDefaultOf('Service', ['spec', 'ipFamilies', 0], none)).toBeUndefined();
  // A Job's Pods have no default restart policy; a Deployment's restart Always.
  expect(
    kubeDefaultOf('Job', ['spec', 'template', 'spec', 'restartPolicy'], none),
  ).toBeUndefined();
  expect(
    kubeDefaultOf('Deployment', ['spec', 'template', 'spec', 'restartPolicy'], none)?.text,
  ).toBe('Always');
  // A Service's targetPort defaults to its port.
  const port = (p: string) => (p === 'spec.ports.0.port' ? 80 : undefined);
  expect(kubeDefaultOf('Service', ['spec', 'ports', 0, 'targetPort'], port)).toMatchObject({
    text: '80',
    host: 'spec.ports.0.port',
  });
});

test('a quiet default that belongs to a value is in its card; the rest fold', () => {
  const q = quietDefaultsOf(fields, sheet, overlay(), false);
  const pull = keyOf(`${C}.imagePullPolicy`);
  expect(q.hosted.has(pull)).toBe(true);
  expect(q.byHost.get(keyOf(`${C}.image`))?.map((f) => f.atom.key)).toEqual([pull]);
  expect(q.alone.has(keyOf('spec.template.spec.dnsPolicy'))).toBe(true);
  expect(q.alone.has(keyOf('spec.revisionHistoryLimit'))).toBe(true);
  // A projected volume has no name to belong to: its defaultMode folds.
  expect(q.alone.has(keyOf('spec.template.spec.volumes.0.projected.defaultMode'))).toBe(true);
  // Replicas has no default here, so it stays.
  expect(quiet(overlay()).has(keyOf('spec.replicas'))).toBe(false);
});

test('a probe timing column comes back whole: one cell on the line brings the column', () => {
  const q = quiet(overlay());
  // Both periods are 10: the column is quiet.
  expect(q.has(keyOf(`${C}.livenessProbe.periodSeconds`))).toBe(true);
  expect(q.has(keyOf(`${C}.readinessProbe.periodSeconds`))).toBe(true);
  // The liveness timeout is 3, so the readiness timeout of 1 is drawn too, not left as a dash.
  expect(q.has(keyOf(`${C}.livenessProbe.timeoutSeconds`))).toBe(false);
  expect(q.has(keyOf(`${C}.readinessProbe.timeoutSeconds`))).toBe(false);
});

test('a default with a state is on the line', () => {
  const pull = keyOf(`${C}.imagePullPolicy`);
  expect(quiet(overlay({ unreleased: new Set([pull]) })).has(pull)).toBe(false);
  expect(quiet(overlay({ stale: new Set([pull]) })).has(pull)).toBe(false);
  expect(quiet(overlay({ edit: edit({ editingKey: pull }) })).has(pull)).toBe(false);
  expect(
    quiet(overlay({ edit: edit({ edits: new Map([[pull, 'Always']]) }) })).has(pull),
  ).toBe(false);
});

test('a default this Unit set over an upstream resource is on the line; in a base Unit it is quiet', () => {
  const dns = keyOf('spec.template.spec.dnsPolicy');
  const origins = (here: string[]) =>
    new Map<string, AtomOrigin>(
      sheet.atoms.map((a) => [
        a.key,
        { kind: here.includes(a.key) ? 'here' : 'inherited', unreleased: false },
      ]),
    );
  expect(quiet(overlay({ origins: origins([dns]) })).has(dns)).toBe(false);
  const base = new Map<string, AtomOrigin>(
    sheet.atoms.map((a) => [a.key, { kind: 'here', unreleased: false }]),
  );
  expect(quiet(overlay({ origins: base })).has(dns)).toBe(true);
});

test('nothing is quiet while a search is typed', () => {
  expect(quiet(overlay(), true).size).toBe(0);
});
