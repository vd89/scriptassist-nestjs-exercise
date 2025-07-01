import { User } from '@modules/users/entities/user.entity';
import { SetMetadata } from '@nestjs/common';
import { Request } from 'express';
export interface CacheOptions {
  namespace: string;
  key: string | ((ctx: { req: Request; user: User; args: any[] }) => string);
  expireIn: number;
}

export const CACHE_METADATA_KEY = 'cache_options';

export const Cache = (options: CacheOptions) => SetMetadata(CACHE_METADATA_KEY, options);
