# NestJS Project Documentation

## 1. Project Overview
This project is a task management application built using NestJS. It allows users to create, manage, and track tasks with features like task status updates, priority settings, and overdue task notifications. The application leverages modern technologies to ensure scalability, reliability, and maintainability.

### Technologies Used
- **NestJS**: A progressive Node.js framework for building efficient and scalable server-side applications.
- **TypeScript**: A typed superset of JavaScript that compiles to plain JavaScript.
- **PostgreSQL**: A powerful, open-source object-relational database system.
- **TypeORM**: An ORM for TypeScript and JavaScript that simplifies database interactions.
- **BullMQ**: A Redis-based queue for Node.js, used for handling background jobs and task processing.
- **@nestjs/schedule**: A module for scheduling tasks and cron jobs in NestJS applications.

## 2. Installation
### Prerequisites
- Node.js (v14 or later)
- Bun (latest version)
- PostgreSQL (v12 or later)
- Redis (for BullMQ)

### Step-by-Step Guide
1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. **Install Dependencies**
   ```bash
   bun install
   ```

3. **Set Up Environment Variables**
   Create a `.env` file in the root directory with the following variables:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_USERNAME=postgres
   DB_PASSWORD=postgres
   DB_DATABASE=taskflow
   REDIS_HOST=localhost
   REDIS_PORT=6379
   ```

## 3. Project Structure
The project follows a modular structure, with each module encapsulating related functionality.

### Key Directories
- **src/**: Contains the source code of the application.
  - **modules/**: Contains modules like `users`, `tasks`, `auth`, etc.
  - **database/**: Contains database-related files, including migrations and data sources.
  - **common/**: Contains shared utilities and constants.
  - **config/**: Contains configuration files.
  - **queues/**: Contains queue-related files for background job processing.

### Modules
- **Users Module**: Handles user-related operations, including registration, authentication, and user management.
- **Tasks Module**: Manages task-related operations, including task creation, updates, and status changes.
- **Auth Module**: Handles authentication and authorization using JWT.
- **Health Module**: Provides health check endpoints for monitoring the application.

## 4. Database Setup
### PostgreSQL Setup
1. **Install PostgreSQL** and ensure it is running.
2. **Create a Database**:
   ```sql
   CREATE DATABASE taskflow;
   ```

### TypeORM Configuration
The project uses TypeORM for database interactions. The configuration is defined in `src/database/data-source.ts`.

### Migrations
Migrations are used to manage database schema changes. To run migrations, use the following command:
```bash
bun run migration:run
```

To revert migrations, use:
```bash
bun run migration:revert
```

## 5. Task Management
### Overview
The task management feature allows users to create, update, and delete tasks. Tasks can have different statuses (PENDING, IN_PROGRESS, COMPLETED) and priorities (LOW, MEDIUM, HIGH).

### OverdueTasksService
The `OverdueTasksService` is responsible for checking and processing overdue tasks. It uses BullMQ to queue tasks for processing and sends notifications to users.

## 6. Cron Jobs
Cron jobs are set up using the `@nestjs/schedule` module. The `checkOverdueTasks` method is scheduled to run at specified intervals to check for overdue tasks and process them accordingly.

## 7. Error Handling
The project implements robust error handling strategies, including retry mechanisms and dead-letter queues for failed tasks. This ensures that tasks are processed reliably and errors are logged for further investigation.

## 8. Testing
### Running Tests
To run the tests, use the following command:
```bash
bun run test
```

### Test Types
- **Unit Tests**: Test individual components and services.
- **Integration Tests**: Test the interaction between different modules and services.

## 9. Deployment
### Guidelines
- Deploy the application to a production environment using a CI/CD pipeline.
- Ensure that environment variables are securely managed.
- Use HTTPS for secure communication.
- Implement logging and monitoring for production environments.

### Best Practices
- Regularly update dependencies to patch security vulnerabilities.
- Use strong passwords and secure database configurations.
- Implement rate limiting and other security measures to protect the application.

## 10. Contributing
### Guidelines
- Fork the repository and create a new branch for your feature.
- Write clear and concise commit messages.
- Submit a pull request with a detailed description of the changes.

### Code of Conduct
- Be respectful and inclusive in all interactions.
- Follow the project's coding standards and guidelines.

## 11. License
This project is licensed under the MIT License. See the LICENSE file for more details. 