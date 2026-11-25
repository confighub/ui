// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/** How the Audit log writes an AuditEvent's time, subject and links. */
import { type Principal, serviceAccountPath, shortId } from '@/hooks/usePrincipalNames';
import type { AuditEventRead } from '@confighub/rtk-query';

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** `14:36:52`, local time. */
export function clockText(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** `Today`, `Yesterday`, `Nov 23`, or `Nov 23, 2025` in another year. */
export function dayText(iso: string | undefined, now: number): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date(now);
  if (sameDay(date, today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** The Space of the subject goes first, as `space/slug`, except for a Space itself. */
export function subjectSpaceSlug(
  event: AuditEventRead,
  spaceSlugById: ReadonlyMap<string, string>,
): string | undefined {
  if (!event.SpaceID || event.SubjectEntityType === 'Space') return undefined;
  return spaceSlugById.get(event.SpaceID);
}

/** The User a UserToken or UserKey belongs to, which its event's document records. */
export interface CredentialOwner {
  name: string;
  /** The owner's page, for a service account. */
  href?: string;
}

/** Looks up a credential's owner by UserID; `undefined` while it cannot be named. */
export type OwnerLookup = (userId: string) => CredentialOwner | undefined;

const CREDENTIAL_NOUN: Record<string, string> = { UserToken: 'Token', UserKey: 'Key' };

// The slug the server gives an entity with no name of its own: `id` and the entity's UUID.
const ID_SLUG_RE =
  /^id[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The UserID of the owner of the credential an event is on, from its document. */
export function credentialOwnerId(event: AuditEventRead): string | undefined {
  if (event.SubjectEntityType === undefined || !(event.SubjectEntityType in CREDENTIAL_NOUN))
    return undefined;
  const document = (event.After ?? event.Before) as { UserID?: unknown } | null | undefined;
  return typeof document?.UserID === 'string' ? document.UserID : undefined;
}

/** The subject's own name: its slug, or for a credential with no slug, whose it is. */
export function subjectName(event: AuditEventRead, owner?: OwnerLookup): string {
  if (event.SubjectSlug && !ID_SLUG_RE.test(event.SubjectSlug)) return event.SubjectSlug;
  const noun = event.SubjectEntityType ? CREDENTIAL_NOUN[event.SubjectEntityType] : undefined;
  if (noun) {
    const ownerId = credentialOwnerId(event);
    const found = ownerId ? owner?.(ownerId) : undefined;
    return found ? `${noun} of ${found.name}` : `A ${noun.toLowerCase()}`;
  }
  return `Unnamed ${event.SubjectEntityType ?? 'entity'}`;
}

/** The subject as one line, for a title or a list of choices. */
export function subjectText(
  event: AuditEventRead,
  spaceSlugById: ReadonlyMap<string, string>,
  owner?: OwnerLookup,
): string {
  const slug = subjectName(event, owner);
  const space = subjectSpaceSlug(event, spaceSlugById);
  return space ? `${space}/${slug}` : slug;
}

/**
 * Where the subject's own page is, when it has one and still exists: a deleted entity's page is
 * gone, so its event links nowhere.
 */
export function subjectHref(
  event: AuditEventRead,
  spaceSlugById: ReadonlyMap<string, string>,
  owner?: OwnerLookup,
): string | undefined {
  if (event.Action === 'Delete' && event.Outcome === 'Succeeded') return undefined;
  const id = event.SubjectEntityID;
  switch (event.SubjectEntityType) {
    case 'Unit':
      return id && event.SpaceID ? `/units/${event.SpaceID}/${id}` : undefined;
    case 'Space':
      return id ? `/spaces/${id}` : undefined;
    case 'ServiceAccount':
      return event.SubjectSlug ? serviceAccountPath(event.SubjectSlug) : undefined;
    case 'ChangeOrder': {
      const space = event.SpaceID ? spaceSlugById.get(event.SpaceID) : undefined;
      return space && event.SubjectSlug
        ? `/change-orders/${encodeURIComponent(space)}/${encodeURIComponent(event.SubjectSlug)}`
        : undefined;
    }
    case 'UserToken':
    case 'UserKey': {
      const ownerId = credentialOwnerId(event);
      return ownerId ? owner?.(ownerId)?.href : undefined;
    }
    default:
      return undefined;
  }
}

export const isFailure = (event: AuditEventRead) =>
  event.Outcome === 'Denied' || event.Outcome === 'Failed';

/** A principal's name, or what it is when nothing names it: an id is never shown. */
export function principalLabel(
  principal: Principal,
  loaded: boolean,
  unknown: string,
): string {
  if (principal.name !== shortId(principal.id)) return principal.name;
  return loaded ? unknown : '…';
}
