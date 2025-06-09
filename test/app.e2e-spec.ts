import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TaskStatus } from '../src/modules/tasks/enums/task-status.enum';
import { CreateTaskDto } from '../src/modules/tasks/dto/create-task.dto';
import { UpdateTaskDto } from '../src/modules/tasks/dto/update-task.dto';

// Bun's test timeout is configured in bunfig.toml

describe('TaskFlow API (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let refreshToken: string;
  let taskId: string;
  let server;

  // Test user credentials
  const testUser = {
    email: `test.user.${Date.now()}@example.com`,
    password: 'TestUser123!',
    name: 'Test User',
  };
  
  const adminUser = {
    email: `admin.user.${Date.now()}@example.com`,
    password: 'AdminPass123!',
    name: 'Admin User',
    role: 'admin',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same pipes used in the main application
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should register a new user', async () => {
      const response = await request(server)
        .post('/auth/register')
        .send(testUser)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      
      // Save tokens for subsequent tests
      authToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should register an admin user', async () => {
      // This might require admin privileges in a real app, 
      // but for testing purposes we'll create an admin user directly
      const response = await request(server)
        .post('/auth/register')
        .send(adminUser)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('should login with valid credentials', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      
      // Update tokens
      authToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });

    it('should reject login with invalid credentials', async () => {
      await request(server)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should refresh token', async () => {
      const response = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      
      // Update tokens
      authToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
    });
    
    it('should reject unauthenticated access to protected routes', async () => {
      await request(server).get('/users/profile').expect(HttpStatus.UNAUTHORIZED);
    });
    
    it('should allow authenticated access to profile', async () => {
      const response = await request(server)
        .get('/users/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);
        
      expect(response.body).toHaveProperty('email', testUser.email);
    });
  });

  describe('Tasks CRUD Operations', () => {
    it('should create a new task', async () => {
      const newTask: CreateTaskDto = {
        title: 'Test Task',
        description: 'This is a test task created for e2e testing',
        priority: 'high',
        status: TaskStatus.PENDING,
        dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      };

      const response = await request(server)
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(newTask)
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(newTask.title);
      expect(response.body.status).toBe(newTask.status);
      
      // Save task ID for subsequent tests
      taskId = response.body.id;
    });

    it('should get a list of tasks with pagination', async () => {
      const response = await request(server)
        .get('/tasks?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get a specific task by ID', async () => {
      const response = await request(server)
        .get(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('id', taskId);
    });

    it('should update a task', async () => {
      const updateData: UpdateTaskDto = {
        title: 'Updated Task Title',
        status: TaskStatus.IN_PROGRESS,
      };

      const response = await request(server)
        .patch(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('title', updateData.title);
      expect(response.body).toHaveProperty('status', updateData.status);
    });

    it('should filter tasks by status', async () => {
      const response = await request(server)
        .get(`/tasks?status=${TaskStatus.IN_PROGRESS}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      expect(response.body.data.every(task => task.status === TaskStatus.IN_PROGRESS)).toBe(true);
    });

    it('should delete a task', async () => {
      await request(server)
        .delete(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.OK);

      // Verify the task is deleted
      await request(server)
        .get(`/tasks/${taskId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(HttpStatus.NOT_FOUND);
    });
  });

  describe('Input Validation', () => {
    it('should reject task creation with invalid data', async () => {
      const invalidTask = {
        // Missing required fields
        description: 'This task is missing required fields',
      };

      await request(server)
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidTask)
        .expect(HttpStatus.BAD_REQUEST);
    });

    it('should reject task creation with invalid date format', async () => {
      const invalidDateTask = {
        title: 'Invalid Date Task',
        description: 'This task has an invalid date format',
        priority: 'high',
        status: TaskStatus.PENDING,
        dueDate: 'not-a-date',
      };

      await request(server)
        .post('/tasks')
        .set('Authorization', `Bearer ${authToken}`)
        .send(invalidDateTask)
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting', async () => {
      // Make multiple rapid requests
      const promises = [];
      for (let i = 0; i < 105; i++) {
        promises.push(
          request(server)
            .get('/tasks')
            .set('Authorization', `Bearer ${authToken}`)
        );
      }

      const results = await Promise.all(promises);
      
      // At least one of the requests should be rate limited (429 Too Many Requests)
      const hasRateLimited = results.some(res => res.status === 429);
      expect(hasRateLimited).toBe(true);
    });
  });

  describe('Batch Operations', () => {
    let batchTaskIds = [];
    
    // Create multiple tasks for batch processing
    beforeAll(async () => {
      for (let i = 0; i < 3; i++) {
        const newTask: CreateTaskDto = {
          title: `Batch Task ${i}`,
          description: 'Task for batch processing test',
          priority: 'medium',
          status: TaskStatus.PENDING,
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        };

        const response = await request(server)
          .post('/tasks')
          .set('Authorization', `Bearer ${authToken}`)
          .send(newTask);

        batchTaskIds.push(response.body.id);
      }
    });
    
    it('should batch complete multiple tasks', async () => {
      const response = await request(server)
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tasks: batchTaskIds,
          action: 'complete',
        })
        .expect(HttpStatus.OK);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(batchTaskIds.length);
      
      // Verify all tasks were updated to COMPLETED
      const tasksResponse = await request(server)
        .get(`/tasks?status=${TaskStatus.COMPLETED}`)
        .set('Authorization', `Bearer ${authToken}`);
        
      const completedTaskIds = tasksResponse.body.data.map(task => task.id);
      batchTaskIds.forEach(id => {
        expect(completedTaskIds).toContain(id);
      });
    });
    
    it('should reject batch processing with empty task array', async () => {
      await request(server)
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tasks: [],
          action: 'complete',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
    
    it('should reject batch processing with invalid action', async () => {
      await request(server)
        .post('/tasks/batch')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tasks: batchTaskIds,
          action: 'invalid-action',
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });
});
