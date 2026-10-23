// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';

import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { fieldById } from '../model/fields';
import { buildGroupTree } from '../model/grouping';
import { groupLevelFor } from '../model/sort';
import { useExplorerContext } from '../state/context';
import { useResults } from '../state/results-context';
import { useActiveTab } from '../state/useExplorer';
import { EmptyLane, Lane, MoreLanes } from './board/Lane';
import {
  laneFieldOf,
  laneableFields,
  rowLabelKeys,
  useLayoutActions,
  withLaneField,
} from './shared';

/**
 * The Board layout: one lane per value of the first group level (or, with no
 * grouping, a field that makes useful lanes: Status for Units). A second
 * group level becomes sub-headings in each lane. The Lanes picker writes the
 * view's grouping, so the board and the Group section never disagree.
 *
 * Cards never move between lanes: moving a Unit from one Target's lane to
 * another would change its configuration, and a view only looks.
 */

const NOUN = { Unit: 'units', Space: 'spaces', Resource: 'resources' } as const;

/** Lanes drawn before a "N more lanes" strip: a field with many values stays usable. */
export const LANE_CAP = 12;

/** One board per tab and entity, so how far it was opened up never carries over to another view. */
export function BoardLayout() {
  const tab = useActiveTab();
  return <Board key={`${tab.id}:${tab.work.entity}`} />;
}

function Board() {
  const { dispatch } = useExplorerContext();
  const { def, derived, universe } = useResults();
  const entity = def.entity;
  const labelKeys = useMemo(
    () => rowLabelKeys(entity, universe.rows),
    [entity, universe.rows],
  );
  const { field, isDefault } = laneFieldOf(entity, def.groupBy, labelKeys);
  const subField = isDefault
    ? undefined
    : def.groupBy.find((g, i) => i > 0 && g !== field && groupLevelFor(entity, g) !== null);
  const { actions, peek, openRow } = useLayoutActions(
    entity,
    isDefault ? [field] : def.groupBy,
    derived.rows,
    derived.rowId,
  );
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [laneLimit, setLaneLimit] = useState(LANE_CAP);

  const lanes = useMemo(() => {
    const level = groupLevelFor(entity, field);
    if (!level) return { shown: [], all: [] as string[] };
    const sub = subField ? groupLevelFor(entity, subField) : null;
    const shown = buildGroupTree(derived.rows, sub ? [level, sub] : [level]);
    // Every value the field takes over all rows, in lane order, so a lane this view filters to nothing still has its place.
    const all = buildGroupTree(universe.rows, [level]).map((n) => n.value);
    return { shown, all };
  }, [entity, field, subField, derived.rows, universe.rows]);

  const byValue = new Map(lanes.shown.map((n) => [n.value, n]));
  const emptyValues = lanes.all.filter((v) => !byValue.has(v));
  const fieldLabel = fieldById(entity, field)?.label ?? field;
  const subLabel = subField ? (fieldById(entity, subField)?.label ?? subField) : null;
  const laneable = laneableFields(entity, labelKeys);
  // A field set as the first group level elsewhere stays listed, so the picker always shows the current lanes.
  const current = laneable.some((f) => f.id === field) ? null : fieldById(entity, field);
  const choices = current ? [current, ...laneable] : laneable;
  // Lanes with cards and empty strips are capped apart, so empty strips never push a lane with cards out.
  const keep = new Set([
    ...lanes.shown.map((n) => n.value).slice(0, laneLimit),
    ...(showEmpty ? emptyValues.slice(0, laneLimit) : []),
  ]);
  const drawn = lanes.all.filter((v) => keep.has(v));
  const hiddenLanes =
    Math.max(0, lanes.shown.length - laneLimit) +
    (showEmpty ? Math.max(0, emptyValues.length - laneLimit) : 0);

  const pickLanes = (next: string) => {
    setPickerAnchor(null);
    dispatch({
      type: 'setGroupBy',
      groupBy: withLaneField(isDefault ? [] : def.groupBy, next),
    });
  };

  return (
    <Box
      sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      data-testid='vx-board'
    >
      <Stack
        direction='row'
        alignItems='center'
        spacing={1}
        sx={{
          px: 1.75,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.default',
          minHeight: 44,
          whiteSpace: 'nowrap',
        }}
      >
        <Typography variant='body2' color='text.secondary'>
          Lanes
        </Typography>
        <Button
          size='small'
          variant='outlined'
          color='inherit'
          endIcon={<ExpandMoreIcon fontSize='small' />}
          onClick={(e) => setPickerAnchor(e.currentTarget)}
          aria-haspopup='menu'
          data-testid='vx-lane-picker'
          sx={{ bgcolor: 'background.paper', fontWeight: 700 }}
        >
          {fieldLabel}
        </Button>
        <Typography
          variant='body2'
          color='text.disabled'
          noWrap
          sx={{ minWidth: 0 }}
          data-testid='vx-lane-caption'
        >
          {isDefault
            ? 'Default: picking a field sets the first group level.'
            : subLabel
              ? `Then ${subLabel} as sub-headings.`
              : 'The first group level.'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {emptyValues.length > 0 && (
          <Button
            size='small'
            color='inherit'
            onClick={() => setShowEmpty((s) => !s)}
            sx={{ color: 'text.secondary', fontWeight: 700 }}
            data-testid='vx-empty-lanes'
          >
            {showEmpty ? 'Hide' : 'Show'} {emptyValues.length} empty lane
            {emptyValues.length === 1 ? '' : 's'}
          </Button>
        )}
        <Typography
          variant='body2'
          color='text.disabled'
          noWrap
          sx={{ display: { xs: 'none', xl: 'block' } }}
        >
          Cards do not move. Change lanes with Group.
        </Typography>
      </Stack>
      {/* Mounted only while open: closing removes the modal root in the same commit. Left mounted to run its exit transition, a slow CPU can leave it in place, invisible, taking every click. */}
      {pickerAnchor && (
        <Menu
          anchorEl={pickerAnchor}
          open={!!pickerAnchor}
          onClose={() => setPickerAnchor(null)}
          slotProps={{ paper: { sx: { maxHeight: 420, minWidth: 220 } } }}
        >
          <ListSubheader sx={{ lineHeight: '32px' }}>Lanes by</ListSubheader>
          {choices.map((f) => (
            <MenuItem key={f.id} selected={f.id === field} onClick={() => pickLanes(f.id)}>
              <ListItemText primary={f.category === 'label' ? `Label ${f.label}` : f.label} />
            </MenuItem>
          ))}
        </Menu>
      )}
      {derived.rows.length === 0 && !derived.loading ? (
        <Box
          sx={{ flex: 1, display: 'grid', placeItems: 'center' }}
          data-testid='vx-board-empty'
        >
          <Typography variant='body2' color='text.secondary'>
            No {NOUN[entity]} match this view.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            gap: 1.25,
            p: 1.5,
            overflowX: 'auto',
            alignItems: 'stretch',
          }}
          data-testid='vx-lanes'
        >
          {drawn.map((v) => {
            const node = byValue.get(v);
            if (!node) return <EmptyLane key={v} entity={entity} field={field} value={v} />;
            return (
              <Lane
                key={v}
                entity={entity}
                node={node}
                rowId={derived.rowId}
                actions={actions}
                labelKeys={labelKeys}
                onOpen={openRow}
                onPeek={peek}
              />
            );
          })}
          {hiddenLanes > 0 && (
            <MoreLanes
              count={hiddenLanes}
              next={Math.min(LANE_CAP, hiddenLanes)}
              onMore={() => setLaneLimit((n) => n + LANE_CAP)}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
