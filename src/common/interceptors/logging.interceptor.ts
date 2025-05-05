import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  Inject,
  HttpException,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger as WinstonLogger } from 'winston';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { QueryFailedError } from 'typeorm';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  message: string;
  error?: string;
  path?: string;
  timestamp: string;
  details?: any;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: WinstonLogger;
  private readonly sensitiveHeaders = ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
  private readonly sensitiveBodyFields = [
    'password',
    'token',
    'secret',
    'credit_card',
    'ssn',
    'api_key',
  ];
  private readonly rateLimiter: RateLimiterMemory;
  private readonly logLevel: string;

  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly winstonLogger: WinstonLogger,
    private readonly configService: ConfigService,
  ) {
    this.logger = winstonLogger;
    this.logLevel = this.configService.get<string>('LOG_LEVEL', 'info');

    // Initialize rate limiter for logging operations
    this.rateLimiter = new RateLimiterMemory({
      points: 100, // Number of points
      duration: 60, // Per 60 seconds
    });
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = req.method;
    const url = req.url;
    const now = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    // Get user ID safely
    const userId = (req.user as any)?.id || 'anonymous';

    // Check if we should log this request based on log level
    if (this.shouldLogRequest(method, url)) {
      try {
        // Rate limit logging operations
        await this.rateLimiter.consume(requestId);

        // Log request details asynchronously
        this.logRequestAsync(requestId, {
          timestamp: new Date().toISOString(),
          method,
          url,
          ip: req.ip,
          userAgent: req.get('user-agent'),
          headers: this.sanitizeHeaders(req.headers),
          query: req.query,
          body: this.sanitizeBody(req.body),
          userId,
        });
      } catch (error) {
        // If rate limit is exceeded, log at error level
        this.logger.error('Logging rate limit exceeded', { requestId });
      }
    }

    return next.handle().pipe(
      tap({
        next: response => {
          if (this.shouldLogResponse(method, url)) {
            const responseTime = Date.now() - now;
            this.logResponseAsync(requestId, {
              timestamp: new Date().toISOString(),
              method,
              url,
              statusCode: res.statusCode,
              responseTime: `${responseTime}ms`,
              responseSize: this.getResponseSize(response),
              userId,
            });
          }
        },
        error: error => {
          const responseTime = Date.now() - now;
          const errorResponse = this.formatErrorResponse(error, req);
          this.logErrorAsync(requestId, {
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode: errorResponse.statusCode,
            responseTime: `${responseTime}ms`,
            error: this.sanitizeError(error),
            userId,
          });
        },
      }),
      catchError(error => {
        // Handle TypeORM unique constraint violations
        if (error instanceof QueryFailedError) {
          const queryError = error as any;
          if (queryError.code === '23505') {
            // PostgreSQL unique violation code
            const detail = queryError.detail || '';
            const message = this.formatUniqueConstraintMessage(detail);

            this.logger.warn('Unique Constraint Violation', {
              requestId,
              error: this.sanitizeError(error),
              details: { message, constraint: detail },
            });

            return throwError(
              () =>
                new ConflictException({
                  message,
                  error: 'Conflict',
                  statusCode: HttpStatus.CONFLICT,
                }),
            );
          }
        }

        // Handle other specific error types based on Swagger documentation
        if (error instanceof BadRequestException) {
          this.logger.warn('Validation Error', {
            requestId,
            error: this.sanitizeError(error),
            details: error.getResponse(),
          });
        } else if (error instanceof UnauthorizedException) {
          this.logger.warn('Unauthorized Access Attempt', {
            requestId,
            ip: req.ip,
            userId,
            details: error.getResponse(),
          });
        } else if (error instanceof ForbiddenException) {
          this.logger.warn('Forbidden Access Attempt', {
            requestId,
            ip: req.ip,
            userId,
            details: error.getResponse(),
          });
        } else if (error instanceof NotFoundException) {
          this.logger.info('Resource Not Found', {
            requestId,
            url: req.url,
            details: error.getResponse(),
          });
        } else if (error instanceof ConflictException) {
          this.logger.warn('Resource Conflict', {
            requestId,
            details: error.getResponse(),
          });
        } else {
          // Handle unexpected errors
          this.logger.error('Unexpected Error', {
            requestId,
            error: this.sanitizeError(error),
            stack:
              this.configService.get<string>('NODE_ENV') === 'development'
                ? error.stack
                : undefined,
          });
        }
        return throwError(() => error);
      }),
    );
  }

  private formatErrorResponse(error: any, req: Request): ErrorResponse {
    const baseResponse: ErrorResponse = {
      success: false,
      statusCode: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
      message: error.message || 'Internal server error',
      path: req.url,
      timestamp: new Date().toISOString(),
    };

    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object') {
        return {
          ...baseResponse,
          ...response,
        };
      }
    }

    return baseResponse;
  }

  private shouldLogRequest(method: string, url: string): boolean {
    // Skip logging for health check endpoints
    if (url.includes('/health')) return false;

    // Adjust logging based on log level
    switch (this.logLevel) {
      case 'error':
        return false;
      case 'warn':
        return ['POST', 'PUT', 'DELETE'].includes(method);
      case 'debug':
        return true;
      default: // info
        return true;
    }
  }

  private shouldLogResponse(method: string, url: string): boolean {
    return this.shouldLogRequest(method, url);
  }

  private async logRequestAsync(requestId: string, data: any): Promise<void> {
    // Use setImmediate to make logging asynchronous
    setImmediate(() => {
      this.logger.info(`Incoming Request: ${JSON.stringify(data, null, 2)}`, {
        requestId,
        type: 'request',
      });
    });
  }

  private async logResponseAsync(requestId: string, data: any): Promise<void> {
    setImmediate(() => {
      this.logger.info(`Outgoing Response: ${JSON.stringify(data, null, 2)}`, {
        requestId,
        type: 'response',
      });
    });
  }

  private async logErrorAsync(requestId: string, data: any): Promise<void> {
    setImmediate(() => {
      this.logger.error(`Error Response: ${JSON.stringify(data, null, 2)}`, {
        requestId,
        type: 'error',
      });
    });
  }

  private sanitizeHeaders(headers: any): any {
    const sanitized = { ...headers };
    this.sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body) return body;

    const sanitized = { ...body };
    this.sensitiveBodyFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  private sanitizeError(error: any): any {
    const sanitized: {
      name: any;
      message: any;
      status: any;
      stack?: string;
      details?: any;
    } = {
      name: error.name,
      message: error.message,
      status: error.status,
    };

    // Add error details if available
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object') {
        sanitized.details = response;
      }
    }

    // Only include stack trace in development
    if (this.configService.get<string>('NODE_ENV') === 'development') {
      sanitized.stack = error.stack;
    }

    return sanitized;
  }

  private getResponseSize(response: any): string {
    try {
      const size = JSON.stringify(response).length;
      return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(2)} KB`;
    } catch {
      return 'unknown';
    }
  }

  private formatUniqueConstraintMessage(detail: string): string {
    // Extract the field name from the PostgreSQL error detail
    const match = detail.match(/Key \((.*?)\)=/);
    if (match && match[1]) {
      const field = match[1].replace(/[()]/g, '');
      return `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    }
    return 'Resource already exists';
  }
}
