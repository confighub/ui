// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * The abort reason's validation, plus the request-error formatter shared by the
 * promote/release and abort hooks so the two cannot drift into two different
 * accounts of the same failure.
 *
 * `validateAbortReason` mirrors `ValidateChangeOrderAbortedReason`
 * (internal/models/changeorder.go:219) -> `models.PermissiveTextRegexp`
 * (internal/models/base_model.go:726-730) verbatim. Character-scanned rather
 * than matched with one whole-string regexp test because the dialog needs to
 * name the offending character in its error message.
 */

export const ABORTED_REASON_MAX_LENGTH = 1024;

const PERMISSIVE_CHAR = '[\\-_@/#$%&~+=!?.,:;(){}\\[\\]<>|A-Za-z0-9]';
const ALLOWED_CHAR = new RegExp(`^(${PERMISSIVE_CHAR}| )$`);

export type AbortReasonError =
  | { kind: 'required' }
  | { kind: 'tooLong'; length: number }
  | { kind: 'illegalChar'; char: string }
  | { kind: 'edgeSpace' };

/** `submitted` is false while typing: an untouched field is never scolded. */
export function validateAbortReason(raw: string, submitted: boolean): AbortReasonError | null {
  if (raw.length === 0) return submitted ? { kind: 'required' } : null;
  if (raw.length > ABORTED_REASON_MAX_LENGTH) return { kind: 'tooLong', length: raw.length };
  for (const ch of raw) {
    if (ch === '\n') return { kind: 'illegalChar', char: '\\n' };
    if (ch === '\t') return { kind: 'illegalChar', char: '\\t' };
    if (!ALLOWED_CHAR.test(ch)) return { kind: 'illegalChar', char: ch };
  }
  if (raw !== raw.trim()) return { kind: 'edgeSpace' };
  return null;
}

/**
 * A short, human-readable account of a transport-level failure.
 *
 * The server's own message is used when there is one — it says far more than a
 * status code, and putting a bare "400" where a reason belongs tells the reader
 * nothing they can act on.
 */
export function describeRequestError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'the request failed';
  const data = (error as { data?: unknown }).data;
  if (typeof data === 'string' && data.length > 0) return data;
  /*
   * BOTH SPELLINGS. The bulk routes answer a request-level refusal with a
   * lower-case `message` — a real 400 from the clone leg reads
   * `{"message":"Error on Unit: A Unit with the same value already exists."}`
   * — while other handlers use `Message`. Reading only the capitalised one
   * dropped the server's sentence and left the reader with the bare
   * "the request failed (400)" this function exists to avoid.
   */
  const body = data as { Message?: unknown; message?: unknown } | undefined;
  for (const candidate of [body?.Message, body?.message]) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate.trim();
  }
  const status = (error as { status?: number }).status;
  return status === undefined ? 'the request failed' : `the request failed (${status})`;
}
