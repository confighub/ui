// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Collapse,
  IconButton,
  InputBase,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DataObjectIcon from '@mui/icons-material/DataObject';
import UndoIcon from '@mui/icons-material/Undo';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { AttributeValueItem, AttributeValueItemWithUnit } from './result-formatters';
import { UnitHeaderRow, UnitSlug, ChevronIcon, TagBadge } from '@/pages/x/apps/diffStyles';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import { NO_VALUE_LABEL } from '@/pages/x/apps/componentValues';

// ─────────────────────────────────────────────────────────────────────────────
// Tree node types
// ─────────────────────────────────────────────────────────────────────────────

/** Tree node for per-unit view (single value per leaf) */
interface UnitTreeNode {
  id: string;
  label: string;
  path: string[];
  value: unknown;
  exists: boolean;
  unitId: string;
  spaceId?: string;
  dataType?: string;
  children: UnitTreeNode[];
  type: 'object' | 'primitive';
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AttributeValueTreeComparisonProps {
  /** Flat items with unit metadata — replaces pivotRows + unitSlugs */
  items: AttributeValueItemWithUnit[];
  editable?: boolean;
  onSaveAttributes?: (
    unitId: string,
    spaceId: string,
    attributes: AttributeValueItem[],
    changeDescription: string,
  ) => Promise<void>;
}


// Edit key format: "unitSlug:nodeId"
type EditKey = string;

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function parseValue(stringValue: string, dataType?: string): unknown {
  if (stringValue === '') return undefined;
  if (stringValue === 'null') return null;

  switch (dataType?.toLowerCase()) {
    case 'number':
    case 'int':
    case 'integer':
    case 'float':
    case 'double': {
      const num = Number(stringValue);
      return isNaN(num) ? stringValue : num;
    }
    case 'boolean':
    case 'bool':
      if (stringValue.toLowerCase() === 'true') return true;
      if (stringValue.toLowerCase() === 'false') return false;
      return stringValue;
    case 'array':
    case 'object':
    case 'json':
      try { return JSON.parse(stringValue); } catch { return stringValue; }
    case 'string':
    default:
      return stringValue;
  }
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const index = lowerText.indexOf(lowerQuery);
  if (index === -1) return <>{text}</>;

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <>
      {before}
      <Box component="span" sx={{ backgroundColor: componentTheme.attentionMuted, fontWeight: 600 }}>{match}</Box>
      {after.includes(lowerQuery) ? <HighlightedText text={after} query={query} /> : after}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildTreeFromFlatItems — per-unit tree building
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups items by unitSlug and builds a tree per unit.
 * Returns a map of unitSlug → { unitId, spaceId, nodes }.
 */
export function buildTreeFromFlatItems(
  items: AttributeValueItemWithUnit[],
): Map<string, { unitId: string; spaceId?: string; nodes: UnitTreeNode[] }> {
  const result = new Map<string, { unitId: string; spaceId?: string; nodes: UnitTreeNode[] }>();

  // Group items by unitSlug, preserving first-seen order
  const groups = new Map<string, { unitId: string; spaceId?: string; items: AttributeValueItemWithUnit[] }>();
  for (const item of items) {
    if (!groups.has(item.unitSlug)) {
      groups.set(item.unitSlug, { unitId: item.unitId, spaceId: item.spaceId, items: [] });
    }
    groups.get(item.unitSlug)!.items.push(item);
  }

  for (const [unitSlug, group] of groups) {
    const nodes = buildUnitTree(group.items, unitSlug, group.unitId, group.spaceId);
    result.set(unitSlug, { unitId: group.unitId, spaceId: group.spaceId, nodes });
  }

  return result;
}

function buildUnitTree(
  items: AttributeValueItemWithUnit[],
  unitSlug: string,
  unitId: string,
  spaceId?: string,
): UnitTreeNode[] {
  const nodesByPath = new Map<string, UnitTreeNode>();
  const rootNodes: UnitTreeNode[] = [];

  for (const item of items) {
    const path = item.Path ? item.Path.split('.') : [];
    const attributeName = item.AttributeName || 'unknown';
    const fullPath = [...path, attributeName];
    const nodeId = `${unitSlug}:${fullPath.join('.')}`;

    const node: UnitTreeNode = {
      id: nodeId,
      label: attributeName,
      path: fullPath,
      value: item.Value,
      exists: item.Value !== undefined,
      unitId,
      spaceId,
      dataType: item.DataType,
      children: [],
      type: 'primitive',
    };

    nodesByPath.set(fullPath.join('.'), node);

    if (fullPath.length === 1) {
      rootNodes.push(node);
    } else {
      const parentPath = fullPath.slice(0, -1).join('.');
      const parent = nodesByPath.get(parentPath);
      if (parent) {
        parent.children.push(node);
        parent.type = 'object';
      } else {
        // Create placeholder parent nodes
        let currentPath: string[] = [];
        for (let i = 0; i < fullPath.length - 1; i++) {
          currentPath = [...currentPath, fullPath[i]];
          const pathKey = currentPath.join('.');
          if (!nodesByPath.has(pathKey)) {
            const placeholder: UnitTreeNode = {
              id: `${unitSlug}:${pathKey}`,
              label: fullPath[i],
              path: currentPath,
              value: undefined,
              exists: false,
              unitId,
              spaceId,
              children: [],
              type: 'object',
            };
            nodesByPath.set(pathKey, placeholder);
            if (currentPath.length === 1) {
              rootNodes.push(placeholder);
            } else {
              const grandParentPath = currentPath.slice(0, -1).join('.');
              nodesByPath.get(grandParentPath)?.children.push(placeholder);
            }
          }
        }
        const finalParent = nodesByPath.get(fullPath.slice(0, -1).join('.'));
        finalParent?.children.push(node);
        if (finalParent) finalParent.type = 'object';
      }
    }
  }

  return compressUnitTree(rootNodes);
}

function compressUnitTree(nodes: UnitTreeNode[]): UnitTreeNode[] {
  return nodes.map((node) => {
    const compressedChildren = compressUnitTree(node.children);
    if (
      node.type === 'object' &&
      !node.exists &&
      compressedChildren.length === 1
    ) {
      const onlyChild = compressedChildren[0];
      if (onlyChild.type === 'object' && !onlyChild.exists) {
        return { ...onlyChild, label: `${node.label}/${onlyChild.label}`, children: onlyChild.children };
      }
    }
    return { ...node, children: compressedChildren };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UnitTreeNodeComponent — renders a single node in a per-unit tree
// ─────────────────────────────────────────────────────────────────────────────

interface UnitTreeNodeComponentProps {
  node: UnitTreeNode;
  level: number;
  editable: boolean;
  editingKey: EditKey | null;
  pendingChanges: Map<EditKey, string>;
  searchQuery: string;
  onStartEdit: (key: EditKey) => void;
  onSaveEdit: (key: EditKey, newValue: string) => void;
  onCancelEdit: () => void;
  onUndo: (key: EditKey) => void;
  canUndo: (key: EditKey) => boolean;
}

function UnitTreeNodeComponent({
  node,
  level,
  editable,
  editingKey,
  pendingChanges,
  searchQuery,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onUndo,
  canUndo,
}: UnitTreeNodeComponentProps) {
  const [expanded, setExpanded] = useState(true);
  const [editValue, setEditValue] = useState('');

  const indent = level * 16;
  const isEditing = editingKey === node.id;
  const hasPendingChange = pendingChanges.has(node.id);
  const displayValue = hasPendingChange
    ? pendingChanges.get(node.id)!
    : formatValue(node.value);

  const handleEditClick = () => {
    const initialValue = node.value === undefined ? '' : formatValue(node.value);
    setEditValue(hasPendingChange ? pendingChanges.get(node.id)! : initialValue);
    onStartEdit(node.id);
  };

  const handleSave = () => {
    const originalFormatted = node.value === undefined ? '' : formatValue(node.value);
    if (editValue !== originalFormatted) {
      onSaveEdit(node.id, editValue);
    } else {
      onCancelEdit();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      onCancelEdit();
    }
  };

  if (node.type === 'object') {
    return (
      <Box>
        <Box
          onClick={() => setExpanded(!expanded)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: '2px',
            pl: `${indent + 4}px`,
            pr: 1,
            borderRadius: 0,
            cursor: 'pointer',
            '&:hover': { backgroundColor: componentTheme.bgSubtle },
          }}
        >
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            sx={{ p: 0.25, mr: 0.25 }}
          >
            {expanded ? <ExpandMoreIcon sx={{ fontSize: 14 }} /> : <ChevronRightIcon sx={{ fontSize: 14 }} />}
          </IconButton>
          <Typography
            sx={{
              fontSize: 11,
              fontFamily: componentTheme.fontSans,
              color: componentTheme.fgMuted,
              fontWeight: 500,
            }}
          >
            <HighlightedText text={node.label} query={searchQuery} />
          </Typography>
        </Box>
        <Collapse in={expanded} timeout="auto">
          <Box>
            {node.children.map((child) => (
              <UnitTreeNodeComponent
                key={child.id}
                node={child}
                level={level + 1}
                editable={editable}
                editingKey={editingKey}
                pendingChanges={pendingChanges}
                searchQuery={searchQuery}
                onStartEdit={onStartEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onUndo={onUndo}
                canUndo={canUndo}
              />
            ))}
          </Box>
        </Collapse>
      </Box>
    );
  }

  // Primitive leaf node
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        py: '2px',
        pl: `${indent + 4}px`,
        pr: 1,
        minHeight: 24,
        border: hasPendingChange ? `1px solid rgba(154,103,0,0.25)` : undefined,
        borderBottom: `1px solid ${componentTheme.borderSubtle}`,
        backgroundColor: hasPendingChange ? componentTheme.attentionMuted : 'transparent',
        '&:hover': { backgroundColor: hasPendingChange ? componentTheme.attentionMuted : componentTheme.bgSubtle },
      }}
    >
      {/* Spacer */}
      <Box sx={{ width: 20, flexShrink: 0 }} />

      {/* Icon */}
      <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <DataObjectIcon sx={{ fontSize: 12, color: componentTheme.fgSubtle }} />
      </Box>

      {/* Label */}
      <Typography
        sx={{
          minWidth: 120,
          maxWidth: 200,
          fontSize: 12,
          fontFamily: componentTheme.fontSans,
          color: componentTheme.fgDefault,
          flexShrink: 0,
          mr: 1.5,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <HighlightedText text={node.label} query={searchQuery} />
      </Typography>

      {/* Value */}
      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
        {isEditing ? (
          <>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                border: `1px solid ${componentTheme.attention}`,
                borderRadius: `${componentTheme.radiusSm}px`,
                '&:focus-within': { outline: `1px solid ${componentTheme.attention}`, outlineOffset: 0 },
                minHeight: 22,
                py: '2px',
                px: 0.5,
                flex: 1,
                maxWidth: 260,
                backgroundColor: componentTheme.bgDefault,
              }}
            >
              <InputBase
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                multiline
                sx={{
                  fontSize: 12,
                  fontFamily: componentTheme.fontMono,
                  color: componentTheme.attentionEmphasis,
                  flex: 1,
                  minWidth: 0,
                  // Grow to fit and wrap long values instead of overflowing.
                  '& textarea': { padding: 0, overflowWrap: 'anywhere' },
                  '& input': { padding: 0 },
                }}
              />
            </Box>
            <Box
              component="kbd"
              sx={{
                fontSize: 10,
                color: componentTheme.fgSubtle,
                fontFamily: componentTheme.fontMono,
                border: `1px solid ${componentTheme.borderDefault}`,
                borderRadius: `${componentTheme.radiusSm}px`,
                px: 0.5,
                lineHeight: '18px',
                flexShrink: 0,
              }}
            >
              ⏎
            </Box>
          </>
        ) : (
          <>
            <Typography
              onClick={() => { if (editable) handleEditClick(); }}
              sx={{
                fontSize: 12,
                fontFamily: componentTheme.fontMono,
                color: hasPendingChange ? componentTheme.attentionEmphasis : componentTheme.fgDefault,
                fontWeight: hasPendingChange ? 600 : 400,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                cursor: editable ? 'text' : 'default',
              }}
            >
              {displayValue || <Box component="span" sx={{ color: componentTheme.fgSubtle, fontStyle: 'italic' }}>{NO_VALUE_LABEL}</Box>}
            </Typography>

            {hasPendingChange && (
              <Typography
                sx={{
                  fontSize: 10,
                  fontFamily: componentTheme.fontSans,
                  color: componentTheme.attentionEmphasis,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                edited
              </Typography>
            )}

            {canUndo(node.id) && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onUndo(node.id); }}
                title="Undo"
                sx={{ p: 0.25, opacity: 0.7, '&:hover': { opacity: 1 } }}
              >
                <UndoIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}

            {node.dataType && (
              <TagBadge sx={{ flexShrink: 0 }}>{node.dataType}</TagBadge>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AttributeValueTreeComparison — main component
// ─────────────────────────────────────────────────────────────────────────────

export function AttributeValueTreeComparison({
  items,
  editable = false,
  onSaveAttributes,
}: AttributeValueTreeComparisonProps) {
  const [editingKey, setEditingKey] = useState<EditKey | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<EditKey, string>>(new Map());
  const [undoStack, setUndoStack] = useState<{ key: EditKey; previousValue: string | undefined }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unitExpanded, setUnitExpanded] = useState<Record<string, boolean>>({});

  // Build per-unit trees
  const unitTrees = useMemo(() => buildTreeFromFlatItems(items), [items]);

  // Ordered list of unit slugs
  const unitOrder = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const item of items) {
      if (!seen.has(item.unitSlug)) {
        seen.add(item.unitSlug);
        order.push(item.unitSlug);
      }
    }
    return order;
  }, [items]);

  const isUnitExpanded = useCallback(
    (unitSlug: string) => unitExpanded[unitSlug] ?? true,
    [unitExpanded],
  );

  const toggleUnit = useCallback((unitSlug: string) => {
    setUnitExpanded((prev) => ({ ...prev, [unitSlug]: !(prev[unitSlug] ?? true) }));
  }, []);

  // Filter nodes by search query
  const matchesSearch = useCallback(
    (node: UnitTreeNode): boolean => {
      const query = searchQuery.toLowerCase();
      if (!query) return true;
      if (node.path.join('.').toLowerCase().includes(query)) return true;
      if (node.label.toLowerCase().includes(query)) return true;
      if (String(node.value ?? '').toLowerCase().includes(query)) return true;
      return node.children.some(matchesSearch);
    },
    [searchQuery],
  );

  const filterTree = useCallback(
    (nodes: UnitTreeNode[]): UnitTreeNode[] => {
      return nodes
        .map((node) => {
          if (matchesSearch(node)) return node;
          const filteredChildren = filterTree(node.children);
          if (filteredChildren.length > 0) return { ...node, children: filteredChildren };
          return null;
        })
        .filter((node): node is UnitTreeNode => node !== null);
    },
    [matchesSearch],
  );

  const handleStartEdit = useCallback((key: EditKey) => {
    setEditingKey(key);
  }, []);

  const handleSaveEdit = useCallback((key: EditKey, newValue: string) => {
    // Store undefined when there was no prior pending change so we can distinguish
    // "no prior change" from a legitimate empty-string pending value on undo.
    const previousValue = pendingChanges.has(key) ? pendingChanges.get(key) : undefined;
    setUndoStack((prev) => [...prev, { key, previousValue }]);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.set(key, newValue);
      return next;
    });
    setEditingKey(null);
  }, [pendingChanges]);

  const handleCancelEdit = useCallback(() => {
    setEditingKey(null);
  }, []);

  const handleUndo = useCallback((key: EditKey) => {
    // Find the last undo stack entry for this key
    const idx = [...undoStack].reverse().findIndex((e) => e.key === key);
    if (idx === -1) return;
    const actualIdx = undoStack.length - 1 - idx;
    const entry = undoStack[actualIdx];

    setUndoStack((prev) => prev.filter((_, i) => i !== actualIdx));
    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (entry.previousValue === undefined) {
        // No prior pending change existed — remove the key entirely to restore original
        next.delete(key);
      } else {
        next.set(key, entry.previousValue);
      }
      return next;
    });
  }, [undoStack]);

