import { NestFastifyApplication } from "@nestjs/platform-fastify";

export function configureApp(app: NestFastifyApplication): void {
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
}