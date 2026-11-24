// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The selected card: the resource that deploys the Space, with its
 * configuration and the Unit holding it, and what the Space deploys.
 */

import { useMemo, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { useListAllResourcesQuery } from '@confighub/rtk-query';

import { StatusDot } from '@/components/console-detail/ConsoleDetail';

import { consoleTokens as T } from '../change-orders/consoleStyle';
import type { Delivery } from './deliveryGraph';
import { LINK_SX, STATUS, controllerName, deliveryText, deliveryUnitHref, type NodeView } from './deliveryView';

const LABEL_SX = { fontSize: 11.5, lineHeight: T.lh, fontWeight: 650, color: T.ink3, mb: '3px' } as const;
const TEXT_SX = { fontSize: 12.5, lineHeight: T.lh, color: T.ink, overflowWrap: 'anywhere' } as const;
const QUIET_SX = { ...TEXT_SX, color: T.ink2 } as const;
const ACTION_LINK_SX = { ...TEXT_SX, ...LINK_SX, display: 'block', color: T.action, fontWeight: 600 } as const;
const SPACE_BUTTON_SX = {
  all: 'unset',
  cursor: 'pointer',
  fontSize: 12.5,
  lineHeight: T.lh,
  color: T.ink,
  overflowWrap: 'anywhere',
  '&:hover': { color: T.action, textDecoration: 'underline', textUnderlineOffset: '3px' },
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 2, borderRadius: '2px' },
} as const;

const YAML_SX = {
  margin: '6px 0 0',
  padding: '8px 10px',
  maxHeight: 340,
  overflow: 'auto',
  fontFamily: T.mono,
  fontSize: 11.5,
  lineHeight: 1.5,
  color: T.ink,
  background: T.surfaceSunk,
  border: `1px solid ${T.line}`,
  borderRadius: '6px',
  whiteSpace: 'pre',
  '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
} as const;

/** Decodes a resource's `RawData`: base64 of the UTF-8 text the Unit holds. */
function decodeRaw(encoded: string): string | undefined {
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
  } catch {
    return undefined;
  }
}

/**
 * The deploying resource as its Unit holds it, comments and field order intact,
 * read when the pane shows it.
 */
function DeliveryYaml({ delivery }: { delivery: Delivery }) {
  const ids = delivery.documentIds;
  const { data, error, isLoading } = useListAllResourcesQuery({
    where: `ResourceID IN (${ids.map((id) => `'${id}'`).join(', ')})`,
    rawData: true,
    select: 'ResourceID',
  });
  const yaml = useMemo(() => {
    if (!data) return undefined;
    const byId = new Map(data.map((row) => [row.Resource?.ResourceID, row.RawData]));
    const documents = ids.map((id) => {
      const raw = byId.get(id);
      return raw ? decodeRaw(raw) : undefined;
    });
    if (documents.some((doc) => doc === undefined)) return undefined;
    return documents.map((doc) => (doc as string).replace(/^---\n/, '').trimEnd()).join('\n---\n');
  }, [data, ids]);
  if (isLoading) return <Typography sx={{ ...QUIET_SX, mt: '6px' }}>Reading the configuration…</Typography>;
  if (error || yaml === undefined) {
    return (
      <Typography role='alert' sx={{ ...QUIET_SX, mt: '6px', color: T.bad }}>
        The configuration could not be read.
      </Typography>
    );
  }
  return (
    <Box component='pre' tabIndex={0} aria-label={`Configuration of the ${delivery.kind} ${delivery.name}`} data-testid='delivery-pane-yaml' sx={YAML_SX}>
      {yaml}
    </Box>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ padding: '10px 14px', borderTop: `1px solid ${T.line}` }}>
      <Typography sx={LABEL_SX}>{label}</Typography>
      {children}
    </Box>
  );
}

interface DeliverySidePaneProps {
  view: NodeView;
  /** The Space's page in its controller's UI, from its release Target's `URL-TargetUI`. */
  controllerUrl?: string;
  views: ReadonlyMap<string, NodeView>;
  /** Slug of the Space holding each delivering Unit, by SpaceID. */
  spaceSlugById: ReadonlyMap<string, string>;
  onSelect: (slug: string) => void;
  onClose: () => void;
}

