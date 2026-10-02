// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { type CSSProperties, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  ControlButton,
  Controls,
  type Edge,
  type EdgeTypes,
  type HandleType,
  type Node,
  type NodeTypes,
  type OnConnectStartParams,
  Panel,
  type ReactFlowState,
  ReactFlowProvider,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  useStore,
  useStoreApi,
  type Viewport,
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
import { ExpandFrameNode } from './ExpandFrameNode';
import { ComponentFrameNode } from './ComponentFrameNode';
import { type ComponentFrameActions, componentGroups } from './componentFrames';
import { FoldFrameNode } from './FoldFrameNode';
import { FlowCanvasToolbar } from './FlowCanvasToolbar';
import { TOGGLE_RESERVE } from './toolbarFit';
import { MoreBelowCue } from './MoreBelowCue';
import { StackNode } from './StackNode';
import {
  FIT_PAD_X,
  MAX_ZOOM,
  MIN_ZOOM_FOLDED,
  MORE_BELOW_MIN_HIDDEN,
  SEARCH_PULSE_MS,
} from './fold/foldConstants';
import { CLICK_PAN_THRESHOLD_PX, type PointerPoint, isClickAfterPan } from './fold/canvasSearch';
import { type FoldLayout, type FrozenFoldParams, computeFoldedLayout, expandFrameId } from './fold/foldLayout';
import type { WaveCondition } from './fold/deploymentCondition';
import { withReleaseAges } from './fold/derivedGroupKeys';
import { type FoldModel, closedStackOf, closedStacksOf, foldMembers, shouldFold } from './fold/foldModel';
import { toFlowElements } from './fold/foldNodes';
import {
  type Rect,
  type Size,
  ensureVisibleViewport,
  hiddenBelowPx,
  panDownViewport,
  solveFoldedFit,
} from './fold/foldViewport';
import { nextWheelZoom } from './fold/wheelZoom';
import { groupByOptions, resolveGroupKey } from './fold/groupBy';
import type { WaveActionRequest } from './fold/waveActions';
import { useFoldStability } from './useFoldStability';
import { useMinuteClock } from './useMinuteClock';
import {
  FOLD_ANIMATE_CLASS,
  FOLD_GHOST_CLASS,
  FOLD_GHOST_LEAVING_CLASS,
  FOLD_TRANSITION_MS,
  useFoldTransitions,
  usePrefersReducedMotion,
} from './useFoldTransitions';

