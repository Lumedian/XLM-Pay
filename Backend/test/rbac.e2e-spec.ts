import request from 'supertest';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../src/auth/entities/user.entity';
import { Role } from '../src/auth/roles.enum';
import * as jwt from 'jsonwebtoken';

describe('RBAC Enforcement', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let regularUserId: string;
  let adminUserId: string;

  const JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-key-for-e2e';

  const signToken = (userId: string) =>
    jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '15m' });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    userRepository = module.get(getRepositoryToken(User));

    // Create test user with USER role
    const regularUser = userRepository.create({
      email: 'user@test.com',
      username: 'testuser',
      role: Role.USER,
      isActive: true,
    });
    const savedUser = await userRepository.save(regularUser);
    regularUserId = savedUser.id;

    // Create test user with ADMIN role
    const adminUser = userRepository.create({
      email: 'admin@test.com',
      username: 'testadmin',
      role: Role.ADMIN,
      isActive: true,
    });
    const savedAdmin = await userRepository.save(adminUser);
    adminUserId = savedAdmin.id;
  }, 30000);

  it('should block USER from audit logs', () => {
    const userToken = signToken(regularUserId);

    return request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  it('should allow ADMIN to access audit logs', () => {
    const adminToken = signToken(adminUserId);

    return request(app.getHttpServer())
      .get('/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  afterAll(async () => {
    // Clean up test users
    if (userRepository) {
      await userRepository.delete({ id: regularUserId });
      await userRepository.delete({ id: adminUserId });
    }
    if (app) {
      await app.close();
    }
  });
});
