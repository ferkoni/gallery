import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envSchema } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from "./auth/auth.module.js";

@Module({
  imports: [
    // main.ts loads .env
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validationSchema: envSchema }),
    PrismaModule,
    HealthModule,
    AuthModule
  ],
})
export class AppModule {}
