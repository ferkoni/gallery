import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// Rails' HealthController#show. Unversioned, and needs no token.
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async show(): Promise<{ status: string; database: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'ok' };
  }
}
