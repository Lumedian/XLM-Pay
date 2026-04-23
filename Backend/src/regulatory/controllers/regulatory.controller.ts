import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  Request,
  HttpStatus,
  HttpException
} from '@nestjs/common';
import { RegulatoryService } from '../services/regulatory.service';
import { 
  RegulatoryChange, 
  ImpactAssessment, 
  ComplianceTask, 
  PolicyUpdate, 
  RegulatoryDashboard,
  ComplianceArea 
} from '../interfaces/regulatory.interface';
import { 
  CreateRegulatoryChangeDto, 
  CreateImpactAssessmentDto, 
  CreateComplianceTaskDto, 
  CreatePolicyUpdateDto 
} from '../dto/create-regulatory-change.dto';

@Controller('regulatory')
export class RegulatoryController {
  constructor(private readonly regulatoryService: RegulatoryService) {}

  @Get('changes')
  async getRegulatoryChanges(
    @Query() filters: {
      source?: string;
      changeType?: string;
      relevanceScore?: number;
      isProcessed?: boolean;
      isAssessed?: boolean;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<RegulatoryChange[]> {
    const parsedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    return this.regulatoryService.getRegulatoryChanges(parsedFilters);
  }

  @Get('changes/:id')
  @ApiOperation({ summary: 'Get a specific regulatory change' })
  @ApiResponse({ status: 200, description: 'Regulatory change details' })
  @ApiResponse({ status: 404, description: 'Regulatory change not found' })
  async getRegulatoryChange(@Param('id') id: string): Promise<RegulatoryChange> {
    const change = await this.regulatoryService.getRegulatoryChange(id);
    if (!change) {
      throw new HttpException('Regulatory change not found', HttpStatus.NOT_FOUND);
    }
    return change;
  }

  @Post('changes')
  @ApiOperation({ summary: 'Create a new regulatory change' })
  @ApiResponse({ status: 201, description: 'Regulatory change created' })
  async createRegulatoryChange(
    @Body() createDto: CreateRegulatoryChangeDto,
    @Request() req: any
  ): Promise<RegulatoryChange> {
    return this.regulatoryService.createRegulatoryChange(createDto);
  }

  @Put('changes/:id/process')
  @ApiOperation({ summary: 'Process a regulatory change' })
  @ApiResponse({ status: 200, description: 'Regulatory change processed' })
  async processRegulatoryChange(
    @Param('id') id: string,
    @Request() req: any
  ): Promise<RegulatoryChange> {
    const change = await this.regulatoryService.processRegulatoryChange(
      id,
      req.user?.id || 'system',
      req.user?.name || 'System'
    );

    if (!change) {
      throw new HttpException('Regulatory change not found', HttpStatus.NOT_FOUND);
    }

    return change;
  }

  @Post('changes/:id/assessment')
  @ApiOperation({ summary: 'Initiate impact assessment for a regulatory change' })
  @ApiResponse({ status: 201, description: 'Impact assessment initiated' })
  async initiateImpactAssessment(
    @Param('id') id: string,
    @Body() body: { assessorId: string; assessorName: string }
  ): Promise<any> {
    try {
      return await this.regulatoryService.initiateImpactAssessment(
        id,
        body.assessorId,
        body.assessorName
      );
    } catch (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('assessment')
  @ApiOperation({ summary: 'Submit impact assessment' })
  @ApiResponse({ status: 201, description: 'Impact assessment submitted' })
  async submitImpactAssessment(
    @Body() assessmentData: CreateImpactAssessmentDto,
    @Body('responses') responses: any
  ): Promise<ImpactAssessment> {
    return this.regulatoryService.submitImpactAssessment(assessmentData, responses);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Get compliance tasks with optional filters' })
  @ApiResponse({ status: 200, description: 'List of compliance tasks' })
  async getComplianceTasks(
    @Query() filters: {
      regulatoryChangeId?: string;
      assigneeId?: string;
      status?: string;
      priority?: string;
      complianceArea?: ComplianceArea;
    }
  ): Promise<ComplianceTask[]> {
    return this.regulatoryService.getComplianceTasks(filters);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a new compliance task' })
  @ApiResponse({ status: 201, description: 'Compliance task created' })
  async createComplianceTask(
    @Body() createTaskDto: CreateComplianceTaskDto
  ): Promise<ComplianceTask> {
    return this.regulatoryService.createComplianceTask(createTaskDto);
  }

  @Get('policies')
  @ApiOperation({ summary: 'Get policy updates' })
  @ApiResponse({ status: 200, description: 'List of policy updates' })
  async getPolicyUpdates(
    @Query('regulatoryChangeId') regulatoryChangeId?: string
  ): Promise<PolicyUpdate[]> {
    return this.regulatoryService.getPolicyUpdates(regulatoryChangeId);
  }

  @Post('policies')
  @ApiOperation({ summary: 'Create a new policy update' })
  @ApiResponse({ status: 201, description: 'Policy update created' })
  async createPolicyUpdate(
    @Body() createPolicyDto: CreatePolicyUpdateDto,
    @Request() req: any
  ): Promise<PolicyUpdate> {
    return this.regulatoryService.createPolicyUpdate(createPolicyDto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get regulatory dashboard data' })
  @ApiResponse({ status: 200, description: 'Dashboard data' })
  async getDashboard(): Promise<RegulatoryDashboard> {
    return this.regulatoryService.getRegulatoryDashboard();
  }

  @Post('aggregate')
  @ApiOperation({ summary: 'Trigger manual regulatory aggregation' })
  @ApiResponse({ status: 200, description: 'Aggregation completed' })
  async triggerAggregation(): Promise<RegulatoryChange[]> {
    return this.regulatoryService.triggerRegulatoryAggregation();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search regulatory changes' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async searchRegulatoryChanges(@Query('q') query: string): Promise<RegulatoryChange[]> {
    if (!query || query.trim().length === 0) {
      throw new HttpException('Search query is required', HttpStatus.BAD_REQUEST);
    }
    return this.regulatoryService.searchRegulatoryChanges(query);
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get compliance metrics' })
  @ApiResponse({ status: 200, description: 'Compliance metrics' })
  async getMetrics(
    @Query() filters: {
      regulatoryChangeId?: string;
      assigneeId?: string;
      complianceArea?: ComplianceArea;
      startDate?: string;
      endDate?: string;
    }
  ): Promise<any> {
    const parsedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    // This would be implemented in the service
    return {
      totalChanges: 0,
      pendingAssessments: 0,
      overdueTasks: 0,
      completedTasks: 0,
      averageAssessmentTime: 0,
      averageTaskCompletionTime: 0,
      complianceScore: 0,
      riskDistribution: {},
      workloadByTeam: {},
    };
  }

  @Get('team')
  @ApiOperation({ summary: 'Get compliance team members' })
  @ApiResponse({ status: 200, description: 'Team members' })
  async getTeamMembers(): Promise<any[]> {
    // This would be implemented in the collaboration service
    return [];
  }

  @Get('notifications')
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiResponse({ status: 200, description: 'User notifications' })
  async getNotifications(@Request() req: any): Promise<any[]> {
    // This would be implemented in the collaboration service
    return [];
  }

  @Put('notifications/:id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  async markNotificationAsRead(
    @Param('id') notificationId: string,
    @Request() req: any
  ): Promise<void> {
    // This would be implemented in the collaboration service
  }

  @Get('workspaces/:regulatoryChangeId')
  @ApiOperation({ summary: 'Get collaboration workspace for a regulatory change' })
  @ApiResponse({ status: 200, description: 'Collaboration workspace' })
  async getWorkspace(@Param('regulatoryChangeId') regulatoryChangeId: string): Promise<any> {
    // This would be implemented in the collaboration service
    return null;
  }

  @Post('workspaces/:regulatoryChangeId/comments')
  @ApiOperation({ summary: 'Add comment to workspace' })
  @ApiResponse({ status: 201, description: 'Comment added' })
  async addComment(
    @Param('regulatoryChangeId') regulatoryChangeId: string,
    @Body() body: { content: string; mentions?: string[] },
    @Request() req: any
  ): Promise<any> {
    // This would be implemented in the collaboration service
    return null;
  }

  @Get('audit-trail/:regulatoryChangeId')
  @ApiOperation({ summary: 'Get audit trail for a regulatory change' })
  @ApiResponse({ status: 200, description: 'Audit trail' })
  async getAuditTrail(@Param('regulatoryChangeId') regulatoryChangeId: string): Promise<any[]> {
    // This would be implemented in the audit trail service
    return [];
  }

  @Get('reports/compliance')
  @ApiOperation({ summary: 'Generate compliance report' })
  @ApiResponse({ status: 200, description: 'Compliance report' })
  async generateComplianceReport(
    @Query() filters: {
      startDate?: string;
      endDate?: string;
      format?: 'PDF' | 'EXCEL' | 'CSV';
    }
  ): Promise<any> {
    // This would generate a comprehensive compliance report
    return {
      reportId: 'report_' + Date.now(),
      generatedAt: new Date(),
      format: filters.format || 'PDF',
      downloadUrl: '/api/regulatory/reports/download/report_' + Date.now(),
    };
  }
}
