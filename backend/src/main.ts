import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true, bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.use(helmet());

  const allowedOrigins = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',').map((o) => o.trim())
    : [
        'http://localhost:4200',
        'http://localhost:4300',
        ...(process.env['NODE_ENV'] === 'production' ? ['https://football-quizball.vercel.app'] : []),
      ];

  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  // Health check for Railway
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: unknown, res: { json: (o: object) => void }) =>
    res.json({ status: 'ok' }),
  );

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Unlimited Quizball backend running on port ${port}`);
}
bootstrap();
