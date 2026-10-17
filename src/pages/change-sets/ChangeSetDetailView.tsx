// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * One ChangeSet: what it is (its Description, Space and authors), what it changed
 * (the image summary and the diff of each Unit), who reviewed it, and the
 * ChangeOrders that carry it. While it is open, Close ChangeSet ends it, with the
 * reviews beside the button. When a ChangeWorkflow governs it, closing it is gated:
 * Close is disabled while a gate does not hold, the Close gates section says which
 * and where, and Force close… closes it anyway with a reason it records.
 *
 * Built from the ChangeOrder page's parts: the summary card and its facts, the
 * image summary, the full diff and its Unit rows.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';

import { useBulkPatchUnitsMutation } from '@confighub/rtk-query';
import { getApiErrorMessage } from '@/utility/error-functions';

import { changeOrderPath } from '../change-orders/changeOrderAddress';
import {
  changeOrderFontMono,
  changeOrderInk,
  changeOrderStatus,
  changeOrderType,
} from '../change-orders/changeOrdersTokens';
import { FullDiffDisclosure, ImageChangeSummary } from '../change-orders/components/ImageChangeHero';
import { Fact, FactLink, OpenedAt, StateChip, SummaryCard } from '../change-orders/components/SummaryFacts';
import { UnitDiffRow } from '../change-orders/components/UnitDiffRow';
import { onlyChangesHint, type ImageChangeSubject } from '../change-orders/imageChangeCopy';
import { useSharedDiffColumns } from '../change-orders/useSharedDiffColumns';
import { ChangeSetGatesSection, ForceCloseChangeSetDialog } from './ChangeSetGatesSection';
import { ChangeSetReviews } from './ChangeSetReviews';
import { closeGatesSummaryText, type ChangeSetCloseGates } from './changeSetCloseGates';
import { CHANGE_SETS_PATH, changeSetStateTone } from './changeSetAddress';
import { reviewStatusText } from './changeSetReviewModel';
import type { ChangeSetDetail } from './useChangeSetDetail';
import { useChangeSetCloseGates } from './useChangeSetCloseGates';
import { useChangeSetReviews } from './useChangeSetReviews';

const CHANGE_SET_IMAGE_SUBJECT: ImageChangeSubject = { noun: 'ChangeSet', unitsWhere: '', idPrefix: 'change-set' };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function SectionCard({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <Box sx={{ marginTop: '16px' }}>
      <SummaryCard label={label}>
        <Box sx={{ padding: '16px 20px 18px' }}>
          <Box
            component="h2"
            sx={{ margin: '0 0 12px', fontSize: changeOrderType.size.lead, lineHeight: changeOrderType.lineHeight.heading, fontWeight: changeOrderType.weight.strong }}
          >
            {title}
          </Box>
          {children}
        </Box>
      </SummaryCard>
    </Box>
  );
}

