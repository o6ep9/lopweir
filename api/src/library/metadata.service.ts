import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ExifDateTime, ExifTool, type Tags } from 'exiftool-vendored';

/** Where the capture date came from: the photo's own EXIF, or the file's modification time. */
export type DateSource = 'exif' | 'mtime';

/** Everything we extract from a single photo or video file. */
export interface PhotoMeta {
  /** Capture moment, epoch milliseconds (for sorting). */
  takenAt: number;
  /** Wall-clock time at the place of capture: 'YYYY-MM-DDTHH:mm:ss' (for grouping by day/hour). */
  takenLocal: string;
  dateSource: DateSource;
  /** Size as the viewer sees it (already corrected for rotation). */
  width: number | null;
  height: number | null;
  lat: number | null;
  lon: number | null;
  make: string | null;
  model: string | null;
  /** Video length in seconds; null for photos. */
  duration: number | null;
  /** Apple ContentIdentifier: both halves of a Live Photo (still + video) share it. */
  liveId: string | null;
}

// EXIF Orientation: 1 = normal, 3 = upside down, 6 = rotate 90° CW, 8 = rotate 90° CCW,
// 5 and 7 = mirrored + rotated 90°. Only 5–8 mean "stored sideways".
const SIDEWAYS_ORIENTATIONS = [5, 6, 7, 8];
// Videos use a Rotation tag in degrees instead
const SIDEWAYS_ROTATIONS = [90, 270];

/** Returns the value if it is a real number, otherwise null. Example: 4032 → 4032, undefined → null. */
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Returns a trimmed non-empty string, otherwise null. Example: ' Apple ' → 'Apple', '' → null. */
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Formats epoch ms as local wall-clock time without zone.
 * Example: 1686819600000 → '2023-06-15T12:00:00' (on a UTC+3 machine).
 */
function localIso(ms: number): string {
  const shifted = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 19);
}

/** Reads photo/video metadata (date, size, GPS, camera, Live Photo id) using exiftool. */
@Injectable()
export class MetadataService implements OnModuleDestroy {
  // One long-lived exiftool process (-stay_open) instead of spawning perl per file
  private readonly exiftool = new ExifTool({ taskTimeoutMillis: 30_000 });

  /**
   * Extracts metadata from one file.
   * @param file  absolute path to a photo or video
   * @param mtime file modification time (epoch ms) — used as the capture date only if EXIF has none
   */
  async read(file: string, mtime: number): Promise<PhotoMeta> {
    const tags = await this.exiftool.read(file);
    const date = this.pickDate(tags)?.toDateTime();
    const hasDate = date?.isValid === true;

    let width = num(tags.ImageWidth) ?? num(tags.ExifImageWidth);
    let height = num(tags.ImageHeight) ?? num(tags.ExifImageHeight);

    const orientation = Number(tags.Orientation);
    const rotation = Number(tags.Rotation);
    const isSideways =
      SIDEWAYS_ORIENTATIONS.includes(orientation) || SIDEWAYS_ROTATIONS.includes(rotation);
    if (isSideways) {
      // The file is stored 4032×3024, but the photo you see is 3024×4032
      const tmp = width;
      width = height;
      height = tmp;
    }

    const lat = num(tags.GPSLatitude);
    const lon = num(tags.GPSLongitude);
    // Some cameras write 0,0 instead of "no GPS" — that's the ocean off Africa, treat as missing
    const hasGps = lat !== null && lon !== null && !(lat === 0 && lon === 0);

    return {
      takenAt: hasDate ? date.toMillis() : mtime,
      takenLocal: hasDate ? date.toFormat("yyyy-MM-dd'T'HH:mm:ss") : localIso(mtime),
      dateSource: hasDate ? 'exif' : 'mtime',
      width,
      height,
      lat: hasGps ? lat : null,
      lon: hasGps ? lon : null,
      make: str(tags.Make),
      model: str(tags.Model),
      duration: num(tags.Duration),
      liveId: str(tags.ContentIdentifier),
    };
  }

  /**
   * Picks the best capture date tag. Order matters:
   * DateTimeOriginal (photos) → CreationDate (iPhone videos, local time + zone) → CreateDate (videos, UTC).
   */
  private pickDate(tags: Tags): ExifDateTime | null {
    for (const value of [tags.DateTimeOriginal, tags.CreationDate, tags.CreateDate]) {
      if (value instanceof ExifDateTime) return value;
    }
    return null;
  }

  /** Nest calls this on shutdown: stop the exiftool process so it doesn't linger. */
  async onModuleDestroy() {
    await this.exiftool.end();
  }
}
