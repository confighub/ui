// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useMemo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath } from 'reactflow';

import AutorenewIcon from '@mui/icons-material/Autorenew';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';

import { componentTheme } from '../componentTheme';
import { usePatchLinkMutation, useSearchListLinksQuery } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

// Pulls the path's bend point in close to the downstream (target) node
// instead of the shared 50% midpoint reactflow's smoothstep defaults to —
// the badge then sits on the short final stretch right before the line
// plugs into the back of that node, rather than floating in open canvas.
// For a fan-out (one upstream, several downstream children sharing the same
// stage X), every sibling edge's bend still lands near ITS OWN target, so
// badges never collide even though they all leave the same upstream handle.
const BEND_OFFSET_FROM_TARGET = 46;
// How far past the bend (toward the target) the badge sits, so it reads as
// "on the segment entering the node" rather than sitting exactly on the
// corner.
const BADGE_NUDGE_TOWARD_TARGET = 18;

// ============================================================================
// TYPES
// ============================================================================

/** One backend Link that a promotion edge represents, flattened for edge display. */
interface PromotionEdgeLink {
  linkId: string;
  /** The Link's own Space (always the downstream/child unit's Space). */
  spaceId: string;
  /** Slug if set, else a `FromUnit → ToUnit` fallback built from the query's included units. */
  label: string;
  autoUpdate: boolean;
}

/**
 * Edge `data` shape for auto-mode promotion edges: just enough to build the
 * shared Link query's `where` clause, plus the two display names the
 * popover's header needs. Deliberately NOT the resolved links themselves
 * (see PromotionEdge's own doc comment for why) — every field here only
 * changes when the set/labeling of deployments changes, not on every Link
 * edit, so edge objects stay stable across AutoUpdate toggles.
 */
export interface PromotionEdgeData {
  /** Every deployment (Space) ID in this graph, comma-joined. */
  deploymentSpaceIdsKey: string;
  /** Upstream (parent) deployment's display name, for the popover header. */
  sourceLabel: string;
  /** Downstream (child) deployment's display name, for the popover header. */
  targetLabel: string;
  /**
   * Draw the line only. The folded and framed layouts hide the sync badge on
   * an edge whose length differs from the unfolded graph's, where the badge's
   * bend would not sit as it does there.
   */
  hideBadge?: boolean;
}

type BadgeState = 'on' | 'off' | 'mixed' | 'empty';

// ============================================================================
// STYLED
// ============================================================================

const Badge = styled(Box, {
  shouldForwardProp: (prop) => prop !== '$state',
})<{ $state: BadgeState }>(({ $state }) => ({
  width: 22,
  height: 22,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: $state === 'empty' ? 'default' : 'pointer',
  opacity: $state === 'empty' ? 0.45 : 1,
  boxShadow: componentTheme.shadowSm,
  border: `1.5px solid ${$state === 'off' ? componentTheme.borderDefault : componentTheme.upgrade}`,
  background:
    $state === 'mixed'
      ? `conic-gradient(${componentTheme.upgrade} 0deg 180deg, ${componentTheme.bgDefault} 180deg 360deg)`
      : $state === 'on'
        ? componentTheme.upgradeMuted
        : componentTheme.bgDefault,
  '& .MuiSvgIcon-root': {
    fontSize: 13,
    color: $state === 'off' || $state === 'empty' ? componentTheme.fgSubtle : componentTheme.upgradeEmphasis,
  },
}));

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Custom edge for auto-mode promotion edges. Renders a smoothstep path bent
 * in close to the downstream (target) node (see `BEND_OFFSET_FROM_TARGET`),
 * plus an always-visible badge on that final stretch summarizing the
 * `AutoUpdate` state of every Link this edge represents. Clicking the badge
 * opens a popover listing each Link as its own row with its own switch — the
 * same UI whether the edge represents one Link or several.
 *
 * Fetches its OWN Link data (via `useSearchListLinksQuery`, deduped with
 * every other promotion edge in the same graph since they all query the
 * identical `where`/`include` args) rather than receiving resolved links as
 * an `edge.data` prop from a parent-level rebuild. That used to mean: toggle
 * a switch -> Link PATCH succeeds -> AppComponentView's Link query
 * invalidates+refetches -> its derived `linksByEdgeKey` gets a new Map
 * reference -> ComponentFlowGraph's buildGraph() dependency changes ->
 * setEdges() creates brand-new edge objects -> this edge type went through
 * enough of reactflow's internal edge-list reconciliation that the popover's
 * own `anchorEl`/open state was observed being lost immediately after a
 * successful toggle, live in CI (screenshots + trace showed the popover gone
 * before the very first post-toggle assertion poll, with no backdrop click
 * or Escape involved) even after two independent fixes at the click-handling
 * and Popover.onClose layers. Self-fetching removes the coupling that let a
 * Link update reach this component through the parent rebuild path at all,
 * rather than trying to survive whatever in that path was resetting local
 * state.
 */
