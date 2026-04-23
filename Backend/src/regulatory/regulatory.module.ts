import { Module } from '@nestjs/common';
import { RegulatoryController } from './controllers/regulatory.controller';
import { RegulatoryService } from './services/regulatory.service';
import { RegulatoryAggregationService } from './services/regulatory-aggregation.service';
import { RelevanceScoringService } from './services/relevance-scoring.service';
import { ImpactAssessmentService } from './services/impact-assessment.service';
import { ComplianceTaskService } from './services/compliance-task.service';
import { PolicyAutomationService } from './services/policy-automation.service';
import { AuditTrailService } from './services/audit-trail.service';
import { CollaborationService } from './services/collaboration.service';

@Module({
  controllers: [RegulatoryController],
  providers: [
    RegulatoryService,
    RegulatoryAggregationService,
    RelevanceScoringService,
    ImpactAssessmentService,
    ComplianceTaskService,
    PolicyAutomationService,
    AuditTrailService,
    CollaborationService,
  ],
  exports: [
    RegulatoryService,
    RegulatoryAggregationService,
    RelevanceScoringService,
    ImpactAssessmentService,
    ComplianceTaskService,
    PolicyAutomationService,
    AuditTrailService,
    CollaborationService,
  ],
})
export class RegulatoryModule {}
