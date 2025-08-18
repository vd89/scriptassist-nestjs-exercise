import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, finalize } from 'rxjs/operators';
import { Request as ExpressRequest, Response } from 'express';
import { ConfigService } from '@nestjs/config';

interface Request extends ExpressRequest {
  requestId?: string;
}

/**
 * Enhanced Logging Interceptor
 * - Logs incoming requests with relevant details
 * - Measures and logs response time
 * - Logs outgoing responses
 * - Includes contextual information like user IDs when available
 * - Avoids logging sensitive information
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly isProduction: boolean;
  private readonly sensitiveHeaders: string[];

  constructor(private configService: ConfigService) {
    this.isProduction = configService.get('NODE_ENV') === 'production';

    // Define sensitive headers that should not be logged
    this.sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'password', 'token'];
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const requestId = Array.isArray(request.headers[ 'x-request-id' ])
      ? request.headers[ 'x-request-id' ][ 0 ]
      : request.headers[ 'x-request-id' ];
    const method = request.method;
    const url = request.url;
    const ip = request.ip;

    // Fix: Ensure requestId is always a string
    this.logRequest(requestId || 'no-request-id', method, url, ip, request);

    // Attach request ID to the request object for potential use in handlers
    request['requestId'] = requestId;

    // Attach request ID to response headers
    const finalRequestId = requestId || this.generateRequestId();
    response.setHeader('X-Request-ID', finalRequestId);

    // Get current timestamp for measuring duration
    const startTime = Date.now();

    // Log the incoming request
    this.logRequest(requestId || 'no-request-id', method, url, ip, request);

    return next.handle().pipe(
      // Log successful responses
      tap(data => {
        const responseData = this.sanitizeResponseData(data);
        this.logger.log(`[${requestId}] Response body: ${JSON.stringify(responseData)}`);
      }),
      // Finalize regardless of success or error
      finalize(() => {
        const duration = Date.now() - startTime;
        const statusCode = response.statusCode;

        // Only log as error for 5xx status codes
        if (statusCode >= 500) {
          this.logger.error(`[${requestId}] ${method} ${url} ${statusCode} - ${duration}ms`);
        } else if (statusCode >= 400) {
          // Log client errors as warnings
          this.logger.warn(`[${requestId}] ${method} ${url} ${statusCode} - ${duration}ms`);
        } else {
          // Log successful requests
          this.logger.log(`[${requestId}] ${method} ${url} ${statusCode} - ${duration}ms`);
        }

        // Record metrics for monitoring (example)
        this.recordMetrics(method, url, statusCode, duration);
      }),
    );
  }

  private logRequest(
    requestId: string | undefined,
    method: string,
    url: string,
    ip: string | undefined, // Update this to allow undefined
    request: Request,
  ): void {
    // Extract user ID if available from token

    // Get safe headers (remove sensitive ones)
    const safeHeaders = this.getSafeHeaders(request.headers);

    // Get query params (sanitized)
    const queryParams = this.sanitizeObject(request.query);

    // Get request body (sanitized)
    const body = this.sanitizeObject(request.body);

    this.logger.log(`[${requestId}] ${method} ${url} - Request from ${ip} `, {
      requestId,
      method,
      url,
      ip,
      headers: safeHeaders,
      query: queryParams,
      body,
    });
  }

  private getSafeHeaders(headers: Record<string, any>): Record<string, any> {
    const safeHeaders: Record<string, any> = {};

    for (const [key, value] of Object.entries(headers)) {
      if (!this.sensitiveHeaders.includes(key.toLowerCase())) {
        safeHeaders[key] = value;
      }
    }

    return safeHeaders;
  }

  private sanitizeObject(obj: any): any {
    if (!obj) return obj;

    // For simple logging, create a shallow copy
    const sanitized = { ...obj };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'secret', 'credit_card', 'creditCard'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  private sanitizeResponseData(data: any): any {
    if (!data) return data;

    // Don't log large response bodies
    if (typeof data === 'object' && JSON.stringify(data).length > 1000 && this.isProduction) {
      return { message: '[Response body too large to log]' };
    }

    return this.sanitizeObject(data);
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }

  private recordMetrics(method: string, url: string, statusCode: number, duration: number): void {
    // This is a placeholder for recording metrics
    // In a real application, you would use a metrics library like Prometheus
    // or send metrics to a monitoring service
    // Example of what might be recorded:
    // - Request count by endpoint
    // - Response time histogram
    // - Error rate by endpoint
    // - Status code distribution
  }
}
