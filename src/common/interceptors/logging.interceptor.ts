import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url, body, query, params, user } = req;
    const now = Date.now();

    const userId = user?.id || 'Unknown';
    const logPrefix = `[${method}] ${url} [User: ${userId}]`;

    const filteredBody = this.filterSensitiveData(body);
    const filteredQuery = this.filterSensitiveData(query);

    this.logger.log(`${logPrefix} - Incoming request`);
    this.logger.debug(`Body: ${JSON.stringify(filteredBody)}, Query: ${JSON.stringify(filteredQuery)}, Params: ${JSON.stringify(params)}`);

    return next.handle().pipe(
      tap({
        next: (data) => {
          const elapsedTime = Date.now() - now;
          this.logger.log(`${logPrefix} - Response sent in ${elapsedTime}ms`);
          this.logger.debug(`Response: ${JSON.stringify(this.truncateLargeFields(data))}`);
        },
        error: (err) => {
          const elapsedTime = Date.now() - now;
          this.logger.error(`${logPrefix} - Error after ${elapsedTime}ms: ${err.message}`, err.stack);
        },
      }),
    );
  }

  private filterSensitiveData(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;

    const sensitiveFields = ['password', 'access_token'];
    return Object.keys(obj).reduce((acc: Record<string, any>, key: string) => {
      acc[key] = sensitiveFields.includes(key.toLowerCase()) ? '[REDACTED]' : obj[key];
      return acc;
    }, {} as Record<string, any>);
  }

  private truncateLargeFields(data: any): any {
    const MAX_LENGTH = 500;
    if (!data || typeof data !== 'object') return data;

    return JSON.parse(
      JSON.stringify(data, (_, value) =>
        typeof value === 'string' && value.length > MAX_LENGTH
          ? `${value.substring(0, MAX_LENGTH)}... [truncated]`
          : value
      ),
    );
  }
}
