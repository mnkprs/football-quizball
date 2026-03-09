import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupFileLogging } from './logger.util';

setupFileLogging();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:4200', 'http://localhost:4300'];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  // Health check for Railway
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: unknown, res: { json: (o: object) => void }) =>
    res.json({ status: 'ok' }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Unlimited Quizball backend running on port ${port}`);
}
bootstrap();
