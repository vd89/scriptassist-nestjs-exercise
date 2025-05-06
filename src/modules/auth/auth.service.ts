import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CacheService } from '@common/services/cache.service';
import * as bcrypt from 'bcrypt';
import {
  ILoginResponse,
  IRegisterResponse,
  IJwtPayload,
  IValidateUserResponse,
} from './interfaces/auth.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
  ) {}

  // Cache key helpers
  private getTokenCacheKey(userId: string): string {
    return `auth:token:${userId}`;
  }

  private getBlacklistCacheKey(token: string): string {
    return `auth:blacklist:${token}`;
  }

  /**
   * Authenticates a user and returns a JWT token.
   * Validates email and password, throws appropriate exceptions if invalid.
   */
  async login(loginDto: LoginDto): Promise<ILoginResponse> {
    try {
      const { email, password } = loginDto;

      // Find user by email
      const user = await this.usersService.findByEmail(email);
      
      if (!user) {
        throw new UnauthorizedException({
          message: 'Invalid email or password',
          error: 'Authentication Failed',
          details: 'The provided email does not exist in our system',
        });
      }

      // Validate password
      const passwordValid = await bcrypt.compare(password, user.password);
      
      if (!passwordValid) {
        throw new UnauthorizedException({
          message: 'Invalid email or password',
          error: 'Authentication Failed',
          details: 'The provided password is incorrect',
        });
      }

      // Generate JWT payload
      const payload: IJwtPayload = { 
        sub: user.id, 
        email: user.email, 
        role: user.role
      };

      const token = this.jwtService.sign(payload);
      
      // Cache the token
      await this.cacheService.set(this.getTokenCacheKey(user.id), token);

      return {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to process login request',
        error: 'Login Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Registers a new user and returns a JWT token.
   * Validates email uniqueness and creates user account.
   */
  async register(registerDto: RegisterDto): Promise<IRegisterResponse> {
    try {
      // Check if email already exists
      const existingUser = await this.usersService.findByEmail(registerDto.email);

      if (existingUser) {
        throw new BadRequestException({
          message: 'Email already exists',
          error: 'Registration Failed',
          details: 'An account with this email address already exists',
        });
      }

      // Create new user
      const user = await this.usersService.create(registerDto);

      // Generate JWT token
      const token = this.jwtService.sign({ sub: user.id });

      // Cache the token
      await this.cacheService.set(this.getTokenCacheKey(user.id), token);

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        token,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to process registration request',
        error: 'Registration Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generates a JWT token for a user.
   * @param userId The ID of the user to generate the token for
   */
  private generateToken(userId: string): string {
    try {
      const payload: IJwtPayload = { sub: userId };
      return this.jwtService.sign(payload);
    } catch (error) {
      throw new HttpException({
        message: 'Failed to generate authentication token',
        error: 'Token Generation Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validates a user by their ID.
   * Returns null if user not found.
   */
  async validateUser(userId: string): Promise<IValidateUserResponse | null> {
    try {
      const user = await this.usersService.findOne(userId);
      
      if (!user) {
        return null;
      }
      
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
    } catch (error) {
      throw new HttpException({
        message: 'Failed to validate user',
        error: 'User Validation Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Validates if a user has the required roles.
   * Currently returns true for all users (to be implemented).
   */
  async validateUserRoles(userId: string, requiredRoles: string[]): Promise<boolean> {
    try {
      // TODO: Implement role validation logic
      return true;
    } catch (error) {
      throw new HttpException({
        message: 'Failed to validate user roles',
        error: 'Role Validation Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async logout(userId: string) {
    // Get the current token
    const token = await this.cacheService.get<string>(this.getTokenCacheKey(userId));
    if (token) {
      // Add token to blacklist
      await this.cacheService.set(this.getBlacklistCacheKey(token), true);
      // Remove token from active tokens
      await this.cacheService.delete(this.getTokenCacheKey(userId));
    }
  }

  async validateToken(token: string): Promise<boolean> {
    try {
      // Check if token is blacklisted
      const isBlacklisted = await this.cacheService.get<boolean>(this.getBlacklistCacheKey(token));
      if (isBlacklisted) {
        return false;
      }

      // Verify token
      const payload = this.jwtService.verify(token);
      const cachedToken = await this.cacheService.get<string>(this.getTokenCacheKey(payload.sub));
      
      // Token is valid if it matches the cached token
      return cachedToken === token;
    } catch {
      return false;
    }
  }

  async refreshToken(userId: string) {
    const user = await this.usersService.findOne(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const token = this.jwtService.sign({ sub: user.id });
    
    // Update cached token
    await this.cacheService.set(this.getTokenCacheKey(userId), token);
    
    return { token };
  }
} 