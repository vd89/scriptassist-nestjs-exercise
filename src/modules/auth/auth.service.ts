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
  ITokenPair,
} from './interfaces/auth.interface';
import { v4 as uuidv4 } from 'uuid';
import { Role } from '@common/enums/role.enum';
import { Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly cacheService: CacheService,
  ) {
    // Log cache service status on initialization
    this.logger.debug('AuthService initialized');
    this.checkCacheService();
  }

  private async checkCacheService() {
    try {
      // Try to set and get a test value
      const testKey = 'auth:test:connection';
      const testValue = 'test-value';
      
      await this.cacheService.set(testKey, testValue, 60);
      const retrievedValue = await this.cacheService.get<string>(testKey);
      
      if (retrievedValue === testValue) {
        this.logger.debug('Cache service is working properly');
      } else {
        this.logger.error('Cache service is not working properly - test value mismatch');
      }
      
      // Clean up test key
      await this.cacheService.delete(testKey);
    } catch (error: unknown) {
      this.logger.error(`Cache service error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Cache key helpers
  private getTokenCacheKey(userId: string): string {
    return `auth:token:${userId}`;
  }

  private getRefreshTokenCacheKey(userId: string): string {
    return `auth:refresh:${userId}`;
  }

  private getBlacklistCacheKey(token: string): string {
    return `auth:blacklist:${token}`;
  }

  private async generateTokenPair(userId: string, email: string, role: Role): Promise<ITokenPair> {
    const accessToken = this.jwtService.sign(
      { sub: userId, email, role },
      { expiresIn: '15m' } // Short-lived access token
    );

    const refreshToken = uuidv4(); // Generate a unique refresh token
    const refreshTokenExpiry = 60 * 60 * 24 * 7; // 7 days in seconds

    // Store refresh token in cache
    const cacheKey = this.getRefreshTokenCacheKey(userId);
    this.logger.debug(`Storing refresh token for user ${userId} with key ${cacheKey}`);
    
    try {
      // First check if we can set a value
      const testKey = 'auth:test:write';
      await this.cacheService.set(testKey, 'test', 60);
      const testValue = await this.cacheService.get<string>(testKey);
      this.logger.debug(`Cache write test result: ${testValue === 'test' ? 'success' : 'failed'}`);
      await this.cacheService.delete(testKey);

      // Now store the actual refresh token
      await this.cacheService.set(
        cacheKey,
        refreshToken,
        refreshTokenExpiry
      );

      // Verify the token was stored
      const storedToken = await this.cacheService.get<string>(cacheKey);
      if (storedToken === refreshToken) {
        this.logger.debug(`Successfully stored and verified refresh token for user ${userId}`);
      } else {
        this.logger.error(`Failed to verify refresh token storage for user ${userId}`);
        throw new Error('Failed to verify refresh token storage');
      }
    } catch (error: unknown) {
      this.logger.error(`Failed to store refresh token for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }

    return {
      accessToken,
      refreshToken,
    };
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

      const { accessToken, refreshToken } = await this.generateTokenPair(user.id, user.email, user.role);

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
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
  async validateUserRoles(userId: string, requiredRoles: Role[]): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId);
      if (!user) {
        return false;
      }
      return requiredRoles.includes(user.role);
    } catch (error) {
      throw new HttpException({
        message: 'Failed to validate user roles',
        error: 'Role Validation Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  async logout(userId: string) {
    try {
      // Invalidate refresh token
      await this.cacheService.delete(this.getRefreshTokenCacheKey(userId));
      
      // Get the current access token
      const token = await this.cacheService.get<string>(this.getTokenCacheKey(userId));
      if (token) {
        // Add token to blacklist
        await this.cacheService.set(this.getBlacklistCacheKey(token), true, 60 * 15); // 15 minutes
        // Remove token from active tokens
        await this.cacheService.delete(this.getTokenCacheKey(userId));
      }
    } catch (error) {
      throw new HttpException({
        message: 'Failed to logout',
        error: 'Logout Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
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

  async refreshToken(refreshToken: string): Promise<ITokenPair> {
    try {
      // Find user by refresh token
      const userId = await this.findUserByRefreshToken(refreshToken);
      if (!userId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.usersService.findOne(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new token pair
      const newTokenPair = await this.generateTokenPair(user.id, user.email, user.role);

      // Invalidate old refresh token
      await this.cacheService.delete(this.getRefreshTokenCacheKey(userId));

      return newTokenPair;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException({
        message: 'Failed to refresh token',
        error: 'Token Refresh Failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async findUserByRefreshToken(refreshToken: string): Promise<string | null> {
    try {
      // Get all refresh token keys
      const keys = await this.cacheService.keys('auth:refresh:*');
      this.logger.debug(`Found ${keys.length} refresh token keys in cache`);
      
      // Check each key for the matching refresh token
      for (const key of keys) {
        const storedToken = await this.cacheService.get<string>(key);
        this.logger.debug(`Checking key ${key} with stored token: ${storedToken}`);
        
        if (storedToken === refreshToken) {
          // Extract user ID from the key (format: namespace:auth:refresh:userId)
          const userId = key.split(':').pop();
          this.logger.debug(`Found matching refresh token for user ${userId}`);
          return userId || null;
        }
      }
      this.logger.debug('No matching refresh token found');
      return null;
    } catch (error: unknown) {
      this.logger.error(`Error finding user by refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
} 