// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeTypes,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  GROUP_BY_CONFIGS,
  getGroupValue,
  type GroupByOption,
} from '@/components/group-by-selector/GroupBySelector';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { FlowGroupNode, type FlowGroupNodeData } from './FlowGroupNode';
import { FlowUnitNode, type FlowUnitNodeData } from './FlowUnitNode';

// ============================================================================
// CONSTANTS
// ============================================================================

const NODE_WIDTH = 250;
const NODE_HEIGHT = 90;
const GROUP_NODE_WIDTH = 200;
const GROUP_NODE_HEIGHT = 50;
const RANK_SEP = 80;
const NODE_SEP = 40;

const nodeTypes: NodeTypes = {
  unitNode: FlowUnitNode,
  groupNode: FlowGroupNode,
};

// ============================================================================
// TYPES
// ============================================================================

interface UnitFlowGraphProps {
  units: ExtendedUnitRead[];
  groupBy: GroupByOption;
  selectedUnitIds: string[];
  isMultiSelect: boolean;
  selectedUnitId: string | undefined;
}

interface TreeNode {
  unit: ExtendedUnitRead;
  children: TreeNode[];
}

// ============================================================================
// STYLED COMPONENTS
// ============================================================================

const FlowContainer = styled(Box)({
  width: '100%',
  height: 690,
});

const EmptyState = styled(Box)({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
});

// ============================================================================
// LAYOUT HELPERS
// ============================================================================

/**
 * Build clone tree from UpstreamUnitID relationships.
 * Reuses the pattern from UnitTreeView.
 */
function buildCloneTree(units: ExtendedUnitRead[]): TreeNode[] {
  const unitMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];

  units.forEach((unit) => {
    if (unit.Unit?.UnitID) {
      unitMap.set(unit.Unit.UnitID, { unit, children: [] });
    }
  });

  units.forEach((unit) => {
    if (!unit.Unit?.UnitID) return;
    const node = unitMap.get(unit.Unit.UnitID);
    if (!node) return;

    if (unit.Unit.UpstreamUnitID) {
      const parentNode = unitMap.get(unit.Unit.UpstreamUnitID);
      if (parentNode) {
        parentNode.children.push(node);
      } else {
        rootNodes.push(node);
      }
    } else {
      rootNodes.push(node);
    }
  });

  return rootNodes;
}

/**
 * Convert a clone tree to React Flow nodes and edges.
 */
function convertCloneTreeToFlow(
  tree: TreeNode[],
  selectedUnitId: string | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];
  const visited = new Set<string>();
  let nodeIdx = 0;

  const processNode = (treeNode: TreeNode, x: number, y: number, parentId?: string) => {
    const unitId = treeNode.unit.Unit?.UnitID;
    if (!unitId || visited.has(unitId)) return;
    visited.add(unitId);

    const currentId = `unit-${nodeIdx++}`;

    flowNodes.push({
      id: currentId,
      type: 'unitNode',
      position: { x, y },
      data: {
        unit: treeNode.unit,
        isSelected: unitId === selectedUnitId,
      } satisfies FlowUnitNodeData,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    });

    if (parentId) {
      flowEdges.push({
        id: `edge-${parentId}-${currentId}`,
        source: parentId,
        target: currentId,
        type: 'smoothstep',
        style: { stroke: '#3b82f6' },
      });
    }

    const childCount = treeNode.children.length;
    const totalWidth = childCount * (NODE_WIDTH + NODE_SEP);
    let childX = x - totalWidth / 2 + NODE_WIDTH / 2;
    const childY = y + NODE_HEIGHT + RANK_SEP;

    treeNode.children.forEach((child) => {
      processNode(child, childX, childY, currentId);
      childX += NODE_WIDTH + NODE_SEP;
    });
  };

  const totalWidth = tree.length * (NODE_WIDTH + NODE_SEP * 2);
  let rootX = -totalWidth / 2 + NODE_WIDTH / 2;

  tree.forEach((root) => {
    processNode(root, rootX, 0);
    rootX += NODE_WIDTH + NODE_SEP * 2;
  });

  return { nodes: flowNodes, edges: flowEdges };
}

/**
 * Build a group-based graph: group parent nodes with unit child nodes connected by edges.
 */