function CloseChangeSetDialog({
  slug,
  unitCount,
  spaceCount,
  reviewStatus,
  gatesStatus,
  error,
  closing,
  onCancel,
  onConfirm,
}: {
  slug: string;
  unitCount: number;
  spaceCount: number;
  reviewStatus: string;
  /** What the close gates say, when a ChangeWorkflow governs the ChangeSet. */
  gatesStatus?: string;
  error?: string;
  closing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open onClose={closing ? undefined : onCancel} maxWidth="xs" fullWidth data-testid="change-set-close-dialog">
      <DialogTitle sx={{ fontSize: 16 }}>Close ChangeSet {slug}?</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: changeOrderType.size.prose, marginBottom: '8px' }}>
          It is open on {plural(unitCount, 'Unit')}
          {spaceCount > 1 ? ` in ${plural(spaceCount, 'Space')}` : ''}. Closing it takes all of them out of it and marks where it ends.
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, marginBottom: '8px' }}>
          Its change can then be promoted to the variants downstream. Changes made to these Units afterwards are not part of it.
        </Box>
        <Box sx={{ fontSize: changeOrderType.size.body }}>Reviews: {reviewStatus}</Box>
        {gatesStatus !== undefined ? <Box sx={{ fontSize: changeOrderType.size.body }}>Gates: {gatesStatus}</Box> : null}
        {error !== undefined ? (
          <Box role="alert" sx={{ marginTop: '10px', fontSize: changeOrderType.size.body, color: changeOrderStatus.danger }}>
            {error}
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button size="small" variant="outlined" onClick={onCancel} disabled={closing}>
          Cancel
        </Button>
        <Button size="small" variant="contained" disabled={closing} onClick={onConfirm} data-testid="change-set-close-confirm">
          {closing ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : 'Close ChangeSet'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ChangeSetDetailView({ detail, onNotice }: { detail: ChangeSetDetail; onNotice: (message: string) => void }) {
  const changeSet = detail.changeSet;
  const reviews = useChangeSetReviews(detail);
  const columns = useSharedDiffColumns();
  const [diffOpen, setDiffOpen] = useState<boolean | undefined>(undefined);
  const [closeDialog, setCloseDialog] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | undefined>(undefined);
  const [forceDialog, setForceDialog] = useState(false);
  const [bulkPatchUnits] = useBulkPatchUnitsMutation();
  // What the gates read: the Revisions the ChangeSet made, the approvals of them, and the
  // Units it is open on.
  const gatesKey = useMemo(
    () =>
      [
        ...(detail.revisions ?? []).map((entry) => `${entry.Revision?.RevisionID ?? ''}:${entry.Attestations?.length ?? 0}`),
        ...detail.openUnitIds,
      ].join(','),
    [detail.revisions, detail.openUnitIds],
  );
  const closeGates = useChangeSetCloseGates({ changeSet, open: detail.open, refreshKey: gatesKey });

  if (changeSet === undefined) return null;
  const slug = changeSet.Slug;
  const changeSetId = changeSet.ChangeSetID ?? '';
  const { imageChanges, diff } = detail;
  const imagesOnly = imageChanges.status === 'some' && imageChanges.fieldChanges.count === 0;
  const expanded = diffOpen ?? !imagesOnly;
  const status = reviewStatusText(reviews.summary);

  const governed = changeSet.ChangeWorkflowID !== undefined;
  const gates: ChangeSetCloseGates = closeGates.gates;
  const held = gates.status === 'held';
  const gatesStatus = governed ? closeGatesSummaryText(gates) : undefined;

  const close = async (forceReason?: string) => {
    setClosing(true);
    setCloseError(undefined);
    try {
      await bulkPatchUnits({
        where: `ChangeSetID = '${changeSetId}'`,
        changeSetId,
        ...(forceReason !== undefined ? { forceClose: true, forceReason } : {}),
        // @ts-expect-error RTK Query merge-patch+json content type requires pre-stringified body
        body: JSON.stringify({ ChangeSetID: null }),
      }).unwrap();
      setCloseDialog(false);
      setForceDialog(false);
      onNotice(forceReason !== undefined ? `ChangeSet ${slug} forced closed.` : `ChangeSet ${slug} closed.`);
      detail.refetch();
    } catch (error: unknown) {
      setCloseError(getApiErrorMessage(error));
      closeGates.refresh();
    } finally {
      setClosing(false);
    }
  };

  return (
    <>
      <SummaryCard label="ChangeSet summary">
        <Box sx={{ padding: '18px 20px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 220px', gap: '0 32px' }}>
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <Box
                component="h1"
                sx={{
                  fontSize: changeOrderType.size.display,
                  lineHeight: changeOrderType.lineHeight.tight,
                  fontWeight: changeOrderType.weight.strong,
                  fontFamily: changeOrderFontMono,
                  letterSpacing: '-0.015em',
                  margin: 0,
                  color: changeOrderInk.default,
                  overflowWrap: 'anywhere',
                }}
              >
                {slug}
              </Box>
              {changeSet.State ? <StateChip label={changeSet.State} tone={changeSetStateTone(changeSet.State)} /> : null}
            </Box>
            {changeSet.Description?.trim() ? (
              <Box
                data-testid="change-set-description"
                sx={{
                  fontSize: changeOrderType.size.prose,
                  lineHeight: changeOrderType.lineHeight.body,
                  color: changeOrderInk.muted,
                  margin: '6px 0 0',
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                }}
              >
                {changeSet.Description}
              </Box>
            ) : null}
            <Box
              component="dl"
              sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', margin: '16px 0 0' }}
            >
              <Fact term="Space" icon={FolderOutlinedIcon}>
                <FactLink href={`/spaces/${changeSet.SpaceID}`}>{changeSet.SpaceSlug ?? changeSet.SpaceID}</FactLink>
              </Fact>
              <Fact term="Units" icon={DataObjectOutlinedIcon}>
                <span data-testid="change-set-unit-count">
                  {detail.revisions === undefined ? '—' : `${detail.changedUnitIds.length} changed`}
                  {detail.open ? `, open on ${detail.openUnitIds.length}` : ''}
                </span>
              </Fact>
              <Fact term="Created by" icon={PersonOutlineOutlinedIcon}>
                <span data-testid="change-set-creator">{reviews.creator?.name ?? '—'}</span>
              </Fact>
              <Fact term="Authors" icon={PersonOutlineOutlinedIcon}>
                {reviews.summary.authors.length === 0 ? '—' : reviews.summary.authors.map((a) => a.name).join(', ')}
              </Fact>
              <Fact term="Opened" icon={CalendarTodayOutlinedIcon}>
                <OpenedAt value={changeSet.CreatedAt} />
              </Fact>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch' }}>
            {detail.open ? (
              <Button
                variant="contained"
                size="small"
                data-testid="change-set-close"
                disabled={held}
                onClick={() => {
                  setCloseError(undefined);
                  setCloseDialog(true);
                }}
              >
                Close ChangeSet
              </Button>
            ) : null}
            {detail.open && held ? (
              <Button
                variant="outlined"
                size="small"
                color="error"
                data-testid="change-set-force-close"
                onClick={() => {
                  setCloseError(undefined);
                  setForceDialog(true);
                }}
              >
                Force close…
              </Button>
            ) : null}
            <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>Reviews: {status}</Box>
            {detail.open && gatesStatus !== undefined ? (
              <Box
                data-testid="change-set-gates-status"
                sx={{ fontSize: changeOrderType.size.body, color: held ? changeOrderStatus.warn : changeOrderInk.muted }}
              >
                {gatesStatus}
              </Box>
            ) : null}
          </Box>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <ImageChangeSummary changes={imageChanges} stageNames={[]} subject={CHANGE_SET_IMAGE_SUBJECT} />
            {diff.status === 'failed' ? (
              <Box sx={{ marginTop: '14px', fontSize: changeOrderType.size.body, color: changeOrderStatus.danger }}>
                The ChangeSet's diff could not be read.
              </Box>
            ) : null}
            {diff.status === 'resolved' && diff.rows.length === 0 ? (
              <Box data-testid="change-set-no-change" sx={{ marginTop: '14px', fontSize: changeOrderType.size.body, color: changeOrderInk.muted }}>
                No Unit has changed in this ChangeSet yet.
              </Box>
            ) : null}
            {diff.rows.length > 0 ? (
              <FullDiffDisclosure
                idPrefix={CHANGE_SET_IMAGE_SUBJECT.idPrefix}
                changeCount={diff.changeCount}
                unitCount={diff.rows.length}
                imagesOnly={imagesOnly}
                hintText={onlyChangesHint(imageChanges.images)}
                expanded={expanded}
                onToggle={() => setDiffOpen(!expanded)}
                renderBody={() => (
                  <Box sx={{ marginTop: '12px' }}>
                    {diff.rows.map((row) => (
                      <UnitDiffRow
                        key={row.unit.unitId}
                        unitId={row.unit.unitId}
                        spaceId={row.unit.spaceId}
                        slug={row.unit.slug}
                        resourceKind={row.resourceKind}
                        spaceName={row.unit.spaceSlug}
                        spaceHref={`/spaces/${row.unit.spaceId}`}
                        changed
                        diff={row.diff}
                        columns={columns.columns}
                      />
                    ))}
                    {diff.unchangedCount > 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderInk.muted, padding: '4px 12px' }}>
                        {plural(diff.unchangedCount, 'other Unit')} in the ChangeSet {diff.unchangedCount === 1 ? 'has' : 'have'} no field that differs.
                      </Box>
                    ) : null}
                    {diff.droppedCount > 0 ? (
                      <Box sx={{ fontSize: changeOrderType.size.body, color: changeOrderStatus.warn, padding: '4px 12px' }}>
                        What the ChangeSet did to {plural(diff.droppedCount, 'Unit')} could not be read.
                      </Box>
                    ) : null}
                  </Box>
                )}
              />
            ) : null}
          </Box>
        </Box>
      </SummaryCard>

      {governed ? (
        <SectionCard label="ChangeSet close gates" title="Close gates">
          <ChangeSetGatesSection changeSet={changeSet} open={detail.open} gates={gates} closedBy={reviews.closedBy} />
        </SectionCard>
      ) : null}

      <SectionCard label="ChangeSet reviews" title="Reviews">
        <ChangeSetReviews
          reviews={reviews}
          changeSetSlug={slug}
          unitCount={detail.changedUnitIds.length}
          spaceCount={detail.changedSpaceIds.length}
          onNotice={onNotice}
        />
      </SectionCard>

      {detail.changeOrders.length > 0 ? (
        <SectionCard label="ChangeOrders carrying this change" title="ChangeOrders carrying this change">
          <Box component="ul" data-testid="change-set-change-orders" sx={{ margin: 0, paddingLeft: '18px', fontSize: changeOrderType.size.prose }}>
            {detail.changeOrders.map((order) => (
              <li key={order.changeOrderId}>
                <Box component={RouterLink} to={changeOrderPath(order.spaceSlug, order.slug)} sx={{ fontFamily: changeOrderFontMono, color: changeOrderStatus.accent }}>
                  {order.spaceSlug ? `${order.spaceSlug}/${order.slug}` : order.slug}
                </Box>
              </li>
            ))}
          </Box>
        </SectionCard>
      ) : null}

      {closeDialog ? (
        <CloseChangeSetDialog
          slug={slug}
          unitCount={detail.openUnitIds.length}
          spaceCount={detail.openSpaceIds.length}
          reviewStatus={status}
          gatesStatus={gatesStatus}
          error={closeError}
          closing={closing}
          onCancel={() => setCloseDialog(false)}
          onConfirm={() => void close()}
        />
      ) : null}

      {forceDialog && held ? (
        <ForceCloseChangeSetDialog
          slug={slug}
          gates={gates.gates}
          error={closeError}
          closing={closing}
          onCancel={() => setForceDialog(false)}
          onConfirm={(reason) => void close(reason)}
        />
      ) : null}
    </>
  );
}

/** The back link the detail view sits under. */
export function AllChangeSetsLink() {
  return (
    <Box sx={{ marginBottom: '12px' }}>
      <Box component={RouterLink} to={CHANGE_SETS_PATH} sx={{ fontSize: changeOrderType.size.prose, color: changeOrderInk.muted, textDecoration: 'none' }}>
        ← All ChangeSets
      </Box>
    </Box>
  );
}
