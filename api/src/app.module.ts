import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LibraryModule } from './library/library.module.js';

@Module({
    imports: [ConfigModule.forRoot({ isGlobal: true }), LibraryModule],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
