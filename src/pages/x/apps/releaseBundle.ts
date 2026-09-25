// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

/**
 * Detects whether a Release's bundle (`ReleaseRead.Data`) contains zero
 * files — the "publishes successfully but bundles nothing" failure mode.
 * Root cause (backend, NOT fixed here): `internal/views/release_core.go`
 * only bundles Units whose `TargetID` equals the Space's `ReleaseTargetID`;
 * a Space whose Units aren't (yet) assigned to that Target publishes an
 * empty, but otherwise perfectly successful (200 OK, new history row),
 * Release.
 *
 * VERIFIED against a live local backend (2026-07-17, dev DB, Space
 * `us-prod-1-eshop`, whose 5 Units all target a DIFFERENT Target than the
 * Space's ReleaseTargetID — i.e. a real, naturally-occurring instance of
 * this exact bug):
 * - `Data` is base64(gzip(tar)) and is present BY DEFAULT on both the
 *   `POST .../release` (publish) response and a single-release `GET` — no
 *   `select`/`include` param needed. Confirmed via a real `POST` against
 *   the running backend, not just the Go source.
 * - An empty bundle decompresses to exactly 1024 zero bytes — tar's
 *   canonical two 512-byte all-zero end-of-archive blocks, with no file
 *   entries at all.
 * - 5 independent real publishes against that Space produced BYTE-IDENTICAL
 *   `Data` (`Digest` = `sha256:4f4fb700ef54461cfa02571ae0db9a0dc1e0cdb5577484a6d75e68dc38e8acc1`
 *   every time), proving the backend's gzip output is deterministic for
 *   empty input — so a digest-comparison shortcut WOULD have been reliable
 *   too, but this module checks the decompressed bytes directly instead
 *   (see below for why).
 *
 * No new dependency: `ui/package.json` has no existing gzip/tar library, and
 * none is needed — this uses the native `DecompressionStream('gzip')` Web
 * API (broadly supported: Chrome/Edge 80+, Firefox 113+, Safari 16.4+; this
 * is an internal admin tool with no legacy-browser requirement). Checking
 * for "any non-zero byte in the decompressed tar" rather than comparing a
 * hardcoded compressed-bytes digest means this stays correct even if the
 * backend's gzip parameters (compression level, an embedded mtime, etc.)
 * ever change — those would change the DIGEST of an empty bundle, but not
 * the fact that its decompressed tar content is all zero bytes.
 */

/** Decode a standard base64 string (as returned for a `format:"byte"` OpenAPI field) into raw bytes. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function decompressGzip(bytes: Uint8Array): Promise<Uint8Array> {
  // Uint8Array -> ReadableStream -> gunzip -> ArrayBuffer, entirely via
  // standard Web APIs (Response is a convenient bytes<->stream adapter).
  const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * @param base64Data `ReleaseRead.Data` — base64(gzip(tar)).
 * @returns true if the bundle contains zero files (all-zero decompressed content).
 */
export async function isEmptyReleaseBundle(base64Data: string): Promise<boolean> {
  const compressed = base64ToBytes(base64Data);
  const decompressed = await decompressGzip(compressed);
  for (let i = 0; i < decompressed.length; i++) {
    if (decompressed[i] !== 0) return false;
  }
  return true;
}
