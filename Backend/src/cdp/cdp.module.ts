import { Module } from '@nestjs/common';
import { CdpService } from './cdp.service';
import { CdpController } from './cdp.controller';
import { EventIngestionService } from './services/event-ingestion.service';
import { IdentityResolutionService } from './services/identity-resolution.service';
import { SegmentBuilderService } from './services/segment-builder.service';
import { UserProfileService } from './services/user-profile.service';
import { ConsentTrackingService } from './services/consent-tracking.service';
import { RealtimeService } from './services/realtime.service';
import { IntegrationService } from './services/integration.service';
import { PrismaModule } from '../prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RabbitmqModule } from '../messaging/rabbitmq/rabbitmq.module';

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    RabbitmqModule,
  ],
  controllers: [CdpController],
  providers: [
    CdpService,
    EventIngestionService,
    IdentityResolutionService,
    SegmentBuilderService,
    UserProfileService,
    ConsentTrackingService,
    RealtimeService,
    IntegrationService,
  ],
  exports: [
    CdpService,
    EventIngestionService,
    IdentityResolutionService,
    SegmentBuilderService,
    UserProfileService,
    ConsentTrackingService,
    RealtimeService,
    IntegrationService,
  ],
})
export class CdpModule {}
