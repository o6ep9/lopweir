import { Module } from '@nestjs/common';
import { MetadataService } from './metadata.service.js';
import { IndexService } from './index.service.js';
import { ScannerService } from './scanner.service.js';
import { LibraryController } from './library.controller.js';

@Module({
    providers: [MetadataService, IndexService, ScannerService],
    controllers: [LibraryController],
})
export class LibraryModule {}
