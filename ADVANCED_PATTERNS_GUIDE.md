# Advanced Patterns Implementation Guide

This document provides a comprehensive guide to the advanced architectural patterns implemented in the NestJS TaskFlow application.

## Table of Contents

1. [Repository Pattern with Abstractions](#repository-pattern-with-abstractions)
2. [Unit of Work Pattern](#unit-of-work-pattern)
3. [Application Service Layer](#application-service-layer)
4. [CQRS (Command Query Responsibility Segregation)](#cqrs-command-query-responsibility-segregation)
5. [Specification Pattern](#specification-pattern)
6. [Integration Examples](#integration-examples)
7. [Testing Strategy](#testing-strategy)
8. [Performance Considerations](#performance-considerations)

## Repository Pattern with Abstractions

### Overview
The Repository pattern provides a consistent interface for accessing data, regardless of the underlying persistence mechanism.

### Implementation

#### Base Repository Interface
```typescript
// src/domain/repositories/base.repository.interface.ts
export interface BaseRepository<T> {
  findById(id: EntityId): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: EntityId): Promise<void>;
  exists(id: EntityId): Promise<boolean>;
}
```

#### Specification Support
```typescript
export interface SpecificationRepository<T> extends BaseRepository<T> {
  findBySpecification(spec: Specification<T>): Promise<T[]>;
  findOneBySpecification(spec: Specification<T>): Promise<T | null>;
  countBySpecification(spec: Specification<T>): Promise<number>;
}
```

#### Concrete Implementation
```typescript
// src/infrastructure/persistence/repositories/typeorm-task.repository.ts
@Injectable()
export class TypeOrmTaskRepository implements TaskRepository {
  // Implementation with TypeORM
  // Supports both basic CRUD and specification-based queries
}
```

### Benefits
- **Abstraction**: Separates business logic from data access details
- **Testability**: Easy to mock for unit testing
- **Flexibility**: Can switch between different persistence technologies
- **Consistency**: Uniform interface across all repositories

### Usage Examples
```typescript
// Basic repository operations
const task = await taskRepository.findById(taskId);
await taskRepository.save(updatedTask);

// Specification-based queries
const spec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
const overdueTasks = await taskRepository.findBySpecification(spec);
```

## Unit of Work Pattern

### Overview
The Unit of Work pattern maintains a list of objects affected by a business transaction and coordinates writing out changes and resolving concurrency problems.

### Implementation

#### Interface Definition
```typescript
// src/domain/interfaces/unit-of-work.interface.ts
export interface UnitOfWork {
  start(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  execute<T>(work: () => Promise<T>): Promise<T>;
  isActive(): boolean;
}
```

#### TypeORM Implementation
```typescript
// src/infrastructure/persistence/unit-of-work/typeorm-unit-of-work.service.ts
@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWorkWithRepositories {
  // Manages database transactions
  // Tracks entity changes
  // Provides transactional boundaries
}
```

### Benefits
- **Atomicity**: Ensures all operations succeed or fail together
- **Consistency**: Maintains data integrity across multiple operations
- **Performance**: Reduces database round trips by batching operations
- **Error Handling**: Automatic rollback on failures

### Usage Examples
```typescript
// Execute multiple operations in a transaction
await unitOfWork.execute(async () => {
  const task = await taskDomainService.createTask(createTaskData);
  await userDomainService.updateTaskCount(userId);
  await auditService.logTaskCreation(task.id);
  return task;
});

// Manual transaction management
await unitOfWork.start();
try {
  await taskRepository.save(task);
  await userRepository.save(user);
  await unitOfWork.commit();
} catch (error) {
  await unitOfWork.rollback();
  throw error;
}
```

## Application Service Layer

### Overview
The Application Service Layer coordinates between the domain and infrastructure layers, handling cross-cutting concerns and orchestrating complex business operations.

### Implementation

#### Cross-Cutting Concerns
```typescript
// src/application/services/cross-cutting-concerns.service.ts
@Injectable()
export class CrossCuttingConcernsService implements CrossCuttingConcerns {
  // Logging, validation, caching, events, metrics
}
```

#### Command Service
```typescript
// src/application/services/task-command.service.ts
@Injectable()
export class TaskCommandService implements ApplicationService {
  async createTask(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
    // 1. Validation
    // 2. Execute within transaction
    // 3. Handle cross-cutting concerns
    // 4. Return structured result
  }
}
```

#### Query Service
```typescript
// src/application/services/task-query.service.ts
@Injectable()
export class TaskQueryService implements ApplicationService {
  async getTasks(query: GetTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    // 1. Cache check
    // 2. Execute query
    // 3. Cache result
    // 4. Return structured result
  }
}
```

### Benefits
- **Separation of Concerns**: Clear boundaries between layers
- **Reusability**: Services can be used by multiple controllers
- **Testability**: Easy to unit test business logic
- **Consistency**: Standardized error handling and logging

### Usage Examples
```typescript
// Command execution
const command = new CreateTaskCommand(title, description, priority, dueDate, userId, createdBy);
const result = await taskCommandService.createTask(command);

// Query execution
const query = new GetTasksQuery(filters, pagination, userId);
const result = await taskQueryService.getTasks(query);
```

## CQRS (Command Query Responsibility Segregation)

### Overview
CQRS separates read and write operations, allowing for optimized data models and improved scalability.

### Implementation

#### Command Bus
```typescript
// src/application/cqrs/command-bus.ts
@Injectable()
export class CommandBus implements ICommandBus {
  async execute<TCommand extends ICommand, TResult = any>(command: TCommand): Promise<TResult> {
    const handler = this.handlers.get(command.constructor.name);
    return await handler.handle(command);
  }
}
```

#### Query Bus
```typescript
// src/application/cqrs/query-bus.ts
@Injectable()
export class QueryBus implements IQueryBus {
  async execute<TQuery extends IQuery, TResult = any>(query: TQuery): Promise<TResult> {
    const handler = this.handlers.get(query.constructor.name);
    return await handler.handle(query);
  }
}
```

#### CQRS Mediator
```typescript
// src/application/cqrs/cqrs-mediator.ts
@Injectable()
export class CQRSMediator implements ICQRSMediator {
  async send<TCommand extends ICommand, TResult = any>(command: TCommand): Promise<TResult> {
    return await this.commandBus.execute(command);
  }

  async query<TQuery extends IQuery, TResult = any>(query: TQuery): Promise<TResult> {
    return await this.queryBus.execute(query);
  }
}
```

#### Command and Query Handlers
```typescript
// Command Handler
@Injectable()
export class CreateTaskHandler implements ICommandHandler<CreateTaskCommand, ServiceResult<Task>> {
  async handle(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
    return await this.taskCommandService.createTask(command);
  }
}

// Query Handler
@Injectable()
export class GetTasksHandler implements IQueryHandler<GetTasksQuery, ServiceResult<PaginatedResult<Task>>> {
  async handle(query: GetTasksQuery): Promise<ServiceResult<PaginatedResult<Task>>> {
    return await this.taskQueryService.getTasks(query);
  }
}
```

### Benefits
- **Scalability**: Separate optimization for reads and writes
- **Flexibility**: Different data models for commands and queries
- **Performance**: Optimized query paths
- **Maintainability**: Clear separation of responsibilities

### Usage Examples
```typescript
// Using CQRS through the mediator
const command = new CreateTaskCommand(/* parameters */);
const result = await mediator.send(command);

const query = new GetTasksQuery(/* parameters */);
const tasks = await mediator.query(query);

// Direct usage through buses
await commandBus.execute(command);
await queryBus.execute(query);
```

## Specification Pattern

### Overview
The Specification pattern encapsulates business rules and query logic in reusable, composable objects.

### Implementation

#### Base Specification
```typescript
// src/domain/specifications/task.specifications.ts
export abstract class TaskSpecification implements Specification<Task> {
  abstract isSatisfiedBy(task: Task): boolean;
  abstract toQuery(): any;
}
```

#### Concrete Specifications
```typescript
export class TaskByStatusSpecification extends TaskSpecification {
  constructor(private readonly status: TaskStatus) { super(); }
  
  isSatisfiedBy(task: Task): boolean {
    return task.status === this.status;
  }
  
  toQuery(): any {
    return { status: this.status };
  }
}

export class OverdueTaskSpecification extends TaskSpecification {
  isSatisfiedBy(task: Task): boolean {
    return task.dueDate && 
           task.dueDate.value < new Date() && 
           task.status !== TaskStatus.COMPLETED;
  }
}
```

#### Composite Specifications
```typescript
export class CompositeTaskSpecification extends TaskSpecification {
  constructor(
    private readonly specifications: TaskSpecification[],
    private readonly operator: 'AND' | 'OR' = 'AND'
  ) { super(); }
  
  isSatisfiedBy(task: Task): boolean {
    if (this.operator === 'AND') {
      return this.specifications.every(spec => spec.isSatisfiedBy(task));
    }
    return this.specifications.some(spec => spec.isSatisfiedBy(task));
  }
}
```

#### Specification Factory
```typescript
export class TaskSpecificationFactory {
  static createOverdueTasksForUser(userId: EntityId): CompositeTaskSpecification {
    return new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new OverdueTaskSpecification()
    ]);
  }
  
  static createHighPriorityTasksForUser(userId: EntityId): CompositeTaskSpecification {
    return new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new HighPriorityTaskSpecification()
    ]);
  }
}
```

### Benefits
- **Reusability**: Specifications can be combined and reused
- **Testability**: Business rules are isolated and testable
- **Maintainability**: Complex queries are broken down into simple components
- **Expressiveness**: Business logic is clearly expressed

### Usage Examples
```typescript
// Simple specification
const highPrioritySpec = new HighPriorityTaskSpecification();
const highPriorityTasks = await taskRepository.findBySpecification(highPrioritySpec);

// Composite specification
const userOverdueSpec = TaskSpecificationFactory.createOverdueTasksForUser(userId);
const overdueTasks = await taskRepository.findBySpecification(userOverdueSpec);

// In-memory validation
const isTaskValid = specification.isSatisfiedBy(task);
```

## Integration Examples

### Complete Task Creation Flow
```typescript
// Controller (CQRS)
@Post()
async createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: any) {
  const command = new CreateTaskCommand(/* parameters */);
  const result = await this.mediator.send(command);
  return result;
}

// Command Handler
async handle(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
  return await this.taskCommandService.createTask(command);
}

// Application Service
async createTask(command: CreateTaskCommand): Promise<ServiceResult<Task>> {
  // Cross-cutting concerns
  await this.crossCuttingConcerns.validate(command);
  
  // Unit of Work
  const task = await this.unitOfWork.execute(async () => {
    return await this.taskDomainService.createTask(/* data */);
  });
  
  // Cache invalidation
  await this.crossCuttingConcerns.cache.delete(`user_tasks:${command.userId}`);
  
  return { success: true, data: task };
}

// Domain Service
async createTask(data: CreateTaskData): Promise<Task> {
  // Business logic validation
  const task = Task.create(data);
  return await this.taskRepository.save(task);
}
```

### Complex Query with Specifications
```typescript
// Controller
@Get('user/:userId/critical')
async getCriticalTasks(@Param('userId') userId: string) {
  const query = new GetCriticalTasksQuery(userId);
  return await this.mediator.query(query);
}

// Query Handler
async handle(query: GetCriticalTasksQuery): Promise<ServiceResult<Task[]>> {
  return await this.taskQueryService.getCriticalTasks(query);
}

// Application Service
async getCriticalTasks(query: GetCriticalTasksQuery): Promise<ServiceResult<Task[]>> {
  // Cache check
  const cacheKey = `critical_tasks:${query.userId}`;
  let tasks = await this.crossCuttingConcerns.cache.get<Task[]>(cacheKey);
  
  if (!tasks) {
    // Specification-based query
    const userId = EntityId.fromString(query.userId);
    const criticalSpec = new CompositeTaskSpecification([
      new TaskByUserSpecification(userId),
      new HighPriorityTaskSpecification(),
      new OverdueTaskSpecification()
    ], 'AND');
    
    tasks = await this.taskRepository.findBySpecification(criticalSpec);
    
    // Cache result
    await this.crossCuttingConcerns.cache.set(cacheKey, tasks, 300);
  }
  
  return { success: true, data: tasks };
}
```

## Testing Strategy

### Unit Tests
- Test each pattern in isolation
- Mock dependencies appropriately
- Verify behavior and contracts

### Integration Tests
- Test patterns working together
- Verify transaction boundaries
- Test error handling and rollback scenarios

### Example Test Structure
```typescript
describe('Task Creation with All Patterns', () => {
  it('should create task using CQRS, UoW, and Repository patterns', async () => {
    // Arrange
    const command = new CreateTaskCommand(/* data */);
    
    // Act
    const result = await mediator.send(command);
    
    // Assert
    expect(result.success).toBe(true);
    expect(unitOfWork.execute).toHaveBeenCalled();
    expect(taskRepository.save).toHaveBeenCalled();
  });
});
```

## Performance Considerations

### Caching Strategy
- Query results cached at application service layer
- Cache invalidation on command operations
- Appropriate TTL based on data volatility

### Database Optimization
- Efficient specification-to-SQL translation
- Connection pooling through TypeORM
- Transaction batching via Unit of Work

### Scalability
- CQRS enables read/write scaling
- Specifications reduce code duplication
- Repository abstraction enables data partitioning

## Configuration and Setup

### Module Registration
```typescript
// Application Module
@Module({
  imports: [DomainModule, InfrastructureModule, CommonModule],
  providers: [
    // Services
    CrossCuttingConcernsService,
    TaskCommandService,
    TaskQueryService,
    
    // CQRS
    CommandBus,
    QueryBus,
    CQRSMediator,
    
    // Unit of Work
    { provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
    
    // Handlers
    ...commandHandlers,
    ...queryHandlers
  ]
})
export class ApplicationModule {}
```

### Dependency Injection
- All services registered with NestJS DI container
- Interfaces used for loose coupling
- Factory providers for complex initialization

## API Endpoints

### CQRS Controller
The new CQRS controller demonstrates all patterns:

- `POST /api/v2/tasks` - Create task (Command)
- `GET /api/v2/tasks` - Get tasks (Query)
- `GET /api/v2/tasks/:id` - Get task by ID (Query)
- `PUT /api/v2/tasks/:id` - Update task (Command)
- `DELETE /api/v2/tasks/:id` - Delete task (Command)
- `GET /api/v2/tasks/user/:userId/high-priority` - Specification-based query
- `PUT /api/v2/tasks/bulk/status` - Bulk operations with Unit of Work

### Comparison with Original Controller
- Original: Direct service calls
- CQRS: Commands and queries through mediator
- Better separation of concerns
- Improved testability and maintainability

## Benefits Summary

1. **Repository Pattern**: Clean data access abstraction
2. **Unit of Work**: Transactional integrity and performance
3. **Application Services**: Cross-cutting concerns and orchestration
4. **CQRS**: Scalable read/write separation
5. **Specifications**: Reusable business rules

These patterns work together to create a robust, maintainable, and scalable application architecture that follows enterprise-level best practices.
