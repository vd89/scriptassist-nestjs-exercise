import { Injectable, UnauthorizedException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
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
  ) {}

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

      return {
        access_token: this.jwtService.sign(payload),
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
      const token = this.generateToken(user.id);

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
} 