// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Whether the viewer reads every AuditEvent of the Organization or only their own.
 *
 * The server sends an Organization admin every event and anyone else only the events they made,
 * and nothing the UI reads names the viewer's Organization role. Two one-event reads tell:
 * an event made by someone else can reach only an admin, and the viewer's own newest event
 * records the role they had then. With neither, the viewer is taken to see only their own.
 */
import { useUserInfo } from '@/components/authenticated-context/AuthenticatedContext';
import { useListAuditEventsQuery } from '@confighub/rtk-query';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface AuditViewer {
  userId: string;
  /** `undefined` until both reads answer, and when either fails. */
  readsAll: boolean | undefined;
}

export function useAuditViewer(): AuditViewer {
  const { userInfo } = useUserInfo();
  const userId = userInfo?.UserID ?? '';
  const skip = !UUID_RE.test(userId);
  const others = useListAuditEventsQuery(
    { where: `UserID != '${userId}'`, limit: 1, select: 'AuditEventID' },
    { skip },
  );
  const own = useListAuditEventsQuery(
    {
      where: `UserID = '${userId}'`,
      limit: 1,
      orderBy: 'DESC:OccurredAt',
      select: 'AuditEventID,Role',
    },
    { skip },
  );

  if (skip || others.isError || own.isError || others.isLoading || own.isLoading)
    return { userId, readsAll: undefined };
  const seesOthers = (others.data?.length ?? 0) > 0;
  const wasAdmin = own.data?.[0]?.AuditEvent?.Role === 'admin';
  return { userId, readsAll: seesOthers || wasAdmin };
}
