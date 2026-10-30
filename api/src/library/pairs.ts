import { extname } from 'node:path';
import type { MediaKind } from './media.js';

/** The minimum we need to know about a file to find its pair. */
export interface PairInput {
    id: number;
    path: string;
    kind: MediaKind;
    liveId: string | null;
}

/** How a companion file relates to its original photo. */
export type PairRole = 'edited' | 'live';

/** "File childId belongs to the original photo parentId, as its edited copy / its Live Photo video". */
export interface PairLink {
    childId: number;
    parentId: number;
    role: PairRole;
}

// icloudpd saves edited photos next to the original with this suffix
const ADJUSTED_SUFFIX = '-adjusted';

/** Drops the extension. Example: '2025/IMG_9786-adjusted.JPG' → '2025/IMG_9786-adjusted'. */
function withoutExt(path: string): string {
    return path.slice(0, path.length - extname(path).length);
}

/** True for edited copies. Example: 'IMG_9786-adjusted.JPG' → true, 'IMG_9786.JPG' → false. */
function isAdjusted(path: string): boolean {
    return withoutExt(path).endsWith(ADJUSTED_SUFFIX);
}

/**
 * Common name of an original and its edited copy, folder included.
 * Example: '2025/IMG_9786-adjusted.JPG' → '2025/IMG_9786', '2025/IMG_9786.JPG' → '2025/IMG_9786'.
 */
function stemOf(path: string): string {
    const name = withoutExt(path);
    return isAdjusted(path) ? name.slice(0, -ADJUSTED_SUFFIX.length) : name;
}

/**
 * Links companion files to their original photo: edited copies (by name) and Live Photo videos (by liveId).
 * Only facts are stored here — what to show in the grid or on hover is the frontend's decision.
 * Companions whose original is missing get no link and stay standalone.
 */
export function findPairs(files: PairInput[]): PairLink[] {
    // 1. Original photos by stem: 'IMG_9786.JPG' is found under '2025/IMG_9786'
    const originalByStem = new Map<string, PairInput>();
    for (const file of files) {
        if (file.kind === 'photo' && !isAdjusted(file.path)) {
            originalByStem.set(stemOf(file.path), file);
        }
    }

    // 2. Original photos by Live Photo id
    const originalByLiveId = new Map<string, PairInput>();
    for (const original of originalByStem.values()) {
        if (original.liveId) originalByLiveId.set(original.liveId, original);
    }

    // 3. Link every companion to its original
    const links: PairLink[] = [];
    for (const file of files) {
        if (file.kind === 'photo' && isAdjusted(file.path)) {
            const original = originalByStem.get(stemOf(file.path));
            if (original) links.push({ childId: file.id, parentId: original.id, role: 'edited' });
        } else if (file.kind === 'video' && file.liveId) {
            const original = originalByLiveId.get(file.liveId);
            if (original) links.push({ childId: file.id, parentId: original.id, role: 'live' });
        }
    }
    return links;
}
