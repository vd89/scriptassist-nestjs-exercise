# TaskFlow API - Senior Backend Engineer Coding Challenge

## Introduction

Welcome to the TaskFlow API coding challenge! This project is designed to evaluate the skills of experienced backend engineers in identifying and solving complex architectural problems using our technology stack.

The TaskFlow API is a task management system with significant scalability, performance, and security challenges that need to be addressed. The codebase contains intentional anti-patterns and inefficiencies that require thoughtful refactoring and architectural improvements.

## Tech Stack

- **Language**: TypeScript
- **Framework**: NestJS
- **ORM**: TypeORM with PostgreSQL
- **Queue System**: BullMQ with Redis
- **API Style**: REST with JSON
- **Package Manager**: Bun
- **Testing**: Bun test

## Getting Started

### Prerequisites

- Node.js (v16+)
- Bun (latest version)
- PostgreSQL
- Redis

### Setup Instructions

1. Clone this repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Configure environment variables by copying `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # Update the .env file with your database and Redis connection details
   ```
4. Database Setup:
   
   Ensure your PostgreSQL database is running, then create a database:
   ```bash
   # Using psql
   psql -U postgres
   CREATE DATABASE taskflow;
   \q
   
   # Or using createdb
   createdb -U postgres taskflow
   ```
   
   Build the TypeScript files to ensure the migrations can be run:
   ```bash
   bun run build
   ```

5. Run database migrations:
   ```bash
   # Option 1: Standard migration (if "No migrations are pending" but tables aren't created)
   bun run migration:run
   
   # Option 2: Force table creation with our custom script
   bun run migration:custom
   ```
   
   Our custom migration script will:
   - Try to run formal migrations first
   - If no migrations are executed, it will directly create the necessary tables
   - It provides detailed logging to help troubleshoot database setup issues

6. Seed the database with initial data:
   ```bash
   bun run seed
   ```
   
7. Start the development server:
   ```bash
   bun run start:dev
   ```

### Troubleshooting Database Issues

If you continue to have issues with database connections:

1. Check that PostgreSQL is properly installed and running:
   ```bash
   # On Linux/Mac
   systemctl status postgresql
   # or
   pg_isready
   
   # On Windows
   sc query postgresql
   ```

2. Verify your database credentials by connecting manually:
   ```bash
   psql -h localhost -U postgres -d taskflow
   ```

3. If needed, manually create the schema from the migration files:
   - Look at the SQL in `src/database/migrations/`
   - Execute the SQL manually in your database

### Default Users

The seeded database includes two users:

1. Admin User:
   - Email: admin@example.com
   - Password: admin123
   - Role: admin

2. Regular User:
   - Email: user@example.com
   - Password: user123
   - Role: user

## Challenge Overview

This codebase contains a partially implemented task management API that suffers from various architectural, performance, and security issues. Your task is to analyze, refactor, and enhance the codebase to create a production-ready, scalable, and secure application.

## Core Problem Areas

The codebase has been intentionally implemented with several critical issues that need to be addressed:

### 1. Performance & Scalability Issues

- N+1 query problems throughout the application
- Inefficient in-memory filtering and pagination that won't scale
- Excessive database roundtrips in batch operations
- Poorly optimized data access patterns

### 2. Architectural Weaknesses

- Inappropriate separation of concerns (e.g., controllers directly using repositories)
- Missing domain abstractions and service boundaries
- Lack of transaction management for multi-step operations
- Tightly coupled components with high interdependency

### 3. Security Vulnerabilities

- Inadequate authentication mechanism with several vulnerabilities
- Improper authorization checks that can be bypassed
- Unprotected sensitive data exposure in error responses
- Insecure rate limiting implementation

### 4. Reliability & Resilience Gaps

- Ineffective error handling strategies
- Missing retry mechanisms for distributed operations
- Lack of graceful degradation capabilities
- In-memory caching that fails in distributed environments

## Implementation Requirements

Your implementation should address the following areas:

### 1. Performance Optimization

- Implement efficient database query strategies with proper joins and eager loading
- Create a performant filtering and pagination system
- Optimize batch operations with bulk database operations
- Add appropriate indexing strategies

### 2. Architectural Improvements

- Implement proper domain separation and service abstractions
- Create a consistent transaction management strategy
- Apply SOLID principles throughout the codebase
- Implement at least one advanced pattern (e.g., CQRS, Event Sourcing)

### 3. Security Enhancements

- Strengthen authentication with refresh token rotation
- Implement proper authorization checks at multiple levels
- Create a secure rate limiting system
- Add data validation and sanitization

### 4. Resilience & Observability

- Implement comprehensive error handling and recovery mechanisms
- Add proper logging with contextual information
- Create meaningful health checks
- Implement at least one observability pattern

## Advanced Challenge Areas

For senior engineers, we expect solutions to also address:

### 1. Distributed Systems Design

- Create solutions that work correctly in multi-instance deployments
- Implement proper distributed caching with invalidation strategies
- Handle concurrent operations safely
- Design for horizontal scaling

### 2. System Reliability

- Implement circuit breakers for external service calls
- Create graceful degradation pathways for non-critical features
- Add self-healing mechanisms
- Design fault isolation boundaries

### 3. Performance Under Load

- Optimize for high throughput scenarios
- Implement backpressure mechanisms
- Create efficient resource utilization strategies
- Design for predictable performance under varying loads

## Evaluation Criteria

Your solution will be evaluated on:

1. **Problem Analysis**: How well you identify and prioritize the core issues
2. **Technical Implementation**: The quality and cleanliness of your code
3. **Architectural Thinking**: Your approach to solving complex design problems
4. **Performance Improvements**: Measurable enhancements to system performance
5. **Security Awareness**: Your identification and remediation of vulnerabilities
6. **Testing Strategy**: The comprehensiveness of your test coverage
7. **Documentation**: The clarity of your explanation of key decisions

## Submission Guidelines

1. Create a new branch for your implementation
2. Make regular, meaningful commits that tell a story
3. Create a pull request with a comprehensive description containing:
   - Analysis of the core problems you identified
   - Overview of your architectural approach
   - Performance and security improvements made
   - Key technical decisions and their rationale
   - Any tradeoffs you made and why

## API Endpoints

The API should expose the following endpoints:

### Authentication
- `POST /auth/login` - Authenticate a user
- `POST /auth/register` - Register a new user

### Tasks
- `GET /tasks` - List tasks with filtering and pagination
- `GET /tasks/:id` - Get task details
- `POST /tasks` - Create a task
- `PATCH /tasks/:id` - Update a task
- `DELETE /tasks/:id` - Delete a task
- `POST /tasks/batch` - Batch operations on tasks

Good luck! This challenge is designed to test the skills of experienced engineers in creating scalable, maintainable, and secure systems.

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