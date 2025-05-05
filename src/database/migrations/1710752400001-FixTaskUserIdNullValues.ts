/**
 * Migration: FixTaskUserIdNullValues1710752400001
 *
 * This migration fixes null user_id values in the tasks table by:
 * - Making the user_id column nullable
 * - Updating null user_id values with the first admin user's ID
 * - Making the user_id column non-nullable again
 *
 * Rollback: Reverses the changes by making the user_id column non-nullable again.
 */

import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixTaskUserIdNullValues1710752400001 implements MigrationInterface {
  name = 'FixTaskUserIdNullValues1710752400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, make user_id column nullable
    await queryRunner.query(`
      ALTER TABLE "tasks" ALTER COLUMN "user_id" DROP NOT NULL
    `);

    // Get the first admin user ID to use as default
    const adminUser = await queryRunner.query(`
      SELECT id FROM users WHERE role = 'admin' LIMIT 1
    `);

    if (adminUser && adminUser.length > 0) {
      // Update null user_id values with the admin user ID
      await queryRunner.query(
        `
        UPDATE tasks 
        SET user_id = $1 
        WHERE user_id IS NULL
      `,
        [adminUser[0].id],
      );
    }

    // Make user_id column non-nullable again
    await queryRunner.query(`
      ALTER TABLE "tasks" ALTER COLUMN "user_id" SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse the changes made in the up method
    await queryRunner.query(`
      ALTER TABLE "tasks" ALTER COLUMN "user_id" SET NOT NULL
    `);
  }
}
