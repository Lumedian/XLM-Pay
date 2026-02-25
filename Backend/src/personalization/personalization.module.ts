import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEvent } from './entities/user-event.entity';
import { PersonalizationRule } from './entities/personalization-rule.entity';
import { Experiment } from './entities/experiment.entity';
import { ExperimentAssignment } from './entities/experiment-assignment.entity';
import { EventTrackingService } from './services/event-tracking.service';
import { RecommendationService } from './services/recommendation.service';
import { RuleEngineService } from './services/rule-engine.service';
import { ExperimentService } from './services/experiment.service';
import { PersonalizationController } from './personalization.controller';

@Module({
  imports: [TypeOrmModule.forFeature([UserEvent, PersonalizationRule, Experiment, ExperimentAssignment])],
  providers: [EventTrackingService, RecommendationService, RuleEngineService, ExperimentService],
  controllers: [PersonalizationController],
  exports: [EventTrackingService, RecommendationService, RuleEngineService, ExperimentService, TypeOrmModule],
})
export class PersonalizationModule {}
