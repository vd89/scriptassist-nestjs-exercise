import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm';
import { RefreshToken } from '../entities/refresh-token.entity';
@EventSubscriber()
export class RefreshTokenSubscriber implements EntitySubscriberInterface<RefreshToken> {
  constructor(dataSource: DataSource) {
    dataSource.subscribers.push(this);
  }
  listenTo() {
    return RefreshToken;
  }

  async afterInsert(event: InsertEvent<RefreshToken>) {
    const { manager, entity } = event;
    if (!entity) return;

    try {
      await manager
        .createQueryBuilder()
        .update(RefreshToken)
        .set({ blacklisted: true })
        .where('user_id = :userId', { userId: entity.userId })
        .andWhere('id != :currentId', { currentId: entity.id })
        .andWhere('blacklisted = false')
        .execute();

      console.log(
        `Blacklisted old tokens for user: ${entity.userId}, except token id: ${entity.id}`,
      );
    } catch (error) {
      console.error(`Failed to blacklist old tokens for user ${entity.userId}:`, error);
    }
  }
}
