// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The delivery graph with its status cards, search and two views: the tree of
 * cards (DeliveryCards) with a side pane for the selected Space, and the list
 * (DeliveryList).
 *
 * A Space that delivers others says how many, and how many of those are not
 * synced and healthy, so a closed branch still shows where the trouble is. The
 * status cards and the search narrow either view to the Spaces that match,
 * each kept under the Spaces that deliver it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import Box from '@mui/material/Box';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';

import {
  ConsoleClearButton,
  ConsoleEmpty,
  ConsoleFilterBar,
  ConsoleFooter,
  ConsoleSearch,
} from '../change-orders/components/ConsoleParts';
import { KpiStrip, type KpiCard } from '../change-orders/components/KpiStrip';
import {
  KPI_ACTIVE_CARD_SX,
  KPI_CARD_SX,
  KPI_HINT_SX,
  KPI_LABEL_SX,
  KPI_NUM_SX,
  KPI_PARTIAL_CARD_SX,
  consoleTokens as T,
  controlSx,
} from '../change-orders/consoleStyle';
import { liveStatusText, releaseTone, type RunningRelease } from '../x/apps/liveStatus';
import { DeliveryCards } from './DeliveryCards';
import { DeliveryList, type ListRow } from './DeliveryList';
import { DeliverySidePane } from './DeliverySidePane';
import { descendantIds, groupByTarget, parentIds, treeRows, withAncestors, type DeliveryGraph } from './deliveryGraph';
import { SpaceNameList } from '../change-orders/components/SpaceListing';
import {
  STATUS,
  STATUS_KEYS,
  controllerName,
  controllerUiHome,
  nodeNames,
  plural,
  type NodeView,
  type Status,
  type TargetInfo,
} from './deliveryView';

/** The Spaces released to a Target with a tree that no resource delivers: most often a Space someone forgot to add. */
function Undelivered({ target, spaces }: { target?: string; spaces: readonly { spaceId: string; slug: string }[] }) {
  return (
    <Box data-testid='delivery-undelivered' sx={{ mt: '12px', padding: '10px 14px', background: T.surface, border: `1px solid ${T.line}`, borderRadius: '9px' }}>
      <Typography sx={{ fontSize: 12.5, lineHeight: T.lh, fontWeight: 650, color: T.ink }}>
        Released to {target ? `the Target ${target}` : 'this Target'}, and nothing deploys {spaces.length === 1 ? 'it' : 'them'}
      </Typography>
      <SpaceNameList spaces={spaces.map((space) => ({ spaceId: space.spaceId, name: space.slug }))} />
    </Box>
  );
}

/** A tree this large opens with only its roots' children showing. */
const OPEN_ALL_UP_TO = 60;

export type DeliveryViewMode = 'tree' | 'list';

interface DeliveryTreeProps {
  graph: DeliveryGraph;
  /** The Release each Space is running. */
  releases: ReadonlyMap<string, RunningRelease>;
  targets: ReadonlyMap<string, TargetInfo>;
  view: DeliveryViewMode;
  onView: (view: DeliveryViewMode) => void;
  /** The selected node, from a card or from a link on another page: shown, marked and scrolled to. */
  selectedId?: string;
  /** Selects the Space of a slug, or nothing. */
  onSelect: (slug: string | undefined) => void;
}

