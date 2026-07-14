import {
    Controller,
    Post,
    UseInterceptors,
    UploadedFile,
    ParseFilePipe,
    MaxFileSizeValidator,
    FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
    constructor(private readonly filesService: FilesService) { }

    @Post('upload')
    @UseInterceptors(FileInterceptor('file'))
    async uploadFile(
        @UploadedFile(
            new ParseFilePipe({
                validators: [
                    new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
                    // new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }), // Optional strict check
                ],
            }),
        )
        file: any, // Express.Multer.File
    ) {
        const result = await this.filesService.uploadImage(file);
        return {
            url: result.secure_url,
            public_id: result.public_id,
        };
    }
}
