import { Controller, Get, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Rails' HealthController#show. Unversioned, and needs no token.
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async show(): Promise<{ status: string; database: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      // Rails reports the failure in the body with a 503, so a monitor can tell "up, database
      // down" from "down". Logged as well, so the cause is not only in the response.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`database check failed: ${message}`);
      throw new HttpException({ status: 'error', database: message }, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', database: 'ok' };
  }
}
