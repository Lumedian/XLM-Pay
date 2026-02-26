import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRoleToUser1740606000000 implements MigrationInterface {
  name = 'AddRoleToUser1740606000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'role',
        type: 'varchar',
        default: "'user'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('users', 'role');
  }
}
