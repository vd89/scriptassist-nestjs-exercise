# Task Flow Exercise Overview

This document summarizes the enhancements, bug fixes, and architectural improvements implemented in the Task Flow module.

---

## Project Startup Bug Fixes

- Registered the Task Repository in the `ScheduleTaskModule`.
- Fixed typos in the `JWTStrategy` and `AuthModule` for improved stability.

---

## Batch Processing Refactor

- Introduced a dedicated service method for batch task update/delete operations.
- Refactored the batch controller to leverage the service instead of processing each task individually.
- Added relevant interfaces in the task module to support type safety.
- Assumed that the only error possible during batch processing is an invalid task ID. In such cases, the entire batch operation fails to maintain transactional consistency.

---

## Database-Level Pagination

- Implemented server-side pagination at the database level for task listing.
- Updated the service to return paginated data along with meta information (e.g., page, limit, total count).
- Enhanced the Task Filter DTO to validate and sanitize incoming query parameters.

---

## Stats API Refactor

- Rewrote the `getStats()` service method to use native SQL aggregation for performance.
- Removed redundant calculations from the controller and streamlined the response.

---

## Transaction Handling in Task APIs

- Added database transactions to `create`, `update`, and `batch` APIs to ensure task creation is synchronized with task queue insertion.
- Renamed service methods to reflect their functionality more clearly.
- Applied proper JWT guards in the `TaskController`.
- Cleaned up unused code from controller files.

---

## Caching & Rate Limiting with Redis

- Created a global Redis module to initialize a shared Redis client.
- Refactored the cache service to use Redis with reusable utility methods.
- Updated the rate-limiter guard to use Redis (instead of an in-memory map) for distributed rate limiting.
- This approach ensures consistency and scalability across multi-instance deployments by avoiding cache/rate-limit drift.

---

## Logger & Global Exception Handling

- Enhanced the HTTP exception filter to serialize error responses and send structured error objects with correct status codes.
- Improved logging interceptor to capture:
  - Request body, path, query parameters
  - Response time and payload
- Added masking for sensitive fields such as `password`, `accessToken`, etc., in logs.

---

## Task Queue Fixes

- Updated the Overdue Task Service to enqueue overdue tasks into the `overdue-tasks-notification` queue.
- Modified the Task Processor Service to throw errors appropriately, allowing BullMQ to retry failed jobs automatically based on retry configuration.

---

## CRUD Operations & Validation Enhancements

- Removed direct repository access from controllers; all logic now flows through services.
- Enforced validation and authorization in all CRUD operations:
  - Users can only view/update/delete their own tasks.
  - Admins can manage all tasks.
- Aligned the Stats API to follow the same authorization model.
- Updated DTOs to transform emails to lowercase using `@Transform`.
- Added meaningful HTTP exceptions (`Conflict`, `Forbidden`, etc.) where appropriate.
- Optimized the batch update process in the service layer.
- Configured retry attempts in BullMQ `add(), addBulk()` job calls for better resilience.
