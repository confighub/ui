// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import {
  Box,
  IconButton,
  InputBase,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { DataGrid, GridColDef } from '@mui/x-data-grid';
import { useCallback, useMemo, useState } from 'react';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import { AttributeValueItem, AttributeValueItemWithUnit } from './result-formatters';
import { TagBadge } from '@/pages/x/apps/diffStyles';
import { componentTheme } from '@/pages/x/apps/componentTheme';
import { DiffInline } from './DiffInline';

export type AttributeValueRowWithId = (AttributeValueItem | AttributeValueItemWithUnit) & { id: number };

interface AttributeValueDataGridProps {
  attributeValues: (AttributeValueItem | AttributeValueItemWithUnit)[];
  editable?: boolean;
  editingIndex: number | null;
  pendingChanges: Map<number, unknown>;
  undoStack: { index: number; previousValue: unknown }[];
  onStartEdit: (index: number) => void;
  onSaveEdit: (index: number, newValue: unknown) => void;
  onCancelEdit: () => void;
  onUndo: () => void;
  /** Show unit column (for combined flat view) */
  showUnitColumn?: boolean;
}

/** Helper to check if item has unit info */
const hasUnitInfo = (item: AttributeValueItem | AttributeValueItemWithUnit): item is AttributeValueItemWithUnit => {
  return 'unitSlug' in item;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const AttributeValueDataGrid = ({
  attributeValues,
  editable = false,
  editingIndex,
  pendingChanges,
  undoStack,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onUndo,
  showUnitColumn = false,
}: AttributeValueDataGridProps) => {
  const rows: AttributeValueRowWithId[] = useMemo(
    () => attributeValues.map((item, idx) => ({ ...item, id: idx })),
    [attributeValues],
  );

  const getDisplayValue = useCallback(
    (idx: number, originalValue: unknown) => {
      if (pendingChanges.has(idx)) return formatValue(pendingChanges.get(idx));
      return formatValue(originalValue);
    },
    [pendingChanges],
  );

  const columns: GridColDef<AttributeValueRowWithId>[] = useMemo(() => {
    const cols: GridColDef<AttributeValueRowWithId>[] = [];

    if (showUnitColumn) {
      cols.push({
        field: 'unitSlug',
        headerName: 'Unit',
        flex: 1,
        minWidth: 110,
        resizable: true,
        valueGetter: (_value, row) => (hasUnitInfo(row) ? row.unitSlug : '-'),
        renderCell: (params) => (
          <Typography
            variant="body2"
            sx={{ fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgDefault, fontWeight: 500 }}
          >
            {params.value}
          </Typography>
        ),
      });
    }

    cols.push(
      {
        field: 'Resource',
        headerName: 'Resource',
        flex: 1,
        minWidth: 100,
        resizable: true,
        valueGetter: (_value, row) => {
          const parts: string[] = [];
          if (row.ResourceType) parts.push(row.ResourceType);
          if (row.ResourceName) parts.push(row.ResourceName);
          if (row.ResourceIndex !== undefined) parts.push(`[${row.ResourceIndex}]`);
          return parts.length > 0 ? parts.join(' ') : '-';
        },
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgMuted }}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: 'Path',
        headerName: 'Path',
        flex: 1,
        minWidth: 100,
        resizable: true,
        renderCell: (params) => (
          <Typography variant="body2" sx={{ fontSize: 12, fontFamily: componentTheme.fontMono, color: componentTheme.fgMuted }}>
            {params.value || '-'}
          </Typography>
        ),
      },
      {
        field: 'AttributeName',
        headerName: 'Attribute',
        width: 130,
        resizable: true,
        renderCell: (params) => (
          <Typography variant="body2" fontWeight={500} sx={{ fontSize: 12, fontFamily: componentTheme.fontSans, color: componentTheme.fgDefault }}>
            {params.value || '-'}
          </Typography>
        ),
      },
      {
        field: 'Value',
        headerName: 'Value',
        flex: 2,
        minWidth: 140,
        resizable: true,
        valueGetter: (_value, row) => getDisplayValue(row.id, row.Value),
        renderCell: (params) => {
          const row = params.row;
          const idx = row.id;
          const isEditing = editingIndex === idx;
          const hasChange = pendingChanges.has(idx);
          const canUndoThis = undoStack.some((e) => e.index === idx);
          const originalDisplay = formatValue(row.Value);
          const currentDisplay = getDisplayValue(idx, row.Value);

          if (isEditing) {
            return (
              <InlineValueEditor
                value={pendingChanges.has(idx) ? pendingChanges.get(idx) : row.Value}
                dataType={row.DataType || 'string'}
                onSave={(newValue) => onSaveEdit(idx, newValue)}
                onCancel={onCancelEdit}
              />
            );
          }

          if (editable) {
            return (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  width: '100%',
                  '&:hover .edit-icon': { opacity: 1 },
                  px: 0.5,
                  backgroundColor: hasChange ? componentTheme.attentionMuted : 'transparent',
                }}
              >
                <Box
                  onClick={(e) => { e.stopPropagation(); onStartEdit(idx); }}
                  sx={{
                    flex: 1,
                    cursor: 'pointer',
                    fontFamily: componentTheme.fontMono,
                    fontSize: 12,
                    color: hasChange ? componentTheme.attentionEmphasis : componentTheme.fgDefault,
                    fontWeight: hasChange ? 600 : 400,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hasChange ? (
                    <DiffInline oldValue={originalDisplay} newValue={currentDisplay} />
                  ) : (
                    params.value
                  )}
                </Box>
                {canUndoThis && (
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); onUndo(); }} title="Undo" sx={{ p: 0.25 }}>
                    <UndoIcon sx={{ fontSize: 14 }} />
                  </IconButton>
                )}
                <EditOutlinedIcon
                  className="edit-icon"
                  onClick={(e) => { e.stopPropagation(); onStartEdit(idx); }}
                  sx={{ fontSize: 14, color: componentTheme.fgMuted, opacity: hasChange ? 1 : 0, cursor: 'pointer' }}
                />
              </Box>
            );
          }

          return (
            <Typography
              variant="body2"
              sx={{ fontSize: 12, fontFamily: componentTheme.fontMono, color: componentTheme.fgDefault, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {params.value}
            </Typography>
          );
        },
      },
      {
        field: 'DataType',
        headerName: 'Type',
        width: 80,
        resizable: true,
        renderCell: (params) => <TagBadge sx={{ borderRadius: '100px' }}>{params.value || 'unknown'}</TagBadge>,
      },
    );

    return cols;
  }, [showUnitColumn, editable, editingIndex, pendingChanges, undoStack, getDisplayValue, onStartEdit, onSaveEdit, onCancelEdit, onUndo]);

  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid
        rows={rows}
        columns={columns}
        autoHeight
        rowHeight={32}
        columnHeaderHeight={32}
        disableRowSelectionOnClick
        hideFooter={rows.length <= 10}
        pageSizeOptions={[10, 25, 50]}
        initialState={{
          pagination: { paginationModel: { pageSize: 10 } },
        }}
        sx={{
          border: `1px solid ${componentTheme.borderDefault}`,
          borderRadius: 0,
          fontSize: 12,
          fontFamily: componentTheme.fontSans,
          '& .MuiDataGrid-columnHeaders': {
            background: componentTheme.bgDefault,
            borderBottom: `1px solid ${componentTheme.borderDefault}`,
          },
          '& .MuiDataGrid-columnHeaderTitle': {
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: componentTheme.fgSubtle,
          },
          '& .MuiDataGrid-row': {
            '&:hover': { background: componentTheme.bgSubtle },
          },
          '& .MuiDataGrid-cell': {
            borderBottom: `1px solid ${componentTheme.borderSubtle}`,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
          },
        }}
      />
    </Box>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// InlineValueEditor
