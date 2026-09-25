// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type EdgeTypes,
  type HandleType,
  type Node,
  type NodeTypes,
  type OnConnectStartParams,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import type { TargetRead } from '@confighub/rtk-query';
import type { ComponentDeployment, Stage } from '../componentTypes';
import { componentTheme } from '../componentTheme';
import type { OverallPhase, PerSpaceStatus } from '../useCreateVariantMutation';
import { computeLayout, NODE_WIDTH, NODE_HEIGHT } from './flowLayout';
import { DeploymentFlowNode, type NodeUnitSummary } from './DeploymentFlowNode';
import { ComposerNode, type ComposerNodeData, type ComposerSubmitValues } from './ComposerNode';
import { LandingSlotNode } from './LandingSlotNode';
import { resolveNodeClick } from './nodeClick';
import {
  COMPOSER_DEFAULT_HEIGHT,
  COMPOSER_WIDTH,
  computeComposerPosition,
  computeLandingSlotPosition,
  computeNudgeIntoView,
} from './composerLayout';
import { PromotionEdge } from './PromotionEdge';

const nodeTypes: NodeTypes = {
  deploymentNode: DeploymentFlowNode,
  composerNode: ComposerNode,
  landingSlotNode: LandingSlotNode,
};

const COMPOSER_NODE_ID_PREFIX = '__variant-composer__';
const LANDING_SLOT_NODE_ID_PREFIX = '__variant-landing-slot__';

const edgeTypes: EdgeTypes = {
  promotionEdge: PromotionEdge,
};

// ============================================================================
// TYPES
// ============================================================================

