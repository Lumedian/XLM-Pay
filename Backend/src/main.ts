import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { Reflector } from '@nestjs/core';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // API prefix
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);

  // Global middleware
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global rate limiting guard (user/IP-based)
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new UserThrottlerGuard(reflector));

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();
