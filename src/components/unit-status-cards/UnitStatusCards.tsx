// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { memo, useCallback, useMemo, useState } from 'react';

import { Ellipses } from '@/components/styled';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { type ExtendedUnitRead } from '@confighub/rtk-query';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { styled } from '@mui/material/styles';
import jsyaml from 'js-yaml';
import { useUnitData } from '@/hooks/useUnitData';

// ============================================================================
// TYPES
// ============================================================================

interface CardConfig {
  label: string;
  value: string;
}

// ============================================================================
// STYLED
// ============================================================================

const CardsContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(2),
  padding: theme.spacing(2),
}));

const CardSlot = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(1),
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1.5),
  boxShadow: 'none',
  backgroundColor: theme.palette.background.paper,
  flex: 1,
  minWidth: 120,
  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
}));

const CardLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.68rem',
  fontWeight: 600,
  color: theme.palette.text.secondary,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}));

// ============================================================================
// PARSERS
// ============================================================================

// --- Kubernetes/YAML --------------------------------------------------------

interface K8sData {
  kinds: string;
  namespaces: string;
  images: string;
  ports: string;
  replicas: string;
}

const parseKubernetes = (raw: string): K8sData => {
  const docs: unknown[] = [];
  try {
    jsyaml.loadAll(raw, (doc) => {
      if (doc) docs.push(doc);
    });
  } catch {
    return { kinds: 'N/A', namespaces: 'N/A', images: 'N/A', ports: 'N/A', replicas: 'N/A' };
  }

  const kinds = new Set<string>();
  const namespaces = new Set<string>();
  const images = new Set<string>();
  const ports = new Set<string>();
  let replicas: number | undefined;

  for (const doc of docs) {
    const d = doc as Record<string, unknown>;
    if (typeof d.kind === 'string') kinds.add(d.kind);

    const meta = d.metadata as Record<string, unknown> | undefined;
    if (typeof meta?.namespace === 'string') namespaces.add(meta.namespace);

    const spec = d.spec as Record<string, unknown> | undefined;
    if (typeof spec?.replicas === 'number') replicas = spec.replicas;

    const podSpec = (spec?.template as Record<string, unknown> | undefined)?.spec as
      | Record<string, unknown>
      | undefined;
    const containers = podSpec?.containers;
    if (Array.isArray(containers)) {
      for (const c of containers) {
        const container = c as Record<string, unknown>;
        if (typeof container.image === 'string') {
          const parts = container.image.split('/');
          images.add(parts[parts.length - 1]);
        }
        if (Array.isArray(container.ports)) {
          for (const p of container.ports as Record<string, unknown>[]) {
            if (p.containerPort != null) ports.add(String(p.containerPort));
          }
        }
      }
    }
  }

  return {
    kinds: kinds.size > 0 ? Array.from(kinds).join(', ') : 'N/A',
    namespaces: namespaces.size > 0 ? Array.from(namespaces).join(', ') : 'default',
    images: images.size > 0 ? Array.from(images).join(', ') : 'N/A',
    ports: ports.size > 0 ? Array.from(ports).join(', ') : 'None',
    replicas: replicas !== undefined ? String(replicas) : 'N/A',
  };
};

// --- AppConfig/* ------------------------------------------------------------

const parseAppConfig = (data: string, toolchain: string): CardConfig[] => {
  const lines = data
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (toolchain.endsWith('/Properties') || toolchain.endsWith('/Env')) {
    const keys = lines.filter((l) => !l.startsWith('#') && l.includes('='));
    return [
      { label: 'Keys', value: String(keys.length) },
      { label: 'Format', value: toolchain.endsWith('/Env') ? 'Env' : 'Properties' },
    ];
  }

  if (toolchain.endsWith('/TOML')) {
    const sections = lines.filter((l) => l.startsWith('[') && !l.startsWith('[['));
    const keys = lines.filter(
      (l) => !l.startsWith('#') && !l.startsWith('[') && l.includes('='),
    );
    return [
      { label: 'Sections', value: String(sections.length) },
      { label: 'Keys', value: String(keys.length) },
      { label: 'Format', value: 'TOML' },
    ];
  }

  if (toolchain.endsWith('/INI')) {
    const sections = lines.filter((l) => l.startsWith('['));
    const keys = lines.filter(
      (l) => !l.startsWith('#') && !l.startsWith(';') && !l.startsWith('[') && l.includes('='),
    );
    return [
      { label: 'Sections', value: String(sections.length) },
      { label: 'Keys', value: String(keys.length) },
      { label: 'Format', value: 'INI' },
    ];
  }

  // AppConfig/YAML
  try {
    const parsed = jsyaml.load(data) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') return [{ label: 'Format', value: 'YAML' }];

    const dig = (obj: Record<string, unknown>, ...paths: string[]): string => {
      for (const path of paths) {
        let val: unknown = obj;
        for (const key of path.split('.')) {
          if (val && typeof val === 'object') {
            val = (val as Record<string, unknown>)[key];
          } else {
            val = undefined;
            break;
          }
        }
        if (val != null && val !== '') return String(val);
      }
      return 'N/A';
    };

    return [
      { label: 'Title', value: dig(parsed, 'app.title', 'app.name', 'title', 'name') },
      { label: 'Version', value: dig(parsed, 'app.version', 'version') },
      {
        label: 'Base URL',
        value: dig(parsed, 'app.baseUrl', 'app.base_url', 'app.url', 'baseUrl', 'base_url'),
      },
      { label: 'Format', value: 'YAML' },
    ];
  } catch {
    return [{ label: 'Format', value: 'YAML' }];
  }
};