export function DeliveryTree({ graph, releases, targets, view, onView, selectedId, onSelect }: DeliveryTreeProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);

  // Which branches are open: all of them in a tree small enough to read, otherwise the roots
  // alone, until the person opens or closes all of them; then whatever they toggled since.
  const [base, setBase] = useState<'default' | 'all' | 'none'>('default');
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const [unstacked, setUnstacked] = useState<ReadonlySet<string>>(() => new Set());
  const openByDefault = graph.nodes.size <= OPEN_ALL_UP_TO;
  const selectedAncestors = useMemo(() => {
    const ids = selectedId ? withAncestors(graph, [selectedId]) : new Set<string>();
    if (selectedId) ids.delete(selectedId);
    return ids;
  }, [graph, selectedId]);
  const isOpen = useCallback(
    (id: string) => {
      if (selectedAncestors.has(id) && !toggled.has(id)) return true;
      const node = graph.nodes.get(id);
      const baseOpen = base === 'all' || (base === 'default' && (openByDefault || node?.depth === 0));
      return baseOpen !== toggled.has(id);
    },
    [graph, base, toggled, openByDefault, selectedAncestors],
  );
  const toggle = useCallback((id: string) => {
    setToggled((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const setStack = useCallback((parentId: string, stacked: boolean) => {
    setUnstacked((current) => {
      const next = new Set(current);
      if (stacked) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);
  const setAll = (next: 'all' | 'none') => {
    setBase(next);
    setToggled(new Set());
  };

  // The trees under the Target they release to, with what a section's heading says of it.
  const groups = useMemo(
    () =>
      groupByTarget(graph)
        .map((group) => {
          const ids = group.roots.flatMap((rootId) => [rootId, ...descendantIds(graph, rootId)]);
          const controllers = new Set<string>();
          for (const id of ids) {
            const node = graph.nodes.get(id);
            for (const d of [...(node?.deliveredBy ?? []), ...(node?.root ? [node.root] : [])]) controllers.add(controllerName(d));
          }
          const target = group.targetId ? targets.get(group.targetId) : undefined;
          return { ...group, ids, target, controllers: [...controllers].sort(), uiHome: controllerUiHome(target?.uiTemplate) };
        })
        .sort((a, b) => (a.target?.name ?? '~').localeCompare(b.target?.name ?? '~')),
    [graph, targets],
  );

  const views = useMemo(() => {
    const groupTargetOf = new Map<string, string | undefined>();
    for (const group of groups) for (const id of group.ids) groupTargetOf.set(id, group.targetId);
    const own = new Map<string, { status: Status; text: string }>();
    for (const node of graph.nodes.values()) {
      if (!node.space) {
        own.set(node.id, { status: 'missing', text: STATUS.missing.label });
      } else if (!node.space.releaseTargetId) {
        own.set(node.id, { status: 'none', text: 'No release Target' });
      } else {
        const running = releases.get(node.space.spaceId);
        own.set(node.id, { status: releaseTone(running?.liveStatus), text: running ? liveStatusText(running.liveStatus) : 'Not released' });
      }
    }
    const map = new Map<string, NodeView>();
    for (const node of graph.nodes.values()) {
      const below = descendantIds(graph, node.id);
      const wrong = STATUS_KEYS.filter((key) => key !== 'ok').flatMap((key) => {
        const n = below.filter((childId) => own.get(childId)?.status === key).length;
        return n > 0 ? [`${n} ${STATUS[key].rollup}`] : [];
      });
      map.set(node.id, {
        node,
        ...nodeNames(node),
        status: own.get(node.id)?.status ?? 'none',
        statusText: own.get(node.id)?.text ?? '',
        targetSlug: node.space?.releaseTargetId ? targets.get(node.space.releaseTargetId)?.name : undefined,
        otherTarget:
          node.space?.releaseTargetId && node.space.releaseTargetId !== groupTargetOf.get(node.id)
            ? targets.get(node.space.releaseTargetId)?.name
            : undefined,
        below: below.length,
        rollup: [plural(below.length, 'Space'), ...wrong].join(' · '),
      });
    }
    return map;
  }, [graph, releases, targets, groups]);

  const counts = useMemo(() => {
    const byStatus = new Map<Status, number>();
    for (const { status } of views.values()) byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    return byStatus;
  }, [views]);

  const spaceSlugById = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of graph.nodes.values()) if (node.space) map.set(node.space.spaceId, node.slug);
    return map;
  }, [graph]);

  const needle = search.trim().toLowerCase();
  const filtering = needle !== '' || statusFilter !== null;
  const matches = useMemo(() => {
    if (!filtering) return undefined;
    const ids: string[] = [];
    for (const node of graph.nodes.values()) {
      if (statusFilter !== null && views.get(node.id)?.status !== statusFilter) continue;
      if (needle !== '') {
        const fields = [
          node.slug,
          node.space?.componentSlug ?? '',
          node.space?.variant ?? '',
          ...[...node.deliveredBy, ...(node.root ? [node.root] : [])].flatMap((d) => [d.name, d.kind, d.destination ?? '']),
        ];
        if (!fields.some((field) => field.toLowerCase().includes(needle))) continue;
      }
      ids.push(node.id);
    }
    return new Set(ids);
  }, [graph, views, needle, statusFilter, filtering]);
  const shown = useMemo(() => (matches ? withAncestors(graph, matches) : undefined), [graph, matches]);

  const rows = useMemo<ListRow[]>(
    () =>
      view !== 'list'
        ? []
        : treeRows(graph, isOpen, shown).flatMap(({ id, depth, open }) => {
            const nodeView = views.get(id);
            return nodeView ? [{ ...nodeView, depth, open, spaceSlugById, focused: id === selectedId, onToggle: toggle }] : [];
          }),
    [view, graph, isOpen, shown, views, spaceSlugById, selectedId, toggle],
  );

  // Bring the selected Space into view: to the middle of the page when a link from another page
  // asked for it, and after that only as far as it takes to show it.
  const selectedSlug = selectedId ? graph.nodes.get(selectedId)?.slug : undefined;
  const selectedShown = selectedId !== undefined && (!shown || shown.has(selectedId));
  const arrived = useRef(false);
  useEffect(() => {
    if (!selectedSlug || !selectedShown) return;
    document.querySelector('[data-selected="true"]')?.scrollIntoView({ block: arrived.current ? 'nearest' : 'center', inline: 'nearest' });
    arrived.current = true;
  }, [selectedSlug, selectedShown, view]);
  useEffect(() => {
    arrived.current = true;
  }, []);

  const cards: KpiCard[] = STATUS_KEYS.map((key) => ({
    key,
    label: STATUS[key].label,
    count: counts.get(key) ?? 0,
    status: statusFilter === key ? 'on' : 'off',
    tone: key === 'neutral' ? T.ink2 : STATUS[key].color,
  }));
  const clearFilters = () => {
    setSearch('');
    setStatusFilter(null);
  };
  const parents = useMemo(() => parentIds(graph), [graph]);
  const hasBranches = parents.size > graph.roots.reduce((n, id) => n + (graph.nodes.get(id)?.children.length ?? 0), 0);

  const empty = (
    <ConsoleEmpty
      message='No Space matches these filters.'
      action={
        <ConsoleClearButton onClick={clearFilters} disabled={false}>
          Clear filters
        </ConsoleClearButton>
      }
    />
  );
  const count = matches
    ? `${plural(matches.size, 'Space')} of ${graph.nodes.size} ${matches.size === 1 ? 'matches' : 'match'}, shown beside the apps Spaces that deploy them`
    : view === 'list'
      ? `${rows.length} of ${plural(graph.nodes.size, 'Space')} shown`
      : plural(graph.nodes.size, 'Space');
  const selected = selectedId ? views.get(selectedId) : undefined;
  const selectedTemplate = selected?.node.space?.releaseTargetId ? targets.get(selected.node.space.releaseTargetId)?.uiTemplate : undefined;
  const selectedControllerUrl =
    selected && selectedTemplate && controllerUiHome(selectedTemplate)
      ? selectedTemplate.replace(/\{slug\}/g, encodeURIComponent(selected.node.slug))
      : undefined;
  // Above each tree's root: the Target the tree releases to, and the way into its controller's UI.
  const rootCaption = (rootId: string) => {
    const group = groups.find((g) => g.roots.includes(rootId));
    if (!group) return null;
    const name = group.target?.name ?? 'No release Target';
    return (
      <Box data-testid='delivery-target' data-target={name} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '2px 10px', mb: '5px', pl: '2px' }}>
        <Typography component='span' sx={{ fontSize: 11.5, lineHeight: T.lh, fontWeight: 650, color: T.ink3 }}>
          {group.target ? 'Target' : name}
        </Typography>
        {group.target && (
          <Typography component='span' sx={{ fontFamily: T.mono, fontSize: 12.5, lineHeight: T.lh, fontWeight: 600, color: T.ink, overflowWrap: 'anywhere' }}>
            {name}
          </Typography>
        )}
        {group.uiHome && (
          <Typography
            component='a'
            href={group.uiHome}
            target='_blank'
            rel='noopener noreferrer'
            data-testid='delivery-target-ui'
            sx={{
              fontSize: 12,
              lineHeight: T.lh,
              fontWeight: 600,
              color: T.action,
              textDecoration: 'none',
              '&:hover': { textDecoration: 'underline', textUnderlineOffset: '3px' },
              '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 2, borderRadius: '2px' },
            }}
          >
            Open {group.controllers.length === 1 ? group.controllers[0] : 'the controller'} ↗
          </Typography>
        )}
      </Box>
    );
  };
  const shownGroups = shown ? groups.filter((group) => group.roots.some((id) => shown.has(id))) : groups;
  const undelivered = shownGroups.filter((group) => group.undelivered.length > 0);

  return (
    <>
      <Box role='group' aria-label='Running Releases by status'>
        <KpiStrip
          cards={cards}
          onSelect={(key) => setStatusFilter((current) => (current === key ? null : (key as Status)))}
          testIdPrefix='delivery-card'
          numSx={KPI_NUM_SX}
          labelSx={KPI_LABEL_SX}
          hintSx={KPI_HINT_SX}
          cardSx={KPI_CARD_SX}
          activeCardSx={KPI_ACTIVE_CARD_SX}
          partialCardSx={KPI_PARTIAL_CARD_SX}
        />
      </Box>
      <ConsoleFilterBar>
        <ToggleButtonGroup
          value={view}
          exclusive
          size='small'
          aria-label='View'
          onChange={(_event, next: DeliveryViewMode | null) => {
            if (next) onView(next);
          }}
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none',
              fontFamily: T.sans,
              fontSize: 12.5,
              fontWeight: 600,
              lineHeight: T.lh,
              padding: '4px 12px',
              color: T.ink2,
              borderColor: T.lineStrong,
            },
            '& .MuiToggleButton-root.Mui-selected': { color: T.ink, background: T.surfaceHover },
          }}
        >
          <ToggleButton value='tree' data-testid='delivery-view-tree'>
            Tree
          </ToggleButton>
          <ToggleButton value='list' data-testid='delivery-view-list'>
            List
          </ToggleButton>
        </ToggleButtonGroup>
        <ConsoleSearch value={search} onChange={setSearch} placeholder='Search Spaces' />
        {(hasBranches || !openByDefault) && (
          <>
            <Box component='button' type='button' disabled={filtering} onClick={() => setAll('all')} data-testid='delivery-open-all' sx={controlSx('quiet', !filtering)}>
              Open all
            </Box>
            <Box component='button' type='button' disabled={filtering} onClick={() => setAll('none')} data-testid='delivery-close-all' sx={controlSx('quiet', !filtering)}>
              Close all
            </Box>
          </>
        )}
        <ConsoleClearButton onClick={clearFilters} disabled={!filtering}>
          Clear filters
        </ConsoleClearButton>
      </ConsoleFilterBar>
      {view === 'list' ? (
        <>
          <DeliveryList rows={rows} empty={empty} footer={<ConsoleFooter countTestId='delivery-count' count={count} />} />
          {undelivered.map((group) => (
            <Undelivered key={group.targetId ?? ''} target={group.target?.name} spaces={group.undelivered} />
          ))}
        </>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {matches?.size === 0 && empty}
            {matches?.size !== 0 && (
              <DeliveryCards
                graph={graph}
                roots={shownGroups.flatMap((group) => group.roots)}
                rootCaption={rootCaption}
                views={views}
                isOpen={isOpen}
                onToggle={toggle}
                shown={shown}
                matches={matches}
                selectedId={selectedId}
                onSelect={onSelect}
                unstacked={unstacked}
                onStack={setStack}
              />
            )}
            <Typography data-testid='delivery-count' sx={{ fontSize: 12, lineHeight: T.lh, color: T.ink3, mt: '6px' }}>
              {count}
            </Typography>
            {undelivered.map((group) => (
              <Undelivered key={group.targetId ?? ''} target={group.target?.name} spaces={group.undelivered} />
            ))}
          </Box>
          {selected && (
            <DeliverySidePane
              view={selected}
              controllerUrl={selectedControllerUrl}
              views={views}
              spaceSlugById={spaceSlugById}
              onSelect={onSelect}
              onClose={() => onSelect(undefined)}
            />
          )}
        </Box>
      )}
    </>
  );
}
