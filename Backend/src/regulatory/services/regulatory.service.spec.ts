import { Test, TestingModule } from '@nestjs/testing';
import { RegulatoryService } from './regulatory.service';
import { RegulatoryAggregationService } from './regulatory-aggregation.service';
import { RelevanceScoringService } from './relevance-scoring.service';
import { ImpactAssessmentService } from './impact-assessment.service';
import { ComplianceTaskService } from './compliance-task.service';
import { PolicyAutomationService } from './policy-automation.service';
import { AuditTrailService } from './audit-trail.service';
import { CollaborationService } from './collaboration.service';
import { CreateRegulatoryChangeDto } from '../dto/create-regulatory-change.dto';
import { RegulatorySource, ChangeType, ComplianceArea } from '../interfaces/regulatory.interface';

describe('RegulatoryService', () => {
  let service: RegulatoryService;
  let aggregationService: RegulatoryAggregationService;
  let relevanceScoringService: RelevanceScoringService;
  let impactAssessmentService: ImpactAssessmentService;
  let complianceTaskService: ComplianceTaskService;
  let policyAutomationService: PolicyAutomationService;
  let auditTrailService: AuditTrailService;
  let collaborationService: CollaborationService;

  beforeEach(async () => {
    const mockAggregationService = {
      triggerAggregation: jest.fn(),
    };

    const mockRelevanceScoringService = {
      calculateRelevance: jest.fn(),
    };

    const mockImpactAssessmentService = {
      initiateAssessment: jest.fn(),
      submitAssessment: jest.fn(),
    };

    const mockComplianceTaskService = {
      getTasksByRegulatoryChange: jest.fn(),
      getTasksByAssignee: jest.fn(),
      getTasksByStatus: jest.fn(),
      getTasksByPriority: jest.fn(),
      getTasksByComplianceArea: jest.fn(),
      getOverdueTasks: jest.fn(),
      getUpcomingTasks: jest.fn(),
      getTaskMetrics: jest.fn(),
      createTask: jest.fn(),
      generateTasksFromAssessment: jest.fn(),
    };

    const mockPolicyAutomationService = {
      generatePolicyUpdates: jest.fn(),
      createPolicyUpdate: jest.fn(),
    };

    const mockAuditTrailService = {
      logAction: jest.fn(),
    };

    const mockCollaborationService = {
      createWorkspace: jest.fn(),
      requestAssessment: jest.fn(),
      getTeamMembers: jest.fn(),
      getTeamMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryService,
        {
          provide: RegulatoryAggregationService,
          useValue: mockAggregationService,
        },
        {
          provide: RelevanceScoringService,
          useValue: mockRelevanceScoringService,
        },
        {
          provide: ImpactAssessmentService,
          useValue: mockImpactAssessmentService,
        },
        {
          provide: ComplianceTaskService,
          useValue: mockComplianceTaskService,
        },
        {
          provide: PolicyAutomationService,
          useValue: mockPolicyAutomationService,
        },
        {
          provide: AuditTrailService,
          useValue: mockAuditTrailService,
        },
        {
          provide: CollaborationService,
          useValue: mockCollaborationService,
        },
      ],
    }).compile();

    service = module.get<RegulatoryService>(RegulatoryService);
    aggregationService = module.get<RegulatoryAggregationService>(RegulatoryAggregationService);
    relevanceScoringService = module.get<RelevanceScoringService>(RelevanceScoringService);
    impactAssessmentService = module.get<ImpactAssessmentService>(ImpactAssessmentService);
    complianceTaskService = module.get<ComplianceTaskService>(ComplianceTaskService);
    policyAutomationService = module.get<PolicyAutomationService>(PolicyAutomationService);
    auditTrailService = module.get<AuditTrailService>(AuditTrailService);
    collaborationService = module.get<CollaborationService>(CollaborationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRegulatoryChange', () => {
    it('should create a new regulatory change successfully', async () => {
      const createDto: CreateRegulatoryChangeDto = {
        title: 'New AML Regulation',
        summary: 'Updated AML requirements for crypto exchanges',
        content: 'Full regulatory content...',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      };

      const result = await service.createRegulatoryChange(createDto);

      expect(result).toBeDefined();
      expect(result.title).toBe(createDto.title);
      expect(result.source).toBe(createDto.source);
      expect(result.isProcessed).toBe(false);
      expect(result.isAssessed).toBe(false);
      expect(auditTrailService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_CHANGE_CREATED',
          regulatoryChangeId: result.id,
        })
      );
    });
  });

  describe('getRegulatoryChanges', () => {
    it('should return all regulatory changes when no filters provided', async () => {
      // Create some test changes
      await service.createRegulatoryChange({
        title: 'Test Change 1',
        summary: 'Test summary 1',
        content: 'Test content 1',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      await service.createRegulatoryChange({
        title: 'Test Change 2',
        summary: 'Test summary 2',
        content: 'Test content 2',
        source: RegulatorySource.CFTC,
        changeType: ChangeType.AMENDMENT,
        publicationDate: new Date(),
        jurisdictions: ['EU'],
        complianceAreas: [ComplianceArea.KYC],
      });

      const result = await service.getRegulatoryChanges();

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Test Change 2'); // Should be sorted by newest first
    });

    it('should filter regulatory changes by source', async () => {
      await service.createRegulatoryChange({
        title: 'SEC Change',
        summary: 'SEC summary',
        content: 'SEC content',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      await service.createRegulatoryChange({
        title: 'CFTC Change',
        summary: 'CFTC summary',
        content: 'CFTC content',
        source: RegulatorySource.CFTC,
        changeType: ChangeType.AMENDMENT,
        publicationDate: new Date(),
        jurisdictions: ['EU'],
        complianceAreas: [ComplianceArea.KYC],
      });

      const result = await service.getRegulatoryChanges({ source: 'SEC' });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe(RegulatorySource.SEC);
      expect(result[0].title).toBe('SEC Change');
    });
  });

  describe('processRegulatoryChange', () => {
    it('should process a regulatory change successfully', async () => {
      const regulatoryChange = await service.createRegulatoryChange({
        title: 'Test Change',
        summary: 'Test summary',
        content: 'Test content',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      (collaborationService.createWorkspace as jest.Mock).mockResolvedValue({ id: 'workspace_123' });

      const result = await service.processRegulatoryChange(
        regulatoryChange.id,
        'user_123',
        'Test User'
      );

      expect(result).toBeDefined();
      expect(result.isProcessed).toBe(true);
      expect(collaborationService.createWorkspace).toHaveBeenCalledWith(
        regulatoryChange.id,
        regulatoryChange,
        'user_123',
        'Test User'
      );
      expect(auditTrailService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REGULATORY_CHANGE_PROCESSED',
          regulatoryChangeId: regulatoryChange.id,
        })
      );
    });

    it('should request assessment for high-relevance changes', async () => {
      const regulatoryChange = await service.createRegulatoryChange({
        title: 'High Impact Change',
        summary: 'High impact summary',
        content: 'High impact content',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      // Manually set high relevance score
      const change = await service.getRegulatoryChange(regulatoryChange.id);
      if (change) {
        change.relevanceScore = 0.9;
      }

      (collaborationService.createWorkspace as jest.Mock).mockResolvedValue({ id: 'workspace_123' });
      (collaborationService.requestAssessment as jest.Mock).mockResolvedValue({});

      await service.processRegulatoryChange(
        regulatoryChange.id,
        'user_123',
        'Test User'
      );

      expect(collaborationService.requestAssessment).toHaveBeenCalledWith(
        regulatoryChange.id,
        expect.objectContaining({ relevanceScore: 0.9 }),
        'user_123',
        'Test User'
      );
    });
  });

  describe('initiateImpactAssessment', () => {
    it('should initiate impact assessment successfully', async () => {
      const regulatoryChange = await service.createRegulatoryChange({
        title: 'Test Change',
        summary: 'Test summary',
        content: 'Test content',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      (impactAssessmentService.initiateAssessment as jest.Mock).mockResolvedValue({
        id: 'assessment_123',
        regulatoryChangeId: regulatoryChange.id,
      });

      const result = await service.initiateImpactAssessment(
        regulatoryChange.id,
        'assessor_123',
        'Assessor User'
      );

      expect(result).toBeDefined();
      expect(impactAssessmentService.initiateAssessment).toHaveBeenCalledWith(
        expect.objectContaining({ id: regulatoryChange.id }),
        'assessor_123',
        'Assessor User'
      );
    });

    it('should throw error for non-existent regulatory change', async () => {
      await expect(
        service.initiateImpactAssessment('non-existent', 'assessor_123', 'Assessor')
      ).rejects.toThrow('Regulatory change not found');
    });
  });

  describe('submitImpactAssessment', () => {
    it('should submit impact assessment and generate tasks', async () => {
      const assessmentData = {
        regulatoryChangeId: 'change_123',
        assessorId: 'assessor_123',
        assessorName: 'Assessor',
        complianceArea: ComplianceArea.AML,
        impactLevel: 'HIGH',
        impactSummary: 'High impact on AML operations',
        affectedOperations: ['Customer onboarding'],
        requiredActions: ['Update procedures'],
        riskFactors: ['Regulatory risk'],
        recommendations: ['Implement controls'],
      };

      const mockAssessment = {
        id: 'assessment_123',
        ...assessmentData,
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (impactAssessmentService.submitAssessment as jest.Mock).mockResolvedValue(mockAssessment);
      (complianceTaskService.generateTasksFromAssessment as jest.Mock).mockResolvedValue([]);

      const result = await service.submitImpactAssessment(assessmentData, {});

      expect(result).toBeDefined();
      expect(result.id).toBe('assessment_123');
      expect(impactAssessmentService.submitAssessment).toHaveBeenCalledWith(
        assessmentData.regulatoryChangeId,
        assessmentData,
        {}
      );
      expect(complianceTaskService.generateTasksFromAssessment).toHaveBeenCalledWith(
        assessmentData.regulatoryChangeId,
        mockAssessment,
        assessmentData.assessorId
      );
    });
  });

  describe('searchRegulatoryChanges', () => {
    it('should search regulatory changes by query', async () => {
      await service.createRegulatoryChange({
        title: 'Cryptocurrency Regulation',
        summary: 'New crypto regulations',
        content: 'Full crypto content',
        source: RegulatorySource.SEC,
        changeType: ChangeType.NEW_REGULATION,
        publicationDate: new Date(),
        jurisdictions: ['US'],
        complianceAreas: [ComplianceArea.AML],
      });

      await service.createRegulatoryChange({
        title: 'Banking Regulation',
        summary: 'New banking rules',
        content: 'Full banking content',
        source: RegulatorySource.CFTC,
        changeType: ChangeType.AMENDMENT,
        publicationDate: new Date(),
        jurisdictions: ['EU'],
        complianceAreas: [ComplianceArea.KYC],
      });

      const result = await service.searchRegulatoryChanges('cryptocurrency');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Cryptocurrency Regulation');
    });
  });

  describe('triggerRegulatoryAggregation', () => {
    it('should trigger regulatory aggregation', async () => {
      const mockChanges = [
        {
          id: 'change_123',
          title: 'Aggregated Change',
          source: RegulatorySource.SEC,
          relevanceScore: 0.8,
        },
      ];

      (aggregationService.triggerAggregation as jest.Mock).mockResolvedValue(mockChanges);

      const result = await service.triggerRegulatoryAggregation();

      expect(result).toEqual(mockChanges);
      expect(aggregationService.triggerAggregation).toHaveBeenCalled();
    });
  });
});
