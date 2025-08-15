import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { JwtPayload } from '../../types/jwt-payload.interface';

/**
 * Guard to ensure users can only access resources they own
 * Currently supports task ownership verification
 */
@Injectable()
export class UserOwnershipGuard implements CanActivate {
  constructor(
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: JwtPayload = request.user;
    const params = request.params;

    // If user is admin, allow access to all resources
    if (user.role === 'admin') {
      return true;
    }

    // Check task ownership for task-related endpoints
    if (params.id) {
      const resourceType = this.getResourceType(request.url);

      switch (resourceType) {
        case 'tasks':
          return await this.checkTaskOwnership(params.id, user.id);
        default:
          // For unknown resources, allow access (other guards will handle authorization)
          return true;
      }
    }

    return true;
  }

  private getResourceType(url: string): string {
    const segments = url.split('/');
    // Find the resource type (e.g., 'tasks' from '/api/tasks/123')
    const resourceIndex = segments.findIndex(segment => segment === 'tasks' || segment === 'users');
    return resourceIndex !== -1 ? segments[resourceIndex] : '';
  }

  private async checkTaskOwnership(taskId: string, userId: string): Promise<boolean> {
    try {
      const task = await this.taskRepository.findOne({
        where: { id: taskId },
        select: ['id', 'userId'],
      });

      if (!task) {
        // Let the controller handle the not found case
        return true;
      }

      if (task.userId !== userId) {
        throw new ForbiddenException('You can only access your own tasks');
      }

      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // For any other errors, allow the request to proceed
      // and let the controller handle the error
      return true;
    }
  }
}
