import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { MediaKind } from './media.js';
import type { PhotoMeta } from './metadata.service.js';

/** One row of the photos table = one file in the library. */
export interface PhotoRecord extends PhotoMeta {
    id: number;
    /** Path relative to the library root, e.g. '2025/01/31/IMG_9775.JPG'. */
    path: string;
    size: number;
    mtime: number;
    kind: MediaKind;
    ext: string;
}

/** What we remember about a file to notice changes on the next scan. */
export interface FileStamp {
    path: string;
    size: number;
    mtime: number;
}

// Bump this when the table layout changes: the old index is dropped and rebuilt
const SCHEMA_VERSION = 1;

/** Stores the scanned library in a local SQLite file. It's a cache: safe to delete any time. */
@Injectable()
export class IndexService implements OnModuleDestroy {
    private readonly db: DatabaseSync;

    constructor(config: ConfigService) {
        const dir = resolve(
            config.get<string>('CACHE_DIR') ??
                join(homedir(), '.cache', 'lopweir'),
        );
        mkdirSync(dir, { recursive: true });
        this.db = new DatabaseSync(join(dir, 'index.sqlite'));
        this.migrate();
    }

    /** Creates the table, or recreates it if SCHEMA_VERSION changed (the data lives in files anyway). */
    private migrate() {
        const { user_version } = this.db
            .prepare('PRAGMA user_version')
            .get() as {
            user_version: number;
        };
        if (user_version === SCHEMA_VERSION) return;

        this.db.exec(`
      DROP TABLE IF EXISTS photos;
      CREATE TABLE photos (
        id          INTEGER PRIMARY KEY,
        path        TEXT    NOT NULL UNIQUE,
        size        INTEGER NOT NULL,
        mtime       INTEGER NOT NULL,
        kind        TEXT    NOT NULL,
        ext         TEXT    NOT NULL,
        takenAt     INTEGER NOT NULL,
        takenLocal  TEXT    NOT NULL,
        dateSource  TEXT    NOT NULL,
        width       INTEGER,
        height      INTEGER,
        lat         REAL,
        lon         REAL,
        make        TEXT,
        model       TEXT,
        duration    REAL,
        liveId      TEXT
      );
      CREATE INDEX photos_taken ON photos (takenLocal);
      PRAGMA user_version = ${SCHEMA_VERSION};
    `);
    }

    /** All known files with their size and mtime, keyed by path — the scanner compares against this. */
    stamps(): Map<string, FileStamp> {
        const rows = this.db
            .prepare('SELECT path, size, mtime FROM photos')
            .all() as unknown as FileStamp[];
        return new Map(rows.map((row) => [row.path, row]));
    }

    /** Inserts a new file or overwrites an existing one with the same path. */
    upsert(record: Omit<PhotoRecord, 'id'>) {
        this.db
            .prepare(
                `INSERT INTO photos (path, size, mtime, kind, ext, takenAt, takenLocal, dateSource,
                             width, height, lat, lon, make, model, duration, liveId)
         VALUES (:path, :size, :mtime, :kind, :ext, :takenAt, :takenLocal, :dateSource,
                 :width, :height, :lat, :lon, :make, :model, :duration, :liveId)
         ON CONFLICT (path) DO UPDATE SET
           size = excluded.size, mtime = excluded.mtime, kind = excluded.kind, ext = excluded.ext,
           takenAt = excluded.takenAt, takenLocal = excluded.takenLocal, dateSource = excluded.dateSource,
           width = excluded.width, height = excluded.height, lat = excluded.lat, lon = excluded.lon,
           make = excluded.make, model = excluded.model, duration = excluded.duration, liveId = excluded.liveId`,
            )
            .run({ ...record });
    }

    /** Removes a file that no longer exists on disk. */
    remove(path: string) {
        this.db.prepare('DELETE FROM photos WHERE path = ?').run(path);
    }

    /** Everything in the index, newest first. */
    all(): PhotoRecord[] {
        return this.db
            .prepare('SELECT * FROM photos ORDER BY takenLocal DESC')
            .all() as unknown as PhotoRecord[];
    }

    /** How many files are indexed. */
    count(): number {
        const row = this.db
            .prepare('SELECT COUNT(*) AS n FROM photos')
            .get() as {
            n: number;
        };
        return row.n;
    }

    /** Nest calls this on shutdown: close the database file properly. */
    onModuleDestroy() {
        this.db.close();
    }
}
