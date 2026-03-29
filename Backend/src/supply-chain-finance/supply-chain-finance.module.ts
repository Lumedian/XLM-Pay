import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupplyChainFinanceController } from './supply-chain-finance.controller';
import { SupplyChainFinanceService } from './supply-chain-finance.service';
import { TransactionQueueModule } from '../transaction-queue/transaction-queue.module';

@Module({
  imports: [ConfigModule, TransactionQueueModule],
  controllers: [SupplyChainFinanceController],
  providers: [SupplyChainFinanceService],
  exports: [SupplyChainFinanceService],
})
export class SupplyChainFinanceModule {}
