// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Centered, focus-trapping MUI <Dialog> that walks the user through creating a
// component: a base Space (no Target) plus its starter Units. It is the real
// implementation of the approved "Approach A" wizard mockup
// (design-mockups/mockup-a-wizard.html).
//
// It mirrors CreateVariantPane.tsx for the hook-driving / phase-rendering /
// react-hook-form pattern, but is a Dialog (not a resizable pane): the a11y
// focus-trap requirement is met natively by MUI's <Dialog>.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';

import { CodeEditor } from '@/components/code-editor/CodeEditor';
import { ConfirmationModal } from '@/components/confirmation-modal/ConfirmationModal';
import { slugify } from '@/components/query-builder/ViewTabs';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormHelperText from '@mui/material/FormHelperText';
import FormLabel from '@mui/material/FormLabel';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Step from '@mui/material/Step';
import StepButton from '@mui/material/StepButton';
import Stepper from '@mui/material/Stepper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import {
  type TargetRead,
  type UploadResult,
  useListAllTargetsQuery,
  useUploadMutation,
} from '@confighub/rtk-query';
import { type QueryErrorDisplay, describeQueryError, isAbortedRequestError } from '@/utility/error-functions';

import { ownerValueProblem } from './componentOwner';
import { componentTheme } from './componentTheme';
import { type Granularity, effectiveUnitCount, groupDraftsForDisplay } from './createComponentInput';
import { DownstreamTargetPicker, buildDownstreamSpecs } from './DownstreamTargetPicker';
import {
  type FolderImportOutcome,
  type PickedFile,
  MAX_FOLDER_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  importFolderFiles,
  relativeToRoot,
  walkDroppedEntries,
} from './folderImport';
import { KeyValueRows } from './KeyValueRows';
import { OciErrorDetail, OciPlanList, OciSourcePanel } from './OciSourcePanel';
import type { UnitMetaRow } from './ociUpload';
import {
  EMPTY_OCI_SOURCE,
  type OciSourceForm,
  buildOciUploadRequest,
  ociPreviewBlocker,
  ociPreviewKey,
  resolveSpaceSlug,
  spaceSlugProblem,
  splitUnitMeta,
  uploadUnits,
} from './ociUpload';
import {
  type CreateComponentInput,
  useCreateComponentMutation,
} from './useCreateComponentMutation';
import {
  type DownstreamResult,
  useCreateDownstreamsMutation,
} from './useCreateDownstreamsMutation';

// ============================================================================
// CONSTANTS
// ============================================================================

const STEP_LABELS = ['Component', 'Units', 'Review'] as const;

const CUSTOM_OWNER = '__custom__';

/**
 * Label keys the rest of ConfigHub already groups and filters Spaces by. They
 * are suggestions only — the key input stays free-form, because a label is
 * whatever the org decides to call it.
 */
const WELL_KNOWN_LABEL_KEYS = ['Stage', 'Environment', 'Region', 'Layer'];

// Granularity is re-exported from createComponentInput.ts (imported above) so
// the wizard and its pure test-covered helpers share exactly one definition.

interface GranularityOption {
  value: Granularity;
  label: string;
  help: string;
  recommended?: boolean;
}

const GRANULARITY_OPTIONS: GranularityOption[] = [
  {
    value: 'per-resource',
    label: 'per-resource',
    help: 'One Unit per resource — scopes revisions, validation errors & promotion per resource.',
  },
  {
    value: 'minimal',
    label: 'minimal',
    help: 'One main Unit for everything, but CRDs are grouped into their own Unit, and ConfigMaps and Namespaces each get one Unit. The CLI default.',
    recommended: true,
  },
  {
    value: 'per-file',
    label: 'per-file',
    help: 'One Unit per source file, named from the file stem.',
  },
];

/**
 * Syntax-highlighting hint for the draft-YAML editors only. The wizard's parser
 * (`parseManifest`) requires a `kind:` field, so every draft it produces is
 * Kubernetes-shaped. The authoritative per-Unit ToolchainType is inferred
 * server-side by upload.BuildPlan — this constant is never sent anywhere.
 */
const EDITOR_TOOLCHAIN = 'Kubernetes/YAML';

const SAMPLE_MULTI_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  labels:
    app: checkout-api
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/acme/checkout-api:1.4.2
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
spec:
  selector:
    app: checkout-api
  ports:
    - port: 80
      targetPort: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: checkout-api-config
data:
  LOG_LEVEL: info
  TIMEOUT_MS: "3000"
