import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cluster from 'cluster';
import os from 'os';

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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Health check for Railway
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/api/health', (_req: unknown, res: { json: (o: object) => void }) =>
    res.json({ status: 'ok' }),
  );

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Stepover backend running on port ${port}`);
}

// Cluster mode: use all CPU cores in production (Railway provides multi-core instances).
// Cron jobs and distributed locks are Redis-backed, so running on multiple workers is safe.
// Disable with DISABLE_CLUSTER=1 for local dev or single-core environments.
const isClustered =
  process.env['NODE_ENV'] === 'production' &&
  process.env['DISABLE_CLUSTER'] !== '1' &&
  cluster.isPrimary;

if (isClustered) {
  const maxWorkers = parseInt(process.env['MAX_WORKERS'] ?? '2', 10);
  const numWorkers = Math.min(os.cpus().length, maxWorkers);
  console.log(`Primary ${process.pid} starting ${numWorkers} workers`);
  for (let i = 0; i < numWorkers; i++) cluster.fork();
  cluster.on('exit', (worker) => {
    console.warn(`Worker ${worker.process.pid} died — restarting`);
    cluster.fork();
  });
} else {
  bootstrap();
}
