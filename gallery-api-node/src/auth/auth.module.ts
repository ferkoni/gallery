import { Module } from '@nestjs/common';
import { UsersController } from "./users.controller.js";
import { AuthService } from "./auth.service.js";

@Module({
  controllers: [UsersController],
  providers: [AuthService]
})
export class AuthModule {}
