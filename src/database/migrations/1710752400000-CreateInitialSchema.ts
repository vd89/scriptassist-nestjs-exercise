/**
 * Migration: CreateInitialSchema1710752400000
 *
 * This migration creates the initial database schema for the application.
 * It sets up the following:
 * - Users table with fields: id, email, name, password, role, created_at, updated_at
 * - Tasks table with fields: id, title, description, status (enum), priority (enum), due_date, user_id, created_at, updated_at
 * - Postgres enums for task status and priority
 * - Foreign key constraint on user_id with ON DELETE SET NULL
 *
 * Rollback: Drops the tasks and users tables, and the task status and priority enums.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInitialSchema1710752400000 implements MigrationInterface {
  name = 'CreateInitialSchema1710752400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create tables for users, tasks, and other entities
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "password" varchar NOT NULL,
        "role" varchar NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TYPE "task_status_enum" AS ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED')
    `);

    await queryRunner.query(`
      CREATE TYPE "task_priority_enum" AS ENUM('LOW', 'MEDIUM', 'HIGH')
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tasks" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "title" varchar NOT NULL,
        "description" text,
        "status" "task_status_enum" NOT NULL DEFAULT 'PENDING',
        "priority" "task_priority_enum" NOT NULL DEFAULT 'MEDIUM',
        "due_date" TIMESTAMP,
        "user_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_id" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "task_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "task_status_enum"`);
  }
}