`;

const SAMPLE_SINGLE_YAML = `${SAMPLE_MULTI_YAML.split('\n---\n')[0]}\n`;

// ============================================================================
// TYPES
// ============================================================================

export interface CreateComponentPaneProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Close the dialog (Cancel / Done / backdrop / Escape when idle). */
  onClose: () => void;
  /**
   * Called after a successful create when the user hits Done, with the new
   * component's name (the `Component` label value AppsComponentLayout keys
   * `?app=` deep-links by) so the caller can navigate straight to it.
   */
  onCreated?: (componentName: string) => void;
  /** Owner options to group the component under (nav tree grouping). */
  owners: string[];
  /**
   * The owner of each existing Component by Slug, "" for one with no owner.
   * A name that matches an owned Component locks the owner to its owner.
   */
  ownerByComponentSlug?: ReadonlyMap<string, string>;
  /**
   * Existing Space slugs, used to pre-flight the derived `<slug>-base` collision
   * inline before submit (a backstop to the server's own 409 handling).
   */
  existingSpaceSlugs: string[];
}

interface ComponentFormValues {
  componentName: string;
  owner: string;
  customOwner: string;
  labels: Array<{ key: string; value: string }>;
  /** Empty means the derived `<component>-base` slug is used. */
  spaceSlugOverride: string;
  /** Recorded on every Unit the create writes. Empty is not sent. */
  changeDescription: string;
  /**
   * Labels and annotations for every Unit an upload writes. One list, because
   * the OCI panel enters both in one row editor.
   */
  unitMeta: UnitMetaRow[];
}

/** One draft resource/document the user has staged for creation. */
interface DraftDoc {
  id: string;
  /** Derived unit slug / document name. */
  name: string;
  kind: string | null;
  resourceName: string | null;
  /** metadata.namespace, part of the doc's stable identity (null if cluster-scoped). */
  namespace: string | null;
  yaml: string;
  originalYaml: string;
  edited: boolean;
  source: 'yaml' | 'manual' | 'folder' | 'oci';
  /** Relative path of the file this doc came from (folder/oci mode only). */
  sourcePath?: string;
  expanded: boolean;
}

type UnitsMode = 'paste' | 'folder' | 'oci' | 'manual';

/** Summary of the most recent folder pick/drop, surfaced as a status line. */
interface FolderNotice {
  filtered: number;
  oversized: string[];
  fatal?: string;
  zeroResourceFiles: number;
}

// ============================================================================
// PURE HELPERS
// ============================================================================

let draftSeq = 0;
const nextDraftId = () => `draft-${draftSeq++}`;

// ConfigHub's sentinel namespace/name value — never a meaningful slug part, so
// the server drops it from generated slugs (plan.go `placeholderValue`).
const PLACEHOLDER_VALUE = 'confighubplaceholder';

// Server-side slug rule (cubkit CubNormalizeName + the API validator): the first
// and last characters must be alphanumeric. We validate the derived `<name>-base`
// space slug against this inline so `_internal` / `.net` fail early with a clear
// message instead of a raw 400 from the server.
const SLUG_RE = /^[A-Za-z0-9]([-_.A-Za-z0-9]*[A-Za-z0-9])?$/;

// The server gives a pull two minutes, so a spinner alone can stay on screen
// long enough to look like a hang. After this long, the panel says what it
// waits for and offers a cancel.
const OCI_SLOW_PULL_MS = 10_000;

/** Extract a `metadata.name` from a single YAML document. */
function metaName(doc: string): string | null {
  const metaIdx = doc.search(/^\s*metadata:\s*$/m);
  if (metaIdx < 0) {
    const flat = doc.match(/\bname:\s*["']?([A-Za-z0-9][A-Za-z0-9._-]*)/);
    return flat ? flat[1] : null;
  }
  const after = doc.slice(metaIdx);
  const m = after.match(/\n\s+name:\s*["']?([A-Za-z0-9][A-Za-z0-9._-]*)["']?/);
  return m ? m[1] : null;
}

/** Extract a `metadata.namespace` from a single YAML document. */
function metaNamespace(doc: string): string | null {
  const metaIdx = doc.search(/^\s*metadata:\s*$/m);
  if (metaIdx < 0) return null;
  const after = doc.slice(metaIdx);
  const m = after.match(/\n\s+namespace:\s*["']?([A-Za-z0-9][A-Za-z0-9._-]*)["']?/);
  return m ? m[1] : null;
}

/**
 * Mirror the server's per-resource slug (plan.go `resourceSlug`, verified by
 * plan_test.go:243-245): `[namespace-]kind-name`, with the namespace included
 * only when it's a real disambiguating value and placeholder namespace/name
 * values dropped. So `Deployment/web` → `deployment-web` and `shop/Deployment/web`
 * → `shop-deployment-web`.
 *
 * Case: the server's `kindOf` lowercases ONLY the kind; `CubNormalizeName`
 * (cubkit.go) explicitly does NOT lowercase, so the namespace/name keep their
 * original case. We mirror that here — lowercase kind, pass namespace/name
 * through as-is (they're already restricted to valid slug chars by the
 * metaName/metaNamespace regexes).
 */
function serverResourceSlug(kind: string, name: string | null, namespace: string | null): string {
  const parts: string[] = [];
  if (namespace && namespace !== PLACEHOLDER_VALUE) parts.push(namespace);
  parts.push(kind.toLowerCase());
  if (name && name !== PLACEHOLDER_VALUE) parts.push(name);
  return parts.filter(Boolean).join('-') || 'resource';
}

/** Disambiguate a slug against existing docs the way the server's `uniqueSlug` does (`-2`, `-3`, …). */
function uniqueSlug(base: string, existing: DraftDoc[]): string {
  let candidate = base;
  let k = 2;
  while (existing.some((u) => u.name === candidate)) candidate = `${base}-${k++}`;
  return candidate;
}

/** Split a multi-doc YAML manifest into one DraftDoc per resource. */
function parseManifest(text: string): DraftDoc[] {
  const docs: DraftDoc[] = [];
  if (!text || !text.trim()) return docs;
  const rawDocs = text.split(/^[ \t]*---[ \t]*$/m);
  for (const raw of rawDocs) {
    const doc = raw.replace(/^\s*[\r\n]/, '').replace(/\s+$/, '');
    if (!doc.trim()) continue;
    const km = doc.match(/^\s*kind:\s*["']?([A-Za-z][A-Za-z0-9]*)["']?\s*$/m);
    if (!km) continue; // not a resource doc
    const kind = km[1];
    const name = metaName(doc) || 'unnamed';
    const namespace = metaNamespace(doc);
    docs.push({
      id: nextDraftId(),
      name: uniqueSlug(serverResourceSlug(kind, name, namespace), docs),
      kind,
      resourceName: name,
      namespace,
      yaml: doc,
      originalYaml: doc,
      edited: false,
      source: 'yaml',
      expanded: false,
    });
  }
  return docs;
}

/**
 * Stable identity for reconciling a re-parsed doc against an existing one.
 * MUST include namespace: two ConfigMaps named `app-config` in different
 * namespaces (or two nameless resources of the same kind, which collapse to
 * `.../unnamed`) are distinct resources. Omitting namespace collided them, so
 * one prev doc overwrote the other in the identity lookup and its edit was lost.
 */
const docIdentity = (
  kind: string | null,
  resourceName: string | null,
  namespace: string | null,
): string =>
  `${namespace ?? ''}/${kind ?? ''}/${resourceName ?? ''}`;

/**
 * Reconcile freshly-parsed pasted docs against the current `docs`, without
 * discarding user work — replacing `docs` wholesale on every keystroke would
 * mint new ids and wipe edits and manually-added units. Rules:
 *   - Every `source === 'manual'` doc is preserved unconditionally.
 *   - A parsed doc matching an existing (kind, resourceName) that was EDITED keeps
 *     the user's edited YAML, `edited` flag, and id.
 *   - A parsed doc matching an unedited existing doc adopts the fresh source YAML
 *     but keeps the id/expanded so the row doesn't remount.
 *   - Parsed docs with no match are added; existing YAML docs no longer present in
 *     the paste are dropped (the user removed them from the manifest).
 */
function reconcilePastedDocs(prev: DraftDoc[], parsed: DraftDoc[]): DraftDoc[] {
  // Manual AND folder docs are staged independently of the paste box — a
  // different input mode — so both are preserved unconditionally here. Only
  // 'yaml' (paste-sourced) docs are subject to reconciliation against `parsed`.
  const nonYaml = prev.filter((d) => d.source !== 'yaml');
  // Identity -> QUEUE of prev docs, so matching is ONE-TO-ONE: each parsed doc
  // consumes at most one existing doc. Duplicate identities (same ns/kind/name)
  // no longer clobber each other, and an existing `id` is never reused for two
  // docs (ids are React keys; a reused key drops/misrenders a row).
  const prevByIdentity = new Map<string, DraftDoc[]>();
  for (const d of prev) {
    if (d.source !== 'yaml') continue;
    const key = docIdentity(d.kind, d.resourceName, d.namespace);
    const queue = prevByIdentity.get(key);
    if (queue) queue.push(d);
    else prevByIdentity.set(key, [d]);
  }

  const result: DraftDoc[] = [...nonYaml];
  for (const p of parsed) {
    const existing = prevByIdentity.get(docIdentity(p.kind, p.resourceName, p.namespace))?.shift();
    if (existing?.edited) {
      // Keep the user's edited YAML + flag + id; refresh only the derived name.
      result.push({ ...existing, name: p.name });
    } else if (existing) {
      // Adopt the fresh source YAML, but keep id/expanded to avoid a remount.
      result.push({ ...p, id: existing.id, expanded: existing.expanded });
    } else {
      // No existing doc to consume — `p` already carries a fresh unique id.
      result.push(p);
    }
  }
  return result;
}

// effectiveUnitCount now lives in createComponentInput.ts (exported, pure,
// unit-tested) so the granularity math is testable without rendering.

/** Guess a Kubernetes kind from a manual unit name (for the starter template). */
function guessKind(nm: string): string {
  const k = nm.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const map: Record<string, string> = {
    deployment: 'Deployment',
    service: 'Service',
    configmap: 'ConfigMap',
    serviceaccount: 'ServiceAccount',
    hpa: 'HorizontalPodAutoscaler',
    ingress: 'Ingress',
    secret: 'Secret',
    statefulset: 'StatefulSet',
    daemonset: 'DaemonSet',
    namespace: 'Namespace',
  };
  return map[k] || 'ConfigMap';
}

/** Build a starter YAML document for a manually-authored unit. */
function manualTemplate(name: string): string {
  const kind = guessKind(name);
  const apiV =
    kind === 'Deployment' ? 'apps/v1' : kind === 'HorizontalPodAutoscaler' ? 'autoscaling/v2' : 'v1';
  let y = `apiVersion: ${apiV}\nkind: ${kind}\nmetadata:\n  name: ${name}\n`;
  if (kind === 'Deployment') y += 'spec:\n  replicas: 2\n';
  else if (kind === 'Service') y += 'spec:\n  ports:\n    - port: 80\n';
  else if (kind === 'ConfigMap') y += 'data:\n  KEY: value\n';
  return y;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CreateComponentPane({
  open,
  onClose,
  onCreated,
  owners,
  ownerByComponentSlug,
  existingSpaceSlugs,
}: CreateComponentPaneProps) {
  const hook = useCreateComponentMutation();
  const downstreams = useCreateDownstreamsMutation();

  // All org targets for the optional "create deployment variants" card on the
  // Review step. `ExtendedTargetRead[]` → `TargetRead[]`, mirroring the
  // established unwrap in useUnitForm.ts — DownstreamTargetPicker's contract
  // is fixed to the bare `TargetRead`. Every Target is a pull destination, so
  // every one is offered.
  const { targets, isLoading: targetsLoading } = useListAllTargetsQuery(
    {},
    {
      selectFromResult: ({ data, isLoading }) => ({
        targets: data?.map((et) => et.Target).filter((t): t is TargetRead => t !== undefined) ?? [],
        isLoading,
      }),
    },
  );
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [variantNames, setVariantNames] = useState<Record<string, string>>({});
  const onVariantNameChange = useCallback((targetId: string, name: string) => {
    setVariantNames((prev) => ({ ...prev, [targetId]: name }));
  }, []);

  const defaultOwner = owners[0] ?? CUSTOM_OWNER;

  const { control, handleSubmit, watch, reset: resetForm, getValues } = useForm<ComponentFormValues>({
    defaultValues: {
      componentName: '',
      owner: defaultOwner,
      customOwner: '',
      labels: [],
      spaceSlugOverride: '',
      changeDescription: '',
      unitMeta: [],
    },
  });
  const { fields: labelFields, append: appendLabel, remove: removeLabel } = useFieldArray({
    control,
    name: 'labels',
  });
  const {
    fields: unitMetaFields,
    append: appendUnitMeta,
    remove: removeUnitMeta,
  } = useFieldArray({ control, name: 'unitMeta' });

  // ── Wizard / units local state ──────────────────────────────────────────
  const [activeStep, setActiveStep] = useState(0);
  const [unitsMode, setUnitsMode] = useState<UnitsMode>('paste');
  const [pasteText, setPasteText] = useState('');
  const [docs, setDocs] = useState<DraftDoc[]>([]);
  const [granularity, setGranularity] = useState<Granularity>('minimal');
  // `per-file` only means anything for folder (the only source that tags each
  // draft with a `sourcePath` file of origin) — for paste/manual it always
  // collapses to 1 regardless of resource count, so it's a confusing,
  // effectively-dead option there. Switching AWAY from folder while `per-file`
  // is selected falls back to the recommended default rather than leaving the
  // RadioGroup showing nothing selected while `granularity` state still
  // silently holds a now-hidden value.
  const handleSetUnitsMode = useCallback((mode: UnitsMode) => {
    setUnitsMode(mode);
    if (mode !== 'folder') {
      setGranularity((g) => (g === 'per-file' ? 'minimal' : g));
    }
  }, []);
  const [manualName, setManualName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [folderNotice, setFolderNotice] = useState<FolderNotice | null>(null);
  // OCI mode stages nothing into `docs`: the server pulls the bundle, so the
  // wizard holds only the form and the dry-run upload that previewed it.
  const [ociForm, setOciForm] = useState<OciSourceForm>(EMPTY_OCI_SOURCE);
  const [ociPreview, setOciPreview] = useState<{ key: string; result: UploadResult } | null>(null);
  const [ociPreviewError, setOciPreviewError] = useState<QueryErrorDisplay | null>(null);
  // True once a pull runs longer than OCI_SLOW_PULL_MS, which turns the bare
  // spinner into a waiting message plus a cancel.
  const [ociPullIsSlow, setOciPullIsSlow] = useState(false);
  const ociSlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The in-flight preview request, kept only for its abort().
  const ociPreviewRequestRef = useRef<{ abort: () => void } | null>(null);
  const [previewUpload, { isLoading: ociPreviewing }] = useUploadMutation();
  // Switching the import-type tab discards every staged unit, regardless of
  // which mode produced it — the wizard only ever authors from ONE source at a
  // time. Gate the discard behind a confirmation whenever there's actually
  // something to lose; a no-op switch (clicking the already-active tab) or
  // switching with zero staged docs skips the modal entirely.
  const [pendingUnitsMode, setPendingUnitsMode] = useState<UnitsMode | null>(null);
  const requestSetUnitsMode = useCallback(
    (mode: UnitsMode) => {
      if (mode === unitsMode) return;
      if (docs.length === 0) {
        handleSetUnitsMode(mode);
        return;
      }
      setPendingUnitsMode(mode);
    },
    [unitsMode, docs.length, handleSetUnitsMode],
  );
  const confirmUnitsModeSwitch = useCallback(() => {
    if (!pendingUnitsMode) return;
    setDocs([]);
    setPasteText('');
    setManualName('');
    setFolderNotice(null);
    handleSetUnitsMode(pendingUnitsMode);
    setPendingUnitsMode(null);
  }, [pendingUnitsMode, handleSetUnitsMode]);
  const cancelUnitsModeSwitch = useCallback(() => setPendingUnitsMode(null), []);

  // ── Derived form values ─────────────────────────────────────────────────
  const componentName = watch('componentName');
  const owner = watch('owner');
  const customOwner = watch('customOwner');
  // `watch` hands back the live form array, which react-hook-form mutates in
  // place when a row's own fields change: its identity moves only on add and
  // remove, so anything derived from row *content* would keep a stale value
  // through every edit. `useWatch` re-publishes a copy on each content change,
  // which is what the maps below are built from.
  const labelRows = useWatch({ control, name: 'labels' });
  const unitMetaRows = useWatch({ control, name: 'unitMeta' });
  const spaceSlugOverride = watch('spaceSlugOverride');

  const componentSlug = slugify(componentName);
  // A Component that exists with an owner keeps it: a create cannot give it
  // another one, so the owner is shown and locked.
  const lockedOwner = componentSlug ? ownerByComponentSlug?.get(componentSlug) || undefined : undefined;
  const effectiveOwner = lockedOwner ?? (owner === CUSTOM_OWNER ? customOwner.trim() : owner);
  const baseSlug = componentSlug ? `${componentSlug}-base` : '';

  // The Space the create actually writes to. The OCI request builder resolves
  // the same override through the same helper, so what the step shows and what
  // is sent cannot drift apart.
  const effectiveSpaceSlug = resolveSpaceSlug(spaceSlugOverride, baseSlug);
  const spaceSlugOverrideProblem = spaceSlugProblem(spaceSlugOverride);

  const slugCollision = useMemo(
    () => !!effectiveSpaceSlug && existingSpaceSlugs.includes(effectiveSpaceSlug),
    [effectiveSpaceSlug, existingSpaceSlugs],
  );

  // Parsed (per-resource) count and the effective count once granularity is applied.
  const parsedCount = docs.length;
  const effectiveCount = useMemo(
    () => (docs.length > 0 ? effectiveUnitCount(docs, granularity) : null),
    [docs, granularity],
  );
  const showGranularity = parsedCount > 1 && unitsMode !== 'oci';

  // ── Phase flags ─────────────────────────────────────────────────────────
  const inFlight = hook.phase === 'creatingSpace' || hook.phase === 'creatingUnits';

  // ── OCI preview ─────────────────────────────────────────────────────────
  // A preview is used only while every input it was made from is unchanged, so
  // what is created is always what was previewed.
  const extraLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    for (const row of labelRows) {
      if (row.key.trim() && row.value.trim()) labels[row.key.trim()] = row.value.trim();
    }
    return Object.keys(labels).length > 0 ? labels : undefined;
  }, [labelRows]);
  const { unitLabels, unitAnnotations } = useMemo(() => splitUnitMeta(unitMetaRows), [unitMetaRows]);
  // Step 0 owns the Space slug override for both sources, so every OCI request
  // is built from the source form plus that one field.
  const effectiveOciForm = useMemo(
    () => ({ ...ociForm, spaceSlugOverride }),
    [ociForm, spaceSlugOverride],
  );
  const ociKey = useMemo(
    () =>
      ociPreviewKey({
        form: effectiveOciForm,
        componentSlug,
        baseSlug,
        labels: extraLabels,
        // The key is built from the same request the preview sends, so the two
        // cannot drift apart. The key builder drops the metadata fields, so an
        // edit to these alone leaves a pulled bundle usable.
        unitLabels,
        unitAnnotations,
      }),
    [effectiveOciForm, componentSlug, baseSlug, extraLabels, unitLabels, unitAnnotations],
  );
  const currentOciPreview = ociPreview && ociPreview.key === ociKey ? ociPreview.result : null;
  const ociBlocker = ociPreviewBlocker(currentOciPreview, effectiveSpaceSlug);
  // A preview was made, but an input changed after it, so it is no longer used.
  // The panel says so, because Create goes dead with no other sign of why.
  const ociPreviewIsStale = !!ociPreview && !currentOciPreview;

  const clearOciSlowTimer = useCallback(() => {
    if (ociSlowTimerRef.current !== null) {
      clearTimeout(ociSlowTimerRef.current);
      ociSlowTimerRef.current = null;
    }
  }, []);
  // The timer must not outlive the wizard.
  useEffect(() => clearOciSlowTimer, [clearOciSlowTimer]);

  const runOciPreview = useCallback(async () => {
    const key = ociKey;
    setOciPreviewError(null);
    clearOciSlowTimer();
    setOciPullIsSlow(false);
    ociSlowTimerRef.current = setTimeout(() => setOciPullIsSlow(true), OCI_SLOW_PULL_MS);
    const request = previewUpload({
      dryRun: true,
      uploadRequest: buildOciUploadRequest({
        form: effectiveOciForm,
        componentSlug,
        baseSlug,
        unitLabels,
        unitAnnotations,
        labels: extraLabels,
      }),
    });
    ociPreviewRequestRef.current = request;
    try {
      const result = await request.unwrap();
      setOciPreview({ key, result });
    } catch (err) {
      // A cancel the user asked for is not a failure: leave the panel as it was
      // before the pull, with no error.
      if (isAbortedRequestError(err)) return;
      setOciPreview(null);
      setOciPreviewError(describeQueryError(err, 'the bundle'));
    } finally {
      ociPreviewRequestRef.current = null;
      clearOciSlowTimer();
      setOciPullIsSlow(false);
    }
  }, [
    ociKey,
    previewUpload,
    effectiveOciForm,
    componentSlug,
    baseSlug,
    extraLabels,
    unitLabels,
    unitAnnotations,
    clearOciSlowTimer,
  ]);

  const cancelOciPreview = useCallback(() => {
    ociPreviewRequestRef.current?.abort();
  }, []);

  // paste/folder/manual all stage into the same `docs` array; OCI needs a
  // current preview that can be created from.
  const hasSource = unitsMode === 'oci' ? !!currentOciPreview && !ociBlocker : docs.length > 0;

  // The derived `<slug>-base` must satisfy the server's slug rule (first/last char
  // alphanumeric) — catch `_internal` / `.net` inline instead of via a raw 400.
  const slugFormatValid = !baseSlug || SLUG_RE.test(baseSlug);

  const nameError =
    componentName.trim() && !componentSlug
      ? 'Name must contain letters or numbers'
      : !slugFormatValid
        ? 'Name must start and end with a letter or number'
        : // A collision an override caused belongs on the override, not on the
          // name the override replaced.
          slugCollision && !spaceSlugOverride.trim()
          ? `A space named "${baseSlug}" already exists`
          : hook.isNameCollision && hook.phase === 'spaceError'
            ? hook.error?.detail ?? `A space named "${effectiveSpaceSlug}" already exists`
            : '';

  const spaceSlugError =
    spaceSlugOverrideProblem ??
    (spaceSlugOverride.trim() && slugCollision ? `A space named "${effectiveSpaceSlug}" already exists` : '');

  // An owner the server would refuse as a label value. A locked owner is the
  // existing Component's own, so it is not checked again.
  const ownerError = lockedOwner ? '' : ownerValueProblem(effectiveOwner) ?? '';

  // Owner is optional: it only groups the component in the nav tree (see the
  // field's own subtitle), and a Component with no owner is "ungrouped"
  // (AppsComponentPage.tsx's `owners` list skips empty values). An org with no
  // Components has no owners to pick from, so `defaultOwner` is
  // `CUSTOM_OWNER` with an empty "New owner" field; requiring an owner would
  // block Continue there with no message on screen. A refused owner blocks it,
  // and its message is shown on the owner field.
  const step0Valid =
    !!componentSlug && slugFormatValid && !slugCollision && !spaceSlugOverrideProblem && !ownerError;

  const canCreate = step0Valid && hasSource && !inFlight;

  // ── Paste handling ──────────────────────────────────────────────────────
  // Reconcile on every change instead of blind-replacing `docs`, so editing a
  // unit's YAML or manually adding units survives typing in the paste box.
  // With OCI now its own mode, the paste box is YAML-only — no more
  // per-keystroke OCI-ref detection.
  const applyPaste = useCallback((text: string) => {
    setPasteText(text);
    setDocs((prev) => reconcilePastedDocs(prev, parseManifest(text)));
  }, []);

  const insertSample = useCallback(
    (yaml: string) => {
      applyPaste(yaml);
    },
    [applyPaste],
  );

  const clearPaste = useCallback(() => {
    setPasteText('');
    // Clear only the pasted-YAML docs — keep anything authored manually or
    // imported from a folder.
    setDocs((prev) => prev.filter((d) => d.source !== 'yaml'));
  }, []);

  const toggleExpanded = useCallback((id: string) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, expanded: !d.expanded } : d)));
  }, []);

  const editDocYaml = useCallback((id: string, yaml: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, yaml, edited: yaml !== d.originalYaml } : d)),
    );
  }, []);

  const revertDoc = useCallback((id: string) => {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, yaml: d.originalYaml, edited: false } : d)),
    );
  }, []);

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  // Removing a folder-imported file removes every DraftDoc it produced.
  const removeFolderPath = useCallback((path: string) => {
    setDocs((prev) => prev.filter((d) => d.sourcePath !== path));
  }, []);

  const addManualUnit = useCallback(() => {
    const nm = slugify(manualName);
    if (!nm) return;
    setDocs((prev) => {
      const yaml = manualTemplate(nm);
      const kind = guessKind(nm);
      return [
        ...prev,
        {
          id: nextDraftId(),
          // Same per-resource slug the server will assign to this inline YAML.
          name: uniqueSlug(serverResourceSlug(kind, nm, null), prev),
          kind,
          resourceName: nm,
          namespace: null,
          yaml,
          originalYaml: yaml,
          edited: false,
          source: 'manual',
          expanded: true,
        },
      ];
    });
    setManualName('');
  }, [manualName]);

  // ── Folder import ─────────────────────────────────────────────────────────
  // Parse every accepted file, tag its drafts with the originating path, and
  // re-key names uniquely across the WHOLE accumulated set (not just this
  // file) so two files that each contain e.g. `Deployment/web` don't collide
  // in the preview list.
  //
  // Shared by the folder picker and drag-drop. Always replaces prior
  // folder-sourced docs with whatever this outcome produced — even an empty
  // or fatal outcome — so a failed re-pick can't silently leave a previous
  // pick's units staged behind a notice the user might not read. Paste and
  // manual docs are untouched.
  const applyFolder = useCallback((outcome: FolderImportOutcome) => {
    let zeroResourceFiles = 0;
    const perFile =
      outcome.fatal || outcome.accepted.length === 0
        ? []
        : outcome.accepted.map(({ path, text }) => {
            const parsed = parseManifest(text).map((d) => ({ ...d, source: 'folder' as const, sourcePath: path }));
            if (parsed.length === 0) zeroResourceFiles++;
            return parsed;
          });
    setDocs((prev) => {
      const kept = prev.filter((d) => d.source !== 'folder');
      const combined: DraftDoc[] = [...kept];
      for (const group of perFile) {
        for (const d of group) {
          combined.push({ ...d, name: uniqueSlug(d.name, combined) });
        }
      }
      return combined;
    });
    setFolderNotice({
      filtered: outcome.filtered,
      oversized: outcome.oversized,
      fatal: outcome.fatal,
      zeroResourceFiles,
    });
  }, []);

  const handleFolderPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      e.target.value = ''; // allow re-picking the identical folder
      if (!fileList || fileList.length === 0) return;
      const picked: PickedFile[] = Array.from(fileList).map((f) => ({
        path: relativeToRoot((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name),
        file: f,
      }));
      void importFolderFiles(picked).then(applyFolder);
    },
    [applyFolder],
  );

  const handleFolderDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      // `dataTransfer.items` must be captured synchronously here — the list is
      // neutered after this event turn. `walkDroppedEntries` calls
      // `webkitGetAsEntry()` on every item in a synchronous loop before its
      // first internal `await`, so passing it directly (not via a `setTimeout`
      // or after any prior `await`) satisfies that constraint.
      const items = e.dataTransfer.items;
      void walkDroppedEntries(items)
        .then((picked) => importFolderFiles(picked))
        .then(applyFolder);
    },
    [applyFolder],
  );

  // Per-file summary of currently-staged folder docs: path → resource count.
  const folderFileList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const d of docs) {
      if (d.source === 'folder' && d.sourcePath) {
        counts.set(d.sourcePath, (counts.get(d.sourcePath) ?? 0) + 1);
      }
    }
    return [...counts.entries()];
  }, [docs]);

  // ── Submit ──────────────────────────────────────────────────────────────
  // Assemble the CreateComponentInput from CURRENT pane state. Shared by the
  // initial Create and by Retry, so a retry always reflects the user's latest
  // edits to the source / granularity / labels.
  const buildInput = useCallback(
    (values: ComponentFormValues): CreateComponentInput => {
      const resolvedOwner =
        ownerByComponentSlug?.get(slugify(values.componentName)) ||
        (values.owner === CUSTOM_OWNER ? values.customOwner.trim() : values.owner);
      const labels: Record<string, string> = {};
      for (const row of values.labels) {
        if (row.key.trim() && row.value.trim()) labels[row.key.trim()] = row.value.trim();
      }

      // Named apart from the watched value above, so it is plain that a build
      // reads the values it was handed and never live form state.
      const slugOverride = values.spaceSlugOverride.trim();
      const changeDescription = values.changeDescription.trim();

      return {
        componentName: values.componentName.trim(),
        owner: resolvedOwner,
        source:
          unitsMode === 'oci'
            ? // The upload builder reads the override off the source form, so the
              // Step 0 field is stamped onto it here rather than held in two places.
              { kind: 'oci', form: { ...ociForm, spaceSlugOverride: slugOverride }, digest: currentOciPreview?.SourceDigest }
            : { kind: 'inline', documents: docs },
        granularity,
        labels: Object.keys(labels).length > 0 ? labels : undefined,
        // The rows are an OCI-panel control, and the inline path has nowhere to
        // put them, so only the source that can write them sends them.
        ...splitUnitMeta(unitsMode === 'oci' ? values.unitMeta : []),
        spaceSlugOverride: slugOverride || undefined,
        changeDescription: changeDescription || undefined,
      };
    },
    [docs, granularity, unitsMode, ociForm, currentOciPreview, ownerByComponentSlug],
  );

  // Chain downstream-variant creation after a CLEAN create — never after a
  // spaceError/unitsError/partialFailure (hook.submit returns `null` for all
  // three; see CreateComponentOutcome's doc comment). Deliberately no
  // useEffect: the chain is driven directly from the submit handler.
  const onSubmit = useCallback(
    async (values: ComponentFormValues) => {
      const outcome = await hook.submit(buildInput(values));
      if (!outcome) return;
      const specs = buildDownstreamSpecs(selectedTargetIds, variantNames, targets);
      if (specs.length === 0) return;
      await downstreams.submit({
        upstreamSpaceId: outcome.spaceId,
        upstreamUnitWhere: `SpaceID='${outcome.spaceId}'`,
        downstreams: specs,
      });
    },
    [hook, buildInput, downstreams, selectedTargetIds, variantNames, targets],
  );

  // Retry step 2 only, re-deriving the input from live pane/form state at click
  // time so the user's fix (edited/removed resource, changed granularity) is used.
  const handleRetryUnits = useCallback(() => {
    void hook.retryUnits(buildInput(getValues()));
  }, [hook, buildInput, getValues]);

  // ── Reset / close ───────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    hook.reset();
    downstreams.reset();
    // Recompute the owner default from the CURRENT `owners` prop rather than the
    // value frozen at first mount.
    resetForm({
      componentName: '',
      owner: owners[0] ?? CUSTOM_OWNER,
      customOwner: '',
      labels: [],
      spaceSlugOverride: '',
      changeDescription: '',
      unitMeta: [],
    });
    setActiveStep(0);
    setUnitsMode('paste');
    setPasteText('');
    setDocs([]);
    setGranularity('minimal');
    setManualName('');
    setDragging(false);
    setFolderNotice(null);
    cancelOciPreview();
    setOciForm(EMPTY_OCI_SOURCE);
    setOciPreview(null);
    setOciPreviewError(null);
    setOciPullIsSlow(false);
    setSelectedTargetIds([]);
    setVariantNames({});
  }, [hook, downstreams, resetForm, owners, cancelOciPreview]);

  const handleClose = useCallback(() => {
    if (inFlight) return; // don't allow dismiss mid-flight
    onClose();
    resetAll();
  }, [inFlight, onClose, resetAll]);

  const handleDone = useCallback(() => {
    // Capture before resetAll() clears the form back to defaults.
    onCreated?.(hook.createdComponentName ?? componentName);
    onClose();
    resetAll();
  }, [onCreated, hook.createdComponentName, componentName, onClose, resetAll]);

  // If a name collision surfaced server-side, send the user back to step 1.
  const goToNameStepIfCollision = hook.isNameCollision && hook.phase === 'spaceError';

  // ── Navigation ──────────────────────────────────────────────────────────
  const goNext = useCallback(() => setActiveStep((s) => Math.min(s + 1, STEP_LABELS.length - 1)), []);
  const goBack = useCallback(() => setActiveStep((s) => Math.max(s - 1, 0)), []);

  const stepReachable = useCallback(
    (index: number) => {
      // Step 0 is always reachable; every later step needs a valid component identity.
      if (index === 0) return true;
      return step0Valid;
    },
    [step0Valid],
  );

  // ── Render helpers ──────────────────────────────────────────────────────
  const showSuccess = hook.phase === 'success';
  const showPartial = hook.phase === 'partialFailure';
  const showUnitsError = hook.phase === 'unitsError';

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth='sm'
      fullWidth
      aria-labelledby='create-component-title'
      slotProps={{ paper: { sx: { minHeight: 560 } } }}
    >
      <DialogTitle
        id='create-component-title'
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}
      >
        <Typography component='span' sx={{ fontSize: 16, fontWeight: 700 }}>
          New component
        </Typography>
        <Tooltip title='Close'>
          <span>
            <IconButton
              aria-label='Close'
              onClick={handleClose}
              disabled={inFlight}
              size='small'
              sx={{ position: 'absolute', right: 12, top: 12, color: componentTheme.fgMuted }}
            >
              <CloseIcon fontSize='small' />
            </IconButton>
          </span>
        </Tooltip>
      </DialogTitle>

      <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {hook.ownerWarning && (
          <Alert severity='warning' icon={<ErrorOutlineIcon fontSize='small' />} data-testid='create-component-owner-warning'>
            <AlertTitle sx={{ fontSize: 13, fontWeight: 700 }}>Owner not set</AlertTitle>
            {hook.ownerWarning}
          </Alert>
        )}

        {/* ── Success receipt ──────────────────────────────────────────── */}
        {showSuccess ? (
          <SuccessReceipt
            spaceSlug={hook.createdSpaceSlug ?? effectiveSpaceSlug}
            units={hook.createdUnits}
            skippedSecrets={hook.skippedSecrets}
            componentName={hook.createdComponentName ?? componentName.trim()}
            downstreams={downstreams.results}
            downstreamsInFlight={downstreams.phase === 'creating'}
            onRetryDownstreams={
              downstreams.phase === 'partialFailure' || downstreams.phase === 'error'
                ? downstreams.retryFailed
                : undefined
            }
          />
        ) : (
          <>
            {/* ── Stepper (real focusable StepButtons) ─────────────────── */}
            <Stepper nonLinear activeStep={activeStep} sx={{ pt: 0.5 }}>
              {STEP_LABELS.map((label, index) => (
                <Step key={label} completed={index < activeStep}>
                  <StepButton
                    color='inherit'
                    onClick={() => setActiveStep(index)}
                    disabled={!stepReachable(index)}
                  >
                    {label}
                  </StepButton>
                </Step>
              ))}
            </Stepper>

            {/* ── Space-level error banner ─────────────────────────────── */}
            {hook.phase === 'spaceError' && hook.error && (
              <Alert severity='error' icon={<ErrorOutlineIcon fontSize='small' />}>
                <AlertTitle sx={{ fontSize: 13, fontWeight: 700 }}>{hook.error.title}</AlertTitle>
                {hook.error.suggestion ?? hook.error.detail}
                {hook.error.suggestion && hook.error.detail && <OciErrorDetail detail={hook.error.detail} />}
                {goToNameStepIfCollision && activeStep !== 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Button size='small' onClick={() => setActiveStep(0)}>
                      Edit name
                    </Button>
                  </Box>
                )}
              </Alert>
            )}

            {/* ── Total units-failure banner (step 2 threw, 0 units) ───── */}
            {showUnitsError && (
              <Alert severity='error' icon={<ErrorOutlineIcon fontSize='small' />}>
                <AlertTitle sx={{ fontSize: 13, fontWeight: 700 }}>
                  Base space created — authoring units failed
                </AlertTitle>
                <Typography sx={{ fontSize: 12, mb: 0.5 }}>
                  The base space{' '}
                  <Box component='code' sx={{ fontFamily: componentTheme.fontMono }}>
                    {hook.createdSpaceSlug ?? effectiveSpaceSlug}
                  </Box>{' '}
                  exists but no units were authored.
                </Typography>
                {hook.error?.detail && (
                  <Typography sx={{ fontSize: 12, mb: 0.5 }}>{hook.error.detail}</Typography>
                )}
                <Box sx={{ mt: 1 }}>
                  <Button size='small' variant='outlined' onClick={handleRetryUnits} disabled={inFlight}>
                    Retry
                  </Button>
                </Box>
              </Alert>
            )}

            {/* ── Partial-failure banner (207 with itemErrors) ─────────── */}
            {showPartial && (
              <Alert severity='warning' icon={<ErrorOutlineIcon fontSize='small' />}>
                <AlertTitle sx={{ fontSize: 13, fontWeight: 700 }}>
                  Base space created — some units failed
                </AlertTitle>
                {hook.error?.detail && (
                  <Typography sx={{ fontSize: 12, mb: 0.5 }}>{hook.error.detail}</Typography>
                )}
                {hook.itemErrors.length > 0 && (
                  <Box component='ul' sx={{ m: 0, pl: 2, fontSize: 12 }}>
                    {hook.itemErrors.map((e) => (
                      <li key={`${e.slug}-${e.message}`}>
                        <Box component='code' sx={{ fontFamily: componentTheme.fontMono }}>
                          {e.slug || 'unit'}
                        </Box>
                        : {e.message}
                      </li>
                    ))}
                  </Box>
                )}
                {hook.createdUnits.length > 0 && (
                  <Typography sx={{ fontSize: 12, mt: 0.5, color: componentTheme.fgMuted }}>
                    {hook.createdUnits.length} unit{hook.createdUnits.length === 1 ? '' : 's'} were
                    created successfully.
                  </Typography>
                )}
                {hook.skippedSecrets.length > 0 && (
                  <SkippedSecretsNote skippedSecrets={hook.skippedSecrets} />
                )}
              </Alert>
            )}

            {/* ── In-flight progress ───────────────────────────────────── */}
            {inFlight && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  p: 1.5,
                  borderRadius: `${componentTheme.radiusMd}px`,
                  border: `1px solid ${componentTheme.borderDefault}`,
                  bgcolor: componentTheme.bgSubtle,
                }}
              >
                <CircularProgress size={18} thickness={5} />
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {unitsMode === 'oci'
                    ? 'Pulling the bundle and creating units…'
                    : hook.phase === 'creatingSpace'
                      ? 'Creating base space…'
                      : 'Authoring units…'}
                </Typography>
              </Box>
            )}

            {/* ── Step bodies ──────────────────────────────────────────── */}
            <Box sx={{ opacity: inFlight ? 0.5 : 1, pointerEvents: inFlight ? 'none' : 'auto' }}>
              {activeStep === 0 && (
                <StepComponent
                  control={control}
                  owners={owners}
                  owner={owner}
                  lockedOwner={lockedOwner}
                  ownerError={ownerError}
                  nameError={nameError}
                  baseSlug={baseSlug}
                  effectiveSpaceSlug={effectiveSpaceSlug}
                  spaceSlugError={spaceSlugError}
                  onIdentityChange={hook.clearSpaceError}
                  componentName={componentName}
                  labelFields={labelFields}
                  appendLabel={() => appendLabel({ key: '', value: '' })}
                  removeLabel={removeLabel}
                />
              )}

              {activeStep === 1 && (
                <StepUnits
                  unitsMode={unitsMode}
                  setUnitsMode={requestSetUnitsMode}
                  pasteText={pasteText}
                  onPasteChange={applyPaste}
                  onClearPaste={clearPaste}
                  onInsertSample={insertSample}
                  dragging={dragging}
                  setDragging={setDragging}
                  onFolderPick={handleFolderPick}
                  onFolderDrop={handleFolderDrop}
                  folderNotice={folderNotice}
                  folderFileList={folderFileList}
                  onRemoveFolderPath={removeFolderPath}
                  docs={docs}
                  effectiveCount={effectiveCount}
                  showGranularity={showGranularity}
                  granularity={granularity}
                  setGranularity={setGranularity}
                  onToggleExpanded={toggleExpanded}
                  onEditDoc={editDocYaml}
                  onRevertDoc={revertDoc}
                  onRemoveDoc={removeDoc}
                  manualName={manualName}
                  setManualName={setManualName}
                  onAddManual={addManualUnit}
                  ociPanel={
                    <OciSourcePanel
                      form={ociForm}
                      onChange={setOciForm}
                      componentSlug={componentSlug}
                      control={control}
                      unitMetaName='unitMeta'
                      unitMetaFields={unitMetaFields}
                      onAddUnitMeta={() => appendUnitMeta({ kind: 'label', key: '', value: '' })}
                      onRemoveUnitMeta={removeUnitMeta}
                      onPreview={() => void runOciPreview()}
                      onCancelPreview={cancelOciPreview}
                      previewing={ociPreviewing}
                      pullIsSlow={ociPullIsSlow}
                      preview={currentOciPreview}
                      previewIsStale={ociPreviewIsStale}
                      previewError={ociPreviewError}
                      previewBlocker={ociBlocker}
                    />
                  }
                />
              )}

              {activeStep === 2 && (
                <StepReview
                  componentName={componentName.trim()}
                  componentSlug={componentSlug}
                  owner={effectiveOwner}
                  baseSlug={effectiveSpaceSlug}
                  docs={docs}
                  granularity={granularity}
                  effectiveCount={unitsMode === 'oci' ? uploadUnits(currentOciPreview ?? undefined).length : effectiveCount}
                  ociPreview={unitsMode === 'oci' ? currentOciPreview : null}
                  ociRef={unitsMode === 'oci' ? ociForm.ref.trim() : ''}
                  hasSource={hasSource}
                  targets={targets}
                  targetsLoading={targetsLoading}
                  selectedTargetIds={selectedTargetIds}
                  setSelectedTargetIds={setSelectedTargetIds}
                  variantNames={variantNames}
                  onVariantNameChange={onVariantNameChange}
                />
              )}
            </Box>
          </>
        )}
      </DialogContent>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        {showSuccess ? (
          <>
            <Button variant='outlined' onClick={resetAll} disabled={downstreams.phase === 'creating'}>
              Create another
            </Button>
            <Button
              variant='contained'
              onClick={handleDone}
              disabled={downstreams.phase === 'creating'}
              startIcon={<CheckCircleOutlineIcon />}
              data-testid='create-component-done-button'
            >
              Done
            </Button>
          </>
        ) : showPartial ? (
          <Button variant='contained' onClick={handleDone} data-testid='create-component-done-button'>
            Done
          </Button>
        ) : showUnitsError ? (
          <>
            <Button
              variant='outlined'
              onClick={handleRetryUnits}
              disabled={inFlight}
              sx={{ mr: 'auto' }}
            >
              Retry
            </Button>
            <Button variant='contained' onClick={handleDone} data-testid='create-component-done-button'>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant='text' onClick={handleClose} disabled={inFlight} sx={{ mr: 'auto' }}>
              Cancel
            </Button>
            {activeStep > 0 && (
              <Button
                variant='outlined'
                onClick={goBack}
                disabled={inFlight}
                data-testid='create-component-back-button'
              >
                Back
              </Button>
            )}
            {activeStep < STEP_LABELS.length - 1 ? (
              <Button
                variant='contained'
                onClick={goNext}
                disabled={activeStep === 0 && !step0Valid}
                data-testid='create-component-next-button'
                endIcon={<ChevronRightIcon />}
              >
                Continue
              </Button>
            ) : (
              <Button
                variant='contained'
                onClick={handleSubmit(onSubmit)}
                disabled={!canCreate}
                data-testid='create-component-submit-button'
                startIcon={inFlight ? <CircularProgress size={14} color='inherit' /> : undefined}
              >
                {inFlight ? 'Creating…' : 'Create'}
              </Button>
            )}
          </>
        )}
      </DialogActions>

      {/* Renders via a Portal, same as Dialog itself, so its DOM position here
          (nested inside Dialog's JSX) doesn't put it visually inside it. */}
      <ConfirmationModal
        isOpen={pendingUnitsMode !== null}
        onClose={cancelUnitsModeSwitch}
        onSubmit={confirmUnitsModeSwitch}
        modalTitleText='Discard staged units?'
        modalDescriptionText={`Switching the import type will remove all ${docs.length} staged unit${docs.length === 1 ? '' : 's'}. This can't be undone.`}
      />
    </Dialog>
  );
}