export function PromotionEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<PromotionEdgeData>) {
  // Bend near the target rather than the default midpoint (see the constants'
  // doc comments above) — the badge is positioned on this same bend below, so
  // the two must share the same `centerX` or the badge would float off the
  // actual rendered line.
  const bendX = targetX - BEND_OFFSET_FROM_TARGET;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX: bendX,
  });
  const badgeX = bendX + BADGE_NUDGE_TOWARD_TARGET;
  const badgeY = targetY;

  const deploymentSpaceIdsKey = data?.deploymentSpaceIdsKey ?? '';
  const spaceIds = useMemo(
    () => deploymentSpaceIdsKey.split(',').filter(Boolean),
    [deploymentSpaceIdsKey],
  );
  // Every promotion edge in the graph issues this exact same query (same
  // where/include), so RTK Query dedupes them into one shared subscription —
  // this is not N separate network requests.
  const { data: linksData } = useSearchListLinksQuery(
    {
      where: `SpaceID IN (${spaceIds.map((sid) => `'${sid}'`).join(',')}) AND UpdateType IN ('UpgradeUnit','MergeUnits')`,
      include: 'FromUnitID,ToUnitID',
    },
    { skip: spaceIds.length === 0 || data?.hideBadge === true },
  );

  // source = the upstream (parent) deployment's Space ID, target = the
  // downstream (child) deployment's — matches flowLayout.ts's edge
  // construction (source: parentDeploymentId, target: deploymentId).
  const links: PromotionEdgeLink[] = useMemo(() => {
    return (linksData ?? [])
      .filter((ext) => ext.Link?.SpaceID === target && ext.Link?.ToSpaceID === source)
      .map((ext) => {
        const link = ext.Link!;
        const fromSlug = ext.FromUnit?.Slug;
        const toSlug = ext.ToUnit?.Slug;
        return {
          linkId: link.LinkID!,
          spaceId: link.SpaceID!,
          label: link.Slug || `${fromSlug ?? '?'} → ${toSlug ?? '?'}`,
          autoUpdate: !!link.AutoUpdate,
        };
      });
  }, [linksData, source, target]);

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  // Optimistic per-link overrides, keyed by linkId — cleared once the
  // triggering PATCH settles (success or failure); on failure this falls
  // back to `link.autoUpdate`, which is still the pre-toggle value since the
  // write never landed, so clearing IS the revert.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [patchLink] = usePatchLinkMutation();

  const effectiveLinks = links.map((link) => ({
    ...link,
    autoUpdate: overrides.get(link.linkId) ?? link.autoUpdate,
  }));

  const badgeState: BadgeState =
    effectiveLinks.length === 0
      ? 'empty'
      : effectiveLinks.every((l) => l.autoUpdate)
        ? 'on'
        : effectiveLinks.every((l) => !l.autoUpdate)
          ? 'off'
          : 'mixed';

  const handleBadgeClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    if (badgeState === 'empty') return;
    setAnchorEl(event.currentTarget);
  };

  // Gate strictly on `reason`: MUI's Popover.onClose can in principle fire
  // without one of the two genuine user-dismissal reasons (backdrop click,
  // Escape) — require an exact match rather than just "not undefined", so
  // anything else that might invoke onClose can never close the popover out
  // from under the user. Belt-and-suspenders alongside the self-fetch
  // decoupling above.
  const handleClose = (_event: unknown, reason: 'backdropClick' | 'escapeKeyDown') => {
    if (reason !== 'backdropClick' && reason !== 'escapeKeyDown') return;
    setAnchorEl(null);
    setError(null);
  };

  const handleToggle = async (link: PromotionEdgeLink, next: boolean) => {
    setError(null);
    setOverrides((prev) => new Map(prev).set(link.linkId, next));
    try {
      await patchLink({
        spaceId: link.spaceId,
        linkId: link.linkId,
        body: { AutoUpdate: next },
      }).unwrap();
      // Leave the override in place on success rather than clearing it here:
      // invalidatesTags triggers this query's refetch asynchronously, so
      // clearing immediately would flash back to the still-stale `link.autoUpdate`
      // for the gap between this resolving and that refetch landing. The
      // override becomes a no-op once the refetched value catches up to it.
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || `Failed to update ${link.label}.`);
      setOverrides((prev) => {
        const reverted = new Map(prev);
        reverted.delete(link.linkId);
        return reverted;
      });
    }
  };

  if (data?.hideBadge) {
    return <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />;
  }

  const open = Boolean(anchorEl);
  const sourceLabel = data?.sourceLabel ?? '';
  const targetLabel = data?.targetLabel ?? '';
  const onCount = effectiveLinks.filter((l) => l.autoUpdate).length;

  return (
    <>
      <BaseEdge path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${badgeX}px, ${badgeY}px)`,
            pointerEvents: 'all',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Tooltip
            title={
              badgeState === 'empty'
                ? 'No auto-upgrade link configured between these components'
                : 'Auto-upgrade — click to manage'
            }
          >
            <Badge
              $state={badgeState}
              onClick={handleBadgeClick}
              data-testid="promotion-edge-badge"
              data-badge-state={badgeState}
              data-edge-id={id}
            >
              <AutorenewIcon />
            </Badge>
          </Tooltip>
        </div>
      </EdgeLabelRenderer>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        className="nodrag nopan"
      >
        <Box
          data-testid="promotion-edge-popover"
          sx={{ width: 328, maxWidth: 360 }}
          onMouseDown={(e) => e.stopPropagation()}
          // MUI's Popover portals this content to document.body, which escapes
          // the DOM tree but NOT React's synthetic event bubbling — clicks here
          // still bubble through the *original* JSX ancestry: up through this
          // edge's reactflow EdgeWrapper (which has its own onClick), and
          // potentially further. Stop click (not just mousedown) here so a
          // click on a switch/row can never be reinterpreted by an ancestor as
          // an edge/pane click and close the popover.
          onClick={(e) => e.stopPropagation()}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={1.1}
            sx={{ px: 2, pt: 1.75, pb: 1.5, borderBottom: `1px solid ${componentTheme.borderSubtle}` }}
          >
            <Box
              sx={{
                width: 26,
                height: 26,
                flexShrink: 0,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: componentTheme.upgradeMuted,
              }}
            >
              <AutorenewIcon sx={{ fontSize: 14, color: componentTheme.upgradeEmphasis }} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: componentTheme.fgDefault, lineHeight: 1.3 }}>
                Auto-upgrade
              </Typography>
              {(sourceLabel || targetLabel) && (
                <Typography
                  sx={{
                    fontSize: 10.5,
                    fontFamily: componentTheme.fontMono,
                    color: componentTheme.fgSubtle,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    mt: 0.25,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sourceLabel} → {targetLabel}
                </Typography>
              )}
            </Box>
            {/* Only worth a count once there's more than one switch to count. */}
            {effectiveLinks.length > 1 && (
              <Box
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontFamily: componentTheme.fontMono,
                  color: componentTheme.upgradeEmphasis,
                  background: componentTheme.upgradeMuted,
                  borderRadius: 999,
                  px: 1,
                  py: 0.375,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {onCount} of {effectiveLinks.length} on
              </Box>
            )}
          </Stack>

          <Typography sx={{ fontSize: 12, lineHeight: 1.5, color: componentTheme.fgMuted, px: 2, pt: 1.5, pb: 0.5 }}>
            When on, upstream changes merge into that unit automatically — no manual upgrade needed.
          </Typography>

          <Stack sx={{ px: 0.75, pt: 0.5, pb: 1 }}>
            {effectiveLinks.map((link) => (
              <Stack
                key={link.linkId}
                direction="row"
                alignItems="center"
                justifyContent="space-between"
                spacing={1.25}
                data-testid="promotion-edge-link-row"
                data-link-id={link.linkId}
                sx={{ px: 1.25, py: 1, borderRadius: 1.75, '&:hover': { background: componentTheme.borderSubtle } }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: componentTheme.fgDefault,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {link.label}
                  </Typography>
                  <Typography sx={{ fontSize: 10.5, color: componentTheme.fgSubtle, mt: 0.125 }}>
                    {link.autoUpdate ? 'syncs automatically' : 'manual upgrade only'}
                  </Typography>
                </Box>
                <Stack direction="row" alignItems="center" spacing={1} sx={{ flexShrink: 0 }}>
                  <Typography
                    sx={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      fontFamily: componentTheme.fontMono,
                      width: 24,
                      textAlign: 'right',
                      color: link.autoUpdate ? componentTheme.upgradeEmphasis : componentTheme.fgSubtle,
                    }}
                  >
                    {link.autoUpdate ? 'On' : 'Off'}
                  </Typography>
                  <Switch
                    size="small"
                    checked={link.autoUpdate}
                    onChange={(_e, checked) => handleToggle(link, checked)}
                    data-testid="promotion-edge-switch"
                  />
                </Stack>
              </Stack>
            ))}
          </Stack>
          {error && (
            <Alert severity="error" sx={{ mx: 1.5, mb: 1.5 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Box>
      </Popover>
    </>
  );
}
