import { Body, Controller, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorators/roles.decorator';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate user and return access & refresh tokens.',
    description: 'Logs in a user using email and password, and returns JWT tokens.',
  })
  @ApiBody({ type: LoginDto })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new user.',
    description: 'Creates a new user account and returns JWT tokens upon success.',
  })
  @ApiBody({ type: RegisterDto })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get a new access token using a refresh token.',
    description: 'Exchanges a valid refresh token for a new access token.',
  })
  @ApiBody({ type: RefreshTokenDto })
  exchangeRefreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.exchangeRefreshToken(dto.token);
  }

  @Patch('refresh-token/blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Blacklist a specific refresh token (Admin only).',
    description:
      'Marks a refresh token as blacklisted, preventing future use. Requires admin privileges.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  blacklistRefreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.blacklistRefreshToken(dto.token);
  }
}
