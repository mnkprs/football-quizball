import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:4200', 'http://localhost:4300'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`Football QuizBall backend running on port ${port}`);
}
bootstrap();
