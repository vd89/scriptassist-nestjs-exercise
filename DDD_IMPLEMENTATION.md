# Domain-Driven Design (DDD) Implementation

This project implements Domain-Driven Design (DDD) patterns to separate business logic from infrastructure concerns and create a more maintainable, testable architecture.

## Architecture Overview

```
src/
├── domain/                     # Domain Layer (Business Logic)
│   ├── entities/              # Domain Entities (Business Objects)
│   ├── value-objects/         # Value Objects (Immutable Objects)
│   ├── services/              # Domain Services (Business Logic)
│   └── repositories/          # Repository Interfaces (Contracts)
├── infrastructure/            # Infrastructure Layer (Technical Implementation)
│   └── persistence/           # Data Persistence Implementation
│       ├── entities/          # Persistence Models (Database Entities)
│       ├── repositories/      # Repository Implementations
│       └── mappers/           # Domain ↔ Persistence Mappers
└── modules/                   # Application Layer (Controllers, DTOs)
```

## Key Components

### 1. Domain Entities

**Purpose**: Represent core business concepts with behavior and business rules.

#### User Entity (`domain/entities/user.entity.ts`)
- Encapsulates user business logic
- Contains methods for updating user properties
- Implements role-based permissions
- Uses value objects for email, name, and password

#### Task Entity (`domain/entities/task.entity.ts`)
- Manages task lifecycle and status transitions
- Enforces business rules (e.g., only pending tasks can be started)
- Contains methods for task operations (complete, reopen, etc.)
- Uses value objects for title, description, and due date

### 2. Value Objects

**Purpose**: Immutable objects that represent concepts through their attributes.

#### Email (`value-objects/email.value-object.ts`)
- Validates email format
- Ensures email uniqueness constraints
- Provides normalized email handling

#### Password (`value-objects/password.value-object.ts`)
- Enforces password strength requirements
- Handles both plain and hashed passwords
- Provides secure string representation

#### TaskTitle (`value-objects/task-title.value-object.ts`)
- Validates title length constraints
- Ensures title is not empty
- Provides consistent formatting

#### TaskDescription (`value-objects/task-description.value-object.ts`)
- Handles optional descriptions
- Enforces length limits
- Provides empty state checking

#### DueDate (`value-objects/due-date.value-object.ts`)
- Manages date validation
- Provides utility methods (isPast, isFuture, isToday)
- Handles null dates for tasks without deadlines

#### EntityId (`value-objects/entity-id.value-object.ts`)
- Ensures valid UUID format
- Provides type safety for entity identifiers
- Generates new UUIDs when needed

### 3. Domain Services

**Purpose**: Contain business logic that doesn't naturally fit within a single entity.

#### UserDomainService (`services/user-domain.service.ts`)
- User creation with validation
- Email change validation
- Password change operations
- Role management (promote/demote admin)
- User authentication

#### TaskDomainService (`services/task-domain.service.ts`)
- Task creation with user validation
- Task updates with permission checks
- Status change management
- Task assignment operations
- Bulk task operations
- Task statistics calculation

### 4. Repository Interfaces

**Purpose**: Define contracts for data access without coupling to specific implementations.

#### UserRepository Interface
```typescript
interface UserRepository {
  findById(id: EntityId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  save(user: User): Promise<User>;
  delete(id: EntityId): Promise<void>;
  findAll(): Promise<User[]>;
  exists(id: EntityId): Promise<boolean>;
}
```

#### TaskRepository Interface
```typescript
interface TaskRepository {
  findById(id: EntityId): Promise<Task | null>;
  save(task: Task): Promise<Task>;
  delete(id: EntityId): Promise<void>;
  findAll(filters?: TaskFilters, pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  findByUserId(userId: EntityId): Promise<Task[]>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findOverdueTasks(pagination?: PaginationOptions): Promise<PaginatedResult<Task>>;
  // ... more methods
}
```

