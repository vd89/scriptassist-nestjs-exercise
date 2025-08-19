import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';
import * as bcrypt from 'bcrypt';

interface RoleObject {
  value: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) { }
  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid email');
    }

    const passwordValue = typeof user.password === 'object' ? user.password.value : user.password;
    const passwordValid = await bcrypt.compare(password, passwordValue);

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const userId = typeof user.id === 'object' ? user.id.value : user.id;

    return {
      access_token: this.jwtService.sign({
        sub: userId,
        email: typeof user.email === 'object' ? user.email.value : user.email,
        role: user.role && typeof user.role === 'object' && 'value' in (user.role as RoleObject) ? (user.role as RoleObject).value : user.role,
      }),
      user: {
        id: userId,
        email: typeof user.email === 'object' ? user.email.value : user.email,
        role: user.role && typeof user.role === 'object' && 'value' in (user.role as RoleObject) ? (user.role as RoleObject).value : user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new UnauthorizedException('Email already exists');
    }

    const user = await this.usersService.create(registerDto);

    const token = this.generateToken(user.id.toString());

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token,
    };
  }

  private generateToken(userId: string) {
    const payload = { sub: userId };
    return this.jwtService.sign(payload);
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId);

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    return true;
  }
}
