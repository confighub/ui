// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { ErrorBox } from '@/components/error-box/ErrorBox';
import { Header } from '@/components/header/Header';
import { AddTriggerDrawer } from '@/pages/space-detail/components/add-trigger-drawer/AddTriggerDrawer';
import { getApiErrorMessage } from '@/utility/error-functions';
import type { TriggerRead } from '@confighub/rtk-query';
import RefreshIcon from '@mui/icons-material/Cached';
import PolicyIcon from '@mui/icons-material/Policy';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { PolicyDetail } from './components/PolicyDetail';
import { ValidationBoard } from './components/ValidationBoard';
import { useValidationPolicies } from './useValidationPolicies';
import type { ValidationPolicy } from './validationModel';

/** The label naming the group of policies a Trigger belongs to. */
const PACK_LABEL = 'Pack';

const ALL_PACKS = '';

const matchesSearch = (p: ValidationPolicy, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    p.name,
    p.trigger.Slug,
    p.spaceSlug,
    p.trigger.Description,
    p.trigger.FunctionName,
  ].some((s) => s?.toLowerCase().includes(q));
};

const EmptyValidation = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
      gap: 2,
      color: 'text.secondary',
      py: 10,
    }}
  >
    <PolicyIcon sx={{ fontSize: 64, opacity: 0.3 }} />
    <Typography variant='h6' fontWeight={600}>
      No validating Triggers yet
    </Typography>
    <Typography variant='body2' textAlign='center' sx={{ maxWidth: 460 }}>
      A validating Trigger checks configuration against a policy. Create one in audit (warn)
      mode, select it in the Spaces or Targets it is for, work its warnings down, then enforce
      it. This page tracks each one through those steps.
    </Typography>
  </Box>
);

/**
 * The Validation page: the enforcement of every validating Trigger's policy, from Created through Audit
 * to Enforced, as a board; and, for the Trigger picked on it, its scope and how the Units in it
 * fared.
 *
 * Routes:
 *   /validation             the board
 *   /validation/:triggerId  the board, with that Trigger's detail below it
 */
export const InitiativesPage = () => {
  const { triggerId } = useParams<{ triggerId: string }>();
  const selectedId = triggerId ?? null;
  const navigate = useNavigate();
  const { policies, spaceById, targetById, componentById, isLoading, error, refetch } =
    useValidationPolicies();
  const [search, setSearch] = useState('');
  const [pack, setPack] = useState(ALL_PACKS);
  const [triggerToEdit, setTriggerToEdit] = useState<TriggerRead | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const packs = useMemo(
    () =>
      [
        ...new Set(
          policies.flatMap((p) =>
            p.trigger.Labels?.[PACK_LABEL] ? [p.trigger.Labels[PACK_LABEL]] : [],
          ),
        ),
      ].sort(),
    [policies],
  );
  const shownPolicies = useMemo(
    () =>
      policies.filter(
        (p) =>
          matchesSearch(p, search) &&
          (pack === ALL_PACKS || p.trigger.Labels?.[PACK_LABEL] === pack),
      ),
    [policies, search, pack],
  );
  const selected = useMemo(
    () => policies.find((p) => p.id === selectedId),
    [policies, selectedId],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedId && !triggerToEdit) navigate('/validation');
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedId, triggerToEdit, navigate]);

  // Scroll the detail into view when a card is picked, once it is there to scroll to.
  const scrolledToRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || scrolledToRef.current === selected.id) return;
    scrolledToRef.current = selected.id;
    requestAnimationFrame(() => {
      const el = detailRef.current;
      const container = scrollContainerRef.current;
      if (!el || !container) return;
      const top =
        el.getBoundingClientRect().top -
        container.getBoundingClientRect().top +
        container.scrollTop -
        16;
      container.scrollTo({ top, behavior: 'smooth' });
    });
  }, [selected]);

  return (
    <Box
      ref={scrollContainerRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'auto',
        backgroundColor: 'rgb(249, 250, 251)',
      }}
    >
      <Header breadCrumbs={[{ name: 'Validation' }]} />

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Box sx={{ p: 3 }}>
          <ErrorBox
            error={getApiErrorMessage(error, 'Could not read the validating Triggers.')}
            onClose={refetch}
          />
        </Box>
      ) : policies.length === 0 ? (
        <EmptyValidation />
      ) : (
        <>
          <Box
            sx={{
              px: 3,
              pt: 2,
              display: 'flex',
              gap: 1.5,
              alignItems: 'center',
              maxWidth: 1400,
              mx: 'auto',
              width: '100%',
              // Its padding inside its width, so it fits the page rather than scrolling it sideways.
              boxSizing: 'border-box',
            }}
          >
            <TextField
              size='small'
              placeholder='Search Triggers'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <SearchIcon fontSize='small' />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'aria-label': 'Search Triggers' },
              }}
              sx={{ width: 280, bgcolor: 'background.paper' }}
            />
            {packs.length > 0 && (
              <TextField
                select
                size='small'
                label='Pack'
                value={pack}
                onChange={(e) => setPack(e.target.value)}
                sx={{ minWidth: 160, bgcolor: 'background.paper' }}
              >
                <MenuItem value={ALL_PACKS}>All</MenuItem>
                {packs.map((p) => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Typography variant='body2' color='text.secondary' sx={{ ml: 'auto' }}>
              {shownPolicies.length === policies.length
                ? `${policies.length} validating Triggers`
                : `${shownPolicies.length} of ${policies.length} validating Triggers`}
            </Typography>
            <Tooltip title='Refresh'>
              <IconButton onClick={refetch} aria-label='Refresh'>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>

          <Box sx={{ p: 3, pt: 2, flexShrink: 0 }}>
            <ValidationBoard policies={shownPolicies} selectedId={selectedId} />
          </Box>

          {selectedId && !selected && (
            <Box sx={{ px: 3, pb: 3 }}>
              <Typography color='text.secondary'>
                No validating Trigger has this ID.
              </Typography>
            </Box>
          )}
          {selected && (
            <Box
              ref={detailRef}
              sx={{ px: 3, pb: 4, maxWidth: 1400, mx: 'auto', width: '100%', boxSizing: 'border-box' }}
            >
              <PolicyDetail
                key={selected.id}
                policy={selected}
                spaceById={spaceById}
                targetById={targetById}
                componentById={componentById}
                onEdit={setTriggerToEdit}
                onClose={() => navigate('/validation')}
                onRefresh={refetch}
              />
            </Box>
          )}
        </>
      )}

      <AddTriggerDrawer
        key={triggerToEdit?.TriggerID || 'none'}
        isOpen={!!triggerToEdit}
        onClose={() => setTriggerToEdit(undefined)}
        onTriggerUpdated={() => setTriggerToEdit(undefined)}
        existingTrigger={triggerToEdit}
        orgID=''
        spaceId=''
      />
    </Box>
  );
};

export default InitiativesPage;