interface ComponentFlowGraphProps {
  deployments: ComponentDeployment[];
  stages: Stage[];
  selectedDeploymentIds: Set<string>;
  /**
   * The slot letter each deployment currently in the side pane's comparison
   * wears — `A` for the open one, then `B`, `C`… Empty when nothing extra is
   * being compared, which is the shipped graph unchanged.
   */
  compareLetterById?: ReadonlyMap<string, string>;
  /** Modifier-click on a node: add it to, or take it out of, that comparison. */
  onDeploymentCompareToggle?: (deploymentId: string) => void;
  activeUpgrades?: Set<string>;
  onDeploymentToggle: (deploymentId: string) => void;
  onUpgradeToggle?: (parentDeploymentId: string, childDeploymentId: string) => void;
  /** Deep-link a deployment's side pane to a tab from a status-chip peek (Stale → config, Unreleased/Gated → releases). `releaseNum`, when given (the release-stamp peek), asks the Releases tab to scroll to and highlight that specific release. */
  onOpenTab?: (deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => void;
  /** Component name used to build the units filter link from deployment nodes */
  appName?: string;
  /** Deployment IDs that have an error state */
  errorDeploymentIds?: Set<string>;
  /** Unit summaries per deployment for node display */
  unitSummariesByDeployment: Map<string, NodeUnitSummary[]>;
  fitViewTrigger?: number;
  /** Deployment IDs currently being upgraded */
  upgradingDeploymentIds?: Set<string>;
  /** Per-deployment success messages (shown briefly after action completes) */
  deploymentSuccessMessages?: Map<string, string>;
  /** When set, the graph pans to center on this deployment. New object reference per trigger. */
  focusTrigger?: { deploymentId: string };
  /** True while a caller-owned multi-step operation (e.g. variant creation) is in flight and may add/remove deployments of its own — suppresses the generic "fit the whole graph" reflex for the duration, so a caller driving its own camera move (via focusTrigger) isn't fought by an uncontrolled one. */
  suppressStructuralFitView?: boolean;
  /** Latest release per Space (release-enabled deployments only), for each node's header chip. */
  latestReleaseBySpaceId?: Map<string, { num: number; createdAt?: string }>;
  /** Deployment IDs currently publishing (drives the node-card ripple). */
  releasingDeploymentIds?: Set<string>;
  /** The Space that just finished a publish — pulses its outgoing promotion edge toward the next stage. Cleared by the caller a moment after the publish resolves. */
  releasePulseSourceId?: string | null;

  // ── Inline variant composer (Phase 1: on-canvas, single-variant) ──
  /** Deployment ID the composer is currently anchored to, or null/undefined when closed. At most one open at a time. */
  composerParentId?: string | null;
  /** Opens the composer anchored to this deployment as parent — fired by a node's own click affordance or the 'V' key while hovering it. Never routed through onDeploymentToggle/handleNodeClick, which would inherit their setCenter/fitView pan. */
  onComposerOpen?: (deploymentId: string) => void;
  /** Bundled (not flat) render data + callbacks for the currently-open composer — only read while composerParentId is set. */
  composerData?: {
    parentSlug: string;
    componentSlug: string;
    siblingVariantNames: string[];
    targets: TargetRead[];
    hasK8sUnits: boolean;
    overallPhase: OverallPhase;
    perSpaceStatus: Map<string, PerSpaceStatus>;
    onSubmit: (values: ComposerSubmitValues) => void;
    onCancel: () => void;
    onRetryNamespace: (name: string) => void;
  };
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FlowContainer = styled(Box)({
  width: '100%',
  height: '100%',
  background: componentTheme.bgSubtle,
  borderBottom: `1px solid ${componentTheme.borderDefault}`,
  // React Flow ships the `.react-flow` wrapper with `overflow: hidden`, which
  // still makes it a PROGRAMMATIC scroll container: the user can never scroll
  // it, but `focus()` and `scrollIntoView()` can, and the resulting
  // scrollLeft/Top sticks as a permanently offset canvas that no React Flow
  // control resets (fitView only moves the viewport transform, not the
  // wrapper's scroll offset). `clip` clips identically but is not a scroll
  // container at all, so that corruption becomes unrepresentable.
  //
  // `!important` is load-bearing, and the two tidier-looking alternatives are
  // both dead ends — do not "clean this up" without re-checking them:
  //   • A plain class rule loses: the `overflow: hidden` is applied INLINE at
  //     runtime (reactflow's own stylesheet only sets `direction`).
  //   • The `<ReactFlow style={...}>` prop ALSO loses: @reactflow/core renders
  //     `style: { ...style, ...wrapperStyle }`, and `wrapperStyle` is the
  //     literal `{ width, height, overflow: 'hidden', position, zIndex }` —
  //     spread last, so it overrides anything passed in (verified in
  //     @reactflow/core/dist/esm/index.js, reactflow 11.11.4).
  // A class rule with `!important` beats an inline declaration that has none,
  // so this is the one form that actually applies.
  '& .react-flow': {
    overflow: 'clip !important',
  },
  '& .react-flow__controls': {
    boxShadow: componentTheme.shadowSm,
    border: `1px solid ${componentTheme.borderDefault}`,
    borderRadius: componentTheme.radiusMd,
  },
  '& .react-flow__controls-button': {
    background: componentTheme.bgDefault,
    borderBottom: `1px solid ${componentTheme.borderDefault}`,
    '&:hover': {
      background: componentTheme.bgSubtle,
    },
  },
  '& .react-flow__edge-path': {
    strokeWidth: 2,
  },
  // Release edge pulse — the "graph-forward" signature move: the edge
  // leaving a Space that just published briefly flows accent-colored dashes
  // toward the next stage. `pulseFromDeploymentId` is cleared by the caller
  // a moment after publish resolves, so the className (and this animation)
  // is transient — no looping state to clean up here. `!important` is
  // required because reactflow renders `edge.style` as an inline style,
  // which otherwise always wins over this class-based override.
  '@keyframes releaseEdgeFlow': {
    from: { strokeDashoffset: 32 },
    to: { strokeDashoffset: 0 },
  },
  '@keyframes releaseEdgePulseFade': {
    '0%': { opacity: 0 },
    '12%': { opacity: 0.9 },
    '75%': { opacity: 0.7 },
    '100%': { opacity: 0 },
  },
  '& .release-pulse-edge .react-flow__edge-path': {
    stroke: `${componentTheme.accent} !important`,
    strokeWidth: '2.5px !important',
    strokeDasharray: '6 10 !important',
    animation: 'releaseEdgeFlow 1.1s linear 2, releaseEdgePulseFade 1.9s ease-out forwards',
  },
});

const EmptyState = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  padding: 40,
});

// ============================================================================
// STABLE DEFAULTS (defined outside component to avoid recreation)
// ============================================================================

const EMPTY_SET = new Set<string>();
const NOOP = () => {};

// ============================================================================
// INNER COMPONENT (needs ReactFlowProvider)
// ============================================================================

