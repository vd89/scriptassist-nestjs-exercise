import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckResult } from '@nestjs/terminus';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Check system health' })
  @ApiResponse({
    status: 200,
    description: 'The system is healthy',
  })
  @ApiResponse({
    status: 503,
    description: 'The system is unhealthy',
  })
  async check(): Promise<HealthCheckResult> {
    return this.healthService.check();
  }

  @Get('liveness')
  @HealthCheck()
  @ApiOperation({ summary: 'Check if the application is running' })
  @ApiResponse({
    status: 200,
    description: 'The application is running',
  })
  async checkLiveness(): Promise<HealthCheckResult> {
    return this.healthService.checkLiveness();
  }

  @Get('readiness')
  @HealthCheck()
  @ApiOperation({ summary: 'Check if the application is ready to accept traffic' })
  @ApiResponse({
    status: 200,
    description: 'The application is ready',
  })
  @ApiResponse({
    status: 503,
    description: 'The application is not ready',
  })
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }
}
