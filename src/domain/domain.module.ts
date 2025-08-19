import { Module } from '@nestjs/common';
import { UserDomainService } from './services/user-domain.service';
import { TaskDomainService } from './services/task-domain.service';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';

@Module({
  imports: [InfrastructureModule],
  providers: [
    UserDomainService,
    TaskDomainService,
  ],
  exports: [
    UserDomainService,
    TaskDomainService,
  ],
})
export class DomainModule {}
