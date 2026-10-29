import { Module } from '@nestjs/common';
import { MetadataService } from './metadata.service.js';

@Module({
  providers: [MetadataService]
})
export class LibraryModule {}
