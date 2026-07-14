
import { NestFactory } from '@nestjs/core';
// Rebuild trigger
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for Frontend communication
  app.enableCors();

  // Set global prefix for API routes (e.g., http://localhost:3000/api/trabajadores)
  app.setGlobalPrefix('api');

  // Bind to 0.0.0.0 so devices on the LAN (e.g. the logistica-app on a phone)
  // can reach the API via the PC's IPv4 address, not only localhost.
  await app.listen(3005, '0.0.0.0'); // Running on port 3005 to avoid conflict
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
