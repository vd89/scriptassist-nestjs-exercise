import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

// Feature modules
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { DomainModule } from './domain/domain.module';
import { ApplicationModule } from './application/application.module';

// Configuration
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import bullConfig from './config/bull.config';
import cacheConfig from './config/cache.config';

// Common services
import { CacheService } from './common/services/cache.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RateLimitGuard } from './common/guards/rate-limit.guard';

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig, bullConfig, cacheConfig],
      cache: true,
      expandVariables: true,
      validationOptions: {
        allowUnknown: false,
        abortEarly: true,
      },
    }),

    // Database connection
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.database'),
        entities: [ __dirname + '/**/*.entity{.ts,.js}', __dirname + '/**/*.model{.ts,.js}' ],
        // Only enable synchronize in development
        synchronize: configService.get('database.synchronize'),
        // Only enable logging in development
        logging: configService.get('database.logging'),
        // Add connection pool configuration for better performance
        poolSize: configService.get('database.poolSize', 10),
        // Add migration configuration
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        migrationsRun: configService.get('database.migrationsRun', false),
        // Add SSL configuration for production
        ssl: configService.get('database.ssl', false) ? { rejectUnauthorized: false } : false,
      }),
    }),

    // Scheduling
    ScheduleModule.forRoot(),

    // Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('bull.connection.host'),
          port: configService.get('bull.connection.port'),
          password: configService.get('bull.connection.password'),
          // Add TLS support for production
          tls: configService.get('bull.connection.tls', false)
            ? { rejectUnauthorized: false }
            : undefined,
        },
        // Add default job options
        defaultJobOptions: {
          removeOnComplete: configService.get('bull.removeOnComplete', true),
          removeOnFail: configService.get('bull.removeOnFail', 5000),
          attempts: configService.get('bull.attempts', 3),
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }),
    }),

    // Rate limiting (improved)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: configService.get('throttle.ttl', 60),
          limit: configService.get('throttle.limit', 10),
          ignoreUserAgents: [/health-check/],
        },
      ],
    }),

    // Feature modules
    InfrastructureModule,
    DomainModule,
    ApplicationModule,
    UsersModule,
    TasksModule,
    AuthModule,

    // Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    // Global cache service (improved and properly configured)
    CacheService,

    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },

    // Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },

    // Global rate limit guard
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [
    // Export services that might be needed in other modules
    CacheService,
  ],
})
export class AppModule {}
