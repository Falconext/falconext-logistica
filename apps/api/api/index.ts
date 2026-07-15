import type { VercelRequest, VercelResponse } from '@vercel/node';
import { NestFactory } from '@nestjs/core';
// Se importa el módulo YA COMPILADO (dist) a propósito: NestJS depende de los
// metadatos de los decoradores (emitDecoratorMetadata) que genera `nest build`.
// Si se importara el fuente TS, el bundler serverless (esbuild) los perdería
// y la inyección de dependencias fallaría en tiempo de ejecución.
// @ts-ignore - dist se genera durante el build (vercel-build)
import { AppModule } from '../dist/src/app.module';

let cached: ((req: any, res: any) => void) | null = null;

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    app.setGlobalPrefix('api');
    // CORS: si FRONTEND_URL está definida se restringe a ese dominio; si no, se abre.
    app.enableCors({
        origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : true,
        credentials: true,
    });
    await app.init();
    return app.getHttpAdapter().getInstance();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!cached) cached = await bootstrap();
    return cached(req as any, res as any);
}
