import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

if (existsSync('.env')) process.loadEnvFile('.env');

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
app.enableShutdownHooks();
await app.listen(Number(process.env['PORT'] ?? 4000), '127.0.0.1');
