import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { RefreshToken } from './entities/refresh-token.entity';
import { Repository } from 'typeorm';
import { User } from '@modules/users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    const user = await this.usersService.findByEmail(email);

    if (!user || !user.verifyPassword(password)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const [access_token, refresh_token] = await this.generateTokens(user);

    return {
      access_token,
      refresh_token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const user = await this.usersService.create(registerDto);

    const [access_token, refresh_token] = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      access_token,
      refresh_token,
    };
  }

  private generateAccessToken(payload: Record<string, any>) {
    return this.jwtService.sign(payload);
  }

  private generateRefreshToken(userId: string) {
    return crypto.createHash('sha256').update(userId).digest('hex');
  }

  private async generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const refreshToken = this.generateRefreshToken(user.id);
    const accessToken = this.generateAccessToken(payload);
    const record = this.refreshTokenRepository.create({
      userId: user.id,
      token: refreshToken,
    });
    await this.refreshTokenRepository.save(record);
    return [accessToken, record.token];
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      return null;
    }

    return user;
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    if (!requiredRoles.length) return true;
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return requiredRoles.includes(user.role);
  }

  async exchangeRefreshToken(token: string): Promise<string> {
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token, blacklisted: false },
      relations: { user: true },
    });

    if (!refreshToken) {
      throw new NotFoundException('Refresh token not found or has been blacklisted.');
    }

    if (!refreshToken.user) {
      throw new NotFoundException('User associated with this refresh token does not exist.');
    }

    const { id, email, role } = refreshToken.user;

    const payload = {
      sub: id,
      email,
      role,
    };

    return this.generateAccessToken(payload);
  }

  async blacklistRefreshToken(token: string): Promise<RefreshToken> {
    const refreshToken = await this.refreshTokenRepository.findOne({
      where: { token, blacklisted: false },
      relations: { user: true },
    });
    if (!refreshToken) {
      throw new NotFoundException('Refresh token not found or has been blacklisted.');
    }
    refreshToken.blacklisted = true;
    return this.refreshTokenRepository.save(refreshToken);
  }
}
