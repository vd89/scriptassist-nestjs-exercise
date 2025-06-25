import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

export const IdParam = createParamDecorator((paramName: string, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  const id = request.params[paramName];

  if (!isUUID(id)) {
    throw new BadRequestException(`Param '${paramName}' must be a valid UUID`);
  }

  return id;
});
