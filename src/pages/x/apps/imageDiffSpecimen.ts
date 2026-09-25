// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * A worked release comparison for the design-system specimen.
 *
 * The two sides are real config documents, and the diff is produced by the same
 * `computeFieldDiffs` / `buildPaths` the product uses. So the specimen exercises
 * the whole chain from a document to a rendered row — parsing, flattening,
 * change detection, image recognition — rather than a hand-written change list
 * that could agree with the renderer while disagreeing with the parser.
 *
 * Every container below earns its place by being a different KIND of move. The
 * one that does not move is the important one: a fixture built from changed
 * paths alone structurally cannot contain it, which is exactly why a container
 * left behind by its neighbours is the case most likely to go unrendered.
 */

import { computeFieldDiffs, buildPaths } from './entryBuilders';
import type { ReleaseDiffUnitView } from './ReleaseDiffPanel';

const checkout = (after: boolean): string =>
  [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: checkout',
    'spec:',
    `  replicas: ${after ? 4 : 3}`,
    '  template:',
    '    spec:',
    '      initContainers:',
    '        - name: db-migrate',
    `          image: "ghcr.io/confighubai/checkout:${after ? 'v1.4.3' : 'v1.4.2'}"`,
    '      containers:',
    '        - name: api',
    `          image: "ghcr.io/confighubai/checkout:${after ? 'v1.4.3' : 'v1.4.2'}"`,
    '          resources:',
    '            limits:',
    `              memory: "${after ? '512Mi' : '256Mi'}"`,
    // Stays exactly where it was while every neighbour moves.
    '        - name: log-shipper',
    '          image: "ghcr.io/confighubai/log-shipper:v2.3.1"',
    // No registry host at all — the repository is printed as-is.
    '        - name: otel',
    `          image: "otel/opentelemetry-collector-contrib:${after ? '0.112.0' : '0.104.0'}"`,
    '        - name: gateway',
    `          image: "ghcr.io/confighubai/gateway:${after ? 'v2.0.0' : 'v1.9.2'}"`,
    // Same tag on both sides; only the digest moves.
    '        - name: cache',
    `          image: "redis:7.4.1-alpine@sha256:${after ? '9c81b4ef2d60a7139f5c2b8ae04d16b7' : '4f2ad1c9e0b37a5c8d1e6f04b2c9a7e3'}"`,
    // Identical tag, different registry — invisible unless the row says so.
    '        - name: envoy',
    `          image: "${after ? 'quay.io' : 'ghcr.io'}/confighubai/envoy:v1.30.0"`,
    // A calendar tag: no magnitude to rank.
    '        - name: docs',
    `          image: "ghcr.io/confighubai/docs:${after ? '2026-09-16.9c02' : '2026-09-13.1a4f'}"`,
  ].join('\n');

/** A workload with no containers at all, so the tree still has to earn its place. */
const edge = (after: boolean): string =>
  [
    'apiVersion: networking.k8s.io/v1',
    'kind: Ingress',
    'metadata:',
    '  name: edge',
    '  annotations:',
    `    nginx.ingress.kubernetes.io/proxy-body-size: "${after ? '32m' : '8m'}"`,
    'spec:',
    '  rules:',
    '    - host: checkout.example.com',
    '      http:',
    '        paths:',
    '          - pathType: ' + (after ? 'Prefix' : 'Exact'),
  ].join('\n');

function unitView(unitId: string, slug: string, kind: string, before: string, after: string): ReleaseDiffUnitView {
  return {
    unitId,
    slug,
    kind,
    result: {
      isLoading: false,
      neverReleased: false,
      fieldDiffs: computeFieldDiffs(before, after),
      // The OLD side, as the panel receives it in production: an image absent
      // from the change list but present here did not move.
      allPaths: buildPaths(before),
      oldData: before,
      // No revision was matched: the specimen is a worked example, not a
      // comparison of two revisions that exist.
      matchedRevisionNum: undefined,
    },
  };
}

/** The specimen's units, in display order. */
export const IMAGE_DIFF_SPECIMEN_UNITS: ReleaseDiffUnitView[] = [
  unitView('specimen-checkout', 'checkout', 'Deployment', checkout(false), checkout(true)),
  unitView('specimen-edge', 'edge', 'Ingress', edge(false), edge(true)),
];
