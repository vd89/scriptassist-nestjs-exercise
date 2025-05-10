import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { TaskPriority } from '../src/modules/tasks/enums/task-priority.enum';
import { Role } from '../src/modules/users/enums/role.enum';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let adminToken: string;
  let createdTaskId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register and login as regular user
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });

    const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });

    authToken = loginResponse.body.access_token;

    // Register and login as admin
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'admin@example.com',
      password: 'admin123',
      name: 'Admin User',
      role: Role.ADMIN,
    });

    const adminLoginResponse = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'admin123',
    });

    adminToken = adminLoginResponse.body.access_token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /tasks', () => {
    it('should create a new task', () => {
      return request(app.getHttpServer())
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test Task',
          description: 'Test Description',
          status: TaskStatus.PENDING,
          priority: TaskPriority.HIGH,
          dueDate: new Date().toISOString(),
        })
        .expect(201)
        .expect(res => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.title).toBe('Test Task');
          createdTaskId = res.body.id;
        });
    });

    it('should not create task without authentication', () => {
      return request(app.getHttpServer())
        .post('/tasks')
        .send({
          title: 'Test Task',
          description: 'Test Description',
        })
        .expect(401);
    });
  });

  describe('GET /tasks', () => {
    it('should get all tasks for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
        });
    });

    it('should not get tasks without authentication', () => {
      return request(app.getHttpServer()).get('/tasks').expect(401);
    });
  });

  describe('GET /tasks/:id', () => {
    it('should get task by id', () => {
      return request(app.getHttpServer())
        .get(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect(res => {
          expect(res.body.id).toBe(createdTaskId);
        });
    });

    it('should not get task with invalid id', () => {
      return request(app.getHttpServer())
        .get('/tasks/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('PATCH /tasks/:id', () => {
    it('should update task', () => {
      return request(app.getHttpServer())
        .patch(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Task',
          status: TaskStatus.IN_PROGRESS,
        })
        .expect(200)
        .expect(res => {
          expect(res.body.title).toBe('Updated Task');
          expect(res.body.status).toBe(TaskStatus.IN_PROGRESS);
        });
    });

    it('should not update task with invalid id', () => {
      return request(app.getHttpServer())
        .patch('/tasks/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Updated Task',
        })
        .expect(404);
    });
  });

  describe('DELETE /tasks/:id', () => {
    it('should delete task', () => {
      return request(app.getHttpServer())
        .delete(`/tasks/${createdTaskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });

    it('should not delete task with invalid id', () => {
      return request(app.getHttpServer())
        .delete('/tasks/invalid-id')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });
  });

  describe('GET /tasks/overdue', () => {
    it('should get overdue tasks', () => {
      return request(app.getHttpServer())
        .get('/tasks/overdue')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect(res => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should not get overdue tasks without admin role', () => {
      return request(app.getHttpServer())
        .get('/tasks/overdue')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });
});
