import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndexesAndRoles1710752400001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create role enum type
    await queryRunner.query(`
      CREATE TYPE "public"."user_role_enum" AS ENUM('user', 'manager', 'admin');
    `);

    // Modify users table to use role enum type
    await queryRunner.query(`
      ALTER TABLE "users" 
      ALTER COLUMN "role" TYPE "public"."user_role_enum" 
      USING "role"::"public"."user_role_enum";
    `);

    // Add indexes to users table
    await queryRunner.query(`
      CREATE INDEX "IDX_users_name" ON "users" ("name");
      CREATE INDEX "IDX_users_role" ON "users" ("role");
    `);

    // Add indexes to tasks table
    await queryRunner.query(`
      CREATE INDEX "IDX_tasks_title" ON "tasks" ("title");
      CREATE INDEX "IDX_tasks_user_id" ON "tasks" ("user_id");
      CREATE INDEX "IDX_tasks_status_priority" ON "tasks" ("status", "priority");
      CREATE INDEX "IDX_tasks_user_id_status" ON "tasks" ("user_id", "status");
      CREATE INDEX "IDX_tasks_due_date" ON "tasks" ("due_date");
    `);

    // Add indexes to refresh_tokens table
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_refresh_tokens_token" ON "refresh_tokens" ("token");
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id");
      CREATE INDEX "IDX_refresh_tokens_expires_at" ON "refresh_tokens" ("expires_at");
      CREATE INDEX "IDX_refresh_tokens_user_id_is_revoked" ON "refresh_tokens" ("user_id", "is_revoked");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes from refresh_tokens table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_refresh_tokens_token";
      DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id";
      DROP INDEX IF EXISTS "IDX_refresh_tokens_expires_at";
      DROP INDEX IF EXISTS "IDX_refresh_tokens_user_id_is_revoked";
    `);

    // Drop indexes from tasks table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_tasks_title";
      DROP INDEX IF EXISTS "IDX_tasks_user_id";
      DROP INDEX IF EXISTS "IDX_tasks_status_priority";
      DROP INDEX IF EXISTS "IDX_tasks_user_id_status";
      DROP INDEX IF EXISTS "IDX_tasks_due_date";
    `);

    // Drop indexes from users table
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_users_name";
      DROP INDEX IF EXISTS "IDX_users_role";
    `);

    // Revert role enum to varchar
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "role" TYPE varchar;
    `);

    // Drop the enum type
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."user_role_enum";
    `);
  }
} 