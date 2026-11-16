import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { AuthService, invalidCredentials } from "./auth.service.js";

interface LoginBody {
  user?: {email?: unknown; password?: unknown};
}

@Controller('users')
export class UsersController {

  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginBody | null): Promise<void> {
    const email = body?.user?.email;
    const password = body?.user?.password;
    if (typeof email !== 'string' || typeof password !== 'string') throw invalidCredentials();

    await this.auth.login(email, password);
  }
}