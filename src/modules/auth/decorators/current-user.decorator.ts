import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../../../types/jwt-payload.interface';

/**
 * Decorator to extract the current authenticated user from the request
 * This decorator should be used with JWT authentication guard
 *
 * @param data - Optional property/key name to extract from user object
 * @param ctx - Execution context
 * @returns User object or specific property if data is provided
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext): JwtPayload | any => {
    const request = ctx.switchToHttp().getRequest();
    const user: JwtPayload = request.user;

    return data ? user?.[data] : user;
  },
);
