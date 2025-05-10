import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { RateLimitException } from '../exceptions/rate-limit.exception';

@Catch(RateLimitException)
export class RateLimitExceptionFilter implements ExceptionFilter {
  catch(exception: RateLimitException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse() as Record<string, any>;

    response.setHeader('Retry-After', `${exception.retryAfter}`);
    response.setHeader('X-RateLimit-Limit', `${exception.limit}`);
    response.setHeader('X-RateLimit-Remaining', `${exception.remaining}`);
    response.setHeader('X-RateLimit-Reset', `${exception.reset}`);

    response.status(status).json(exceptionResponse);
  }
}
