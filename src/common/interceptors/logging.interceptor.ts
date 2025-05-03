import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

interface LogData {
  requestId: string;
  method: string;
  url: string;
  ip: string;
  userAgent: string;
  userId: string;
  responseTime?: string;
  statusCode?: number;
  error?: string;
  stack?: string;
}

interface MaskedObject {
  [key: string]: any;
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  // Initialize logger for this interceptor
  private readonly logger = new Logger(LoggingInterceptor.name);
  
  // List of fields that contain sensitive information and should be masked
  private readonly sensitiveFields = ['password', 'token', 'authorization', 'cookie'];

  /**
   * Creates a base log data object with common request information
   */
  private createBaseLogData(request: Request, userId: string): LogData {
    const userAgentHeader = request.get('user-agent');
    const userAgent = typeof userAgentHeader === 'string' ? userAgentHeader : 'unknown';
    
    return {
      requestId: uuidv4(),
      method: request.method,
      url: request.url,
      ip: request.ip || 'unknown',
      userAgent,
      userId,
    };
  }

  /**
   * Masks sensitive data in objects recursively
   */
  private maskSensitiveData(obj: any): MaskedObject {
    if (!obj || typeof obj !== 'object') return obj;
    
    return Object.entries(obj).reduce<MaskedObject>((masked, [key, value]) => {
      if (this.sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        masked[key] = '[REDACTED]';
      } else if (typeof value === 'object') {
        masked[key] = this.maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
      return masked;
    }, {});
  }

  /**
   * Logs request details with masked sensitive data
   */
  private logRequest(request: Request, logData: LogData): void {
    this.logger.log({
      message: 'Incoming Request',
      ...logData,
      query: this.maskSensitiveData(request.query),
      params: this.maskSensitiveData(request.params),
      body: this.maskSensitiveData(request.body),
      headers: this.maskSensitiveData(request.headers),
    });
  }

  /**
   * Logs response details
   */
  private logResponse(logData: LogData, response: Response, responseTime: number): void {
    this.logger.log({
      message: 'Outgoing Response',
      ...logData,
      statusCode: response.statusCode,
      responseTime: `${responseTime}ms`,
    });
  }

  /**
   * Logs error details
   */
  private logError(logData: LogData, error: any, responseTime: number): void {
    this.logger.error({
      message: 'Request Error',
      ...logData,
      statusCode: error.status || error.statusCode || 500,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      responseTime: `${responseTime}ms`,
    });
  }

  /**
   * Main interceptor method that handles request/response logging
   * @param context - The execution context
   * @param next - The next handler in the chain
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Get request and response objects from the context
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    
    // Extract request details
    const userId = request.user ? (request.user as any).id : 'anonymous';
    
    // Record start time for response time calculation
    const startTime = Date.now();

    // Create base log data
    const logData = this.createBaseLogData(request, userId);
    
    // Log request
    this.logRequest(request, logData);

    // Handle the request and log the response
    return next.handle().pipe(
      tap({
        // Handle successful responses
        next: () => {
          const responseTime = Date.now() - startTime;
          this.logResponse(logData, response, responseTime);
        },
        // Handle errors
        error: (error) => {
          const responseTime = Date.now() - startTime;
          this.logError(logData, error, responseTime);
        },
      }),
    );
  }
} 