### 5. Infrastructure Layer

**Purpose**: Implements technical concerns and data persistence.

#### Persistence Models
- `UserModel`: TypeORM entity for database persistence
- `TaskModel`: TypeORM entity for database persistence
- Separated from domain entities to avoid coupling

#### Mappers
- `UserMapper`: Converts between User domain entity and UserModel
- `TaskMapper`: Converts between Task domain entity and TaskModel
- Ensures clean separation between domain and persistence layers

#### Repository Implementations
- `TypeOrmUserRepository`: Implements UserRepository using TypeORM
- `TypeOrmTaskRepository`: Implements TaskRepository using TypeORM
- Can be easily swapped for different persistence technologies

## Benefits of This Implementation

### 1. Separation of Concerns
- **Domain Layer**: Contains pure business logic
- **Infrastructure Layer**: Handles technical implementations
- **Application Layer**: Coordinates between layers

### 2. Testability
- Domain entities and services can be unit tested without database
- Repository interfaces can be mocked for testing
- Business logic is isolated from technical details

### 3. Maintainability
- Business rules are centralized in domain entities and services
- Changes to persistence layer don't affect business logic
- Clear boundaries between different concerns

### 4. Flexibility
- Can easily change database technologies
- Domain logic is reusable across different interfaces
- Easy to add new features following established patterns

### 5. Type Safety
- Value objects provide compile-time validation
- Strong typing prevents many runtime errors
- Clear contracts through interfaces

## Usage Examples

### Creating a User
```typescript
// Through domain service
const user = await userDomainService.createUser({
  email: 'user@example.com',
  name: 'John Doe',
  password: 'SecurePass123!',
  role: UserRole.USER,
});
```

### Creating a Task
```typescript
// Through domain service
const task = await taskDomainService.createTask({
  title: 'Complete project',
  description: 'Finish the implementation',
  priority: TaskPriority.HIGH,
  dueDate: new Date('2024-12-31'),
  userId: 'user-uuid',
});
```

### Updating Task Status
```typescript
// Business rules enforced in domain entity
const task = await taskRepository.findById(taskId);
task.startProgress(); // Only works if task is PENDING
await taskRepository.save(task);
```

## Migration Strategy

This implementation maintains backward compatibility by:

1. **Keeping original entities**: Old TypeORM entities are preserved
2. **Gradual migration**: New features use DDD patterns
3. **Parallel implementation**: Both approaches work simultaneously
4. **Clear separation**: New domain layer doesn't interfere with existing code

## Best Practices

### 1. Value Object Usage
- Always validate input in value object constructors
- Make value objects immutable
- Provide meaningful error messages

### 2. Domain Entity Design
- Keep entities focused on business behavior
- Avoid anemic domain models
- Use private methods for internal business logic

### 3. Domain Service Guidelines
- Use when behavior involves multiple entities
- Keep domain services stateless
- Focus on business operations, not CRUD

### 4. Repository Implementation
- Implement all interface methods
- Handle errors appropriately
- Use mappers consistently

## Testing Strategy

### Unit Tests
- Test domain entities and value objects in isolation
- Mock repository interfaces in domain service tests
- Focus on business rule validation

### Integration Tests
- Test repository implementations with real database
- Test mapper functionality
- Verify end-to-end data flow

### Example Test
```typescript
describe('TaskDomainService', () => {
  it('should prevent non-admin users from deleting other users tasks', async () => {
    // Arrange
    const mockTaskRepo = createMockTaskRepository();
    const mockUserRepo = createMockUserRepository();
    const service = new TaskDomainService(mockTaskRepo, mockUserRepo);

    // Act & Assert
    await expect(
      service.deleteTask(taskId, nonAdminUserId)
    ).rejects.toThrow('Insufficient permissions');
  });
});
```

This DDD implementation provides a solid foundation for building maintainable, testable, and scalable applications while keeping business logic separated from technical concerns.