  const canUndo = useCallback(
    (key: EditKey) => undoStack.some((e) => e.key === key),
    [undoStack],
  );

  const handleDiscardAll = useCallback(() => {
    setPendingChanges(new Map());
    setUndoStack([]);
    setEditingKey(null);
  }, []);

  const hasPendingChanges = pendingChanges.size > 0;

  // Group pending changes by unit and save
  const handleSaveAll = useCallback(async () => {
    if (!onSaveAttributes || pendingChanges.size === 0) return;

    setIsSaving(true);
    try {
      // For each unit that has pending changes, collect all attributes
      const changesByUnit = new Map<string, { unitId: string; spaceId: string; attributes: AttributeValueItem[] }>();

      for (const [editKey] of pendingChanges) {
        // editKey format: "unitSlug:pathSegments.attributeName"
        // We need to figure out which unit slug this belongs to
        for (const unitSlug of unitOrder) {
          // Use exact slug extraction (split on first ':') rather than startsWith so
          // a slug like 'my-service' never accidentally matches 'my-service-v2:attr'
          // when an attribute path itself contains a colon.
          const colonIdx = editKey.indexOf(':');
          if (colonIdx === -1 || editKey.slice(0, colonIdx) !== unitSlug) continue;

          const unitTree = unitTrees.get(unitSlug);
          if (!unitTree) continue;

          const unitKey = `${unitTree.unitId}:${unitTree.spaceId ?? ''}`;
          if (!changesByUnit.has(unitKey)) {
            // Build attribute list for this unit (applying all pending changes)
            const unitItems = items.filter((item) => item.unitSlug === unitSlug);
            const attributes: AttributeValueItem[] = unitItems.map((item) => {
              const path = item.Path ? item.Path.split('.') : [];
              const fullPath = [...path, item.AttributeName || 'unknown'];
              const nodeId = `${unitSlug}:${fullPath.join('.')}`;
              const hasPending = pendingChanges.has(nodeId);
              const value = hasPending
                ? parseValue(pendingChanges.get(nodeId)!, item.DataType)
                : item.Value;
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { unitSlug: _slug, unitId: _uid, spaceId: _sid, ...baseAttr } = item;
              return { ...baseAttr, Value: value };
            });

            changesByUnit.set(unitKey, {
              unitId: unitTree.unitId,
              spaceId: unitTree.spaceId ?? '',
              attributes,
            });
          }
          break;
        }
      }

      const changeCount = pendingChanges.size;
      const changeDescription = `Updated ${changeCount} attribute${changeCount > 1 ? 's' : ''} via tree view`;

      await Promise.all(
        Array.from(changesByUnit.values()).map(({ unitId, spaceId, attributes }) =>
          onSaveAttributes(unitId, spaceId, attributes, changeDescription),
        ),
      );

      setPendingChanges(new Map());
      setUndoStack([]);
      setEditingKey(null);
    } catch (error) {
      console.error('Failed to save tree changes:', error);
    } finally {
      setIsSaving(false);
    }
  }, [onSaveAttributes, pendingChanges, items, unitOrder, unitTrees]);

