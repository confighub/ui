// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ENFORCEMENT_STAGES, type EnforcementStage } from '@/utility/triggerEnforcement';
import Box from '@mui/material/Box';

import { type ValidationPolicy, comparePolicies } from '../validationModel';
import { KanbanColumn } from './KanbanColumn';

// Below this board width, collapse Disabled, which is the least looked at.
const DISABLED_AUTO_COLLAPSE_WIDTH = 900;

interface ValidationBoardProps {
  policies: ValidationPolicy[];
  selectedId: string | null;
}

/**
 * The validating Triggers by enforcement stage: Created, Audited, Enforced and Disabled. A Trigger moves
 * between stages by what is done to it -- selecting it in Spaces or Targets, enforcing it,
 * disabling it -- not by dragging its card, since the stage is computed from those.
 */
export const ValidationBoard = ({ policies, selectedId }: ValidationBoardProps) => {
  const [collapsed, setCollapsed] = useState<Record<EnforcementStage, boolean>>({
    Created: false,
    Audited: false,
    Enforced: false,
    Disabled: false,
  });

  // Collapse Disabled when the board crosses into narrow territory, and expand it when it crosses
  // back. Only crossings change it, so a manual toggle stays.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wasNarrowRef = useRef<boolean | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      const isNarrow = width < DISABLED_AUTO_COLLAPSE_WIDTH;
      if (wasNarrowRef.current === isNarrow) return;
      wasNarrowRef.current = isNarrow;
      setCollapsed((prev) =>
        prev.Disabled === isNarrow ? prev : { ...prev, Disabled: isNarrow },
      );
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleToggleCollapse = useCallback((stage: EnforcementStage) => {
    setCollapsed((prev) => ({ ...prev, [stage]: !prev[stage] }));
  }, []);

  const grouped = useMemo(() => {
    const groups: Record<EnforcementStage, ValidationPolicy[]> = {
      Created: [],
      Audited: [],
      Enforced: [],
      Disabled: [],
    };
    for (const p of policies) groups[p.stage].push(p);
    for (const stage of ENFORCEMENT_STAGES) groups[stage].sort(comparePolicies);
    return groups;
  }, [policies]);

  return (
    <Box
      ref={containerRef}
      data-testid='validation-board'
      sx={{
        display: 'flex',
        maxWidth: 1400,
        mx: 'auto',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '8px',
        bgcolor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {ENFORCEMENT_STAGES.map((stage, i) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          policies={grouped[stage]}
          selectedId={selectedId}
          isCollapsed={collapsed[stage]}
          isLast={i === ENFORCEMENT_STAGES.length - 1}
          onToggleCollapse={() => handleToggleCollapse(stage)}
        />
      ))}
    </Box>
  );
};
