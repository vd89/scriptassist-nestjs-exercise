import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, NotFoundException, InternalServerErrorException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetDto } from './dto/password-reset.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly tokenBlacklist: Set<string> = new Set();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const { email, password } = loginDto;

    // Find the user
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      this.logger.warn(`Login attempt with non-existent email: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Validate password
    const passwordValid = await this.validatePassword(password, user.password);
    if (!passwordValid) {
      this.logger.warn(`Failed login attempt for user: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Transform response
    const userResponse = new UserResponseDto(user);
    
    this.logger.log(`User logged in successfully: ${email}`);
    return new LoginResponseDto({
      user: userResponse,
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  async register(registerDto: RegisterDto): Promise<LoginResponseDto> {
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new BadRequestException('Email already exists');
    }

    // Create the user
    const user = await this.usersService.create(registerDto);

    // Generate tokens
    const { accessToken, refreshToken } = await this.generateTokens(user);

    // Transform response
    const userResponse = new UserResponseDto(user);
    
    this.logger.log(`New user registered: ${registerDto.email}`);
    return new LoginResponseDto({
      user: userResponse,
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto) {
    const { refresh_token } = refreshTokenDto;
    
    // Check if token is blacklisted
    if (this.isTokenBlacklisted(refresh_token)) {
      this.logger.warn('Attempt to use blacklisted refresh token');
      throw new UnauthorizedException('Token has been revoked');
    }
    
    // Verify refresh token
    try {
      const payload = this.jwtService.verify(refresh_token, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
      
      const refreshTokenEntity = await this.refreshTokenRepository.findOne({
        where: { 
          token: refresh_token,
          userId: payload.sub,
          isRevoked: false,
        },
        relations: ['user'],
      });
      
      if (!refreshTokenEntity) {
        this.logger.warn(`Refresh token not found in database for user: ${payload.sub}`);
        throw new UnauthorizedException('Invalid refresh token');
      }
      
      if (new Date() > refreshTokenEntity.expiresAt) {
        this.logger.warn(`Expired refresh token used for user: ${payload.sub}`);
        throw new UnauthorizedException('Refresh token has expired');
      }
      
      // Revoke the old refresh token
      await this.revokeRefreshToken(refreshTokenEntity.id);
      
      // Blacklist the old token
      this.blacklistToken(refresh_token);
      
      // Generate new tokens
      const { accessToken, refreshToken } = await this.generateTokens(refreshTokenEntity.user);
      
      // Return new tokens
      const userResponse = new UserResponseDto(refreshTokenEntity.user);
      
      this.logger.log(`Tokens refreshed for user: ${payload.sub}`);
      return new LoginResponseDto({
        user: userResponse,
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`Error refreshing token: ${error.message}`, error.stack);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(refreshToken: string): Promise<{ success: boolean }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
      
      // Blacklist the token
      this.blacklistToken(refreshToken);
      
      // Find and revoke all refresh tokens for the user
      const refreshTokens = await this.refreshTokenRepository.find({
        where: { userId: payload.sub },
      });
      
      if (refreshTokens.length) {
        for (const token of refreshTokens) {
          await this.revokeRefreshToken(token.id);
        }
      }
      
      this.logger.log(`User logged out: ${payload.sub}`);
      return { success: true };
    } catch (error: any) {
      this.logger.warn(`Logout with invalid token: ${error.message}`);
      return { success: true }; // Still return success even if token is invalid
    }
  }

  private async validatePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  private async generateTokens(user: User) {
    // Generate JWT payload
    const payload = { 
      sub: user.id, 
      email: user.email, 
      role: user.role
    };

    // Generate access token
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.secret'),
      expiresIn: this.configService.get('jwt.expiresIn'),
    });

    // Generate refresh token
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('jwt.refreshSecret'),
      expiresIn: this.configService.get('jwt.refreshExpiresIn'),
    });

    // Save refresh token to database
    await this.storeRefreshToken(refreshToken, user.id);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(token: string, userId: string): Promise<void> {
    // Calculate expiry time
    const expiresIn = this.configService.get<string>('jwt.refreshExpiresIn') || '7d';
    const expiresInMs = this.parseDuration(expiresIn);
    const expiresAt = new Date(Date.now() + expiresInMs);

    // Create and save refresh token entity
    const refreshToken = this.refreshTokenRepository.create({
      token,
      userId,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);
  }

  private async revokeRefreshToken(id: string): Promise<void> {
    await this.refreshTokenRepository.update(id, { isRevoked: true });
  }

  private parseDuration(duration: string): number {
    const regex = /^(\d+)([smhd])$/;
    const match = duration.match(regex);
    
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000; // Default to 7 days
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2];
    
    switch (unit) {
      case 's': return value * 1000; // seconds
      case 'm': return value * 60 * 1000; // minutes
      case 'h': return value * 60 * 60 * 1000; // hours
      case 'd': return value * 24 * 60 * 60 * 1000; // days
      default: return 7 * 24 * 60 * 60 * 1000; // Default to 7 days
    }
  }

  async validateUser(userId: string): Promise<any> {
    try {
      const user = await this.usersService.findOne(userId);
      if (!user) {
        return null;
      }
      
      return user;
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return null;
      }
      this.logger.error(`Error validating user: ${error.message}`, error.stack);
      throw error;
    }
  }

  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId);
      
      if (!user) {
        return false;
      }
      
      return requiredRoles.includes(user.role);
    } catch (error: any) {
      this.logger.error(`Error validating user roles: ${error.message}`, error.stack);
      return false;
    }
  }

  // Token blacklisting methods
  private blacklistToken(token: string): void {
    this.tokenBlacklist.add(token);
    // Set a timeout to remove the token from blacklist after it expires
    // This prevents memory leaks from storing too many expired tokens
    const payload = this.jwtService.decode(token);
    if (payload && typeof payload === 'object' && 'exp' in payload) {
      const timeUntilExpiry = (payload.exp as number) * 1000 - Date.now();
      if (timeUntilExpiry > 0) {
        setTimeout(() => {
          this.tokenBlacklist.delete(token);
        }, timeUntilExpiry);
      }
    }
  }

  private isTokenBlacklisted(token: string): boolean {
    return this.tokenBlacklist.has(token);
  }

  // User Session Management
  async getUserSessions(userId: string): Promise<RefreshToken[]> {
    const activeSessions = await this.refreshTokenRepository.find({
      where: { 
        userId,
        isRevoked: false,
      },
      order: { createdAt: 'DESC' }
    });
    
    // Filter out expired sessions
    return activeSessions.filter(session => new Date() < session.expiresAt);
  }

  async terminateSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const session = await this.refreshTokenRepository.findOne({
        where: { id: sessionId, userId }
      });
      
      if (!session) {
        throw new NotFoundException('Session not found');
      }
      
      // Blacklist the token
      this.blacklistToken(session.token);
      
      // Revoke the token
      await this.revokeRefreshToken(session.id);
      
      this.logger.log(`Session terminated for user: ${userId}, session: ${sessionId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Error terminating session: ${error.message}`, error.stack);
      throw error;
    }
  }

  async terminateAllSessions(userId: string, exceptCurrentToken?: string): Promise<number> {
    try {
      const query = this.refreshTokenRepository
        .createQueryBuilder('refreshToken')
        .where('refreshToken.userId = :userId', { userId })
        .andWhere('refreshToken.isRevoked = :isRevoked', { isRevoked: false });
      
      // Exclude current session if token is provided
      if (exceptCurrentToken) {
        query.andWhere('refreshToken.token != :token', { token: exceptCurrentToken });
      }
      
      const sessions = await query.getMany();
      
      // Blacklist all tokens
      for (const session of sessions) {
        this.blacklistToken(session.token);
        await this.revokeRefreshToken(session.id);
      }
      
      this.logger.log(`All sessions terminated for user: ${userId}, except current: ${!!exceptCurrentToken}`);
      return sessions.length;
    } catch (error: any) {
      this.logger.error(`Error terminating all sessions: ${error.message}`, error.stack);
      throw error;
    }
  }

  // Password Reset Functionality
  async requestPasswordReset(dto: PasswordResetRequestDto): Promise<{ success: boolean; message: string }> {
    try {
      const { email } = dto;
      const user = await this.usersService.findByEmail(email);
      
      if (!user) {
        // Don't reveal that the email doesn't exist
        return { success: true, message: 'If your email exists, you will receive a password reset link' };
      }
      
      // Generate a reset token
      const resetToken = uuidv4();
      const hashedToken = await bcrypt.hash(resetToken, 10);
      
      // Store the token with expiration (24 hours)
      const resetExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      // Update user with reset token information
      await this.usersService.updateResetToken(user.id, hashedToken, resetExpires);
      
      // In a real application, you would send an email with the reset link
      // For this implementation, we'll just log it
      this.logger.log(`Password reset requested for: ${email}, token: ${resetToken}`);
      
      return { success: true, message: 'If your email exists, you will receive a password reset link' };
    } catch (error: any) {
      this.logger.error(`Error requesting password reset: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to process password reset request');
    }
  }

  async resetPassword(dto: PasswordResetDto): Promise<{ success: boolean; message: string }> {
    try {
      const { token, password } = dto;
      
      // Find user with this reset token
      const user = await this.usersService.findByResetToken(token);
      
      if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date() || user.resetToken == null) {
        throw new BadRequestException('Invalid or expired password reset token');
      }
      
      // Verify the token
      const isValid = await bcrypt.compare(token, user.resetToken);
      if (!isValid) {
        throw new BadRequestException('Invalid password reset token');
      }
      
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);
      
      // Update the user's password and clear reset token
      await this.usersService.updatePassword(user.id, hashedPassword);
      
      // Revoke all refresh tokens for this user for security
      await this.terminateAllSessions(user.id);
      
      this.logger.log(`Password reset completed for user: ${user.email}`);
      
      return { success: true, message: 'Password has been reset successfully' };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error resetting password: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to reset password');
    }
  }
} 