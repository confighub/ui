// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CONSOLE_PAGE_SX } from '@/components/console-detail/consoleDetailUtil';
import { spaceComponentSlug, useComponentSlugs } from '@/hooks/useComponentSlugs';
import { usePolling } from '@/hooks/usePolling';
import { getApiErrorMessage } from '@/utility/error-functions';
import { useListAllTargetsQuery, useListSpacesQuery } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { ConsoleEmpty, ConsoleIntro, ConsoleLoading, ConsoleTitleRow } from '../change-orders/components/ConsoleParts';
import { consoleTokens as T } from '../change-orders/consoleStyle';
import { LABEL_VARIANT } from '../x/apps/componentData';
import { useRunningReleases } from '../x/apps/useRunningReleases';
import { DeliveryTree, type DeliveryViewMode } from './DeliveryTree';
import { buildDeliveryGraph, nodeIdOfSlug, type DeliveryResource, type DeliverySpace } from './deliveryGraph';
import type { TargetInfo } from './deliveryView';
import { useDeliveryResources } from './useDeliveryResources';

/** A reporter writes a Release's live status whenever it observes a change, and nothing tells this page when. */
const POLL_MS = 30_000;

const SPACE_QUERY = { select: 'SpaceID,Slug,ReleaseTargetID,ComponentID,Labels' };

const NO_RESOURCES: DeliveryResource[] = [];

/** A tree taller than the window takes the page's canvas down with it, where a stretched shell would stop at the window's height. */
const PAGE_SX = { ...CONSOLE_PAGE_SX, alignSelf: 'flex-start', boxSizing: 'border-box' } as const;

/**
 * GitOps (/gitops): which Space is delivered by which Argo CD Application,
 * Flux Kustomization or Sveltos Profile, held in which other Space, as a tree
 * from each root, with the live status of the Release each Space is running.
 * `?space=<slug>` selects one Space and scrolls to it: the Components page links
 * here with it. `?view=list` shows the list. See deliveryGraph.ts and DeliveryTree.tsx.
 */
export default function DeliveryPage() {
  const { data: spaceRows, error: spacesError, isLoading: spacesLoading } = useListSpacesQuery(SPACE_QUERY);
  const { data: targetRows, error: targetsError, isLoading: targetsLoading } = useListAllTargetsQuery({});
  const {
    resources: readResources,
    error: resourcesError,
    isLoading: resourcesLoading,
    refetch: refetchResources,
  } = useDeliveryResources();
  usePolling(refetchResources, POLL_MS);
  const resources = readResources ?? NO_RESOURCES;
  const { slugById: componentSlugById, isLoaded: componentsLoaded, error: componentsError } = useComponentSlugs();

  const spaces = useMemo<DeliverySpace[]>(
    () =>
      (spaceRows ?? []).flatMap((row) =>
        row.Space?.SpaceID && row.Space.Slug
          ? [
              {
                spaceId: row.Space.SpaceID,
                slug: row.Space.Slug,
                releaseTargetId: row.Space.ReleaseTargetID,
                componentSlug: spaceComponentSlug(row.Space, componentSlugById),
                variant: row.Space.Labels?.[LABEL_VARIANT],
              },
            ]
          : [],
      ),
    [spaceRows, componentSlugById],
  );
  const targets = useMemo(() => {
    const spaceSlugById = new Map((spaceRows ?? []).map((row) => [row.Space?.SpaceID, row.Space?.Slug]));
    const map = new Map<string, TargetInfo>();
    for (const row of targetRows ?? []) {
      const target = row.Target;
      if (!target?.TargetID || !target.Slug) continue;
      const spaceSlug = target.SpaceID ? spaceSlugById.get(target.SpaceID) : undefined;
      map.set(target.TargetID, { name: spaceSlug ? `${spaceSlug}/${target.Slug}` : target.Slug, uiTemplate: target.Annotations?.['URL-TargetUI'] });
    }
    return map;
  }, [targetRows, spaceRows]);

  const graph = useMemo(() => buildDeliveryGraph(resources, spaces), [resources, spaces]);

  const releaseSpaces = useMemo(
    () => spaces.filter((s) => s.releaseTargetId).map((s) => ({ spaceId: s.spaceId, releaseTargetId: s.releaseTargetId })),
    [spaces],
  );
  const releases = useRunningReleases(releaseSpaces, { pollIntervalMs: POLL_MS });

  // The selected Space and the view are in the address, so a link here, and the way back here, keep them.
  const [searchParams, setSearchParams] = useSearchParams();
  const focusSlug = searchParams.get('space') ?? undefined;
  const focusId = focusSlug ? nodeIdOfSlug(graph, focusSlug) : undefined;
  const view: DeliveryViewMode = searchParams.get('view') === 'list' ? 'list' : 'tree';
  const setParam = useCallback(
    (name: string, value: string | undefined) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value === undefined) next.delete(name);
          else next.set(name, value);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const select = useCallback((slug: string | undefined) => setParam('space', slug), [setParam]);
  const setView = useCallback((next: DeliveryViewMode) => setParam('view', next === 'list' ? 'list' : undefined), [setParam]);

  const error = spacesError ?? targetsError ?? resourcesError ?? componentsError ?? releases.error;
  const loading = spacesLoading || targetsLoading || resourcesLoading || !componentsLoaded || !releases.loaded;
  const refresh = useCallback(() => {
    refetchResources();
    releases.refetch();
  }, [refetchResources, releases]);

  let body;
  if (error) {
    body = (
      <Box role='alert' sx={{ border: `1px solid ${T.badLine}`, background: T.badSoft, padding: '10px 12px', fontSize: 12.5, lineHeight: T.lh, color: T.bad }}>
        {getApiErrorMessage(error) || 'The GitOps trees could not be read.'}
      </Box>
    );
  } else if (loading) {
    body = <ConsoleLoading testId='delivery-loading' />;
  } else if (graph.nodes.size === 0) {
    body = (
      <ConsoleEmpty message='No Unit holds an Argo CD Application, Flux Kustomization or Sveltos Profile whose source is a Space&apos;s Release.' />
    );
  } else {
    body = (
      <>
        {focusSlug && !focusId && (
          <Typography data-testid='delivery-focus-missing' sx={{ fontSize: 12.5, lineHeight: T.lh, color: T.ink2, mb: '10px' }}>
            Nothing deploys {focusSlug}, and it deploys nothing.
          </Typography>
        )}
        <DeliveryTree
          graph={graph}
          releases={releases.bySpaceId}
          targets={targets}
          view={view}
          onView={setView}
          selectedId={focusId}
          onSelect={select}
        />
      </>
    );
  }

  return (
    <Box data-testid='delivery-root' sx={PAGE_SX}>
      <Box component='section' role='region' aria-label='GitOps' sx={{ fontFamily: T.sans, color: T.ink, minWidth: 0 }}>
        <ConsoleTitleRow
          title='GitOps'
          headingId='delivery-heading'
          count={graph.nodes.size}
          freshness=''
          refreshing={releases.isFetching}
          onRefresh={refresh}
        />
        <ConsoleIntro>
          What Argo CD, Flux and Sveltos deploy from ConfigHub. Each card is an Argo CD Application, Flux Kustomization or Sveltos Profile, named for the Space it
          deploys. The last card on a branch deploys a Variant&apos;s manifests; the others deploy more Applications.
        </ConsoleIntro>
        {body}
      </Box>
    </Box>
  );
}
