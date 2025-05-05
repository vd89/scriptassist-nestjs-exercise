import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UnauthorizedException } from '@nestjs/common';
import { Role } from '../users/enums/role.enum';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let mockUsersService: any;
  let mockJwtService: any;
  let mockConfigService: any;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock bcrypt with correct implementation
    jest.spyOn(bcrypt, 'compare').mockImplementation(() => Promise.resolve(true));

    mockUsersService = {
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    };

    mockJwtService = {
      signAsync: jest.fn(),
      verifyAsync: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_SECRET':
            return 'test-secret';
          case 'JWT_EXPIRATION':
            return '1h';
          case 'JWT_REFRESH_EXPIRATION':
            return '7d';
          default:
            return null;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user when user exists', async () => {
      const mockUser = {
        id: '1',
        email: 'test@example.com',
        role: Role.USER,
      };

      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser('1');
      expect(result).toEqual(mockUser);
    });

    it('should return null when user is not found', async () => {
      mockUsersService.findOne.mockResolvedValue(null);

      const result = await service.validateUser('1');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('should return access token and refresh token', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: Role.USER,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockImplementation((payload: any, options: any) => {
        if (options.expiresIn === '1h') {
          return Promise.resolve('access-token');
        }
        return Promise.resolve('refresh-token');
      });

      const result = await service.login(loginDto);

      expect(result).toEqual({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        },
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email'),
      );
    });

    it('should throw UnauthorizedException when password is invalid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        password: 'hashedPassword',
        role: Role.USER,
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockImplementationOnce(() => Promise.resolve(false));

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid password'),
      );
    });
  });

  describe('register', () => {
    it('should create and return new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password',
        name: 'Test User',
      };

      mockUsersService.findByEmail.mockResolvedValue(null);

      const mockUser = {
        id: 'user1',
        email: registerDto.email,
        name: registerDto.name,
        role: Role.USER,
      };

      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue('test-token');

      const result = await service.register(registerDto);

      expect(result).toEqual({
        access_token: 'test-token',
        refresh_token: 'test-token',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        },
      });
    });

    it('should throw UnauthorizedException if user already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password',
        name: 'Test User',
      };

      mockUsersService.findByEmail.mockResolvedValue({
        id: '1',
        email: 'test@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        new UnauthorizedException('Email already exists'),
      );
    });
  });

  describe('refreshTokens', () => {
    it('should return new access token and refresh token when refresh token is valid', async () => {
      const mockUser = {
        id: 'user1',
        email: 'test@example.com',
        role: Role.USER,
      };

      const payload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockUsersService.findOne.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockImplementation((payload: any, options: any) => {
        if (options.expiresIn === '1h') {
          return Promise.resolve('new-access-token');
        }
        return Promise.resolve('new-refresh-token');
      });

      const result = await service.refreshTokens('valid-refresh-token');

      expect(result).toEqual({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });
    });

    it('should throw UnauthorizedException when refresh token is invalid', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('Invalid token'));

      await expect(service.refreshTokens('invalid-token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
    });

    it('should throw UnauthorizedException when user not found', async () => {
      const payload = {
        sub: 'non-existent-id',
        email: 'test@example.com',
        role: Role.USER,
      };

      mockJwtService.verifyAsync.mockResolvedValue(payload);
      mockUsersService.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens('valid-token')).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });
  });
});