// ─────────────────────────────────────────────────────────────────────────────

interface InlineValueEditorProps {
  value: unknown;
  dataType: string;
  onSave: (newValue: unknown) => void;
  onCancel: () => void;
}

const InlineValueEditor = ({ value, dataType, onSave, onCancel }: InlineValueEditorProps) => {
  const parseValue = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val, null, 2);
    return String(val);
  };

  const convertValue = (val: string): unknown => {
    const trimmed = val.trim();
    const dt = dataType.toLowerCase();
    if (dt === 'int' || dt === 'integer' || dt === 'number') return parseInt(trimmed, 10);
    if (dt === 'float' || dt === 'double') return parseFloat(trimmed);
    if (dt === 'bool' || dt === 'boolean') return trimmed.toLowerCase() === 'true';
    if (dt === 'object' || dt === 'json') {
      try { return JSON.parse(trimmed); } catch { return trimmed; }
    }
    return trimmed;
  };

  const [editValue, setEditValue] = useState(parseValue(value));
  const isBoolean = dataType.toLowerCase() === 'bool' || dataType.toLowerCase() === 'boolean';

  const handleSave = () => onSave(convertValue(editValue));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
    else if (e.key === 'Escape') { onCancel(); }
  };

  if (isBoolean) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <ToggleButtonGroup
          value={editValue}
          exclusive
          onChange={(_, v) => { if (v !== null) setEditValue(v); }}
          size="small"
        >
          <ToggleButton value="true">True</ToggleButton>
          <ToggleButton value="false">False</ToggleButton>
        </ToggleButtonGroup>
        <IconButton size="small" onClick={handleSave} color="primary"><CheckIcon fontSize="small" /></IconButton>
        <IconButton size="small" onClick={onCancel}><CloseIcon fontSize="small" /></IconButton>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          border: `1px solid ${componentTheme.attention}`,
          borderRadius: `${componentTheme.radiusSm}px`,
          '&:focus-within': { outline: `1px solid ${componentTheme.attention}`, outlineOffset: 0 },
          height: 24,
          px: 0.5,
          flex: 1,
          minWidth: 80,
          backgroundColor: componentTheme.bgDefault,
        }}
      >
        <InputBase
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          type={dataType.toLowerCase() === 'int' || dataType.toLowerCase() === 'integer' ? 'number' : 'text'}
          sx={{
            fontSize: 12,
            fontFamily: componentTheme.fontMono,
            color: componentTheme.attentionEmphasis,
            flex: 1,
            '& input': { padding: 0 },
          }}
        />
      </Box>
      <IconButton size="small" onClick={handleSave} color="primary"><CheckIcon fontSize="small" /></IconButton>
      <IconButton size="small" onClick={onCancel}><CloseIcon fontSize="small" /></IconButton>
    </Box>
  );
};
