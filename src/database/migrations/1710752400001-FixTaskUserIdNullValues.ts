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

  public async down(): Promise<void> {
    // No down migration needed as we're fixing data
  }
}