export function DeliverySidePane({ view, controllerUrl, views, spaceSlugById, onSelect, onClose }: DeliverySidePaneProps) {
  const { node, title, named, status, statusText, targetSlug, below, rollup } = view;
  const style = status === 'none' ? undefined : STATUS[status];
  const space = node.space;
  const delivered = node.deliveredBy[0] ?? node.root;

  const delivery = (d: Delivery, own: boolean) => {
    const fromSlug = spaceSlugById.get(d.fromSpaceId);
    return (
      <Box key={d.resourceId} data-testid='delivery-pane-delivery' sx={{ '& + &': { mt: '10px' } }}>
        <Typography sx={{ ...TEXT_SX, fontWeight: 600 }}>{deliveryText(d)}</Typography>
        <Typography sx={QUIET_SX}>
          {own ? 'In this Space' : 'In the apps Space '}
          {!own && fromSlug && (
            <Box component='button' type='button' onClick={() => onSelect(fromSlug)} title={`Show ${fromSlug} in the tree`} sx={{ ...SPACE_BUTTON_SX, fontFamily: T.mono }}>
              {fromSlug}
            </Box>
          )}
        </Typography>
        {d.destination && <Typography sx={QUIET_SX}>Applies to {d.destination}</Typography>}
        <Typography component={RouterLink} to={deliveryUnitHref(d)} data-testid='delivery-pane-unit' sx={{ ...ACTION_LINK_SX, mt: '3px' }}>
          Open the configuration of {fromSlug && d.unitSlug ? `${fromSlug}/${d.unitSlug}` : `the ${d.kind}`}
        </Typography>
        <DeliveryYaml delivery={d} />
      </Box>
    );
  };

  return (
    <Box
      component='aside'
      aria-label={`What deploys ${named}`}
      data-testid='delivery-pane'
      sx={{
        flex: 'none',
        boxSizing: 'border-box',
        width: 'clamp(280px, 28vw, 380px)',
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 12,
        maxHeight: 'calc(100vh - 24px)',
        overflowY: 'auto',
        background: T.surface,
        border: `1px solid ${T.line}`,
        borderRadius: '9px',
        boxShadow: T.shadow,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px 10px 10px 14px' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component='h2' data-testid='delivery-pane-title' sx={{ fontFamily: title === node.slug ? T.mono : T.sans, fontSize: 14, lineHeight: T.lh, fontWeight: 650, color: T.ink, overflowWrap: 'anywhere', m: 0 }}>
            {title}
          </Typography>
          {title !== node.slug && (
            <Typography data-testid='delivery-pane-slug' sx={QUIET_SX}>
              Space{' '}
              <Box component='span' sx={{ fontFamily: T.mono }}>
                {node.slug}
              </Box>
            </Typography>
          )}
          <Box sx={{ mt: '4px' }}>
            {style ? (
              <StatusDot color={style.color} hollow={style.hollow} label={space ? statusText : style.label} />
            ) : (
              <Typography sx={QUIET_SX}>{statusText}</Typography>
            )}
          </Box>
          {targetSlug && <Typography sx={{ ...QUIET_SX, mt: '2px' }}>Released to the Target {targetSlug}</Typography>}
        </Box>
        <Box
          component='button'
          type='button'
          onClick={onClose}
          aria-label='Close'
          data-testid='delivery-pane-close'
          sx={{
            all: 'unset',
            flex: 'none',
            display: 'inline-flex',
            padding: '3px',
            cursor: 'pointer',
            color: T.ink3,
            borderRadius: '4px',
            '&:hover': { color: T.ink, background: T.surfaceHover },
            '&:focus-visible': { outline: `2px solid ${T.focus}`, outlineOffset: 1 },
          }}
        >
          <CloseIcon sx={{ fontSize: 18 }} />
        </Box>
      </Box>

      <Section label='Deployed by'>
        {node.deliveredBy.map((d) => delivery(d, false))}
        {node.deliveredBy.length === 0 && node.root && delivery(node.root, true)}
        {node.deliveredBy.length === 0 && !node.root && <Typography sx={QUIET_SX}>Nothing in any Space deploys it.</Typography>}
        {!space && <Typography sx={{ ...QUIET_SX, mt: '8px' }}>No Space has this slug.</Typography>}
      </Section>

      {node.children.length > 0 && (
        <Section label={`Deploys ${rollup}`}>
          <Box component='ul' sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {node.children.map((childId) => {
              const child = views.get(childId);
              if (!child) return null;
              const childStyle = child.status === 'none' ? undefined : STATUS[child.status];
              return (
                <Box component='li' key={childId} sx={{ display: 'flex', alignItems: 'baseline', gap: '7px' }}>
                  <Box
                    aria-hidden='true'
                    sx={{
                      flex: 'none',
                      width: 7,
                      height: 7,
                      borderRadius: '999px',
                      background: childStyle && !childStyle.hollow ? childStyle.color : 'transparent',
                      border: childStyle && !childStyle.hollow ? 'none' : `1px solid ${childStyle?.color ?? T.idleLine}`,
                    }}
                  />
                  <Box component='button' type='button' onClick={() => onSelect(child.node.slug)} title={`Show ${child.named} in the tree`} sx={SPACE_BUTTON_SX}>
                    {child.title}
                  </Box>
                </Box>
              );
            })}
          </Box>
          {below > node.children.length && <Typography sx={{ ...QUIET_SX, mt: '4px' }}>and {below - node.children.length} more below those</Typography>}
        </Section>
      )}

      {space && ((controllerUrl && delivered) || !space.componentSlug) && (
        <Section label='Open'>
          {controllerUrl && delivered && (
            <Typography component='a' href={controllerUrl} target='_blank' rel='noopener noreferrer' data-testid='delivery-pane-controller' sx={ACTION_LINK_SX}>
              {title} in {controllerName(delivered)} ↗
            </Typography>
          )}
          {!space.componentSlug && (
            <Typography component={RouterLink} to={`/spaces/${space.spaceId}`} data-testid='delivery-pane-space' sx={ACTION_LINK_SX}>
              The Space {node.slug}
            </Typography>
          )}
        </Section>
      )}
    </Box>
  );
}