  if (items.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted }}>
          No attributes to display
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Toolbar */}
      <Box
        sx={{
          mb: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        {/* Left: counts */}
        <Typography sx={{ fontSize: 11, fontFamily: componentTheme.fontSans, color: componentTheme.fgSubtle }}>
          {items.length} attribute{items.length !== 1 ? 's' : ''} · {unitOrder.length} unit{unitOrder.length !== 1 ? 's' : ''}
        </Typography>

        {/* Right: search + actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Search input */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              border: `1px solid ${componentTheme.borderDefault}`,
              borderRadius: `${componentTheme.radiusSm}px`,
              height: 28,
              px: 1,
              backgroundColor: componentTheme.bgDefault,
              '&:focus-within': {
                borderColor: componentTheme.accent,
                outline: `2px solid ${componentTheme.accentFocusRing}`,
                outlineOffset: 0,
              },
            }}
          >
            <SearchIcon sx={{ fontSize: 14, color: componentTheme.fgSubtle, mr: 0.5 }} />
            <InputBase
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              sx={{
                fontSize: 12,
                fontFamily: componentTheme.fontSans,
                width: 160,
                '& input': { padding: 0 },
              }}
            />
            {searchQuery && (
              <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.25 }}>
                <ClearIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>

          {/* Save / Discard — only when pending changes exist */}
          {hasPendingChanges && (
            <>
              <Box
                component="button"
                onClick={!isSaving ? handleSaveAll : undefined}
                disabled={isSaving}
                sx={{
                  height: 28,
                  px: 1.5,
                  borderRadius: `${componentTheme.radiusSm}px`,
                  border: 'none',
                  backgroundColor: componentTheme.accent,
                  color: componentTheme.fgOnEmphasis,
                  fontSize: 12,
                  fontFamily: componentTheme.fontSans,
                  fontWeight: 500,
                  cursor: isSaving ? 'default' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  '&:hover': { backgroundColor: componentTheme.accentEmphasis },
                }}
              >
                {isSaving ? 'Saving…' : `Save (${pendingChanges.size})`}
              </Box>
              <Box
                component="button"
                onClick={handleDiscardAll}
                disabled={isSaving}
                sx={{
                  height: 28,
                  px: 1.5,
                  borderRadius: `${componentTheme.radiusSm}px`,
                  border: `1px solid ${componentTheme.borderDefault}`,
                  backgroundColor: componentTheme.bgDefault,
                  color: componentTheme.fgMuted,
                  fontSize: 12,
                  fontFamily: componentTheme.fontSans,
                  fontWeight: 500,
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: componentTheme.bgSubtle },
                }}
              >
                Discard
              </Box>
            </>
          )}
        </Box>
      </Box>

      {/* Per-unit tree blocks */}
      <Box
        sx={{
          backgroundColor: componentTheme.bgDefault,
          maxHeight: 600,
          overflowY: 'auto',
        }}
      >
        {unitOrder.map((unitSlug) => {
          const unitTree = unitTrees.get(unitSlug);
          if (!unitTree) return null;

          const filteredNodes = filterTree(unitTree.nodes);
          if (searchQuery && filteredNodes.length === 0) return null;

          const pendingCount = Array.from(pendingChanges.keys()).filter((k) => {
            const idx = k.indexOf(':');
            return idx !== -1 && k.slice(0, idx) === unitSlug;
          }).length;
          const expanded = isUnitExpanded(unitSlug);

          return (
            <Box key={unitSlug}>
              <UnitHeaderRow
                sx={{ borderLeft: 'none', background: 'transparent', '&:hover': { background: componentTheme.bgSubtle } }}
                onClick={() => toggleUnit(unitSlug)}
              >
                <ChevronIcon $expanded={expanded}>
                  <ChevronRightIcon />
                </ChevronIcon>
                {unitTree.unitId && unitTree.spaceId ? (
                  <UnitSlug
                    href={`/units/${unitTree.spaceId}/${unitTree.unitId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {unitSlug}
                  </UnitSlug>
                ) : (
                  <Typography
                    sx={{
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: componentTheme.fontMono,
                      color: componentTheme.fgDefault,
                    }}
                  >
                    {unitSlug}
                  </Typography>
                )}
                {pendingCount > 0 && (
                  <TagBadge sx={{ ml: 'auto' }}>{pendingCount} pending</TagBadge>
                )}
              </UnitHeaderRow>

              <Collapse in={expanded} timeout="auto">
                <Box sx={{ py: 0.5 }}>
                  {filteredNodes.length === 0 ? (
                    <Box sx={{ p: 2, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: 12, color: componentTheme.fgSubtle }}>
                        No matching attributes
                      </Typography>
                    </Box>
                  ) : (
                    filteredNodes.map((node) => (
                      <UnitTreeNodeComponent
                        key={node.id}
                        node={node}
                        level={0}
                        editable={editable}
                        editingKey={editingKey}
                        pendingChanges={pendingChanges}
                        searchQuery={searchQuery}
                        onStartEdit={handleStartEdit}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onUndo={handleUndo}
                        canUndo={canUndo}
                      />
                    ))
                  )}
                </Box>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