// ============================================================================
// STEP 1 — COMPONENT
// ============================================================================

interface StepComponentProps {
  control: ReturnType<typeof useForm<ComponentFormValues>>['control'];
  owners: string[];
  owner: string;
  /** The owner of the existing Component the name matches; the select is locked to it. */
  lockedOwner?: string;
  /** Why the server would refuse the selected owner, or '' when it accepts it. */
  ownerError: string;
  nameError: string;
  baseSlug: string;
  /** The Space slug that will be written: the override, or `baseSlug`. */
  effectiveSpaceSlug: string;
  /** What is wrong with the Space slug override, or '' when it can be sent. */
  spaceSlugError: string;
  /** Clears any surfaced server collision/error as soon as the name or slug is edited. */
  onIdentityChange: () => void;
  /** For the read-only `Component = <slug>` chip in the labels disclosure. */
  componentName: string;
  labelFields: Array<{ id: string }>;
  appendLabel: () => void;
  removeLabel: (index: number) => void;
}

function StepComponent({
  control,
  owners,
  owner,
  lockedOwner,
  ownerError,
  nameError,
  baseSlug,
  effectiveSpaceSlug,
  spaceSlugError,
  onIdentityChange,
  componentName,
  labelFields,
  appendLabel,
  removeLabel,
}: StepComponentProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // A bad slug blocks Continue, so it is never left hidden behind a collapsed
  // disclosure with nothing on screen to explain the dead button.
  const advancedExpanded = advancedOpen || !!spaceSlugError;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Name your component</Typography>
        <Typography sx={{ fontSize: 12.5, color: componentTheme.fgSubtle }}>
          ConfigHub creates the component, owned by this owner, and a first{' '}
          <strong>base space</strong> in it. The base has <strong>no target</strong>, so it never
          deploys directly — it's the source you clone into dev / staging / prod variants.
        </Typography>
      </Box>

      <Controller
        name='componentName'
        control={control}
        rules={{ required: 'A component name is required' }}
        render={({ field }) => (
          <TextField
            {...field}
            onChange={(e) => {
              field.onChange(e);
              // Drop any stale server collision/error the moment the name changes.
              onIdentityChange();
            }}
            label='Component name'
            data-testid='create-component-name-input'
            placeholder='e.g. checkout-api'
            size='small'
            fullWidth
            autoFocus
            error={!!nameError}
            helperText={nameError || 'lowercase, hyphenated'}
            inputProps={{ autoComplete: 'off', spellCheck: false }}
          />
        )}
      />

      <Box>
        <FormLabel sx={{ fontSize: 12, fontWeight: 600, color: componentTheme.fgMuted }}>
          Owner
        </FormLabel>
        <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, mb: 1 }}>
          {lockedOwner
            ? 'This component already exists, and has this owner.'
            : 'Set on the component. Groups it in the nav tree.'}
        </Typography>
        <Controller
          name='owner'
          control={control}
          render={({ field }) => (
            <ToggleButtonGroup
              exclusive
              aria-label='Owner'
              data-testid='create-component-owner-select'
              value={lockedOwner ?? field.value}
              disabled={!!lockedOwner}
              onChange={(_e, val) => {
                if (val !== null) field.onChange(val);
              }}
              size='small'
              sx={{ flexWrap: 'wrap', gap: 1, '& .MuiToggleButton-root': { borderRadius: 1 } }}
            >
              {owners.map((o) => (
                <ToggleButton key={o} value={o} sx={{ textTransform: 'none', px: 1.5 }}>
                  {o}
                </ToggleButton>
              ))}
              <ToggleButton value={CUSTOM_OWNER} sx={{ textTransform: 'none', px: 1.5 }}>
                <AddIcon fontSize='small' sx={{ mr: 0.5 }} />
                New owner
              </ToggleButton>
            </ToggleButtonGroup>
          )}
        />
        {owner === CUSTOM_OWNER && !lockedOwner && (
          <Controller
            name='customOwner'
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label='New owner'
                data-testid='create-component-custom-owner-input'
                size='small'
                sx={{ mt: 1.5 }}
                fullWidth
                error={!!ownerError}
                helperText={ownerError || undefined}
                inputProps={{ autoComplete: 'off', spellCheck: false }}
              />
            )}
          />
        )}
        {owner !== CUSTOM_OWNER && ownerError && (
          <FormHelperText error data-testid='create-component-owner-error'>
            {ownerError}
          </FormHelperText>
        )}
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 1.5,
          py: 1.25,
          bgcolor: componentTheme.bgInset,
          borderRadius: `${componentTheme.radiusSm}px`,
          border: `1px solid ${componentTheme.borderMuted}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: componentTheme.fgSubtle,
          }}
        >
          Base space slug
        </Typography>
        <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12.5 }}>
          {!effectiveSpaceSlug ? (
            <Box component='span' sx={{ color: componentTheme.fgSubtle }}>
              component-name-base
            </Box>
          ) : effectiveSpaceSlug.endsWith('-base') ? (
            <>
              {effectiveSpaceSlug.replace(/-base$/, '')}
              <Box component='span' sx={{ color: componentTheme.accent, fontWeight: 600 }}>
                -base
              </Box>
            </>
          ) : (
            // An overridden slug has no `-base` suffix to call out.
            effectiveSpaceSlug
          )}
        </Typography>
        <Chip label='No target' size='small' sx={{ ml: 'auto', height: 22, fontSize: 11 }} />
      </Box>

      {/* Advanced — the optional Space slug, change description and labels,
          collapsed by default so Step 0 stays short. */}
      <Box>
        <Button
          size='small'
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedExpanded}
          startIcon={
            <ChevronRightIcon
              sx={{ transform: advancedExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
            />
          }
          sx={{ textTransform: 'none' }}
        >
          Advanced (optional)
        </Button>
        <Collapse in={advancedExpanded} unmountOnExit>
          <Box sx={{ pt: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.75 }}>
              <Chip
                size='small'
                label={`Component = ${slugify(componentName) || 'component-name'}`}
                sx={{ fontFamily: componentTheme.fontMono, fontSize: 11 }}
              />
            </Box>
            <Controller
              name='spaceSlugOverride'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    // Drop any stale server collision the moment the slug changes.
                    onIdentityChange();
                  }}
                  label='Space slug (optional)'
                  data-testid='create-component-space-slug-input'
                  placeholder={baseSlug || 'component-name-base'}
                  size='small'
                  fullWidth
                  error={!!spaceSlugError}
                  helperText={spaceSlugError || 'Leave empty to use the slug above'}
                  inputProps={{ autoComplete: 'off', spellCheck: false }}
                  sx={{ mb: 2 }}
                />
              )}
            />
            <Controller
              name='changeDescription'
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label='Change description'
                  data-testid='create-component-change-description-input'
                  placeholder='Imported the first version of the checkout API'
                  size='small'
                  fullWidth
                  helperText='Recorded on every unit this create writes'
                  inputProps={{ autoComplete: 'off' }}
                  sx={{ mb: 2 }}
                />
              )}
            />
            <KeyValueRows
              control={control}
              name='labels'
              fields={labelFields}
              onAdd={appendLabel}
              onRemove={removeLabel}
              keyOptions={WELL_KNOWN_LABEL_KEYS}
              keyPlaceholder='tier'
              valuePlaceholder='backend'
              addLabel='Add label'
              itemLabel='label'
            />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}

// ============================================================================
// STEP 2 — UNITS
// ============================================================================

interface StepUnitsProps {
  unitsMode: UnitsMode;
  setUnitsMode: (m: UnitsMode) => void;
  pasteText: string;
  onPasteChange: (text: string) => void;
  onClearPaste: () => void;
  onInsertSample: (yaml: string) => void;
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFolderPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFolderDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  folderNotice: FolderNotice | null;
  folderFileList: Array<[string, number]>;
  onRemoveFolderPath: (path: string) => void;
  docs: DraftDoc[];
  effectiveCount: number | null;
  showGranularity: boolean;
  granularity: Granularity;
  setGranularity: (g: Granularity) => void;
  onToggleExpanded: (id: string) => void;
  onEditDoc: (id: string, yaml: string) => void;
  onRevertDoc: (id: string) => void;
  onRemoveDoc: (id: string) => void;
  manualName: string;
  setManualName: (v: string) => void;
  onAddManual: () => void;
  /** The OCI reference form, rendered in OCI mode. */
  ociPanel: React.ReactNode;
}

function StepUnits(props: StepUnitsProps) {
  const {
    unitsMode,
    setUnitsMode,
    pasteText,
    onPasteChange,
    onClearPaste,
    onInsertSample,
    dragging,
    setDragging,
    onFolderPick,
    onFolderDrop,
    folderNotice,
    folderFileList,
    onRemoveFolderPath,
    docs,
    effectiveCount,
    showGranularity,
    granularity,
    setGranularity,
    onToggleExpanded,
    onEditDoc,
    onRevertDoc,
    onRemoveDoc,
    manualName,
    setManualName,
    onAddManual,
    ociPanel,
  } = props;

  const isEmpty = !pasteText.trim();
  // Scoped to the paste box specifically (docs also holds folder/manual
  // drafts once those modes have been used) so the "Detected N resources"
  // summary reflects only what's actually in the textarea.
  const pasteDocsCount = docs.filter((d) => d.source === 'yaml').length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Add starter units</Typography>
        <Typography sx={{ fontSize: 12.5, color: componentTheme.fgSubtle }}>
          Paste manifests, upload a folder, or reference an{' '}
          <Box component='code' sx={{ fontFamily: componentTheme.fontMono, fontVariantLigatures: 'none' }}>oci://</Box> image — either way
          you get one unit per resource. Add as many as you like now, or after.
        </Typography>
      </Box>

      {/* Mode toggle — the ACTIVE mode, not a heuristic, decides the source. */}
      <ToggleButtonGroup
        exclusive
        aria-label='Units input mode'
        value={unitsMode}
        onChange={(_e, val) => {
          if (val !== null) setUnitsMode(val);
        }}
        size='small'
        sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { borderRadius: 1, textTransform: 'none', px: 1.5 } }}
      >
        <ToggleButton value='paste' data-testid='create-component-units-mode-paste'>
          Paste YAML
        </ToggleButton>
        <ToggleButton value='folder' data-testid='create-component-units-mode-folder'>
          Upload folder
        </ToggleButton>
        <ToggleButton value='oci' data-testid='create-component-units-mode-oci'>
          OCI reference
        </ToggleButton>
        <ToggleButton value='manual' data-testid='create-component-units-mode-manual'>
          Add manually
        </ToggleButton>
      </ToggleButtonGroup>

      {unitsMode === 'paste' && (
        <>
          <TextField
            label='Paste a manifest'
            data-testid='create-component-paste-input'
            value={pasteText}
            onChange={(e) => onPasteChange(e.target.value)}
            multiline
            minRows={6}
            maxRows={14}
            fullWidth
            placeholder='Paste Kubernetes resources separated by ---'
            inputProps={{ spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off' }}
            sx={{ '& .MuiInputBase-input': { fontFamily: componentTheme.fontMono, fontSize: 12 } }}
          />

          {/* Empty-state: sample inserters */}
          {isEmpty && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                p: 2,
                border: `1px dashed ${componentTheme.borderDefault}`,
                borderRadius: `${componentTheme.radiusMd}px`,
              }}
            >
              <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle, textAlign: 'center' }}>
                Paste your Kubernetes YAML — resources separated by{' '}
                <Box component='code' sx={{ fontFamily: componentTheme.fontMono }}>---</Box>
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  size='small'
                  variant='outlined'
                  startIcon={<AddIcon />}
                  onClick={() => onInsertSample(SAMPLE_MULTI_YAML)}
                  data-testid='create-component-insert-sample-button'
                  sx={{ textTransform: 'none' }}
                >
                  Insert a sample manifest
                </Button>
                <Button
                  size='small'
                  onClick={() => onInsertSample(SAMPLE_SINGLE_YAML)}
                  data-testid='create-component-insert-sample-single-button'
                  sx={{ textTransform: 'none' }}
                >
                  Single Deployment
                </Button>
              </Box>
            </Box>
          )}

          {!isEmpty && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {pasteDocsCount > 0 ? (
                <Typography sx={{ fontSize: 12.5 }}>
                  Detected <strong>{pasteDocsCount}</strong> resource{pasteDocsCount === 1 ? '' : 's'}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: 12.5, color: componentTheme.attention }}>
                  No <Box component='code' sx={{ fontFamily: componentTheme.fontMono }}>kind:</Box> found — not
                  valid YAML.
                </Typography>
              )}
              <Button size='small' onClick={onClearPaste} sx={{ ml: 'auto', textTransform: 'none' }}>
                Clear
              </Button>
            </Box>
          )}
        </>
      )}

      {unitsMode === 'folder' && (
        <>
          <Box
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onFolderDrop}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
              p: 2,
              border: `2px dashed ${dragging ? componentTheme.accent : componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusMd}px`,
              bgcolor: dragging ? componentTheme.accentMuted : 'transparent',
              transition: 'background-color 0.15s, border-color 0.15s',
            }}
          >
            <Typography sx={{ fontSize: 12.5, color: componentTheme.fgSubtle }}>
              Drop a folder here, or
            </Typography>
            <Button component='label' variant='outlined' startIcon={<AddIcon />} sx={{ textTransform: 'none' }}>
              Choose folder
              <input type='file' hidden multiple webkitdirectory='' directory='' onChange={onFolderPick} />
            </Button>
            <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
              .yaml / .yml only · up to {MAX_FOLDER_FILES} files · {MAX_FILE_BYTES / (1 << 20)} MiB per
              file · {MAX_TOTAL_BYTES / (1 << 20)} MiB total
            </Typography>
          </Box>

          {folderNotice?.fatal && (
            <Alert severity='error' sx={{ fontSize: 12 }}>
              {folderNotice.fatal}
            </Alert>
          )}
          {folderNotice && !folderNotice.fatal && folderFileList.length === 0 && (
            <Alert severity='warning' sx={{ fontSize: 12 }}>
              No .yaml or .yml files found in that folder.
            </Alert>
          )}
          {folderNotice &&
            !folderNotice.fatal &&
            (folderNotice.filtered > 0 || folderNotice.oversized.length > 0 || folderNotice.zeroResourceFiles > 0) && (
              <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
                {folderNotice.filtered > 0 &&
                  `${folderNotice.filtered} file${folderNotice.filtered === 1 ? '' : 's'} filtered out (extension / noise dir). `}
                {folderNotice.oversized.length > 0 &&
                  `${folderNotice.oversized.length} file${folderNotice.oversized.length === 1 ? '' : 's'} skipped for size. `}
                {folderNotice.zeroResourceFiles > 0 &&
                  `${folderNotice.zeroResourceFiles} file${folderNotice.zeroResourceFiles === 1 ? '' : 's'} contained no Kubernetes resources.`}
              </Typography>
            )}

          {folderFileList.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgMuted }}>
                Files · {folderFileList.length}
              </Typography>
              {folderFileList.map(([path, count]) => (
                <Box
                  key={path}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1.25,
                    py: 0.5,
                    border: `1px solid ${componentTheme.borderMuted}`,
                    borderRadius: `${componentTheme.radiusSm}px`,
                  }}
                >
                  <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, flex: 1 }}>
                    {path}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>
                    {count} resource{count === 1 ? '' : 's'}
                  </Typography>
                  <Tooltip title='Remove file'>
                    <IconButton
                      aria-label={`Remove ${path}`}
                      size='small'
                      onClick={() => onRemoveFolderPath(path)}
                    >
                      <DeleteOutlineIcon fontSize='small' />
                    </IconButton>
                  </Tooltip>
                </Box>
              ))}
            </Box>
          )}
        </>
      )}

      {unitsMode === 'oci' && ociPanel}

      {unitsMode === 'manual' && (
        <Box
          sx={{
            border: `1px solid ${componentTheme.borderDefault}`,
            borderRadius: `${componentTheme.radiusMd}px`,
            p: 1.5,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              label='Unit name'
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              size='small'
              fullWidth
              placeholder='e.g. deployment'
              inputProps={{ autoComplete: 'off', spellCheck: false }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAddManual();
                }
              }}
            />
            <Button
              variant='contained'
              startIcon={<AddIcon />}
              onClick={onAddManual}
              disabled={!slugify(manualName)}
              sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Add unit
            </Button>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {['deployment', 'service', 'configmap', 'serviceaccount', 'hpa'].map((s) => (
              <Chip
                key={s}
                label={s}
                size='small'
                variant='outlined'
                onClick={() => setManualName(s)}
                sx={{ fontFamily: componentTheme.fontMono, fontSize: 11, cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Granularity control — shown once more than one resource is staged
          across paste/folder/manual. An OCI upload is always one Unit per
          resource. */}
      {showGranularity && (
        <Box
          sx={{
            border: `1px solid ${componentTheme.borderDefault}`,
            borderRadius: `${componentTheme.radiusMd}px`,
            p: 1.5,
          }}
        >
          <FormLabel sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Choose a granularity
          </FormLabel>
          <RadioGroup
            aria-label='Granularity'
            value={granularity}
            onChange={(e) => setGranularity(e.target.value as Granularity)}
            sx={{ mt: 1, gap: 0.5 }}
          >
            {GRANULARITY_OPTIONS.filter((opt) => opt.value !== 'per-file' || unitsMode === 'folder').map((opt) => {
              const count = docs.length > 0 ? effectiveUnitCount(docs, opt.value) : null;
              return (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio size='small' />}
                  sx={{ alignItems: 'flex-start', m: 0, py: 0.5 }}
                  label={
                    <Box sx={{ pt: 0.25 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{opt.label}</Typography>
                        {opt.recommended && (
                          <Chip
                            label='Recommended'
                            size='small'
                            sx={{
                              height: 18,
                              fontSize: 9,
                              fontWeight: 700,
                              bgcolor: componentTheme.successMuted,
                              color: componentTheme.success,
                            }}
                          />
                        )}
                        {count !== null && (
                          <Typography sx={{ fontSize: 10.5, fontFamily: componentTheme.fontMono, color: componentTheme.fgSubtle }}>
                            {count} unit{count === 1 ? '' : 's'}
                          </Typography>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle }}>{opt.help}</Typography>
                    </Box>
                  }
                />
              );
            })}
          </RadioGroup>
        </Box>
      )}

      {/* Staged docs — shared by paste, folder, and manual (OCI mode stages
          none; its panel shows the server's plan). Names shown are the per-resource
          server slugs (plan.go resourceSlug). Under minimal/per-file the
          server groups these resources into fewer, server-named Units, so
          those rows are visually clustered into the Unit each becomes
          (groupDraftsForDisplay, the same bucketing effectiveCount uses)
          rather than shown as a flat list next to a count that would
          otherwise look wrong. per-resource needs none of this: 1 resource
          already IS 1 Unit. */}
      {docs.length > 0 && unitsMode !== 'oci' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgMuted }}>
            {granularity === 'per-resource'
              ? `Units to create · ${docs.length}`
              : `Resources · ${docs.length}`}
          </Typography>
          {granularity !== 'per-resource' && effectiveCount !== null && (
            <Typography sx={{ fontSize: 10.5, color: componentTheme.fgSubtle }}>
              With {granularity} granularity these {docs.length} resources are grouped into{' '}
              {effectiveCount} server-named unit{effectiveCount === 1 ? '' : 's'}.
            </Typography>
          )}
          {granularity === 'per-resource'
            ? docs.map((d) => (
                <UnitRow
                  key={d.id}
                  doc={d}
                  onToggle={() => onToggleExpanded(d.id)}
                  onEdit={(yaml) => onEditDoc(d.id, yaml)}
                  onRevert={() => onRevertDoc(d.id)}
                  onRemove={() => onRemoveDoc(d.id)}
                />
              ))
            : groupDraftsForDisplay(docs, granularity).map((group) => (
                <Box
                  key={group.label}
                  sx={{
                    border: `1px dashed ${componentTheme.borderDefault}`,
                    borderRadius: `${componentTheme.radiusMd}px`,
                    p: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.75,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5 }}>
                    <Typography
                      sx={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        color: componentTheme.variation,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {group.label}
                    </Typography>
                    <Chip
                      label={`${group.docs.length} resource${group.docs.length === 1 ? '' : 's'}`}
                      size='small'
                      variant='outlined'
                      sx={{ height: 18, fontSize: 10 }}
                    />
                  </Box>
                  {group.docs.map((d) => (
                    <UnitRow
                      key={d.id}
                      doc={d}
                      onToggle={() => onToggleExpanded(d.id)}
                      onEdit={(yaml) => onEditDoc(d.id, yaml)}
                      onRevert={() => onRevertDoc(d.id)}
                      onRemove={() => onRemoveDoc(d.id)}
                    />
                  ))}
                </Box>
              ))}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// UNIT ROW — collapsible, with an editable rendered-YAML CodeEditor
// ============================================================================

interface UnitRowProps {
  doc: DraftDoc;
  onToggle: () => void;
  onEdit: (yaml: string) => void;
  onRevert: () => void;
  onRemove: () => void;
}

function UnitRow({ doc, onToggle, onEdit, onRevert, onRemove }: UnitRowProps) {
  return (
    <Box
      sx={{
        border: `1px solid ${componentTheme.borderDefault}`,
        borderRadius: `${componentTheme.radiusMd}px`,
        overflow: 'hidden',
        bgcolor: componentTheme.bgDefault,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1 }}>
        <ButtonBase
          onClick={onToggle}
          aria-expanded={doc.expanded}
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'flex-start' }}
        >
          <ChevronRightIcon
            sx={{
              fontSize: 16,
              color: componentTheme.fgSubtle,
              transition: 'transform 0.15s',
              transform: doc.expanded ? 'rotate(90deg)' : 'none',
            }}
          />
          <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12.5, fontWeight: 600 }}>
            {doc.name}
          </Typography>
          {doc.kind && (
            <Chip label={doc.kind} size='small' sx={{ height: 20, fontSize: 10 }} />
          )}
          {doc.edited && (
            <Chip
              label='Edited'
              size='small'
              sx={{ height: 18, fontSize: 10, bgcolor: componentTheme.attentionMuted, color: componentTheme.attention }}
            />
          )}
        </ButtonBase>
        {doc.edited && (
          <Tooltip title='Revert to source'>
            <IconButton aria-label={`Revert ${doc.name}`} onClick={onRevert} size='small'>
              <RestartAltIcon fontSize='small' />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title='Remove unit'>
          <IconButton aria-label={`Remove ${doc.name}`} onClick={onRemove} size='small'>
            <DeleteOutlineIcon fontSize='small' />
          </IconButton>
        </Tooltip>
      </Box>
      <Collapse in={doc.expanded} unmountOnExit>
        <Box
          role='region'
          aria-label={`Rendered YAML for ${doc.name}`}
          sx={{ borderTop: `1px solid ${componentTheme.borderMuted}` }}
        >
          <CodeEditor
            value={doc.yaml}
            toolchainType={EDITOR_TOOLCHAIN}
            canEdit
            showMinimap={false}
            fitContentHeight
            maxContentHeight={320}
            onCodeChanged={onEdit}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

// ============================================================================
// STEP 3 — REVIEW
// ============================================================================

interface StepReviewProps {
  componentName: string;
  componentSlug: string;
  owner: string;
  /** The Space slug that will be written: the Step 0 override, or the default. */
  baseSlug: string;
  docs: DraftDoc[];
  granularity: Granularity;
  effectiveCount: number | null;
  /** The dry-run upload of an OCI source, which replaces `docs` in OCI mode. */
  ociPreview: UploadResult | null;
  ociRef: string;
  hasSource: boolean;
  targets: TargetRead[];
  targetsLoading: boolean;
  selectedTargetIds: string[];
  setSelectedTargetIds: (ids: string[]) => void;
  variantNames: Record<string, string>;
  onVariantNameChange: (targetId: string, name: string) => void;
}

function StepReview({
  componentName,
  componentSlug,
  owner,
  baseSlug,
  docs,
  granularity,
  effectiveCount,
  ociPreview,
  ociRef,
  hasSource,
  targets,
  targetsLoading,
  selectedTargetIds,
  setSelectedTargetIds,
  variantNames,
  onVariantNameChange,
}: StepReviewProps) {
  // Honest object count: 1 base space + N units. Never a phantom "component" object.
  const staged = ociPreview ? effectiveCount ?? 0 : docs.length;
  const unitCountLabel =
    staged > 0 ? `${effectiveCount ?? 0} unit${effectiveCount === 1 ? '' : 's'}` : '0 units';
  const totalLabel =
    (staged > 0
      ? `1 base space + ${effectiveCount ?? 0} unit${effectiveCount === 1 ? '' : 's'}`
      : '1 base space + units') +
    (selectedTargetIds.length > 0
      ? ` + ${selectedTargetIds.length} variant${selectedTargetIds.length === 1 ? '' : 's'}`
      : '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box>
        <Typography sx={{ fontSize: 15, fontWeight: 700, mb: 0.5 }}>Review &amp; create</Typography>
        <Typography sx={{ fontSize: 12.5, color: componentTheme.fgSubtle }}>
          Nothing is written until you confirm.
        </Typography>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.75,
          bgcolor: componentTheme.accentMuted,
          border: `1px solid ${componentTheme.accent}`,
          borderRadius: `${componentTheme.radiusMd}px`,
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: componentTheme.accent }}>
          {totalLabel}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
          <Chip label='1 base' size='small' sx={{ height: 22, fontSize: 11 }} />
          <Chip label={unitCountLabel} size='small' sx={{ height: 22, fontSize: 11 }} />
        </Box>
      </Box>

      {/* Component & base space */}
      <Box sx={{ border: `1px solid ${componentTheme.borderDefault}`, borderRadius: `${componentTheme.radiusMd}px`, overflow: 'hidden' }}>
        <Box sx={{ px: 1.75, py: 1, bgcolor: componentTheme.bgSubtle, borderBottom: `1px solid ${componentTheme.borderMuted}`, display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Component &amp; base space</Typography>
          <Chip label='No target' size='small' sx={{ ml: 'auto', height: 20, fontSize: 10 }} />
        </Box>
        <Box sx={{ p: 1.75 }}>
          <ReviewLine label='Component'>
            <Chip label={componentName || '—'} size='small' sx={{ height: 20, fontFamily: componentTheme.fontMono, fontSize: 11, bgcolor: componentTheme.accentMuted, color: componentTheme.accent }} />
          </ReviewLine>
          <ReviewLine label='Owner'>{owner || '—'}</ReviewLine>
          <ReviewLine label='Base space'>
            <Box component='span' sx={{ fontFamily: componentTheme.fontMono, fontSize: 12 }}>{baseSlug || '—'}</Box>
          </ReviewLine>
        </Box>
      </Box>

      {/* Units */}
      <Box sx={{ border: `1px solid ${componentTheme.borderDefault}`, borderRadius: `${componentTheme.radiusMd}px`, overflow: 'hidden' }}>
        <Box sx={{ px: 1.75, py: 1, bgcolor: componentTheme.bgSubtle, borderBottom: `1px solid ${componentTheme.borderMuted}`, display: 'flex', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>Units</Typography>
          <Chip label={unitCountLabel} size='small' sx={{ ml: 'auto', height: 20, fontSize: 10 }} />
        </Box>
        <Box sx={{ p: 1.75 }}>
          {ociRef && (
            <ReviewLine label='OCI reference'>
              <Box
                component='span'
                sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, wordBreak: 'break-all', fontVariantLigatures: 'none' }}
              >
                {ociRef}
              </Box>
            </ReviewLine>
          )}
          {ociPreview ? (
            <OciPlanList result={ociPreview} />
          ) : ociRef ? (
            <Typography sx={{ fontSize: 12, color: componentTheme.attention }}>
              Preview the OCI reference on the Units step before creating.
            </Typography>
          ) : docs.length > 0 ? (
            <>
            {granularity !== 'per-resource' && (
              <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, mb: 0.5 }}>
                Per-resource names shown; with {granularity} granularity ConfigHub groups these into{' '}
                {effectiveCount ?? 0} server-named unit{effectiveCount === 1 ? '' : 's'}.
              </Typography>
            )}
            {granularity === 'per-resource'
              ? docs.map((d, i) => (
                  <ReviewResourceRow key={d.id} doc={d} index={i} showTopBorder={i > 0} />
                ))
              : groupDraftsForDisplay(docs, granularity).map((group) => (
                  <Box
                    key={group.label}
                    sx={{
                      border: `1px dashed ${componentTheme.borderDefault}`,
                      borderRadius: `${componentTheme.radiusMd}px`,
                      p: 1,
                      mb: 1,
                      '&:last-child': { mb: 0 },
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 0.5, mb: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: componentTheme.variation,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        {group.label}
                      </Typography>
                      <Chip
                        label={`${group.docs.length} resource${group.docs.length === 1 ? '' : 's'}`}
                        size='small'
                        variant='outlined'
                        sx={{ height: 18, fontSize: 10 }}
                      />
                    </Box>
                    {group.docs.map((d, i) => (
                      <ReviewResourceRow key={d.id} doc={d} index={i} showTopBorder={i > 0} />
                    ))}
                  </Box>
                ))}
            </>
          ) : (
            <Typography sx={{ fontSize: 12, color: componentTheme.attention }}>
              No units staged yet — go back to add a manifest.
            </Typography>
          )}
        </Box>
      </Box>

      {!hasSource && (
        <Alert severity='info' sx={{ fontSize: 12 }}>
          Add at least one unit on the Units step before creating.
        </Alert>
      )}

      <Divider />

      {/* Create deployment variants (optional) */}
      <Box data-testid='create-component-downstream-picker'>
        <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 0.5 }}>
          Create deployment variants (optional)
        </Typography>
        <Typography sx={{ fontSize: 11, color: componentTheme.fgSubtle, mb: 1 }}>
          Clone the base into a variant per target, right after it's created.
        </Typography>
        <DownstreamTargetPicker
          targets={targets}
          isLoading={targetsLoading}
          selectedTargetIds={selectedTargetIds}
          onChange={setSelectedTargetIds}
          componentSlug={componentSlug}
          variantNames={variantNames}
          onVariantNameChange={onVariantNameChange}
        />
      </Box>

      <Divider />
      <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle }}>
        Next: after the base exists, clone it into a dev / staging / prod variant and attach a target
        to deploy it.
      </Typography>
    </Box>
  );
}

function ReviewLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
      <Typography sx={{ fontSize: 11.5, color: componentTheme.fgSubtle, width: 110, flexShrink: 0 }}>{label}</Typography>
      <Box sx={{ fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 1 }}>{children}</Box>
    </Box>
  );
}

/** One resource row in the Review step's Units list, used both flat
 * (per-resource) and nested inside a unit-group box (minimal/per-file). */
function ReviewResourceRow({
  doc,
  index,
  showTopBorder,
}: {
  doc: DraftDoc;
  index: number;
  showTopBorder: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.5,
        borderTop: showTopBorder ? `1px solid ${componentTheme.borderSubtle}` : 'none',
      }}
    >
      <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 11, color: componentTheme.fgSubtle, width: 20 }}>
        {index + 1}
      </Typography>
      <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600 }}>{doc.name}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
        {doc.edited && (
          <Chip
            label='edited'
            size='small'
            sx={{ height: 18, fontSize: 10, bgcolor: componentTheme.attentionMuted, color: componentTheme.attention }}
          />
        )}
        <Chip
          label={
            doc.source === 'manual'
              ? 'authored here'
              : doc.source === 'folder'
                ? 'from folder'
                : doc.source === 'oci'
                  ? 'from OCI'
                  : 'from YAML'
          }
          size='small'
          variant='outlined'
          sx={{ height: 18, fontSize: 10 }}
        />
        {doc.kind && <Chip label={doc.kind} size='small' sx={{ height: 18, fontSize: 10 }} />}
      </Box>
    </Box>
  );
}

// ============================================================================
// SUCCESS RECEIPT
// ============================================================================

interface SuccessReceiptProps {
  spaceSlug: string;
  units: Array<{ slug: string; kind: string }>;
  skippedSecrets: string[];
  componentName: string;
  /** Downstream-variant creation results, if any variants were requested. */
  downstreams?: DownstreamResult[];
  downstreamsInFlight?: boolean;
  onRetryDownstreams?: () => void;
}

function SuccessReceipt({
  spaceSlug,
  units,
  skippedSecrets,
  componentName,
  downstreams = [],
  downstreamsInFlight = false,
  onRetryDownstreams,
}: SuccessReceiptProps) {
  const failedDownstreams = downstreams.filter((d) => d.status === 'failed');
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', py: 4, gap: 2 }}>
      <CheckCircleOutlineIcon sx={{ fontSize: 44, color: componentTheme.success }} />
      <Box>
        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>
          {componentName ? `${componentName} created` : 'Component created'}
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: componentTheme.fgSubtle, mt: 0.5, maxWidth: 360 }}>
          Your component and its base space are ready. Add a deployment variant when you're ready to
          ship.
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', maxWidth: 380 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            py: 1,
            border: `1px solid ${componentTheme.borderDefault}`,
            borderRadius: `${componentTheme.radiusSm}px`,
            textAlign: 'left',
          }}
        >
          <CheckCircleOutlineIcon sx={{ fontSize: 15, color: componentTheme.success }} />
          <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600 }}>{spaceSlug}</Typography>
          <Chip label='base space' size='small' sx={{ ml: 'auto', height: 18, fontSize: 10 }} />
        </Box>
        {units.map((u) => (
          <Box
            key={u.slug}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 1.5,
              py: 1,
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusSm}px`,
              textAlign: 'left',
            }}
          >
            <CheckCircleOutlineIcon sx={{ fontSize: 15, color: componentTheme.success }} />
            <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600 }}>{u.slug}</Typography>
            {u.kind && (
              <Typography sx={{ ml: 'auto', fontSize: 11, color: componentTheme.fgSubtle }}>
                {/* `kind` is the plan's internal classification ('normal' | 'crd',
                    createComponentInput.ts) — not a label a user should ever read.
                    "normal" in particular reads as noise beside a unit slug that can
                    legitimately match the base space's own slug. */}
                {u.kind === 'crd' ? 'CRD unit' : 'unit'}
              </Typography>
            )}
          </Box>
        ))}
      </Box>
      {skippedSecrets.length > 0 && (
        <Box sx={{ width: '100%', maxWidth: 380, textAlign: 'left' }}>
          <Alert severity='info' sx={{ fontSize: 12 }}>
            <SkippedSecretsNote skippedSecrets={skippedSecrets} />
          </Alert>
        </Box>
      )}

      {/* Downstream deployment-variant results, when any were requested. */}
      {(downstreamsInFlight || downstreams.length > 0) && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%', maxWidth: 380 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 600, color: componentTheme.fgMuted, textAlign: 'left' }}>
            Deployment variants
          </Typography>
          {downstreamsInFlight && downstreams.length === 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={14} thickness={5} />
              <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle }}>Creating variants…</Typography>
            </Box>
          )}
          {downstreams.map((d) => (
            <Box
              key={d.targetId}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 1,
                border: `1px solid ${componentTheme.borderDefault}`,
                borderRadius: `${componentTheme.radiusSm}px`,
                textAlign: 'left',
              }}
            >
              {d.status === 'created' ? (
                <CheckCircleOutlineIcon sx={{ fontSize: 15, color: componentTheme.success }} />
              ) : (
                <ErrorOutlineIcon sx={{ fontSize: 15, color: componentTheme.attention }} />
              )}
              <Typography sx={{ fontFamily: componentTheme.fontMono, fontSize: 12, fontWeight: 600 }}>
                {d.spaceSlug ?? d.variantName}
              </Typography>
              {d.status === 'failed' && d.message && (
                <Typography sx={{ ml: 'auto', fontSize: 11, color: componentTheme.attention }}>
                  {d.message}
                </Typography>
              )}
            </Box>
          ))}
          {failedDownstreams.length > 0 && onRetryDownstreams && (
            <Button size='small' variant='outlined' onClick={onRetryDownstreams} sx={{ alignSelf: 'flex-start' }}>
              Retry {failedDownstreams.length} failed variant{failedDownstreams.length === 1 ? '' : 's'}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );
}

// ============================================================================
// SKIPPED-SECRETS NOTE — the server drops Secret resources (never authors them
// as Units); surface them so the user knows to author Secrets separately.
// ============================================================================

function SkippedSecretsNote({ skippedSecrets }: { skippedSecrets: string[] }) {
  const n = skippedSecrets.length;
  return (
    <Box sx={{ fontSize: 12 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600 }}>
        {n} Secret{n === 1 ? ' was' : 's were'} skipped — author Secrets separately.
      </Typography>
      <Box component='ul' sx={{ m: 0, mt: 0.5, pl: 2 }}>
        {skippedSecrets.map((s) => (
          <li key={s}>
            <Box component='code' sx={{ fontFamily: componentTheme.fontMono, fontSize: 11 }}>
              {s}
            </Box>
          </li>
        ))}
      </Box>
    </Box>
  );
}
