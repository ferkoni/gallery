import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { User } from "../generated/prisma/client.js";
import bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {
  }

  async login(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({where: {email: email}});

    if (!user || !(await bcrypt.compare(password, user.encrypted_password))) {
      throw invalidCredentials();
    }
    return user;
  }
}

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({errors: ['Invalid email or password']});
}