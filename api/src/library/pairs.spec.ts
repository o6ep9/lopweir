import { kindOf } from './media.js';
import { findPairs, type PairInput } from './pairs.js';

/** Builds a fake indexed file. Kind is derived from the extension, like the scanner does. */
function file(id: number, path: string, liveId: string | null = null): PairInput {
    return { id, path, kind: kindOf(path)!, liveId };
}

describe('findPairs', () => {
    it('links an edited copy to its original', () => {
        const files = [file(1, 'IMG_9786.JPG'), file(2, 'IMG_9786-adjusted.JPG')];

        expect(findPairs(files)).toEqual([{ childId: 2, parentId: 1, role: 'edited' }]);
    });

    it('links a Live Photo video to its original by liveId', () => {
        const files = [file(1, 'IMG_9829.JPG', 'abc'), file(2, 'IMG_9829.MOV', 'abc')];

        expect(findPairs(files)).toEqual([{ childId: 2, parentId: 1, role: 'live' }]);
    });

    it('links both companions of one original', () => {
        const files = [
            file(1, 'IMG_9829.JPG', 'abc'),
            file(2, 'IMG_9829-adjusted.JPG'),
            file(3, 'IMG_9829.MOV', 'abc'),
        ];

        const links = findPairs(files);

        expect(links).toHaveLength(2);
        expect(links).toContainEqual({ childId: 2, parentId: 1, role: 'edited' });
        expect(links).toContainEqual({ childId: 3, parentId: 1, role: 'live' });
    });

    it('does not depend on the order of files', () => {
        const files = [file(2, 'IMG_9786-adjusted.JPG'), file(1, 'IMG_9786.JPG')];

        expect(findPairs(files)).toEqual([{ childId: 2, parentId: 1, role: 'edited' }]);
    });

    it('leaves a regular video standalone', () => {
        const files = [file(1, 'IMG_0185.MOV')];

        expect(findPairs(files)).toEqual([]);
    });

    it('leaves an edited copy standalone when its original is missing', () => {
        const files = [file(1, 'IMG_9786-adjusted.JPG')];

        expect(findPairs(files)).toEqual([]);
    });

    it('does not pair same-named files from different folders', () => {
        const files = [file(1, '2023/IMG_0001.JPG'), file(2, '2025/IMG_0001-adjusted.JPG')];

        expect(findPairs(files)).toEqual([]);
    });
});
