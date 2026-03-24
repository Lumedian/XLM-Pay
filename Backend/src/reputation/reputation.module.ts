import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database.module';
import { ReputationService } from './reputation.service';
import { TenancyModule } from '../tenancy/tenancy.module';

@Module({
  imports: [DatabaseModule, TenancyModule],
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
