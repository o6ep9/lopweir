import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { IndexService } from './index.service.js';
import { ScannerService } from './scanner.service.js';

/** HTTP endpoints for the photo library, all under /api/library. */
@Controller('library')
export class LibraryController {
  constructor(
    private readonly scanner: ScannerService,
    private readonly index: IndexService,
  ) {}

  /** GET /api/library/status — where the library is, scan progress, how many files are indexed. */
  @Get('status')
  status() {
    return { root: this.scanner.root, scan: this.scanner.status, indexed: this.index.count() };
  }

  /** POST /api/library/scan — start a rescan in the background and return right away. */
  @Post('scan')
  @HttpCode(202)
  scan() {
    void this.scanner.scan();
    return this.scanner.status;
  }

  /** GET /api/library/photos — everything in the index (temporary, to see the scan result). */
  @Get('photos')
  photos() {
    return this.index.all();
  }
}
