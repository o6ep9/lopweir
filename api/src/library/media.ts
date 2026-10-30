import { extname } from 'node:path';

export type MediaKind = 'photo' | 'video';

const PHOTO_EXT = new Set([
    'jpg',
    'jpeg',
    'png',
    'heic',
    'heif',
    'webp',
    'gif',
    'avif',
    'tif',
    'tiff',
    'dng',
]);
const VIDEO_EXT = new Set(['mov', 'mp4', 'm4v', 'avi', 'mkv', '3gp']);

/** 'IMG_0001.HEIC' -> 'heic' */
export function extOf(path: string): string {
    return extname(path).slice(1).toLowerCase();
}

/** Returns null for files we don't care about (.xmp, .txt, .DS_Store...) */
export function kindOf(path: string): MediaKind | null {
    const ext = extOf(path);
    if (PHOTO_EXT.has(ext)) return 'photo';
    if (VIDEO_EXT.has(ext)) return 'video';
    return null;
}