const nodeTypes: NodeTypes = {
  deploymentNode: DeploymentFlowNode,
  composerNode: ComposerNode,
  landingSlotNode: LandingSlotNode,
  foldFrameNode: FoldFrameNode,
  componentFrameNode: ComponentFrameNode,
  stackNode: StackNode,
  expandFrameNode: ExpandFrameNode,
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
  /** Identity of the open node graph — replaces a single Component name so a
   * mixed-Component node graph still gets a stable `structuralKey` (any
   * unique-per-graph string works; it is never displayed). */
  graphKey?: string;
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

  /**
   * `?graphGroup=` as the URL holds it. `off` (any letter case) keeps the unfolded layout;
   * a key the Group by menu offers folds, grouped by that key. Missing, or a
   * value that is not an offered key, means Auto: fold at FOLD_THRESHOLD
   * Deployments or more.
   */
  groupParam?: string | null;
  /**
   * Opens one Component's own graph, from a click on the name in its
   * frame header in a graph of several Components. Without it the frame offers no such action.
   */
  onComponentOpen?: (name: string, owner: string) => void;
  /** Writes `?graphGroup=`: a label key, or `off`. Called only when the user picks one. */
  onGroupChange?: (key: string) => void;
  /**
   * The one bulk action of a wave on a fold header ("Upgrade 55"). Without
   * it the header shows the wave but offers no action.
   */
  onWaveAction?: (request: WaveActionRequest) => void;
  /** `waveKey`s of the waves whose bulk action is running; their button is disabled. */
  runningWaveKeys?: ReadonlySet<string>;

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
  // A folded graph moves its nodes when a poll adds or removes a card, so the
  // eye can follow them (see useFoldTransitions; the class is never set when
  // the user asks for reduced motion).
  [`& .react-flow__node.${FOLD_ANIMATE_CLASS}`]: {
    transition: `transform ${FOLD_TRANSITION_MS}ms ease, opacity ${FOLD_TRANSITION_MS}ms ease`,
  },
  // A card on its way into its stack is only a picture of the card.
  [`& .react-flow__node.${FOLD_GHOST_CLASS}, & .react-flow__node.${FOLD_GHOST_CLASS} *`]: {
    pointerEvents: 'none !important',
  },
  [`& .react-flow__node.${FOLD_GHOST_CLASS} > *`]: {
    transition: `transform ${FOLD_TRANSITION_MS}ms ease`,
    transformOrigin: 'center',
  },
  [`& .react-flow__node.${FOLD_GHOST_LEAVING_CLASS}`]: {
    opacity: 0,
  },
  [`& .react-flow__node.${FOLD_GHOST_LEAVING_CLASS} > *`]: {
    transform: 'scale(0.92)',
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
const NO_GROUPS: ReadonlySet<string> = new Set();
const NO_RECTS: ReadonlyMap<string, Rect> = new Map();
// Auto mode: the wheel pans and a held Cmd or Ctrl turns it into zoom. A
// trackpad pinch arrives as a wheel event with ctrlKey set, so it zooms too.
const ZOOM_KEY_CODES = ['Meta', 'Control'];
/**
 * The canvas's top row spans its width but lets pointer events through
 * between its tools, so the canvas under the gap still pans.
 */
const TOP_ROW_STYLE: CSSProperties = {
  // Stops short of the Graph / Dashboard toggle that floats over the canvas.
  right: TOGGLE_RESERVE,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  pointerEvents: 'none',
};
const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const selectD3Zoom = (s: ReactFlowState) => s.d3Zoom;
const NOOP = () => {};
/** How long the first fit waits for nodes to be measured before it fits anyway. */
const INITIAL_FIT_GIVE_UP_MS = 5000;

const sizeOf = (el: HTMLElement): Size => ({ width: el.clientWidth, height: el.clientHeight });

/** The same icon reactflow's own Fit control draws, so the folded Fit looks like it. */
const FitViewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 30" aria-hidden="true">
    <path d="M3.692 4.63c0-.53.4-.938.939-.938h5.215V0H4.708C2.13 0 0 2.054 0 4.63v5.216h3.692V4.631zM27.354 0h-5.2v3.692h5.17c.53 0 .984.4.984.939v5.215H32V4.631A4.624 4.624 0 0027.354 0zm.954 24.83c0 .532-.4.94-.939.94h-5.215v3.768h5.215c2.577 0 4.631-2.13 4.631-4.707v-5.139h-3.692v5.139zm-23.677.94c-.531 0-.939-.4-.939-.94v-5.138H0v5.139c0 2.577 2.13 4.707 4.708 4.707h5.138V25.77H4.631z" />
  </svg>
);

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
  graphKey,
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
  groupParam = null,
  onGroupChange,
  onComponentOpen,
  onWaveAction,
  runningWaveKeys,
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

  // Two or more Components in one graph (a click on an Owner group or another
  // high-level node): each one's tree gets a frame and a name. With one, empty.
  const components = useMemo(() => componentGroups(deployments), [deployments]);

  // ── Folding: the user's Group by choice, else 10 or more Deployments ──
  // When `folding` is false, `foldModel` is null and every path in this file
  // draws the unfolded graph.
  // The Deployments that Group by reads: each with the bucket of its latest
  // Release ("Last released"), against a clock that moves once a minute, so a
  // poll does not move a Deployment between stacks.
  const releaseClock = useMinuteClock();
  const groupDeployments = useMemo(
    () => withReleaseAges(deployments, latestReleaseBySpaceId, releaseClock),
    [deployments, latestReleaseBySpaceId, releaseClock],
  );
  // The menu lists the options also when the graph does not fold, so the user
  // can turn the fold on at any size.
  const groupOptions = useMemo(
    () => groupByOptions(foldMembers(groupDeployments)),
    [groupDeployments],
  );
  const folding = shouldFold(
    deployments,
    groupParam,
    groupOptions.map((o) => o.key),
  );
  const foldingRef = useRef(folding);
  foldingRef.current = folding;
  // The URL key wins when it is one of this Component's options; the default
  // never depends on fit or health, so the stacks keep their shape between
  // visits and on every screen.
  const foldGroupKey = folding
    ? resolveGroupKey(groupParam, groupOptions, groupOptions.find((o) => o.isDefault)?.key ?? null)
    : null;
  /** The fold on screen: off, or on with its grouping. */
  const foldShape = folding ? `fold:${foldGroupKey ?? ''}` : 'off';
  // Another Component or grouping is another graph: what was open, the
  // columns chosen and the cards held for the old one mean nothing there.
  const foldResetKey = `${graphKey ?? ''}|${foldShape}`;
  // A poll may add or remove exception cards, but a card that just recovered
  // stays for a while and the selected card stays for good, so what the user
  // is reading does not jump back into a stack.
  const {
    model: foldModel,
    holdUntilById,
    keptSelectedIds,
  } = useFoldStability({
    deployments: groupDeployments,
    groupKey: foldGroupKey,
    selectedIds: visuallySelectedIds,
    folding,
    resetKey: foldResetKey,
  });
  const foldModelRef = useRef(foldModel);
  foldModelRef.current = foldModel;
  const [expandedGroupIds, setExpandedGroupIds] = useState<ReadonlySet<string>>(NO_GROUPS);
  const expandedGroupIdsRef = useRef(expandedGroupIds);
  expandedGroupIdsRef.current = expandedGroupIds;
  // Stacks a search jump opened, so their frame says so: a stack that opened
  // without the user clicking it must not look like their own choice.
  const [openedBySearchIds, setOpenedBySearchIds] = useState<ReadonlySet<string>>(NO_GROUPS);
  /** The card a search jump landed on; it pulses for SEARCH_PULSE_MS. */
  const [pulseId, setPulseId] = useState<string | null>(null);
  // The columns the last Fit chose. Every layout until the next Fit reuses
  // them, so a status poll or an opened stack moves things down, never
  // sideways.
  const [frozen, setFrozen] = useState<FrozenFoldParams | null>(null);
  // Nodes animate only after the first Fit of a graph: before it, every node
  // would slide in from wherever reactflow first drew it.
  const [foldFitted, setFoldFitted] = useState(false);
  const foldResetKeyRef = useRef(foldResetKey);
  foldResetKeyRef.current = foldResetKey;
  const fitAnimateRafRef = useRef(0);
  const [foldResetSeen, setFoldResetSeen] = useState(foldResetKey);
  if (foldResetSeen !== foldResetKey) {
    setFoldResetSeen(foldResetKey);
    setExpandedGroupIds(NO_GROUPS);
    setOpenedBySearchIds(NO_GROUPS);
    setFrozen(null);
    setFoldFitted(false);
  }
  /** Deployment id -> the closed stack it is in, where a folding card flies to. */
  const [stackRectById, setStackRectById] = useState<ReadonlyMap<string, Rect>>(NO_RECTS);
  const reducedMotion = usePrefersReducedMotion();

  /** The folded layout on screen, for Fit, pans and "More below"; null when not folding. */
  const foldLayoutRef = useRef<FoldLayout | null>(null);
  /** A stack just opened: pan its frame into view once the new layout is on screen. */
  const revealGroupRef = useRef<string | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const toggleStack = useCallback((groupId: string) => {
    const opening = !expandedGroupIdsRef.current.has(groupId);
    revealGroupRef.current = opening ? groupId : null;
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    // Whatever the user does with a stack by hand is their own choice from
    // then on.
    setOpenedBySearchIds((prev) => {
      if (!prev.has(groupId)) return prev;
      const next = new Set(prev);
      next.delete(groupId);
      return next;
    });
  }, []);

  /**
   * Pan (never zoom) so a rectangle of the folded graph is in view. A folded
   * graph never refits on a click, an opened stack or the side pane: a refit
   * moves everything the user was reading.
   */
  const panToRect = useCallback(
    (rect: Rect, opts: { center?: boolean }, duration: number) => {
      const container = flowContainerRef.current;
      if (!container) return;
      const next = ensureVisibleViewport(rect, getViewport(), sizeOf(container), opts);
      if (next) setViewport(next, { duration });
    },
    [getViewport, setViewport],
  );
  const panToDeployment = useCallback(
    (deploymentId: string, opts: { center?: boolean }, duration: number) => {
      const rect = foldLayoutRef.current?.nodes.find((n) => n.id === deploymentId);
      if (rect) panToRect(rect, opts, duration);
    },
    [panToRect],
  );

  /** A node's box in flow coordinates, from whichever layout is on screen. */
  const rectOfNode = useCallback((id: string): Rect | null => {
    const layout = foldLayoutRef.current;
    if (layout) return layout.nodes.find((n) => n.id === id) ?? null;
    const node = nodesRef.current.find((n) => n.id === id);
    if (!node) return null;
    return {
      x: node.position.x,
      y: node.position.y,
      width: node.width ?? NODE_WIDTH,
      height: node.height ?? NODE_HEIGHT,
    };
  }, []);

  /** A search jump waiting for its card to be in the committed layout. */
  const pendingRevealRef = useRef<string | null>(null);
  const pulseTimerRef = useRef(0);
  useEffect(() => () => window.clearTimeout(pulseTimerRef.current), []);
  const selectedIdsRef = useRef(selectedDeploymentIds);
  selectedIdsRef.current = selectedDeploymentIds;

  /**
   * Bring one Deployment into view without moving anything else: open its
   * stack in place (the frame says who opened it), select it so the side pane
   * opens, pulse the card, and pan so it is in the middle. It never refits or
   * zooms: the rest of the graph stays where the user left it.
   */
  const revealDeployment = useCallback(
    (id: string, { openedBy, select = true }: { openedBy: 'search' | 'you'; select?: boolean }) => {
      const loc = foldingRef.current ? foldModelRef.current?.location.get(id) : undefined;
      if (loc?.kind === 'stack') {
        const { groupId } = loc;
        if (!expandedGroupIdsRef.current.has(groupId)) {
          setExpandedGroupIds((prev) => new Set(prev).add(groupId));
          setOpenedBySearchIds((prev) => {
            const next = new Set(prev);
            if (openedBy === 'search') next.add(groupId);
            else next.delete(groupId);
            return next;
          });
        }
      }
      // The pane's toggle would close an open pane; a jump only ever opens.
      // A caller that opens the pane on a given tab selects it itself.
      if (select && !selectedIdsRef.current.has(id)) callbacksRef.current.onDeploymentToggle(id);
      window.clearTimeout(pulseTimerRef.current);
      setPulseId(id);
      pulseTimerRef.current = window.setTimeout(() => setPulseId(null), SEARCH_PULSE_MS);
      // The card of a stack that is opening does not exist yet; the pan runs
      // once the new layout is committed (see the effect on `nodes`).
      revealGroupRef.current = null;
      pendingRevealRef.current = id;
    },
    [],
  );
  // A Deployment named by a compare link may be quiet and sit in a closed
  // stack, where it would have no card and no letter. Its stack opens in
  // place, once per Deployment and graph: a stack the user closes afterwards
  // stays closed. Nothing pans or zooms.
  const compareOpenedRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  useEffect(() => {
    if (!folding || !foldModel || !compareLetterById || compareLetterById.size === 0) return;
    if (compareOpenedRef.current.key !== foldResetKey) {
      compareOpenedRef.current = { key: foldResetKey, ids: new Set() };
    }
    const done = compareOpenedRef.current.ids;
    const fresh = [...compareLetterById.keys()].filter((id) => !done.has(id));
    if (fresh.length === 0) return;
    const groups = closedStacksOf(foldModel, fresh, expandedGroupIdsRef.current);
    for (const id of fresh) if (foldModel.location.has(id)) done.add(id);
    if (groups.length === 0) return;
    setExpandedGroupIds((prev) => new Set([...prev, ...groups]));
  }, [folding, foldModel, compareLetterById, foldResetKey]);
  const revealFromSearch = useCallback(
    (id: string) => revealDeployment(id, { openedBy: 'search' }),
    [revealDeployment],
  );
  const handleGroupPick = useCallback((key: string) => onGroupChange?.(key), [onGroupChange]);

  // The fold header names the wave by its condition; the page gets the wave
  // as the model has it now, with its members, and the reveal it needs to
  // show one of them.
  const onWaveActionRef = useRef(onWaveAction);
  onWaveActionRef.current = onWaveAction;
  const hasWaveAction = !!onWaveAction;
  const handleWaveAction = useCallback(
    (baseId: string, condition: WaveCondition) => {
      const wave = foldModelRef.current?.bases.get(baseId)?.waves.find((w) => w.condition === condition);
      if (wave) onWaveActionRef.current?.({ baseId, wave, reveal: revealDeployment });
    },
    [revealDeployment],
  );

  // A frame's header Owner selects the Component's root Base, and its name
  // goes to that Component's own graph.
  const onComponentOpenRef = useRef(onComponentOpen);
  onComponentOpenRef.current = onComponentOpen;
  const hasComponentOpen = !!onComponentOpen;
  const frameActions = useMemo<ComponentFrameActions>(
    () => ({
      onSelectRoot: (rootId) => revealDeployment(rootId, { openedBy: 'you' }),
      onOpenComponent: hasComponentOpen
        ? (name, owner) => onComponentOpenRef.current?.(name, owner)
        : undefined,
    }),
    [revealDeployment, hasComponentOpen],
  );

  const updateMoreBelow = useCallback(
    (viewport?: Viewport) => {
      const layout = foldLayoutRef.current;
      const container = flowContainerRef.current;
      if (!foldingRef.current || !layout || !container) {
        setMoreBelow(false);
        return;
      }
      const hidden = hiddenBelowPx(viewport ?? getViewport(), layout.height, sizeOf(container));
      setMoreBelow(hidden >= MORE_BELOW_MIN_HIDDEN);
    },
    [getViewport],
  );
  const handleMove = useCallback(
    (_event: unknown, viewport: Viewport) => updateMoreBelow(viewport),
    [updateMoreBelow],
  );
  const handleMoreBelow = useCallback(() => {
    const layout = foldLayoutRef.current;
    const container = flowContainerRef.current;
    if (!layout || !container) return;
    setViewport(panDownViewport(getViewport(), layout.height, sizeOf(container)), { duration: 300 });
  }, [getViewport, setViewport]);

  // Cmd or Ctrl + wheel on the Auto canvas zooms one step per notch (see
  // wheelZoom.ts). The listener captures the event before React Flow's own
  // wheel handler sees it, whichever of its two handlers is active.
  const flowStore = useStoreApi();
  const hasDeployments = deployments.length > 0;
  useEffect(() => {
    const container = flowContainerRef.current;
    if (!hasDeployments || !container) return;
    const isMac = navigator.userAgent.includes('Mac');
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('.react-flow__renderer') || target.closest('.nowheel')) return;
      const { d3Zoom, d3Selection, transform, minZoom, maxZoom } = flowStore.getState();
      const pane = d3Selection?.node();
      if (!d3Zoom || !d3Selection || !pane) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = pane.getBoundingClientRect();
      const point: [number, number] = [event.clientX - rect.left, event.clientY - rect.top];
      const zoom = nextWheelZoom(transform[2], event, isMac, minZoom, maxZoom);
      // d3-zoom takes the source event as a fourth argument, as React Flow's
      // own pinch zoom passes it, so onMove fires as for any wheel zoom. Its
      // types leave that argument out.
      const scaleTo = d3Zoom.scaleTo as (
        selection: typeof d3Selection,
        k: number,
        p: [number, number],
        sourceEvent: WheelEvent,
      ) => void;
      scaleTo(d3Selection, zoom, point, event);
    };
    container.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => container.removeEventListener('wheel', onWheel, { capture: true });
  }, [hasDeployments, flowStore]);

  /**
   * Fit a folded graph: the zoom and the card and stack columns are chosen
   * together, never below the readable floor, and the columns are frozen
   * until the next Fit. Open stacks are left out of the choice, so opening
   * one never changes what the next Fit picks.
   */
  const runFoldedFit = useCallback(
    (duration: number) => {
      const container = flowContainerRef.current;
      if (!foldModel || !container) return;
      const size = sizeOf(container);
      if (size.width <= 0 || size.height <= 0) return;
      const fit = solveFoldedFit(
        (availableWidth) =>
          computeFoldedLayout(deployments, foldModel, {
            availableWidth,
            expandedGroupIds: NO_GROUPS,
            components,
          }),
        size,
      );
      setFrozen(fit.frozen);
      setViewport(fit.viewport, { duration });
      // The Fit's own layout (its columns) must be painted before nodes
      // animate, or the first Fit would slide every node into its column.
      const key = foldResetKeyRef.current;
      cancelAnimationFrame(fitAnimateRafRef.current);
      fitAnimateRafRef.current = requestAnimationFrame(() => {
        fitAnimateRafRef.current = requestAnimationFrame(() => {
          if (foldResetKeyRef.current === key) setFoldFitted(true);
        });
      });
    },
    [deployments, foldModel, components, setViewport],
  );
  useEffect(() => () => cancelAnimationFrame(fitAnimateRafRef.current), []);
  /** The structural fit for whichever graph is on screen. */
  const structuralFitRef = useRef<(duration: number) => void>(NOOP);
  structuralFitRef.current = (duration: number) => {
    if (foldingRef.current) runFoldedFit(duration);
    else fitView({ padding: 0.15, duration });
  };

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
      (graphKey ?? '') +
      '|' +
      deployments.map((d) => d.deploymentId).sort().join(',') +
      '|' +
      stages.map((s) => s.label).join(',') +
      '|' +
      foldShape,
    [graphKey, deployments, stages, foldShape],
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

    function buildUnfoldedElements(): { nodes: Node[]; edges: Edge[] } {
      foldLayoutRef.current = null;
      setStackRectById(NO_RECTS);
      return computeLayout(
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
        components,
        frameActions,
      );
    }

    function buildFoldedElements(model: FoldModel): { nodes: Node[]; edges: Edge[] } {
      const container = flowContainerRef.current;
      const layout = computeFoldedLayout(deployments, model, {
        // Until the first Fit freezes a width, fill the canvas at 100%.
        availableWidth: frozen?.availableWidth ?? Math.max(0, (container?.clientWidth ?? 0) - 2 * FIT_PAD_X),
        frozen,
        expandedGroupIds,
        components,
      });
      foldLayoutRef.current = layout;
      const stackRects = new Map<string, Rect>();
      for (const base of model.bases.values()) {
        for (const group of base.groups) {
          if (group.kind === 'loose' || expandedGroupIds.has(group.id)) continue;
          const stack = layout.nodes.find((n) => n.id === group.id);
          if (!stack) continue;
          for (const id of group.memberIds) stackRects.set(id, stack);
        }
      }
      setStackRectById(stackRects);
      return toFlowElements(layout, model, deploymentById, {
        node: {
          selectedDeploymentIds: visuallySelectedIds,
          activeUpgrades: safeActiveUpgrades,
          onDeploymentToggle: stableOnDeploymentToggle,
          onUpgradeToggle: stableOnUpgradeToggle,
          errorDeploymentIds,
          unitSummariesByDeployment,
          upgradingDeploymentIds,
          deploymentSuccessMessages,
          latestReleaseBySpaceId,
          releasingDeploymentIds,
          onOpenTab: stableOnOpenTab,
          onComposerOpen: stableOnComposerOpen,
        },
        edge: {
          selectedDeploymentIds: visuallySelectedIds,
          activeUpgrades: safeActiveUpgrades,
          pulseFromDeploymentId: releasePulseSourceId,
          deploymentSpaceIdsKey,
          deploymentById,
        },
        expandedGroupIds,
        openedBySearchIds,
        onToggleStack: toggleStack,
        recoveredUntilById: holdUntilById,
        keptSelectedIds,
        onWaveAction: hasWaveAction ? handleWaveAction : undefined,
        runningWaveKeys,
        components,
        frameActions,
      });
    }

    const { nodes: n, edges: e } = foldModel ? buildFoldedElements(foldModel) : buildUnfoldedElements();

    const nodesToRender = n.map((node) => {
      // The comparison letter is stamped on here rather than threaded through
      // the layout functions: it changes on a user gesture and has no effect on
      // where anything sits, so it does not belong in a positioning argument
      // list that four other call sites share.
      const compareLetter = compareLetterById?.get(node.id);
      const isPulsing = node.type === 'deploymentNode' && node.id === pulseId;
      return compareLetter || isPulsing
        ? {
            ...node,
            data: {
              ...node.data,
              ...(compareLetter && { compareLetter }),
              ...(isPulsing && { isPulsing }),
            },
          }
        : node;
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
    foldModel,
    frozen,
    expandedGroupIds,
    openedBySearchIds,
    pulseId,
    toggleStack,
    holdUntilById,
    keptSelectedIds,
    hasWaveAction,
    handleWaveAction,
    runningWaveKeys,
    components,
    frameActions,
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

  /** Where the last pointer went down on the canvas, to tell a click from a pan. */
  const pointerDownRef = useRef<PointerPoint | null>(null);
  const handlePointerDownCapture = useCallback((event: React.PointerEvent) => {
    pointerDownRef.current = { x: event.clientX, y: event.clientY };
  }, []);
  // d3-zoom swallows the click after ANY pointer movement, so a click whose
  // pointer drifted a pixel would never select.
  const d3Zoom = useStore(selectD3Zoom);
  useEffect(() => {
    d3Zoom?.clickDistance(CLICK_PAN_THRESHOLD_PX);
  }, [d3Zoom]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // Only handle deployment nodes, not stage headers
      if (node.type !== 'deploymentNode') return;

      // A drag on a card pans the canvas, and the browser still fires a
      // click at the end of it; that click is the end of a pan, not a
      // request to open the card. A keyboard click (detail 0) has no pointer.
      const down = pointerDownRef.current;
      if (event.detail > 0 && down && isClickAfterPan(down, { x: event.clientX, y: event.clientY })) {
        return;
      }

      const action = resolveNodeClick(event, selectedDeploymentIds.has(node.id));
      if (action === 'toggle-compare') {
        callbacksRef.current.onDeploymentCompareToggle?.(node.id);
        return;
      }

      callbacksRef.current.onDeploymentToggle(node.id);

      // A folded graph pans only, and only as far as the card needs to be in
      // view; closing the pane leaves the view where it is. Refitting here
      // would move every stack the user was reading. The pane's own resize
      // is handled by the ResizeObserver below.
      if (foldingRef.current) {
        if (!selectedDeploymentIds.has(node.id)) panToDeployment(node.id, {}, 300);
        return;
      }

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
      panToDeployment,
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
      structuralFitRef.current(200);
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
    // Backstop in case the width never settles (should rarely fire). It must
    // not fit before the nodes are measured: fitView then finds no bounds and
    // leaves the view at 100%, and with the pending flag cleared nothing
    // fits again, so a large graph would stay at scale 1. It waits for the
    // measurement instead, and fits anyway after INITIAL_FIT_GIVE_UP_MS.
    const startedAt = performance.now();
    const fallback = () => {
      if (!nodesInitializedRef.current && performance.now() - startedAt < INITIAL_FIT_GIVE_UP_MS) {
        fallbackId = window.setTimeout(fallback, 200);
        return;
      }
      runFit();
    };
    fallbackId = window.setTimeout(fallback, 600);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(fallbackId);
    };
  }, [pendingFitView]);

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
  //
  // A folded graph does not refit here: the columns were chosen at the last
  // Fit, and a refit on every pane open would move all of them. It only pans
  // the selected card back into view, the one thing the pane can hide.
  const settleFoldedRef = useRef(NOOP);
  settleFoldedRef.current = () => {
    const selectedId = selectedDeploymentIds.values().next().value;
    if (selectedId !== undefined) panToDeployment(selectedId, {}, 200);
    updateMoreBelow();
  };
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
        if (foldingRef.current) settleFoldedRef.current();
        else fitView({ padding: 0.15, duration: 200 });
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
  //
  // A folded graph ignores it: it refits only on load, on a new Component or
  // grouping, and from its Fit control.
  useEffect(() => {
    if (fitViewTrigger && reactFlowInitialized.current && !foldingRef.current) {
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
    // A Deployment in a closed stack has no node yet. Its stack opens in
    // place and the pan waits for the new layout, so a Deployment opened in
    // the side pane is never hidden on the canvas.
    if (
      foldingRef.current &&
      closedStackOf(foldModelRef.current, focusTrigger.deploymentId, expandedGroupIdsRef.current)
    ) {
      handledFocusRef.current = focusTrigger;
      revealDeployment(focusTrigger.deploymentId, { openedBy: 'you', select: false });
      return;
    }
    const node = nodes.find((n) => n.id === focusTrigger.deploymentId);
    if (!node) return;
    handledFocusRef.current = focusTrigger;
    // A folded graph is too large to fit whole at a readable zoom, and its
    // Fit already shows the Base tree; it pans the node to the middle instead.
    if (foldingRef.current) {
      panToDeployment(node.id, { center: true }, 350);
      return;
    }
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
  }, [focusTrigger, nodes, fitView, panToDeployment, revealDeployment]);

  // After a stack opens and the new layout is on screen, pan (never zoom) so
  // the stack and its frame are in view. It waits for the frame to exist in
  // the committed layout, because before that there is nothing to measure.
  // "More below" is checked after every layout change too: an opened stack
  // or a new card can make the graph taller than the canvas.
  useEffect(() => {
    updateMoreBelow();
    const revealId = pendingRevealRef.current;
    if (revealId) {
      const rect = rectOfNode(revealId);
      if (rect) {
        pendingRevealRef.current = null;
        panToRect(rect, { center: true }, prefersReducedMotion() ? 0 : 300);
      }
      return;
    }
    const groupId = revealGroupRef.current;
    const layout = foldLayoutRef.current;
    if (!groupId || !layout) return;
    const frame = layout.nodes.find((n) => n.id === expandFrameId(groupId));
    if (!frame) return;
    revealGroupRef.current = null;
    const stack = layout.nodes.find((n) => n.id === groupId);
    const top = stack ? stack.y : frame.y;
    panToRect({ x: frame.x, y: top, width: frame.width, height: frame.y + frame.height - top }, {}, 300);
  }, [nodes, panToRect, rectOfNode, updateMoreBelow]);

  // A jump that never found its card must not fire later in another graph.
  useEffect(() => {
    pendingRevealRef.current = null;
  }, [graphKey]);

  const renderedNodes = useFoldTransitions({
    nodes,
    stackRectById,
    reducedMotion,
    enabled: folding && foldFitted,
  });

  if (deployments.length === 0) {
    return (
      <EmptyState>
        <Typography color="text.secondary">No deployments to display</Typography>
      </EmptyState>
    );
  }

  return (
    <FlowContainer
      ref={flowContainerRef}
      onPointerDownCapture={handlePointerDownCapture}
      // A drag on the canvas pans; without this it also selected the card
      // names it crossed, and the selection fought the pan. Fields keep
      // their text selection (the composer and the search have inputs).
      sx={{
        userSelect: 'none',
        '& input, & textarea, & [contenteditable]': { userSelect: 'text' },
      }}
    >
      <ReactFlow
        nodes={renderedNodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeMouseEnter={handleNodeMouseEnter}
        onNodeMouseLeave={handleNodeMouseLeave}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onInit={handleInit}
        onMove={folding ? handleMove : undefined}
        onMoveEnd={folding ? handleMove : undefined}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        minZoom={MIN_ZOOM_FOLDED}
        maxZoom={MAX_ZOOM}
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
        // The graph reads like a document: the wheel and a two-finger swipe
        // pan, Cmd or Ctrl + wheel and a pinch zoom, and a drag on a card
        // pans (see DeploymentFlowNode).
        zoomOnScroll={false}
        panOnScroll
        zoomOnPinch
        zoomActivationKeyCode={ZOOM_KEY_CODES}
      >
        <Background color={componentTheme.borderSubtle} gap={20} />
        <Controls showInteractive={false} showFitView={!folding}>
          {folding && (
            <ControlButton onClick={() => runFoldedFit(300)} title="Fit" aria-label="fit view">
              <FitViewIcon />
            </ControlButton>
          )}
        </Controls>
        {/* Spans the row so the toolbar can measure, and shrink into, its
            available width as the side pane narrows the canvas. */}
        <Panel position="top-left" style={TOP_ROW_STYLE}>
          <FlowCanvasToolbar
            componentName={'this graph'}
            deployments={deployments}
            model={foldModel}
            folding={folding}
            groupKey={foldGroupKey}
            groupOptions={groupOptions}
            onGroupChange={handleGroupPick}
            onReveal={revealFromSearch}
          />
        </Panel>
        {folding && moreBelow && (
          <Panel position="bottom-center">
            <MoreBelowCue onClick={handleMoreBelow} />
          </Panel>
        )}
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
