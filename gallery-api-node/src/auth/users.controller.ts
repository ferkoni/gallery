import { Controller, HttpCode, Logger, Post } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Controller('users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('login')
  @HttpCode(200)
  async login(): Promise<void> {
    // Stub: the route exists, so the first login test fails on its status, not on a 404.
  }
}