function ComponentFlowGraphInner({
  deployments,
  stages,
  selectedDeploymentIds,
  compareLetterById,
  onDeploymentCompareToggle,
  activeUpgrades,
  onDeploymentToggle,
  onUpgradeToggle,
  onOpenTab,
  appName,
  errorDeploymentIds,
  unitSummariesByDeployment,
  fitViewTrigger,
  upgradingDeploymentIds,
  deploymentSuccessMessages,
  focusTrigger,
  suppressStructuralFitView,
  latestReleaseBySpaceId,
  releasingDeploymentIds,
  releasePulseSourceId,
  composerParentId,
  onComposerOpen,
  composerData,
}: ComponentFlowGraphProps) {
  // Use stable defaults
  const safeActiveUpgrades = activeUpgrades ?? EMPTY_SET;
  const safeOnUpgradeToggle = onUpgradeToggle ?? NOOP;
  // Every deployment in the pane's comparison reads as selected on the graph,
  // not just the one the pane is literally open on — the compare panel treats
  // every slot as equal, so its node styling must say so too. Kept separate
  // from `selectedDeploymentIds` itself: click/pan behaviour below still
  // means "the one open in the side pane," a single id.
  const visuallySelectedIds = useMemo(() => {
    if (!compareLetterById || compareLetterById.size === 0) return selectedDeploymentIds;
    const ids = new Set(selectedDeploymentIds);
    for (const id of compareLetterById.keys()) ids.add(id);
    return ids;
  }, [selectedDeploymentIds, compareLetterById]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, getViewport, setCenter, setViewport } = useReactFlow();
  const nodesInitialized = useNodesInitialized();
  // Mirror nodesInitialized into a ref so the structural-fit rAF loop can read the
  // latest value each frame without the effect having to restart when it flips.
  const nodesInitializedRef = useRef(nodesInitialized);
  nodesInitializedRef.current = nodesInitialized;

  // Store callbacks in a ref so their identity doesn't cause graph rebuilds
  const callbacksRef = useRef({
    onDeploymentToggle,
    onDeploymentCompareToggle: undefined as ((deploymentId: string) => void) | undefined,
    onUpgradeToggle: safeOnUpgradeToggle,
    onOpenTab: undefined as ((deploymentId: string, tab: 'config' | 'releases', releaseNum?: number) => void) | undefined,
    onComposerOpen: undefined as ((deploymentId: string) => void) | undefined,
  });
  // Store nodes in a ref so handleNodeClick doesn't need nodes as a dependency
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Track whether we need to fit the view (only on structural changes, not visual state changes)
  const shouldFitViewRef = useRef(true);
  const [pendingFitView, setPendingFitView] = useState(false);
  const reactFlowInitialized = useRef(false);
  // The flow container element, observed for width reflow so the structural fit
  // runs once the layout has settled (see the pending-fit effect below).
  const flowContainerRef = useRef<HTMLDivElement>(null);

  const deploymentById = useMemo(() => {
    const m = new Map<string, ComponentDeployment>();
    for (const d of deployments) m.set(d.deploymentId, d);
    return m;
  }, [deployments]);

  // Every promotion edge fetches its own Link data (see PromotionEdge.tsx) —
  // this is just enough of a key for its query's `where` clause. Deliberately
  // NOT the resolved links themselves, so this key (and therefore the edge
  // `data` object) only changes when the SET of deployments changes, not on
  // every Link edit — a toggle inside one edge's popover never triggers a
  // graph-wide edge rebuild.
  const deploymentSpaceIdsKey = useMemo(
    () => deployments.map((d) => d.deploymentId).sort().join(','),
    [deployments],
  );

  // Reset fit view flag only when graph structure changes (deployments added/removed),
  // not when unit data within deployments changes (e.g. after apply/upgrade).
  const structuralKey = useMemo(
    () =>
      (appName ?? '') +
      '|' +
      deployments.map((d) => d.deploymentId).sort().join(',') +
      '|' +
      stages.map((s) => s.label).join(','),
    [appName, deployments, stages],
  );
  // Suppresses the generic "fit the whole graph" reflex while a variant
  // creation is in flight (suppressStructuralFitView, driven by the
  // caller's own overallPhase). This used to try to detect, after the fact,
  // "the one structural change that brought focusTrigger's target into
  // existence" — but the new Space appears in `deployments` as soon as Step
  // 1 (bulkCreateSpaces) resolves, which is well BEFORE the caller learns
  // the whole sequence succeeded and calls setFocusTrigger (Steps 2/3 —
  // unit cloning, namespace — still have to finish first). So the generic
  // fit had already fired, uncontested, long before focusTrigger existed to
  // suppress anything — which is exactly what read as the camera "jumping
  // all over the place": one uncontrolled fit-to-everything while the
  // clone was still running, then a second, separate pan once focusTrigger
  // finally arrived. Gating on the caller's own in-flight state instead
  // covers the entire window, not just its last instant.
  //
  // prevStructuralKeyRef guards against a false trigger on the FLIP back to
  // not-suppressed at session end: without it, suppressStructuralFitView
  // going true→false would itself re-run this effect and (wrongly) set
  // shouldFitViewRef even though structuralKey hasn't actually changed since.
  const prevStructuralKeyRef = useRef(structuralKey);
  useEffect(() => {
    const changed = prevStructuralKeyRef.current !== structuralKey;
    prevStructuralKeyRef.current = structuralKey;
    if (!changed) return;
    if (suppressStructuralFitView) return;
    shouldFitViewRef.current = true;
  }, [structuralKey, suppressStructuralFitView]);

  // Update ref on each render so stable wrappers always call the latest callbacks
  callbacksRef.current = {
    onDeploymentToggle,
    onDeploymentCompareToggle,
    onUpgradeToggle: safeOnUpgradeToggle,
    onOpenTab,
    onComposerOpen,
  };

  // Stable callback wrappers that read from the ref — identity never changes
  const stableOnDeploymentToggle = useCallback(
    (id: string) => callbacksRef.current.onDeploymentToggle(id),
    [],
  );
  const stableOnOpenTab = useCallback(
    (id: string, tab: 'config' | 'releases', releaseNum?: number) => callbacksRef.current.onOpenTab?.(id, tab, releaseNum),
    [],
  );
  const stableOnUpgradeToggle = useCallback(
    (p: string, c: string) => callbacksRef.current.onUpgradeToggle(p, c),
    [],
  );
  const stableOnComposerOpen = useCallback(
    (id: string) => callbacksRef.current.onComposerOpen?.(id),
    [],
  );
  // ── Composer entry: hover-tracked via ReactFlow's own onNodeMouseEnter/
  // Leave (below), read by the 'V' keydown listener. Kept as a ref (not
  // state) so hovering doesn't cause a re-render on every pointer move.
  const hoveredDeploymentIdRef = useRef<string | null>(null);
  const handleNodeMouseEnter = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'deploymentNode') hoveredDeploymentIdRef.current = node.id;
  }, []);
  const handleNodeMouseLeave = useCallback((_event: React.MouseEvent, node: Node) => {
    if (node.type === 'deploymentNode' && hoveredDeploymentIdRef.current === node.id) {
      hoveredDeploymentIdRef.current = null;
    }
  }, []);

  // 'V' opens the composer for whichever deploymentNode is currently
  // hovered — mirrors the node's own click affordance rather than adding a
  // second code path. Guarded on the event target so typing a literal 'v'
  // into any real input (including the composer's own name field) never
  // reopens/retargets it.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'v' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const hoveredId = hoveredDeploymentIdRef.current;
      if (!hoveredId) return;
      e.preventDefault();
      callbacksRef.current.onComposerOpen?.(hoveredId);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Nudge the composer into view the MINIMUM distance needed, once per
  // compose session — never on every re-render. Composer position is
  // recomputed directly from nodesRef.current (the real, already-laid-out
  // deploymentNode positions) via the same pure functions buildGraph uses,
  // rather than waiting for the ghost nodes to land in `nodes` state: that
  // state update happens in a LATER commit than this effect (buildGraph's
  // own effect hasn't necessarily run yet this commit), so reading it here
  // would be racy. Deliberately keyed ONLY on composerParentId: a background
  // poll rebuilding the graph, or the user panning away after the composer
  // opens, must never yank the viewport back — this must fire exactly once
  // per open (or per switch to a different parent), not on every rebuild.
  useEffect(() => {
    if (!composerParentId) return;
    const landingSlot = computeLandingSlotPosition(nodesRef.current, composerParentId);
    if (!landingSlot) return;
    const composerPos = computeComposerPosition(nodesRef.current, landingSlot);
    const container = flowContainerRef.current;
    if (!container) return;
    const nudged = computeNudgeIntoView(
      { x: composerPos.x, y: composerPos.y },
      { width: COMPOSER_WIDTH, height: COMPOSER_DEFAULT_HEIGHT },
      getViewport(),
      { width: container.clientWidth, height: container.clientHeight },
    );
    if (nudged) setViewport(nudged, { duration: 200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composerParentId]);

  const buildGraph = useCallback(() => {
    if (deployments.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: n, edges: e } = computeLayout(
      deployments,
      stages,
      deploymentById,
      visuallySelectedIds,
      safeActiveUpgrades,
      stableOnDeploymentToggle,
      stableOnUpgradeToggle,
      errorDeploymentIds,
      unitSummariesByDeployment,
      upgradingDeploymentIds,
      deploymentSuccessMessages,
      latestReleaseBySpaceId,
      releasingDeploymentIds,
      releasePulseSourceId,
      stableOnOpenTab,
      stableOnComposerOpen,
      deploymentSpaceIdsKey,
    );

    const nodesToRender = n.map((node) => {
      // The comparison letter is stamped on here rather than threaded through
      // the layout functions: it changes on a user gesture and has no effect on
      // where anything sits, so it does not belong in a positioning argument
      // list that four other call sites share.
      const compareLetter = compareLetterById?.get(node.id);
      return compareLetter ? { ...node, data: { ...node.data, compareLetter } } : node;
    });

    // ── Inline variant composer: append the landing-slot + composer ghost
    // nodes AFTER the real layout has already produced
    // `nodesToRender` above — computeLandingSlotPosition/computeComposerPosition
    // (composerLayout.ts) read those ALREADY-COMPUTED positions and are never
    // fed back into computeLayout's own inputs. That's
    // load-bearing: treeCenterLayout.ts recenters a parent on ALL of its
    // children and runs every root through one shared cursor, so a ghost fed
    // into that computation would shift siblings and every subsequent root
    // (multi-root components are common, not an edge case). Doing this here,
    // downstream of the real layout, is what keeps "existing nodes never move
    // while composing" true regardless of how many roots the component has.
    const ghostNodes: Node[] = [];
    if (composerParentId && composerData) {
      const landingSlot = computeLandingSlotPosition(nodesToRender, composerParentId);
      if (landingSlot) {
        const composerPos = computeComposerPosition(nodesToRender, landingSlot);
        ghostNodes.push({
          // Keyed by parent, not a fixed constant: switching which parent
          // the composer is anchored to (e.g. via the 'V' key on a
          // different node while idle) must remount ComposerNode rather
          // than reuse the same React Flow node id — reusing it would
          // leave its internal form state (name/target/namespace) stale
          // from the previous parent instead of resetting.
          id: `${LANDING_SLOT_NODE_ID_PREFIX}:${composerParentId}`,
          type: 'landingSlotNode',
          position: landingSlot,
          data: {},
          draggable: false,
          selectable: false,
          zIndex: 0,
        });
        ghostNodes.push({
          id: `${COMPOSER_NODE_ID_PREFIX}:${composerParentId}`,
          type: 'composerNode',
          position: { x: composerPos.x, y: composerPos.y },
          data: {
            parentId: composerParentId,
            ...composerData,
          } satisfies ComposerNodeData,
          draggable: false,
          selectable: false,
          zIndex: 20,
        });
      }
    }

    setNodes(ghostNodes.length > 0 ? [...nodesToRender, ...ghostNodes] : nodesToRender);
    setEdges(e);

    // Only fit view when graph structure changes, not on visual state changes like side pane.
    // Defer the actual fitView until ReactFlow has measured node dimensions (see the
    // nodesInitialized effect below), so first-render bounds are correct. Using state (not a
    // ref) ensures the effect re-evaluates immediately when nodes are already measured.
    if (shouldFitViewRef.current) {
      shouldFitViewRef.current = false;
      setPendingFitView(true);
    }
  }, [
    deployments,
    stages,
    deploymentById,
    visuallySelectedIds,
    compareLetterById,
    safeActiveUpgrades,
    stableOnDeploymentToggle,
    stableOnUpgradeToggle,
    stableOnOpenTab,
    stableOnComposerOpen,
    errorDeploymentIds,
    unitSummariesByDeployment,
    upgradingDeploymentIds,
    deploymentSuccessMessages,
    latestReleaseBySpaceId,
    releasingDeploymentIds,
    releasePulseSourceId,
    composerParentId,
    composerData,
    deploymentSpaceIdsKey,
    setNodes,
    setEdges,
    setPendingFitView,
  ]);

  // ── Composer entry, gesture 3 of 3: drag off a node's own SOURCE handle
  // and release on empty canvas. `onConnect` structurally cannot fire for a
  // drop on empty canvas — it requires a valid target handle within
  // connectionRadius, which empty canvas isn't (verified
  // against the installed reactflow source: Handle's own onPointerUp only
  // calls onConnect when `closestHandle && connection && isValid`). The
  // correct mechanism is onConnectStart (captures which node/handle-type the
  // drag began from, into a ref) + onConnectEnd (fires unconditionally on
  // pointer-up — but only ever gets the raw DOM event, no connection info).
  // Disambiguating "dropped on empty canvas" from "dropped on a node" can't
  // be inferred from whether onConnect fired — an invalid on-node drop ALSO
  // skips onConnect, so that would be a trap, not a shortcut — read the
  // actual DOM element under the release point instead.
  const connectDragSourceRef = useRef<{ nodeId: string; handleType: HandleType | null } | null>(null);

  const handleConnectStart = useCallback(
    (_event: React.MouseEvent | React.TouchEvent, params: OnConnectStartParams) => {
      connectDragSourceRef.current = params.nodeId ? { nodeId: params.nodeId, handleType: params.handleType } : null;
    },
    [],
  );

  const handleConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const source = connectDragSourceRef.current;
    connectDragSourceRef.current = null;
    // Only a drag that began from a node's SOURCE handle means "clone this
    // node" — starting from a target handle is a different gesture (and one
    // this composer has no meaning for).
    if (!source || source.handleType !== 'source') return;

    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    if (!point) return;
    const dropEl = document.elementFromPoint(point.clientX, point.clientY);
    if (!dropEl) return;

    // A drop that lands on ANY node — the drag's own source node (a
    // click-without-drag resolves right back onto its own handle, still
    // inside that node's DOM), or a different node (including mid-attempt on
    // one of ITS handles) — is not this gesture, and correctly a no-op.
    if (dropEl.closest('.react-flow__node')) return;
    // Only open when the release genuinely lands on the canvas pane itself —
    // not, say, outside the graph entirely (released over the side pane, the
    // toolbar, or outside the browser window).
    if (!dropEl.closest('.react-flow__pane')) return;

    callbacksRef.current.onComposerOpen?.(source.nodeId);
  }, []);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Only handle deployment nodes, not stage headers
      if (node.type !== 'deploymentNode') return;

      const action = resolveNodeClick(event, selectedDeploymentIds.has(node.id));
      if (action === 'toggle-compare') {
        callbacksRef.current.onDeploymentCompareToggle?.(node.id);
        return;
      }

      callbacksRef.current.onDeploymentToggle(node.id);

      // Deselecting: fit all nodes into view
      if (action === 'deselect') {
        setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 350);
        return;
      }

      // Pan/zoom to show the connection between the clicked node and its upstream parent
      {
        const sidePaneWasOpen = selectedDeploymentIds.size > 0;
        const panToConnection = () => {
          const { x, y, zoom } = getViewport();
          const parentDeploymentId = deploymentById.get(node.id)?.parentDeploymentId;
          const parentNode = parentDeploymentId
            ? nodesRef.current.find((n) => n.id === parentDeploymentId)
            : undefined;

          if (parentNode) {
            // Check if both nodes are visible on screen
            const container = document.querySelector('.react-flow');
            const cw = container?.clientWidth ?? window.innerWidth;
            const ch = container?.clientHeight ?? window.innerHeight;

            const isVisible = (n: Node) => {
              const sx = n.position.x * zoom + x;
              const sy = n.position.y * zoom + y;
              const sr = (n.position.x + NODE_WIDTH) * zoom + x;
              const sb = (n.position.y + NODE_HEIGHT) * zoom + y;
              return sr > 0 && sx < cw && sb > 0 && sy < ch;
            };

            if (isVisible(node) && isVisible(parentNode)) {
              // Both visible — just pan to center the midpoint
              const centerX = (parentNode.position.x + node.position.x + NODE_WIDTH) / 2;
              const centerY = (parentNode.position.y + node.position.y + NODE_HEIGHT) / 2;
              setCenter(centerX, centerY, { zoom, duration: 300 });
            } else {
              // One or both off-screen — fit both nodes into view
              fitView({
                nodes: [{ id: node.id }, { id: parentNode.id }],
                padding: 0.3,
                duration: 300,
              });
            }
          } else {
            // No parent (root node) — center on the node itself
            setCenter(
              node.position.x + NODE_WIDTH / 2,
              node.position.y + NODE_HEIGHT / 2,
              { zoom, duration: 300 },
            );
          }
        };

        if (sidePaneWasOpen) {
          panToConnection();
        } else {
          setTimeout(panToConnection, 100);
        }
      }
    },
    [
      selectedDeploymentIds,
      fitView,
      getViewport,
      setCenter,
      deploymentById,
    ],
  );

  const handleInit = useCallback(() => {
    reactFlowInitialized.current = true;
    // The initial fit is owned by the measurement-gated effect below (shouldFitViewRef
    // starts true → pending set → effect fits once nodes are measured), so we deliberately
    // do NOT fit here to avoid a double-fit on first mount.
  }, []);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  // Run the deferred structural fitView for the new graph (initial mount +
  // app/deployment switch via shouldFitViewRef → pendingFitView).
  //
  // On a switch the side pane unmounts instantly (timeout=0) and the flex layout
  // reflows the graph container wider. If fitView ran before that reflow it would
  // measure a too-small viewport and leave the graph mis-zoomed. We can't wait for
  // a width *change* — the reflow often lands before ReactFlow finishes measuring
  // nodes (nodesInitialized), so by the time we'd watch, the width is already final
  // and no change ever fires. Instead we poll the container width each animation
  // frame and fit once it has been STABLE for a few consecutive frames AND nodes
  // are measured. This is fast in both cases: (a) width already settled → stable
  // within ~3 frames (<50ms), no long wait; (b) pane still mid-unmount → width
  // changes once (resetting the stability counter) then settles → fit right after
  // the reflow. nodesInitialized is read from a ref inside the loop so the loop
  // never has to restart when it flips. A short ~600ms fallback is a pure backstop
  // (should rarely fire). Cleanup cancels the frame and the fallback, so rapid
  // switches/unmounts tear down the prior loop instead of stacking.
  useEffect(() => {
    if (!pendingFitView) return;

    const STABLE_FRAMES = 3;
    let rafId = 0;
    let fallbackId = 0;
    let lastWidth = -1;
    let stableCount = 0;

    const runFit = () => {
      cancelAnimationFrame(rafId);
      clearTimeout(fallbackId);
      setPendingFitView(false);
      fitView({ padding: 0.15, duration: 200 });
    };

    const tick = () => {
      const width = flowContainerRef.current?.clientWidth ?? 0;
      stableCount = width === lastWidth ? stableCount + 1 : 0;
      lastWidth = width;
      // Fit once width has settled for STABLE_FRAMES and nodes are measured.
      if (stableCount >= STABLE_FRAMES && nodesInitializedRef.current) {
        runFit();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    // Backstop in case the loop never reaches a fit (should rarely fire).
    fallbackId = window.setTimeout(runFit, 600);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(fallbackId);
    };
  }, [pendingFitView, fitView]);

  // Re-fit whenever the CONTAINER itself resizes.
  //
  // The canvas shares its row with the component side pane, so selecting a
  // node shrinks this container without moving the graph: a viewport fitted to
  // the old width then leaves nodes outside the new one. The dev node landed
  // underneath the pane exactly this way — spotlit but unreachable, because
  // the pane intercepted the clicks. This was previously masked by the
  // `.react-flow` wrapper being programmatically scrollable (a stray
  // scrollIntoView happened to drag dev back into view); once that wrapper was
  // correctly made unscrollable, the missing re-fit was exposed.
  //
  // Keyed on the resize itself rather than on "the pane opened" so it holds
  // for every cause — pane open/close, window resize, layout change. The file
  // already carries a `fitViewTrigger` prop meant for this, but nothing has
  // ever passed it; a prop each caller must remember to bump is what failed
  // here, so this observes the real condition instead.
  useEffect(() => {
    const container = flowContainerRef.current;
    if (!container) return;

    // The pane opens over several animation frames, so a fit on the first
    // resize callback would target a mid-animation width. Settle on a stable
    // size first — the same idiom (and frame count) the structural fit above
    // uses, so both paths behave identically.
    const STABLE_FRAMES = 3;
    let rafId = 0;
    let lastWidth = container.clientWidth;
    let lastHeight = container.clientHeight;
    let stableCount = 0;

    const settleThenFit = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const changed = width !== lastWidth || height !== lastHeight;
      lastWidth = width;
      lastHeight = height;
      stableCount = changed ? 0 : stableCount + 1;
      if (stableCount >= STABLE_FRAMES && nodesInitializedRef.current) {
        rafId = 0;
        fitView({ padding: 0.15, duration: 200 });
        return;
      }
      rafId = requestAnimationFrame(settleThenFit);
    };

    const observer = new ResizeObserver(() => {
      // Before init, the initial fit (`pendingFitView`) owns the viewport —
      // ResizeObserver also fires once on observe(), which would otherwise
      // double-fit on mount.
      if (!reactFlowInitialized.current) return;
      if (rafId) return; // already settling
      stableCount = 0;
      rafId = requestAnimationFrame(settleThenFit);
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [fitView]);

  // Re-fit when the parent layout changes (e.g. pane position swap).
  //
  // duration: 0 (no animation) on purpose (U17): an animated fit here is a
  // moving target a click can race against. Anything the layout swap reveals
  // is fully present and interceptable the instant it mounts, so for the
  // ~200-300ms an animated fit would still be sliding nodes into position, a
  // real click can land on a node's stale (pre-fit) or transiently-clipped
  // location and hit whatever is underneath instead. An instant snap removes
  // that window entirely rather than narrowing it.
  useEffect(() => {
    if (fitViewTrigger && reactFlowInitialized.current) {
      setTimeout(() => fitView({ padding: 0.15, duration: 0 }), 50);
    }
  }, [fitViewTrigger, fitView]);

  // Pan to a specific deployment node when triggered from outside (e.g. pane
  // navigation, or a just-created variant). Depends on `nodes` (not just
  // `focusTrigger`) and retries as nodes update: a caller may set
  // focusTrigger for a node that doesn't exist YET (e.g. immediately after
  // requesting a variant clone, before the new Space has round-tripped back
  // through the deployments query) specifically so the suppression effect
  // above can see it coming and skip the generic fit-to-everything for that
  // arrival. handledFocusRef ensures each distinct focusTrigger object still
  // only ever fires setCenter once, not on every unrelated `nodes` update.
  const handledFocusRef = useRef<{ deploymentId: string } | undefined>(undefined);
  useEffect(() => {
    if (!focusTrigger || !reactFlowInitialized.current) return;
    if (handledFocusRef.current === focusTrigger) return;
    const node = nodes.find((n) => n.id === focusTrigger.deploymentId);
    if (!node) return;
    handledFocusRef.current = focusTrigger;
    // Fits the WHOLE graph, not `setCenter` on just this one node: the
    // suppression effect above deliberately disables the generic
    // fit-to-everything for the duration of the create, specifically so this
    // is the one camera move the user sees — so this has to be the one that
    // actually shows everything, not a tight zoom on the new arrival alone.
    // A single-node `setCenter` (this call's previous form) genuinely lost
    // an ancestor off-screen once a variant's parent was no longer the
    // graph's ROOT: cloning "prod" from "dev" (rather than from base) lands
    // prod one hop further out along the chain, and centering tightly on
    // just prod, at a floor zoom of 0.75, pushed base — the node still named
    // in this tour's own closing line — off the edge of the viewport for
    // the rest of the session (confirmed live: base never returned to view
    // through the remaining tour steps or the final completion screen).
    // `fitView` with no `nodes` restriction includes every node regardless
    // of how deep the just-created one sits in the tree.
    fitView({ padding: 0.15, duration: 350 });
  }, [focusTrigger, nodes, fitView]);

  if (deployments.length === 0) {
    return (
      <EmptyState>
        <Typography color="text.secondary">No deployments to display</Typography>
      </EmptyState>
    );
  }

  return (
    <FlowContainer ref={flowContainerRef}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onInit={handleInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        // React Flow's built-in drag-line visual (ConnectionLineWrapper in
        // @reactflow/core) has its own guard, `isValid = !!(nodeId &&
        // handleType && width && nodesConnectable)`, reading this SAME
        // graph-level prop through the store. It has nothing to do with
        // whether onConnectStart/onConnectEnd fire (those are gated by each
        // Handle's own isConnectableStart, default true) — with
        // nodesConnectable false, the composer still opens from a handle drag,
        // but no line is ever drawn while dragging, because
        // ConnectionLineWrapper returns null the whole time. The three props
        // here are independent at the library level (confirmed against the
        // installed reactflow source), so this does not enable node dragging
        // or selection.
        nodesConnectable
        elementsSelectable={false}
        deleteKeyCode={null}
        zoomOnScroll
      >
        <Background color={componentTheme.borderSubtle} gap={20} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </FlowContainer>
  );
}

// ============================================================================
// EXPORTED COMPONENT
// ============================================================================

export const ComponentFlowGraph = memo((props: ComponentFlowGraphProps) => (
  <ReactFlowProvider>
    <ComponentFlowGraphInner {...props} />
  </ReactFlowProvider>
));

ComponentFlowGraph.displayName = 'ComponentFlowGraph';
