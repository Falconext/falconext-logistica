import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { CloudinaryProvider } from './cloudinary.provider';

@Module({
    controllers: [FilesController],
    providers: [CloudinaryProvider, FilesService],
    exports: [FilesService],
})
export class FilesModule { }
