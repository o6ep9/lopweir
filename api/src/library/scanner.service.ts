import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { IndexService, type FileStamp } from './index.service.js';
import { extOf, kindOf } from './media.js';
import { MetadataService } from './metadata.service.js';

/** Live progress of the current (or last) scan — returned by GET /api/library/status. */
export interface ScanStatus {
    state: 'idle' | 'scanning' | 'done' | 'error';
    /** Media files found in the folder. */
    found: number;
    /** New or changed files that need exiftool. */
    toRead: number;
    /** How many of those are already processed. */
    read: number;
    /** Files that vanished from disk and were dropped from the index. */
    removed: number;
    startedAt: number | null;
    finishedAt: number | null;
    error: string | null;
}

// How many files we hand to exiftool at once
const BATCH_SIZE = 8;

/** Walks the library folder and keeps the index in sync with what's on disk. */
@Injectable()
export class ScannerService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ScannerService.name);
    private running: Promise<void> | null = null;

    readonly status: ScanStatus = {
        state: 'idle',
        found: 0,
        toRead: 0,
        read: 0,
        removed: 0,
        startedAt: null,
        finishedAt: null,
        error: null,
    };

    constructor(
        private readonly config: ConfigService,
        private readonly index: IndexService,
        private readonly metadata: MetadataService,
    ) {}

    /** Absolute path of the library folder from LIBRARY_PATH, or null if it isn't configured. */
    get root(): string | null {
        const path = this.config.get<string>('LIBRARY_PATH');
        return path ? resolve(path) : null;
    }

    /** Nest calls this once the app is up: start the first scan in the background. */
    onApplicationBootstrap() {
        void this.scan();
    }

    /** Starts a scan, or returns the one already running — two scans at once would fight over the index. */
    scan(): Promise<void> {
        this.running ??= this.run().finally(() => (this.running = null));
        return this.running;
    }

    private async run() {
        Object.assign(this.status, {
            state: 'scanning',
            found: 0,
            toRead: 0,
            read: 0,
            removed: 0,
            startedAt: Date.now(),
            finishedAt: null,
            error: null,
        });

        try {
            const root = this.root;
            if (!root) throw new Error('LIBRARY_PATH is not set');

            const known = this.index.stamps();
            const seen = new Set<string>();
            const changed: FileStamp[] = [];

            // 1. Walk the folder. stat() is cheap: it asks the file system, it doesn't open the file
            for (const abs of await listMediaFiles(root)) {
                const path = relative(root, abs);
                const info = await stat(abs);
                const stamp: FileStamp = {
                    path,
                    size: info.size,
                    mtime: Math.floor(info.mtimeMs),
                };
                seen.add(path);
                this.status.found++;

                const prev = known.get(path);
                const isNewOrChanged =
                    !prev ||
                    prev.size !== stamp.size ||
                    prev.mtime !== stamp.mtime;
                if (isNewOrChanged) changed.push(stamp);
            }

            // 2. Forget files that are gone from disk
            for (const path of known.keys()) {
                if (!seen.has(path)) {
                    this.index.remove(path);
                    this.status.removed++;
                }
            }

            // 3. The slow part: run exiftool only for new/changed files, a few at a time
            this.status.toRead = changed.length;
            for (let i = 0; i < changed.length; i += BATCH_SIZE) {
                const batch = changed.slice(i, i + BATCH_SIZE);
                await Promise.all(
                    batch.map((file) => this.indexFile(root, file)),
                );
            }

            // 4. Now that every file is in the index, link edited copies and Live Photo videos to originals
            this.index.linkPairs();

            this.status.state = 'done';
        } catch (err) {
            this.status.state = 'error';
            this.status.error = (err as Error).message;
            this.logger.error(`Scan failed: ${this.status.error}`);
        } finally {
            this.status.finishedAt = Date.now();
            const { found, read, removed } = this.status;
            this.logger.log(
                `Scan ${this.status.state}: ${found} files, ${read} read, ${removed} removed`,
            );
        }
    }

    /** Reads one file's metadata and saves it. A broken file is logged and skipped, not fatal. */
    private async indexFile(root: string, file: FileStamp) {
        try {
            const meta = await this.metadata.read(
                join(root, file.path),
                file.mtime,
            );
            this.index.upsert({
                ...file,
                kind: kindOf(file.path)!,
                ext: extOf(file.path),
                ...meta,
            });
        } catch (err) {
            this.logger.warn(
                `Skipping ${file.path}: ${(err as Error).message}`,
            );
        }
        this.status.read++;
    }
}

/** Absolute paths of all photos/videos under root, recursively. Skips hidden files and folders. */
async function listMediaFiles(root: string): Promise<string[]> {
    const entries = await readdir(root, {
        recursive: true,
        withFileTypes: true,
    });
    return entries
        .filter((entry) => entry.isFile() && kindOf(entry.name) !== null)
        .map((entry) => join(entry.parentPath, entry.name))
        .filter(
            (abs) =>
                !relative(root, abs)
                    .split(sep)
                    .some((part) => part.startsWith('.')),
        );
}
