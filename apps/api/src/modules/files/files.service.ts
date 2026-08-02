import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Almacenamiento de archivos en AWS S3 (bucket `nexara-s3`, compartido con
// falconext-mype). Reemplaza a Cloudinary. Config vía env:
//   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET_NAME
@Injectable()
export class FilesService {
    private readonly logger = new Logger(FilesService.name);
    private s3Client: S3Client | null = null;
    private bucketName: string;
    private region: string;

    constructor() {
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
        this.region = (process.env.AWS_REGION || 'us-east-1').trim();
        this.bucketName = (process.env.AWS_S3_BUCKET_NAME || '').trim();

        if (!accessKeyId || !secretAccessKey || !this.bucketName) {
            this.logger.warn('⚠️  Credenciales de AWS S3 no configuradas. Subida de archivos deshabilitada.');
        } else {
            this.s3Client = new S3Client({ region: this.region, credentials: { accessKeyId, secretAccessKey } });
            this.logger.log(`✅ AWS S3 inicializado (bucket: ${this.bucketName})`);
        }
    }

    private extFromMime(mime?: string): string {
        switch (mime) {
            case 'image/png': return 'png';
            case 'image/webp': return 'webp';
            case 'image/jpeg':
            case 'image/jpg': return 'jpg';
            case 'image/gif': return 'gif';
            case 'application/pdf': return 'pdf';
            default: return 'bin';
        }
    }

    /**
     * Sube un archivo a S3. Las imágenes se convierten a WEBP (si `sharp` está
     * disponible); los PDF y otros se suben tal cual. Devuelve la misma forma que
     * usaba Cloudinary: { secure_url, public_id } para no tocar el controlador.
     */
    async uploadImage(file: any): Promise<{ secure_url: string; public_id: string }> {
        if (!this.s3Client) throw new Error('S3 no está configurado');

        const mime: string = file?.mimetype || 'application/octet-stream';
        const esImagen = mime.startsWith('image/');

        let body: Buffer = file.buffer;
        let contentType = mime;
        let ext = this.extFromMime(mime);

        if (esImagen) {
            try {
                // Carga dinámica: si sharp no está, subimos el original.
                const sharp = (await import('sharp')).default as any;
                body = await sharp(file.buffer)
                    .rotate() // respeta orientación EXIF (evita fotos de celular giradas)
                    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 82 })
                    .toBuffer();
                contentType = 'image/webp';
                ext = 'webp';
            } catch {
                // Sin sharp: se sube el buffer original con su contentType.
            }
        }

        // Nombre único: logistica/<timestamp>-<rand>.<ext>
        const key = `logistica/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

        await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: body,
            ContentType: contentType,
            // Sin ACL: el bucket usa Object Ownership = Bucket owner enforced.
        }));

        const url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
        this.logger.log(`✅ Archivo subido a S3: ${url}`);
        return { secure_url: url, public_id: key };
    }
}
