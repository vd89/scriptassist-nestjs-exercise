import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  private readonly sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];
  private readonly sensitiveBodyFields = ['password', 'token', 'secret', 'credit_card'];

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const method = req.method;
    const url = req.url;
    const now = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    // Get user ID safely
    const userId = (req.user as any)?.id || 'anonymous';

    // Log request details
    const requestLog = {
      requestId,
      timestamp: new Date().toISOString(),
      method,
      url,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      headers: this.sanitizeHeaders(req.headers),
      query: req.query,
      body: this.sanitizeBody(req.body),
      userId,
    };

    this.logger.log(`Incoming Request: ${JSON.stringify(requestLog, null, 2)}`);

    return next.handle().pipe(
      tap({
        next: response => {
          const responseTime = Date.now() - now;
          const responseLog = {
            requestId,
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode: res.statusCode,
            responseTime: `${responseTime}ms`,
            responseSize: this.getResponseSize(response),
            userId,
          };

          this.logger.log(`Outgoing Response: ${JSON.stringify(responseLog, null, 2)}`);
        },
        error: error => {
          const responseTime = Date.now() - now;
          const errorLog = {
            requestId,
            timestamp: new Date().toISOString(),
            method,
            url,
            statusCode: error.status || 500,
            responseTime: `${responseTime}ms`,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
            },
            userId,
          };

          this.logger.error(`Error Response: ${JSON.stringify(errorLog, null, 2)}`);
        },
      }),
    );
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

  private getResponseSize(response: any): string {
    try {
      const size = JSON.stringify(response).length;
      return size < 1024 ? `${size} B` : `${(size / 1024).toFixed(2)} KB`;
    } catch {
      return 'unknown';
    }
  }
}
