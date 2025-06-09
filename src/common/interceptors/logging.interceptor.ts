import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Implement comprehensive request/response logging
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = req.method;
    const url = req.url;
    const now = Date.now();
    const requestId = req.id || this.generateRequestId();
    
    // Gather context information but avoid sensitive data
    const userContext = req.user 
      ? `user:${req.user.id}(${req.user.role})` 
      : 'anonymous';
      
    const clientIp = this.getClientIp(req);
    const userAgent = req.get('user-agent') || 'unknown';
    
    // Log query params but filter out sensitive information
    const queryParams = { ...req.query };
    this.sanitizeObject(queryParams);

    // Log request body but filter out sensitive information
    const requestBody = { ...req.body };
    this.sanitizeObject(requestBody);
    
    // Enhanced request logging with context
    this.logger.log({
      message: `Incoming request: ${method} ${url}`,
      requestId,
      method,
      url,
      userContext,
      clientIp,
      userAgent,
      queryParams: Object.keys(queryParams).length ? queryParams : undefined,
      body: Object.keys(requestBody).length ? requestBody : undefined,
    });

    return next.handle().pipe(
      tap({
        next: (data) => {
          const responseTime = Date.now() - now;
          
          // Log response without sensitive data
          const responseData = this.prepareSafeResponseData(data);
          
          this.logger.log({
            message: `Response sent: ${method} ${url} ${responseTime}ms`,
            requestId,
            statusCode: res.statusCode,
            responseTime,
            responseData,
          });
        },
        error: (err) => {
          const responseTime = Date.now() - now;
          this.logger.error({
            message: `Error in ${method} ${url} ${responseTime}ms: ${err.message}`,
            requestId,
            statusCode: err.status || 500,
            responseTime,
            errorName: err.name,
            stack: err.stack,
          });
        },
      }),
    );
  }
  
  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
  
  private getClientIp(request: any): string {
    return request.ip || 
           request.connection?.remoteAddress || 
           request.headers['x-forwarded-for']?.split(',')[0] || 
           'unknown';
  }
  
  private sanitizeObject(obj: any): void {
    const sensitiveFields = ['password', 'token', 'secret', 'creditCard', 'authorization'];
    
    if (!obj || typeof obj !== 'object') return;
    
    Object.keys(obj).forEach(key => {
      // If this key is a sensitive field, mask it
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        obj[key] = '[REDACTED]';
      } 
      // If this is a nested object, sanitize it recursively
      else if (obj[key] && typeof obj[key] === 'object') {
        this.sanitizeObject(obj[key]);
      }
    });
  }
  
  private prepareSafeResponseData(data: any): any {
    // Don't log if no data or if data is too large
    if (!data) return undefined;
    
    try {
      const responseDataCopy = { ...data };
      this.sanitizeObject(responseDataCopy);
      
      // If data is very large, truncate it
      const dataString = JSON.stringify(responseDataCopy);
      if (dataString.length > 1000) {
        return {
          truncated: true,
          preview: dataString.substring(0, 1000) + '...',
          fullLength: dataString.length
        };
      }
      
      return responseDataCopy;
    } catch (error) {
      return { loggingError: 'Could not serialize response data' };
    }
  }
} 