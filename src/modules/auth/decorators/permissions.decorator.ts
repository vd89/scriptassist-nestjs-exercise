import { SetMetadata } from '@nestjs/common';
import { ResourcePermission } from '../constants/permissions';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: ResourcePermission[]) => 
  SetMetadata(PERMISSIONS_KEY, permissions); 