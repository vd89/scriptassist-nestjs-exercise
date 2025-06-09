// Permission types based on resources and actions
export enum ResourcePermission {
  // User permissions
  CREATE_USER = 'create:user',
  READ_USER = 'read:user',
  UPDATE_USER = 'update:user',
  DELETE_USER = 'delete:user',
  
  // Task permissions
  CREATE_TASK = 'create:task',
  READ_TASK = 'read:task',
  UPDATE_TASK = 'update:task',
  DELETE_TASK = 'delete:task',
  
  // Statistics permissions
  READ_STATISTICS = 'read:statistics',
  
  // Admin permissions
  MANAGE_ALL = 'manage:all',
}

// Permission mappings by role
export const ROLE_PERMISSIONS = {
  'user': [
    ResourcePermission.CREATE_TASK,
    ResourcePermission.READ_TASK,
    ResourcePermission.UPDATE_TASK,
    ResourcePermission.DELETE_TASK,
    ResourcePermission.READ_USER,
  ],
  'manager': [
    ResourcePermission.CREATE_TASK,
    ResourcePermission.READ_TASK,
    ResourcePermission.UPDATE_TASK,
    ResourcePermission.DELETE_TASK,
    ResourcePermission.READ_USER,
    ResourcePermission.READ_STATISTICS,
  ],
  'admin': [
    // Admins have all permissions
    Object.values(ResourcePermission),
  ].flat(),
};

// Available roles in the system
export const AVAILABLE_ROLES = ['user', 'manager', 'admin']; 