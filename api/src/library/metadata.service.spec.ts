import { resolve } from 'node:path';
import { MetadataService } from './metadata.service.js';

const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/photos');
const photo = (name: string) => resolve(FIXTURES, name);

describe('MetadataService', () => {
    const service = new MetadataService();
    afterAll(() => service.onModuleDestroy());

    it('reads capture time and GPS from a JPEG', async () => {
        const meta = await service.read(photo('IMG_9775.JPG'), 0);
        expect(meta.takenLocal).toBe('2025-01-31T09:05:39');
        expect(meta.dateSource).toBe('exif');
        expect(meta.lat).toBeCloseTo(10.9474, 3);
        expect(meta.lon).toBeCloseTo(108.2036, 3);
    });

    it('swaps width and height for rotated photos', async () => {
        const meta = await service.read(photo('IMG_9775.JPG'), 0);
        expect(meta).toMatchObject({ width: 3024, height: 4032 });
    });

    it('reads video date in its own time zone and duration', async () => {
        const meta = await service.read(photo('IMG_0185.MOV'), 0);
        expect(meta.takenLocal).toBe('2025-02-02T18:00:27');
        expect(meta.duration).toBeCloseTo(4.87, 1);
    });

    it('gives both halves of a Live Photo the same id', async () => {
        const still = await service.read(photo('IMG_9829.JPG'), 0);
        const video = await service.read(photo('IMG_9829.MOV'), 0);
        expect(still.liveId).toBeTruthy();
        expect(still.liveId).toBe(video.liveId);
    });

    it('falls back to mtime when there is no EXIF date', async () => {
        const mtime = new Date(2023, 5, 15, 12, 0).getTime(); // 2023-06-15 12:00 local
        const meta = await service.read(photo('IMG_4807.JPG'), mtime);
        expect(meta.dateSource).toBe('mtime');
        expect(meta.takenLocal).toBe('2023-06-15T12:00:00');
    });

    it('keeps the original capture time zone, not the machine one', async () => {
        const meta = await service.read(photo('IMG_7663.HEIC'), 0);
        expect(meta.takenLocal).toBe('2026-02-19T13:02:33');
    });
});
