import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { Role } from '../src/common/enums/role.enum';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let access_token: string;
  let refresh_token: string;

  const testUser = {
    newUser: {
      email: 'john.doenew@example.com',
      password: 'Password123!',
      name: 'Test User',
    },
    existingUser: {
      email: 'john.doe@example.com',
      password: 'Password123!',
      name: 'Test User',
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  describe('Auth Endpoints', () => {
    it('should register a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser.newUser)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('user');
          expect(res.body).toHaveProperty('token');
          expect(res.body.user).toHaveProperty('id');
          expect(res.body.user.email).toBe(testUser.newUser.email);
          expect(res.body.user.name).toBe(testUser.newUser.name);
          expect(res.body.user.role).toBe(Role.USER);
        });
    });

    it('should not register a user with existing email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser.existingUser)
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toBe('Email already exists');
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.existingUser.email,
          password: testUser.existingUser.password,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('access_token');
          expect(res.body).toHaveProperty('refresh_token');
          expect(res.body).toHaveProperty('user');
          expect(res.body.user.email).toBe(testUser.existingUser.email);
          access_token = res.body.access_token;
          refresh_token = res.body.refresh_token;
        });
    });

    it('should not login with invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.existingUser.email,
          password: 'wrongpassword',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid email or password');
        });
    });

    it('should not refresh token with invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token: 'invalid-token' })
        .expect(401);
    });

    it('should logout user', () => {
      return request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('message', 'Logout successful');
        });
    });

    it('should not be able to use token after logout', () => {
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refresh_token })
        .expect(401);
    });

  });

  afterAll(async () => {
    await app.close();
  });
});