// --- ConfigHub/YAML ---------------------------------------------------------

const parseConfigHubYaml = (raw: string): CardConfig[] => {
  const docs: unknown[] = [];
  try {
    jsyaml.loadAll(raw, (doc) => {
      if (doc) docs.push(doc);
    });
  } catch {
    return [{ label: 'Resources', value: 'N/A' }];
  }
  const kinds = new Set<string>();
  for (const doc of docs) {
    const d = doc as Record<string, unknown>;
    if (typeof d.kind === 'string') kinds.add(d.kind);
  }
  return [
    { label: 'Resources', value: String(docs.length) },
    { label: 'Kinds', value: kinds.size > 0 ? Array.from(kinds).join(', ') : 'N/A' },
  ];
};

// ============================================================================
// CARD BUILDER
// ============================================================================

const buildCards = (unit: ExtendedUnitRead, data: string): CardConfig[] => {
  const toolchain = unit.Unit?.ToolchainType ?? '';

  switch (toolchain) {
    case 'Kubernetes/YAML': {
      const k = parseKubernetes(data);
      return [
        { label: 'Kind', value: k.kinds },
        { label: 'Namespace', value: k.namespaces },
        { label: 'Images', value: k.images },
        { label: 'Ports', value: k.ports },
        { label: 'Replicas', value: k.replicas },
      ];
    }
    case 'ConfigHub/YAML':
      return parseConfigHubYaml(data);
    default:
      if (toolchain.startsWith('AppConfig/')) return parseAppConfig(data, toolchain);
      return [{ label: 'Toolchain', value: toolchain || 'Unknown' }];
  }
};

// ============================================================================
// SINGLE CARD
// ============================================================================

const SingleCard = memo(({ label, value }: CardConfig) => {
  const [isTruncated, setIsTruncated] = useState(false);

  const textRef = useCallback((node: HTMLElement | null) => {
    if (node) setIsTruncated(node.scrollWidth > node.clientWidth);
  }, []);

  return (
    <CardSlot>
      <CardLabel variant='caption'>{label}</CardLabel>
      <Tooltip title={value} placement='top' disableHoverListener={!isTruncated}>
        <Ellipses ref={textRef} variant='body1' fontWeight={700}>
          {value}
        </Ellipses>
      </Tooltip>
    </CardSlot>
  );
});

SingleCard.displayName = 'SingleCard';

// ============================================================================
// COMPONENT
// ============================================================================

export interface IUnitStatusCardsProps {
  unit: ExtendedUnitRead;
}

export const UnitStatusCards = memo(({ unit }: IUnitStatusCardsProps) => {
  const { containerRef, width } = useContainerWidth();
  // The configuration these cards summarise is read from the Unit's data endpoint.
  const { data: unitData } = useUnitData(unit.Unit?.SpaceID, unit.Unit?.UnitID);
  const cards = useMemo(() => buildCards(unit, unitData), [unit, unitData]);
  const visibleCount =
    width < 500 ? 2 : width < 700 ? 3 : width < 850 ? 4 : Math.min(5, cards.length);

  return (
    <CardsContainer ref={containerRef}>
      {cards.slice(0, visibleCount).map((card) => (
        <SingleCard key={card.label} label={card.label} value={card.value} />
      ))}
    </CardsContainer>
  );
});

UnitStatusCards.displayName = 'UnitStatusCards';
