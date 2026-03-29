import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MessagingModule } from '../messaging/messaging.module';
import { CrossChainRouterService } from './services/cross-chain-router.service';
import { LightClientService } from './services/light-client.service';
import { ValidatorService } from './services/validator.service';
import { MessageRouterService } from './services/message-router.service';
import { AssetBridgeService } from './services/asset-bridge.service';
import { ChainAdapterService } from './services/chain-adapter.service';
import { FinalizationDetectorService } from './services/finalization-detector.service';
import { CrossChainRouterController } from './controllers/cross-chain-router.controller';
import { MessageRouterController } from './controllers/message-router.controller';
import { ValidatorController } from './controllers/validator.controller';
import { RouterHealthMonitor } from './monitors/router-health-monitor.service';

@Module({
  imports: [PrismaModule, MessagingModule],
  controllers: [CrossChainRouterController, MessageRouterController, ValidatorController],
  providers: [
    CrossChainRouterService,
    LightClientService,
    ValidatorService,
    MessageRouterService,
    AssetBridgeService,
    ChainAdapterService,
    FinalizationDetectorService,
    RouterHealthMonitor,
  ],
  exports: [
    CrossChainRouterService,
    LightClientService,
    ValidatorService,
    MessageRouterService,
    AssetBridgeService,
    ChainAdapterService,
  ],
})
export class CrossChainRouterModule {}
