
import { NestFactory } from '@nestjs/core';
// Rebuild trigger
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Frontend communication
  app.enableCors();

  // Set global prefix for API routes (e.g., http://localhost:3000/api/trabajadores)
  app.setGlobalPrefix('api');

  await app.listen(3005); // Running on port 3005 to avoid conflict
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
