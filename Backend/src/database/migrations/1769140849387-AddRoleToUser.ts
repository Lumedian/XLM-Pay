import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRoleToUser1769140849387 implements MigrationInterface {
  name = 'AddRoleToUser1769140849387';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists before adding column
    const table = await queryRunner.getTable('users');
    if (!table) {
      throw new Error(
        'Migration AddRoleToUser: table "users" not found. Ensure the InitialSchema migration runs before this one.',
      );
    }

    // Check if column already exists
    const hasRole = table.columns.some((c) => c.name === 'role');
    if (!hasRole) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'role',
          type: 'varchar',
          default: "'user'",
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table) return;

    const hasRole = table.columns.some((c) => c.name === 'role');
    if (hasRole) {
      await queryRunner.dropColumn('users', 'role');
    }
  }
}
