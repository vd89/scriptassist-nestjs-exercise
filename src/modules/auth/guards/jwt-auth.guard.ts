import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

interface LogData {
  url: string;
  method: string;
  ip: string;
  userAgent: string;
  error: string;
  token: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Initialize logger for this guard
  private readonly logger = new Logger(JwtAuthGuard.name);

  /**
   * Creates a base log data object with common request information
   */
  private createLogData(request: Request, error: string, token: string | undefined): LogData {
    return {
      url: request.url,
      method: request.method,
      ip: request.ip || 'unknown',
      userAgent: request.get('user-agent') || 'unknown',
      error,
      token: token ? '[REDACTED]' : 'missing',
    };
  }

  /**
   * Override the default handleRequest method to add custom logging
   * This method is called after the JWT strategy validates the token
   */
  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Get the request object from the context
    const request = context.switchToHttp().getRequest<Request>();
    // Extract the JWT token from the Authorization header
    const token = this.extractTokenFromHeader(request);
    const errorMessage = err?.message || info?.message || 'Invalid token';

    // Check if there was an error or no user was found (invalid token)
    if (err || !user) {
      // Create log data
      const logData = this.createLogData(request, errorMessage, token);
      
      // Log invalid token attempt
      this.logger.warn({
        message: 'Invalid JWT Token Attempt',
        ...logData,
      });

      // Throw an UnauthorizedException with the error message
      throw new UnauthorizedException(errorMessage);
    }

    // If token is valid, return the user object
    return user;
  }

  /**
   * Helper method to extract the JWT token from the Authorization header
   * @param request - The Express request object
   * @returns The JWT token if present, undefined otherwise
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    // Split the Authorization header to get the token type and value
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    // Return the token only if it's a Bearer token
    return type === 'Bearer' ? token : undefined;
  }
} 