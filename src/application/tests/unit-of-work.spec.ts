import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TypeOrmUnitOfWork, UNIT_OF_WORK } from '../../infrastructure/persistence/unit-of-work/typeorm-unit-of-work.service';
import { UnitOfWorkWithRepositories } from '../interfaces/application-service.interface';

describe('Unit of Work', () => {
  let unitOfWork: UnitOfWorkWithRepositories;
  let dataSource: DataSource;
  let module: TestingModule;

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    isTransactionActive: false,
    query: jest.fn(),
    manager: {}
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner)
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        {
          provide: UNIT_OF_WORK,
          useClass: TypeOrmUnitOfWork
        },
        {
          provide: DataSource,
          useValue: mockDataSource
        }
      ]
    }).compile();

    unitOfWork = module.get<UnitOfWorkWithRepositories>(UNIT_OF_WORK);
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Transaction Management', () => {
    it('should start a transaction', async () => {
      await unitOfWork.start();

      expect(mockDataSource.createQueryRunner).toHaveBeenCalled();
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(unitOfWork.isActive()).toBe(true);
      expect(unitOfWork.getTransactionId()).toBeTruthy();
    });

    it('should not allow starting multiple transactions', async () => {
      await unitOfWork.start();

      await expect(unitOfWork.start()).rejects.toThrow('Transaction is already active');
    });

    it('should commit a transaction', async () => {
      await unitOfWork.start();
      await unitOfWork.commit();

      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(unitOfWork.isActive()).toBe(false);
      expect(unitOfWork.getTransactionId()).toBeNull();
    });

    it('should rollback a transaction', async () => {
      await unitOfWork.start();
      await unitOfWork.rollback();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(unitOfWork.isActive()).toBe(false);
      expect(unitOfWork.getTransactionId()).toBeNull();
    });

    it('should not commit without active transaction', async () => {
      await expect(unitOfWork.commit()).rejects.toThrow('No active transaction to commit');
    });

    it('should handle rollback without active transaction gracefully', async () => {
      await expect(unitOfWork.rollback()).resolves.toBeUndefined();
    });
  });

  describe('Execute Pattern', () => {
    it('should execute work within transaction and commit', async () => {
      const work = jest.fn().mockResolvedValue('success');

      const result = await unitOfWork.execute(work);

      expect(work).toHaveBeenCalled();
      expect(result).toBe('success');
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback on work failure', async () => {
      const work = jest.fn().mockRejectedValue(new Error('Work failed'));

      await expect(unitOfWork.execute(work)).rejects.toThrow('Work failed');

      expect(work).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('Repository Management', () => {
    class TestEntity {
      id: string = '123';
    }

    it('should create and manage repositories', () => {
      const repository = unitOfWork.getRepository(TestEntity);

      expect(repository).toBeDefined();
      expect(repository.getNew()).toEqual([]);
      expect(repository.getDirty()).toEqual([]);
      expect(repository.getRemoved()).toEqual([]);
    });

    it('should track new entities', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entity = new TestEntity();

      repository.markNew(entity);

      expect(repository.isNew(entity)).toBe(true);
      expect(repository.getNew()).toContain(entity);
    });

    it('should track dirty entities', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entity = new TestEntity();

      repository.markDirty(entity);

      expect(repository.isDirty(entity)).toBe(true);
      expect(repository.getDirty()).toContain(entity);
    });

    it('should track removed entities', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entityId = { value: '123', equals: jest.fn().mockReturnValue(true) } as any;

      repository.markRemoved(entityId);

      expect(repository.isRemoved(entityId)).toBe(true);
      expect(repository.getRemoved()).toContain(entityId);
    });

    it('should not mark same entity as new twice', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entity = new TestEntity();

      repository.markNew(entity);
      repository.markNew(entity);

      expect(repository.getNew()).toHaveLength(1);
    });

    it('should not mark new entity as dirty', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entity = new TestEntity();

      repository.markNew(entity);
      repository.markDirty(entity);

      expect(repository.isDirty(entity)).toBe(false);
      expect(repository.getDirty()).toHaveLength(0);
    });

    it('should clear repository state', () => {
      const repository = unitOfWork.getRepository(TestEntity);
      const entity = new TestEntity();
      const entityId = { value: '123', equals: jest.fn().mockReturnValue(true) } as any;

      repository.markNew(entity);
      repository.markDirty(entity);
      repository.markRemoved(entityId);

      repository.clear();

      expect(repository.getNew()).toHaveLength(0);
      expect(repository.getDirty()).toHaveLength(0);
      expect(repository.getRemoved()).toHaveLength(0);
    });
  });

  describe('Advanced Operations', () => {
    it('should provide query runner access', async () => {
      await unitOfWork.start();

      const queryRunner = (unitOfWork as TypeOrmUnitOfWork).getQueryRunner();

      expect(queryRunner).toBe(mockQueryRunner);
    });

    it('should execute raw queries', async () => {
      await unitOfWork.start();
      mockQueryRunner.query.mockResolvedValue([{ count: 5 }]);

      const result = await (unitOfWork as TypeOrmUnitOfWork).executeRawQuery(
        'SELECT COUNT(*) as count FROM tasks'
      );

      expect(mockQueryRunner.query).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM tasks',
        undefined
      );
      expect(result).toEqual([{ count: 5 }]);
    });

    it('should not execute raw query without transaction', async () => {
      await expect(
        (unitOfWork as TypeOrmUnitOfWork).executeRawQuery('SELECT 1')
      ).rejects.toThrow('No active transaction for raw query execution');
    });
  });
});
