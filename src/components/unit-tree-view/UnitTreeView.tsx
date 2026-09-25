// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MiniMap,
  Node,
  NodeTypes,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import {
  ExtendedLinkRead,
  ExtendedUnitRead,
  useLazySearchListLinksQuery,
} from '@confighub/rtk-query';
import { Alert, Box, CircularProgress, styled } from '@mui/material';

import { UnitTreeNode } from './UnitTreeNode';

const FlowContainer = styled(Box)`
  width: 100%;
  height: 600px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
  border-radius: 4px;
`;

export type EdgeType = 'clone' | 'link';
export type NodeDisplayType = 'unit' | 'space';

interface UnitTreeViewProps {
  units: ExtendedUnitRead[];
  edgeType: EdgeType;
  nodeType: NodeDisplayType;
  isLoading?: boolean;
}

interface TreeNode {
  unit: ExtendedUnitRead;
  children: TreeNode[];
}

// Dagre layout configuration
const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;
const RANK_SEP = 100;
const NODE_SEP = 50;

const nodeTypes: NodeTypes = {
  unitNode: UnitTreeNode,
};

function UnitTreeViewInner({
  units,
  edgeType,
  nodeType,
  isLoading = false,
}: UnitTreeViewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [error, setError] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  const [fetchLinks] = useLazySearchListLinksQuery();

  // Build tree structure based on edge type
  const buildTree = useCallback(
    async (units: ExtendedUnitRead[]): Promise<TreeNode[]> => {
      if (edgeType === 'clone') {
        return buildCloneTree(units);
      } else {
        return buildLinkTree(units);
      }
    },
    [edgeType],
  );

  // Build clone tree (based on UpstreamUnitID)
  const buildCloneTree = (units: ExtendedUnitRead[]): TreeNode[] => {
    const unitMap = new Map<string, TreeNode>();
    const rootNodes: TreeNode[] = [];

    // First pass: create all nodes
    units.forEach((unit) => {
      if (unit.Unit?.UnitID) {
        unitMap.set(unit.Unit.UnitID, {
          unit,
          children: [],
        });
      }
    });

    // Second pass: establish parent-child relationships
    units.forEach((unit) => {
      if (!unit.Unit?.UnitID) return;

      const node = unitMap.get(unit.Unit.UnitID);
      if (!node) return;

      // Check if this unit has an upstream unit (parent)
      if (unit.Unit.UpstreamUnitID) {
        const parentNode = unitMap.get(unit.Unit.UpstreamUnitID);
        if (parentNode) {
          // This unit has a parent in our dataset
          parentNode.children.push(node);
        } else {
          // Parent not in dataset, treat as root
          rootNodes.push(node);
        }
      } else {
        // No upstream unit, it's a root
        rootNodes.push(node);
      }
    });

    return rootNodes;
  };

  // Build link tree (based on Link relationships)
  const buildLinkTree = async (units: ExtendedUnitRead[]): Promise<TreeNode[]> => {
    const unitMap = new Map<string, TreeNode>();
    const unitIDs = units
      .map((u) => u.Unit?.UnitID)
      .filter((id): id is string => !!id);

    // Create all nodes
    units.forEach((unit) => {
      if (unit.Unit?.UnitID) {
        unitMap.set(unit.Unit.UnitID, {
          unit,
          children: [],
        });
      }
    });

    if (unitIDs.length === 0) {
      return [];
    }

    try {
      // Fetch links where units are FromUnit
      const fromWhere = `FromUnitID IN ('${unitIDs.join("','")}')`;
      const fromLinksResult = await fetchLinks({
        where: fromWhere,
        include: 'FromUnitID,ToUnitID',
      });

      // Fetch links where units are ToUnit
      const toWhere = `ToUnitID IN ('${unitIDs.join("','")}')`;
      const toLinksResult = await fetchLinks({
        where: toWhere,
        include: 'FromUnitID,ToUnitID',
      });

      // Combine and deduplicate links
      const linkMap = new Map<string, ExtendedLinkRead>();
      [...(fromLinksResult.data || []), ...(toLinksResult.data || [])].forEach(
        (link) => {
          if (link.Link?.LinkID) {
            linkMap.set(link.Link.LinkID, link);
          }
        },
      );

      // Build parent-child relationships based on links
      // FromUnit is parent, ToUnit is child
      linkMap.forEach((link) => {
        const fromUnitID = link.Link?.FromUnitID;
        const toUnitID = link.Link?.ToUnitID;

        if (fromUnitID && toUnitID) {
          const parentNode = unitMap.get(fromUnitID);
          const childNode = unitMap.get(toUnitID);

          if (parentNode && childNode) {
            parentNode.children.push(childNode);
          }
        }
      });
    } catch (err) {
      setError(
        `Failed to fetch links: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
      return [];
    }

    // Find root nodes (nodes with no parents)
    const rootNodes: TreeNode[] = [];
    const childSet = new Set<string>();

    // Mark all children
    unitMap.forEach((node) => {
      node.children.forEach((child) => {
        if (child.unit.Unit?.UnitID) {
          childSet.add(child.unit.Unit.UnitID);
        }
      });
    });

    // Roots are nodes not in the child set
    unitMap.forEach((node) => {
      if (node.unit.Unit?.UnitID && !childSet.has(node.unit.Unit.UnitID)) {
        rootNodes.push(node);
      }
    });

    return rootNodes;
  };

  // Convert tree to React Flow nodes and edges
  const convertTreeToFlow = useCallback(
    (tree: TreeNode[]): { nodes: Node[]; edges: Edge[] } => {
      // Space mode: aggregate all units into one node per unique space
      if (nodeType === 'space') {
        const spaceMap = new Map<string, ExtendedUnitRead[]>();
        const interSpaceEdges = new Set<string>();

        const walkForSpaces = (treeNode: TreeNode, parentSpaceSlug?: string) => {
          const spaceSlug = treeNode.unit.Space?.Slug || 'unknown-space';
          if (!spaceMap.has(spaceSlug)) {
            spaceMap.set(spaceSlug, []);
          }
          spaceMap.get(spaceSlug)!.push(treeNode.unit);

          if (parentSpaceSlug && parentSpaceSlug !== spaceSlug) {
            interSpaceEdges.add(`${parentSpaceSlug}||${spaceSlug}`);
          }

          treeNode.children.forEach((child) => walkForSpaces(child, spaceSlug));
        };

        tree.forEach((root) => walkForSpaces(root));

        // Build adjacency lists for hierarchical layout
        const spaceChildren = new Map<string, Set<string>>();
        const spaceParents = new Map<string, Set<string>>();
        for (const slug of spaceMap.keys()) {
          spaceChildren.set(slug, new Set());
          spaceParents.set(slug, new Set());
        }
        interSpaceEdges.forEach((edgeKey) => {
          const sep = edgeKey.indexOf('||');
          const from = edgeKey.slice(0, sep);
          const to = edgeKey.slice(sep + 2);
          spaceChildren.get(from)?.add(to);
          spaceParents.get(to)?.add(from);
        });

        // Assign depth levels via Kahn's topological sort (longest-path variant)
        // so parent spaces are always above their children
        const levels = new Map<string, number>();
        const inDegree = new Map<string, number>();
        for (const slug of spaceMap.keys()) {
          inDegree.set(slug, spaceParents.get(slug)!.size);
          levels.set(slug, 0);
        }
        const topoQueue = [...spaceMap.keys()].filter((s) => inDegree.get(s) === 0);
        while (topoQueue.length > 0) {
          const slug = topoQueue.shift()!;
          const currentLevel = levels.get(slug)!;
          spaceChildren.get(slug)?.forEach((child) => {
            // Longest path: child is at least one level below its deepest parent
            levels.set(child, Math.max(levels.get(child)!, currentLevel + 1));
            const remaining = (inDegree.get(child) ?? 1) - 1;
            inDegree.set(child, remaining);
            if (remaining === 0) topoQueue.push(child);
          });
        }

        // Group spaces by level so we can centre each row horizontally
        const levelGroups = new Map<number, string[]>();
        levels.forEach((level, slug) => {
          if (!levelGroups.has(level)) levelGroups.set(level, []);
          levelGroups.get(level)!.push(slug);
        });

        const spaceNodes: Node[] = [];
        const spaceEdges: Edge[] = [];

        levelGroups.forEach((slugsAtLevel, level) => {
          const rowWidth = slugsAtLevel.length * (NODE_WIDTH + NODE_SEP * 2);
          let x = -rowWidth / 2 + NODE_WIDTH / 2;
          const y = level * (NODE_HEIGHT + RANK_SEP);

          slugsAtLevel.forEach((slug) => {
            const units = spaceMap.get(slug)!;
            // Pick the unit with the worst status as the representative for status indicators
            const representative = units.reduce((worst, u) => {
              const hasGates = u.Unit?.ValidationErrors && Object.keys(u.Unit.ValidationErrors).length > 0;
              const worstHasGates = worst.Unit?.ValidationErrors && Object.keys(worst.Unit.ValidationErrors).length > 0;
              if (hasGates) return u;
              if (worstHasGates) return worst;
              const needsUpgrade =
                u.Unit?.UpstreamUnitID &&
                u.Unit.UpstreamRevisionNum !== undefined &&
                u.UpstreamUnit?.HeadRevisionNum !== undefined &&
                u.Unit.UpstreamRevisionNum !== u.UpstreamUnit.HeadRevisionNum;
              if (needsUpgrade) return u;
              return worst;
            }, units[0]);

            spaceNodes.push({
              id: `space-${slug}`,
              type: 'unitNode',
              position: { x, y },
              data: {
                label: slug,
                sublabel: `${units.length} unit${units.length !== 1 ? 's' : ''}`,
                unit: representative,
                nodeType: 'space',
              },
              sourcePosition: Position.Bottom,
              targetPosition: Position.Top,
            });
            x += NODE_WIDTH + NODE_SEP * 2;
          });
        });

        interSpaceEdges.forEach((edgeKey) => {
          const separatorIndex = edgeKey.indexOf('||');
          const fromSlug = edgeKey.slice(0, separatorIndex);
          const toSlug = edgeKey.slice(separatorIndex + 2);
          spaceEdges.push({
            id: `space-edge-${edgeKey}`,
            source: `space-${fromSlug}`,
            target: `space-${toSlug}`,
            type: 'smoothstep',
            animated: edgeType === 'link',
            label: edgeType === 'clone' ? 'clones' : 'links to',
            style: { stroke: edgeType === 'clone' ? '#3b82f6' : '#10b981' },
          });
        });

        return { nodes: spaceNodes, edges: spaceEdges };
      }

      // Unit mode: one node per unit
      const nodes: Node[] = [];
      const edges: Edge[] = [];
      const visited = new Set<string>();

      let nodeId = 0;
      const processNode = (
        treeNode: TreeNode,
        x: number,
        y: number,
        parentId?: string,
      ) => {
        const unitId = treeNode.unit.Unit?.UnitID;
        if (!unitId || visited.has(unitId)) return;

        visited.add(unitId);
        const currentNodeId = `node-${nodeId++}`;

        nodes.push({
          id: currentNodeId,
          type: 'unitNode',
          position: { x, y },
          data: {
            label: treeNode.unit.Unit?.Slug || '',
            sublabel: treeNode.unit.Space?.Slug || 'unknown-space',
            unit: treeNode.unit,
            nodeType,
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
        });

        if (parentId) {
          edges.push({
            id: `edge-${parentId}-${currentNodeId}`,
            source: parentId,
            target: currentNodeId,
            type: 'smoothstep',
            animated: edgeType === 'link',
            label: edgeType === 'clone' ? 'clones' : 'links to',
            style: { stroke: edgeType === 'clone' ? '#3b82f6' : '#10b981' },
          });
        }

        const childCount = treeNode.children.length;
        const totalWidth = childCount * (NODE_WIDTH + NODE_SEP);
        let childX = x - totalWidth / 2 + NODE_WIDTH / 2;
        const childY = y + NODE_HEIGHT + RANK_SEP;

        treeNode.children.forEach((child) => {
          processNode(child, childX, childY, currentNodeId);
          childX += NODE_WIDTH + NODE_SEP;
        });
      };

      const rootCount = tree.length;
      const totalWidth = rootCount * (NODE_WIDTH + NODE_SEP * 2);
      let rootX = -totalWidth / 2 + NODE_WIDTH / 2;

      tree.forEach((root) => {
        processNode(root, rootX, 0);
        rootX += NODE_WIDTH + NODE_SEP * 2;
      });

      return { nodes, edges };
    },
    [nodeType, edgeType],
  );

  // Build and layout the tree
  useEffect(() => {
    const layoutTree = async () => {
      setError(null);
      try {
        const tree = await buildTree(units);
        const { nodes: flowNodes, edges: flowEdges } = convertTreeToFlow(tree);
        setNodes(flowNodes);
        setEdges(flowEdges);

        // Fit view after a short delay to ensure nodes are rendered
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 300 });
        }, 100);
      } catch (err) {
        setError(
          `Failed to build tree: ${err instanceof Error ? err.message : 'Unknown error'}`,
        );
      }
    };

    layoutTree();
  }, [units, buildTree, convertTreeToFlow, setNodes, setEdges, fitView]);

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    );
  }

  if (isLoading && nodes.length === 0) {
    return (
      <FlowContainer sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </FlowContainer>
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
        nodesDraggable={false}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </FlowContainer>
  );
}

export const UnitTreeView = (props: UnitTreeViewProps) => {
  return (
    <ReactFlowProvider>
      <UnitTreeViewInner {...props} />
    </ReactFlowProvider>
  );
};
