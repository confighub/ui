// Copyright (C) ConfigHub, Inc.
// SPDX-License-Identifier: MIT

// Pure, unit-testable rules for the component wizard's folder-upload mode.
// Kept out of CreateComponentPane.tsx so the safety rules (extension/noise
// filtering, size caps, the readEntries-100 truncation trap) can be
// exercised without rendering anything.

// ============================================================================
// LIMITS
// ============================================================================

export const MAX_FOLDER_FILES = 200;
export const MAX_FILE_BYTES = 5 << 20; // 5 MiB
export const MAX_TOTAL_BYTES = 50 << 20; // 50 MiB — comfortably inside the server's 256 MiB body limit

// ============================================================================
// TYPES
// ============================================================================

export interface PickedFile {
  path: string;
  file: File;
}

export interface FolderImportOutcome {
  /** Accepted files, relative path → text. Insertion-ordered. */
  accepted: Array<{ path: string; text: string }>;
  /** Files rejected for size, with their path. */
  oversized: string[];
  /** Files filtered out (wrong extension / noise dir) — count only. */
  filtered: number;
  /** Set when the whole import was refused; `accepted` is then empty. */
  fatal?: string;
}

// ============================================================================
// FILTERS
// ============================================================================

/** `.yaml`/`.yml`, case-insensitive — mirrors `cub variant upload` and ocisource.isYAMLName. */
export function isYamlPath(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}

/** True when any path segment starts with `.` or is `node_modules` / `vendor`. */
export function isNoisePath(path: string): boolean {
  const segments = path.split('/');
  return segments.some((seg) => seg.startsWith('.') || seg === 'node_modules' || seg === 'vendor');
}

/** Strip the picked folder's own root segment: `app/base/d.yaml` → `base/d.yaml`. */
export function relativeToRoot(webkitRelativePath: string): string {
  const idx = webkitRelativePath.indexOf('/');
  return idx < 0 ? webkitRelativePath : webkitRelativePath.slice(idx + 1);
}

// ============================================================================
// IMPORT PIPELINE
// ============================================================================

/** Apply every filter and cap, then read the survivors. */
export async function importFolderFiles(files: PickedFile[]): Promise<FolderImportOutcome> {
  let filtered = 0;
  const candidates: PickedFile[] = [];
  for (const f of files) {
    if (!isYamlPath(f.path) || isNoisePath(f.path)) {
      filtered++;
      continue;
    }
    candidates.push(f);
  }

  if (candidates.length > MAX_FOLDER_FILES) {
    return {
      accepted: [],
      oversized: [],
      filtered,
      fatal: `Folder contains ${candidates.length} .yaml files (limit ${MAX_FOLDER_FILES}). Pick a narrower folder.`,
    };
  }

  const oversized: string[] = [];
  const kept: PickedFile[] = [];
  for (const f of candidates) {
    if (f.file.size > MAX_FILE_BYTES) {
      oversized.push(f.path);
    } else {
      kept.push(f);
    }
  }

  const totalBytes = kept.reduce((sum, f) => sum + f.file.size, 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    return {
      accepted: [],
      oversized: [],
      filtered,
      fatal: `Folder contents total ${(totalBytes / (1 << 20)).toFixed(1)} MiB (limit ${MAX_TOTAL_BYTES / (1 << 20)} MiB). Pick a narrower folder.`,
    };
  }

  const accepted = await Promise.all(
    kept.map(async (f) => ({ path: f.path, text: await f.file.text() })),
  );

  return { accepted, oversized, filtered };
}

// ============================================================================
// DRAG-DROP DIRECTORY WALK
// ============================================================================

// Minimal ambient shapes for the (non-standard, Chromium/WebKit-only)
// FileSystem Entry API — not present in lib.dom.d.ts.
interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  name: string;
}
interface FileSystemFileEntryLike extends FileSystemEntryLike {
  isFile: true;
  file(cb: (f: File) => void, errCb?: (e: unknown) => void): void;
}
interface FileSystemDirectoryReaderLike {
  // Returns AT MOST 100 entries per call — callers must loop until it yields [].
  readEntries(
    cb: (entries: FileSystemEntryLike[]) => void,
    errCb?: (e: unknown) => void,
  ): void;
}
interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  isDirectory: true;
  createReader(): FileSystemDirectoryReaderLike;
}

function readAllEntries(reader: FileSystemDirectoryReaderLike): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        // MUST loop: readEntries returns at most 100 entries per call.
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function readFileEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string, out: PickedFile[]): Promise<void> {
  const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntryLike);
    out.push({ path: relPath, file });
    return;
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntryLike;
    const children = await readAllEntries(dirEntry.createReader());
    for (const child of children) {
      await walkEntry(child, relPath, out);
    }
  }
}

/**
 * Recursively walk a dropped DataTransferItemList's directory entries.
 *
 * Each TOP-LEVEL directory entry is treated as the picked folder's own root
 * and is NOT included in the returned paths — mirroring `relativeToRoot`'s
 * stripping of `webkitRelativePath`'s first segment for the `<input
 * webkitdirectory>` picker, so drag-drop and the picker produce identical
 * relative paths for the same folder.
 */
export async function walkDroppedEntries(items: DataTransferItemList): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  // `items` must have already been captured synchronously (webkitGetAsEntry()
  // called before the first await) by the caller's onDrop handler — the list
  // is neutered after the event turn.
  const entries: FileSystemEntryLike[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null };
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  for (const entry of entries) {
    if (entry.isDirectory) {
      // Skip the root folder's own name — descend directly into its children.
      const dirEntry = entry as FileSystemDirectoryEntryLike;
      const children = await readAllEntries(dirEntry.createReader());
      for (const child of children) {
        await walkEntry(child, '', out);
      }
    } else {
      // A bare file dropped directly (no enclosing folder) keeps its own name.
      await walkEntry(entry, '', out);
    }
  }
  return out;
}
