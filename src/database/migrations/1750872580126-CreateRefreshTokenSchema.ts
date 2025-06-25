import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateRefreshTokenTable1750872580126 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create refresh_token table
    await queryRunner.createTable(
      new Table({
        name: 'refresh_token',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'token',
            type: 'varchar',
          },
          {
            name: 'blacklisted',
            type: 'boolean',
            default: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
          },
          {
            name: 'expires_at',
            type: 'timestamp',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    // Create index on user_id + blacklisted
    await queryRunner.createIndex(
      'refresh_token',
      new TableIndex({
        name: 'IDX_refresh_token_userId_blacklisted',
        columnNames: ['user_id', 'blacklisted'],
      }),
    );

    // Create foreign key: user_id → users.id
    await queryRunner.createForeignKey(
      'refresh_token',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('refresh_token');

    if (table) {
      // Drop foreign key
      const foreignKey = table.foreignKeys.find(fk => fk.columnNames.includes('user_id'));
      if (foreignKey) {
        await queryRunner.dropForeignKey('refresh_token', foreignKey);
      }

      // Drop index
      const index = table.indices.find(idx => idx.name === 'IDX_refresh_token_userId_blacklisted');
      if (index) {
        await queryRunner.dropIndex('refresh_token', index);
      }

      // Drop table
      await queryRunner.dropTable('refresh_token');
    }
  }
}
