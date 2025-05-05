import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisHealthIndicator } from './indicators/redis.health';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TerminusModule, HttpModule, TypeOrmModule],
  controllers: [HealthController],
  providers: [HealthService, RedisHealthIndicator],
  exports: [HealthService],
})
export class HealthModule {}
