import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { configureApp } from "../../src/configure-app.js";

// Builds the app as main.ts does (AppModule plus configureApp), ready for app.inject.
// AppModule is imported here, when this runs, not at the top: @nestjs/config reads process.env
// when AppModule is first imported, so a spec that changes env does it before calling this.
export async function createTestApp(): Promise<NestFastifyApplication> {
  const { AppModule } = await import('../../src/app.module.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}