function buildGroupGraph(
  units: ExtendedUnitRead[],
  groupBy: GroupByOption,
  selectedUnitId: string | undefined,
): { nodes: Node[]; edges: Edge[] } {
  const config = GROUP_BY_CONFIGS[groupBy];

  // Group units by the appropriate field
  const groups = new Map<string, ExtendedUnitRead[]>();
  const ungrouped: ExtendedUnitRead[] = [];

  units.forEach((unit) => {
    const value = getGroupValue(unit, groupBy);
    if (value) {
      const list = groups.get(value) ?? [];
      list.push(unit);
      groups.set(value, list);
    } else {
      ungrouped.push(unit);
    }
  });

  if (ungrouped.length > 0) {
    groups.set('Ungrouped', ungrouped);
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (a === 'Ungrouped') return 1;
    if (b === 'Ungrouped') return -1;
    return a.localeCompare(b);
  });

  const flowNodes: Node[] = [];
  const flowEdges: Edge[] = [];

  let groupX = 0;

  sortedKeys.forEach((key) => {
    const groupUnits = groups.get(key) ?? [];
    const groupId = `group-${key}`;

    // Compute position: group at top, children below
    const childrenWidth = groupUnits.length * (NODE_WIDTH + NODE_SEP);
    const groupCenterX = groupX + childrenWidth / 2 - GROUP_NODE_WIDTH / 2;

    flowNodes.push({
      id: groupId,
      type: 'groupNode',
      position: { x: groupCenterX, y: 0 },
      data: {
        label: key,
        icon: config.icon,
        unitCount: groupUnits.length,
      } satisfies FlowGroupNodeData,
      sourcePosition: Position.Bottom,
    });

    let childX = groupX;
    const childY = GROUP_NODE_HEIGHT + RANK_SEP;

    groupUnits.forEach((unit, idx) => {
      const unitId = unit.Unit?.UnitID ?? `unknown-${idx}`;
      const nodeId = `unit-${groupId}-${unitId}`;

      flowNodes.push({
        id: nodeId,
        type: 'unitNode',
        position: { x: childX, y: childY },
        data: {
          unit,
          isSelected: unitId === selectedUnitId,
        } satisfies FlowUnitNodeData,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
      });

      flowEdges.push({
        id: `edge-${groupId}-${nodeId}`,
        source: groupId,
        target: nodeId,
        type: 'smoothstep',
        style: { stroke: '#64748b' },
      });

      childX += NODE_WIDTH + NODE_SEP;
    });

    groupX += childrenWidth + NODE_SEP * 2;
  });

  return { nodes: flowNodes, edges: flowEdges };
}

// ============================================================================
// INNER COMPONENT (needs ReactFlowProvider)
// ============================================================================

function UnitFlowGraphInner({
  units,
  groupBy,
  selectedUnitIds,
  isMultiSelect,
  selectedUnitId,
}: UnitFlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();

  // In multi-select, filter to only selected units
  const visibleUnits = useMemo(() => {
    if (!isMultiSelect) return units;
    const idSet = new Set(selectedUnitIds);
    return units.filter((u) => {
      const id = u.Unit?.UnitID;
      return id && idSet.has(id);
    });
  }, [units, isMultiSelect, selectedUnitIds]);

  const effectiveGroupBy = useMemo<GroupByOption>(() => {
    if (groupBy === 'app>environment') return 'app';
    if (groupBy === 'environment>app') return 'environment';
    return groupBy;
  }, [groupBy]);

  const buildGraph = useCallback(() => {
    if (visibleUnits.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const effectiveSelectedId = isMultiSelect ? undefined : selectedUnitId;

    if (groupBy === 'none') {
      const tree = buildCloneTree(visibleUnits);
      const { nodes: n, edges: e } = convertCloneTreeToFlow(tree, effectiveSelectedId);
      setNodes(n);
      setEdges(e);
    } else {
      const { nodes: n, edges: e } = buildGroupGraph(
        visibleUnits,
        effectiveGroupBy,
        effectiveSelectedId,
      );
      setNodes(n);
      setEdges(e);
    }

    setTimeout(() => {
      fitView({ padding: 0.2, duration: 300 });
    }, 100);
  }, [visibleUnits, groupBy, effectiveGroupBy, isMultiSelect, selectedUnitId, setNodes, setEdges, fitView]);

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  if (isMultiSelect && selectedUnitIds.length === 0) {
    return (
      <EmptyState>
        <Typography color='text.secondary'>
          Select units to build the relationship graph
        </Typography>
      </EmptyState>
    );
  }

  if (visibleUnits.length === 0) {
    return (
      <EmptyState>
        <Typography color='text.secondary'>No units to display</Typography>
      </EmptyState>
    );
  }

  return (
    <FlowContainer>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={1.5}
      >
        <Controls />
        <MiniMap />
      </ReactFlow>
    </FlowContainer>
  );
}

// ============================================================================
// EXPORTED COMPONENT
// ============================================================================

export const UnitFlowGraph = memo((props: UnitFlowGraphProps) => (
  <ReactFlowProvider>
    <UnitFlowGraphInner {...props} />
  </ReactFlowProvider>
));

UnitFlowGraph.displayName = 'UnitFlowGraph';
