import { ConfigService } from '@nestjs/config';
import { cp, mkdtemp, readdir, rm, unlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { IndexService } from './index.service.js';
import { kindOf } from './media.js';
import { MetadataService } from './metadata.service.js';
import { ScannerService } from './scanner.service.js';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/photos');

describe('ScannerService', () => {
  let tmp: string;
  let library: string;
  let index: IndexService;
  let metadata: MetadataService;
  let scanner: ScannerService;

  beforeEach(async () => {
    // Each test gets a throwaway copy of the fixtures: tests below modify and delete files
    tmp = await mkdtemp(join(tmpdir(), 'lopweir-test-'));
    library = join(tmp, 'photos');
    await cp(FIXTURES, library, { recursive: true });

    const config = new ConfigService({ LIBRARY_PATH: library, CACHE_DIR: join(tmp, 'cache') });
    index = new IndexService(config);
    metadata = new MetadataService();
    scanner = new ScannerService(config, index, metadata);
  });

  afterEach(async () => {
    index.onModuleDestroy();
    await metadata.onModuleDestroy();
    await rm(tmp, { recursive: true, force: true });
  });

  it('indexes every media file on the first scan', async () => {
    const mediaFiles = (await readdir(FIXTURES)).filter((name) => kindOf(name) !== null);

    await scanner.scan();

    expect(scanner.status.state).toBe('done');
    expect(index.count()).toBe(mediaFiles.length);
  });

  it('does not re-read unchanged files on the second scan', async () => {
    await scanner.scan();
    await scanner.scan();

    expect(scanner.status.toRead).toBe(0);
  });

  it('re-reads a file whose mtime changed', async () => {
    await scanner.scan();
    const newDate = new Date(2020, 0, 1); // 2020-01-01 00:00 local
    await utimes(join(library, 'IMG_4807.JPG'), newDate, newDate);

    await scanner.scan();

    expect(scanner.status.toRead).toBe(1);
    // This file has no EXIF date, so the new mtime becomes its capture date
    const photo = index.all().find((p) => p.path === 'IMG_4807.JPG');
    expect(photo?.takenLocal).toBe('2020-01-01T00:00:00');
  });

  it('forgets files deleted from disk', async () => {
    await scanner.scan();
    const before = index.count();
    await unlink(join(library, 'IMG_9775.JPG'));

    await scanner.scan();

    expect(scanner.status.removed).toBe(1);
    expect(index.count()).toBe(before - 1);
  });
});
