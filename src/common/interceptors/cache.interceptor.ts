import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, from } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { CacheService } from '@common/services/cache.service';
import { CACHE_METADATA_KEY, CacheOptions } from '@common/decorators/cache.decorator';
import { User } from '@modules/users/entities/user.entity';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cache: CacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const user = request.user as User;
    const cacheOptions = this.reflector.get<CacheOptions>(CACHE_METADATA_KEY, handler);
    if (!cacheOptions) {
      return next.handle();
    }

    const { namespace, key, expireIn } = cacheOptions;
    const finalKey =
      typeof key == 'function' ? key({ req: request, user, args: context.getArgs() }) : key;
    return from(this.cache.get(namespace, finalKey)).pipe(
      switchMap(cached => {
        if (cached !== null && cached !== undefined) {
          return of(cached);
        }

        return next.handle().pipe(
          tap(result => {
            this.cache.set(namespace, finalKey, result, expireIn);
          }),
        );
      }),
    );
  }
}
