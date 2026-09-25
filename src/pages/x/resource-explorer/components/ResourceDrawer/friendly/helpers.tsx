// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

import { ReactNode, useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

/**
 * Shared building blocks for the friendly resource views shown in the
 * ResourceDrawer Overview tab. All views render *desired state* (the YAML
 * stored in ConfigHub) — there is no runtime status to display, so every
 * field here comes from the document itself and may be absent.
 */

/** A titled group of fields within a friendly view. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography
        variant='overline'
        color='text.secondary'
        sx={{ display: 'block', lineHeight: 2, letterSpacing: '0.08em' }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

export interface FieldEntry {
  label: string;
  value: ReactNode;
}

/**
 * Label/value rows. Entries whose value is null/undefined/'' are dropped so
 * callers can list every potentially-interesting field without emptiness
 * checks at each call site.
 */
export function FieldList({ fields }: { fields: Array<FieldEntry | null> }) {
  const visible = fields.filter(
    (f): f is FieldEntry => f !== null && f.value !== undefined && f.value !== '',
  );
  if (visible.length === 0) return null;
  return (
    <Stack spacing={0.75}>
      {visible.map((f) => (
        <Stack key={f.label} direction='row' spacing={1} alignItems='baseline'>
          <Typography
            variant='caption'
            color='text.secondary'
            sx={{ minWidth: 140, flexShrink: 0 }}
          >
            {f.label}
          </Typography>
          <Box sx={{ minWidth: 0, fontSize: '0.8rem' }}>{renderValue(f.value)}</Box>
        </Stack>
      ))}
    </Stack>
  );
}

function renderValue(value: ReactNode): ReactNode {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return <Mono>{String(value)}</Mono>;
  }
  return value;
}

/**
 * ConfigHub placeholder token: the literal `confighubplaceholder` optionally
 * followed by alphabetic characters ("named placeholders"), possibly embedded
 * in a larger string. Mirrors yamlkit's placeholderStringRegexp.
 */
const PLACEHOLDER_REGEXP = /confighubplaceholder[a-zA-Z]*/g;

export function containsPlaceholder(text: string): boolean {
  return text.includes('confighubplaceholder');
}

/**
 * Wrap placeholder tokens in a warning-colored highlight so unfilled values
 * stand out in friendly views. Returns the string unchanged when it contains
 * no placeholder.
 */
export function highlightPlaceholders(text: string): ReactNode {
  if (!containsPlaceholder(text)) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER_REGEXP)) {
    const start = match.index ?? 0;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <Box
        key={start}
        component='span'
        sx={{
          bgcolor: 'warning.light',
          color: 'warning.contrastText',
          borderRadius: 0.5,
          px: 0.5,
          fontWeight: 600,
        }}
      >
        {match[0]}
      </Box>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** Monospace inline text for identifiers, images, paths, etc. */
export function Mono({ children }: { children: ReactNode }) {
  return (
    <Typography
      component='span'
      variant='body2'
      sx={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}
    >
      {typeof children === 'string' ? highlightPlaceholders(children) : children}
    </Typography>
  );
}

/** A row of small chips, e.g. DNS names, entry points, access modes. */
export function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <Stack direction='row' spacing={0.5} flexWrap='wrap' useFlexGap>
      {items.map((item) => (
        <Chip
          key={item}
          label={item}
          size='small'
          variant='outlined'
          color={containsPlaceholder(item) ? 'warning' : 'default'}
          sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}
        />
      ))}
    </Stack>
  );
}

/** key=value chips for label maps and selectors. */
export function SelectorChips({ map }: { map: Record<string, string> | undefined }) {
  if (!map || Object.keys(map).length === 0) return null;
  return <ChipList items={Object.entries(map).map(([k, v]) => `${k}=${v}`)} />;
}

/**
 * Compact data table. Columns render in order; each row is a same-length
 * array of cell values. Strings render in monospace.
 */
export function MiniTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: ReactNode[][];
}) {
  if (rows.length === 0) return null;
  return (
    <Table size='small' sx={{ '& td, & th': { px: 1, py: 0.5 } }}>
      <TableHead>
        <TableRow>
          {columns.map((c) => (
            <TableCell key={c}>
              <Typography variant='caption' color='text.secondary'>
                {c}
              </Typography>
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((cells, i) => (
          <TableRow key={i}>
            {cells.map((cell, j) => (
              <TableCell key={j} sx={{ verticalAlign: 'top' }}>
                {typeof cell === 'string' || typeof cell === 'number' ? (
                  <Mono>{cell}</Mono>
                ) : (
                  cell
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * A long text value (ConfigMap entry, annotation, middleware config) that
 * starts collapsed and expands on demand.
 */
export function CollapsibleValue({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const isMultiline = text.includes('\n') || text.length > 120;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 0.5 }}>
      <Stack
        direction='row'
        alignItems='center'
        spacing={0.5}
        sx={{ px: 1, py: 0.25, cursor: isMultiline ? 'pointer' : 'default' }}
        onClick={isMultiline ? () => setOpen((o) => !o) : undefined}
      >
        {isMultiline && (
          <IconButton size='small' sx={{ p: 0.25 }} aria-label={`Expand ${title}`}>
            <ExpandMoreIcon
              fontSize='small'
              sx={{
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.15s',
              }}
            />
          </IconButton>
        )}
        <Mono>{title}</Mono>
        {!isMultiline && (
          <>
            <Typography variant='caption' color='text.secondary'>
              =
            </Typography>
            <Mono>{text}</Mono>
          </>
        )}
      </Stack>
      {isMultiline && (
        <Collapse in={open}>
          <Box
            component='pre'
            sx={{
              m: 0,
              px: 1.5,
              py: 1,
              borderTop: 1,
              borderColor: 'divider',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              maxHeight: 320,
              overflow: 'auto',
            }}
          >
            {highlightPlaceholders(text)}
          </Box>
        </Collapse>
      )}
    </Box>
  );
}

/** Placeholder when a section/view has nothing to show. */
export function EmptyHint({ text }: { text: string }) {
  return (
    <Typography variant='caption' color='text.secondary' sx={{ fontStyle: 'italic' }}>
      {text}
    </Typography>
  );
}

// ---------------------------------------------------------------------------
// Safe accessors for parsed YAML documents. Friendly views receive the parsed
// document as `unknown` and narrow with these instead of casting, so a
// malformed or unexpected doc degrades to empty sections rather than a crash.
// ---------------------------------------------------------------------------

export type UnknownRecord = Record<string, unknown>;

export function asRecord(v: unknown): UnknownRecord | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as UnknownRecord)
    : undefined;
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Scalar (string/number/boolean) coerced to string, else undefined. */
export function asScalar(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return undefined;
}

export function asStringMap(v: unknown): Record<string, string> | undefined {
  const rec = asRecord(v);
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(rec)) {
    const s = asScalar(val);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

export function asStringArray(v: unknown): string[] {
  return asArray(v)
    .map(asScalar)
    .filter((s): s is string => s !== undefined);
}

/** rec?.[key] without casts at the call site. */
export function get(rec: UnknownRecord | undefined, key: string): unknown {
  return rec ? rec[key] : undefined;
}

/** Walk a fixed key path through nested records. */
export function getPath(root: unknown, ...keys: string[]): unknown {
  let current: unknown = root;
  for (const key of keys) {
    const rec = asRecord(current);
    if (!rec) return undefined;
    current = rec[key];
  }
  return current;
}

/** Every friendly view receives the parsed document and renders sections. */
export interface FriendlyViewProps {
  /** Parsed YAML document of the resource (desired state). */
  doc: UnknownRecord;
}
