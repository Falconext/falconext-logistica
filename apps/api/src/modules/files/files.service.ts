import { Injectable, Inject } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import * as streamifier from 'streamifier';

@Injectable()
export class FilesService {
    constructor(@Inject('CLOUDINARY') private cloudinary) { }

    uploadImage(file: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { resource_type: 'auto', folder: 'logistica' }, // acepta imagen o PDF
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                },
            );
            streamifier.createReadStream(file.buffer).pipe(uploadStream);
        });
    }
}
