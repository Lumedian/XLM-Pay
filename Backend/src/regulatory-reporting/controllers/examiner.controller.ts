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
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ExaminerService } from '../services/examiner.service';
import { 
  CreateExaminerAccessDto, 
  UpdateExaminerAccessDto,
  ExaminerLoginDto 
} from '../dto';
import { Role, ExaminerStatus } from '@prisma/client';

@ApiTags('examiner')
@Controller('examiner')
export class ExaminerController {
  constructor(
    private readonly examinerService: ExaminerService,
  ) {}

  @Post('access')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create examiner access' })
  @ApiResponse({ status: 201, description: 'Examiner access created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async createExaminerAccess(@Body() createExaminerDto: CreateExaminerAccessDto) {
    return this.examinerService.createExaminerAccess(createExaminerDto);
  }

  @Put('access/:id')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update examiner access' })
  @ApiParam({ name: 'id', description: 'Examiner access ID' })
  @ApiResponse({ status: 200, description: 'Examiner access updated successfully' })
  async updateExaminerAccess(
    @Param('id') id: string,
    @Body() updateExaminerDto: UpdateExaminerAccessDto,
  ) {
    return this.examinerService.updateExaminerAccess(id, updateExaminerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Examiner login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @HttpCode(HttpStatus.OK)
  async examinerLogin(@Body() loginDto: ExaminerLoginDto) {
    return this.examinerService.examinerLogin(loginDto);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Examiner logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @HttpCode(HttpStatus.OK)
  async examinerLogout(
    @Body() logoutData: { sessionToken: string; ipAddress: string; userAgent?: string },
  ) {
    return this.examinerService.examinerLogout(
      logoutData.sessionToken,
      logoutData.ipAddress,
      logoutData.userAgent,
    );
  }

  @Get('validate-session/:sessionToken')
  @ApiOperation({ summary: 'Validate examiner session' })
  @ApiParam({ name: 'sessionToken', description: 'Session token' })
  @ApiResponse({ status: 200, description: 'Session valid' })
  @ApiResponse({ status: 401, description: 'Invalid session' })
  async validateSession(@Param('sessionToken') sessionToken: string) {
    return this.examinerService.validateSession(sessionToken);
  }

  @Post('check-access')
  @ApiOperation({ summary: 'Check resource access permission' })
  @ApiResponse({ status: 200, description: 'Access permission checked' })
  @HttpCode(HttpStatus.OK)
  async checkResourceAccess(@Body() accessData: {
    sessionToken: string;
    resourceType: string;
    resourceId: string;
    action?: string;
  }) {
    return this.examinerService.checkResourceAccess(
      accessData.sessionToken,
      accessData.resourceType,
      accessData.resourceId,
      accessData.action,
    );
  }

  @Get('logs')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get examiner access logs' })
  @ApiQuery({ name: 'examinerId', required: false, description: 'Filter by examiner ID' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date filter' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date filter' })
  @ApiResponse({ status: 200, description: 'Access logs retrieved successfully' })
  async getExaminerAccessLogs(@Query() query: {
    examinerId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const startDate = query.startDate ? new Date(query.startDate) : undefined;
    const endDate = query.endDate ? new Date(query.endDate) : undefined;
    
    return this.examinerService.getExaminerAccessLogs(
      query.examinerId,
      startDate,
      endDate,
    );
  }

  @Get('active')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get active examiners' })
  @ApiResponse({ status: 200, description: 'Active examiners retrieved successfully' })
  async getActiveExaminers() {
    return this.examinerService.getActiveExaminers();
  }

  @Post('access/:id/revoke')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Revoke examiner access' })
  @ApiParam({ name: 'id', description: 'Examiner access ID' })
  @ApiResponse({ status: 200, description: 'Examiner access revoked successfully' })
  @HttpCode(HttpStatus.OK)
  async revokeExaminerAccess(
    @Param('id') id: string,
    @Body() revokeData: { reason: string },
  ) {
    return this.examinerService.revokeExaminerAccess(id, revokeData.reason);
  }

  @Get('statistics')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN, Role.SUPPORT_AGENT)
  @ApiOperation({ summary: 'Get examiner statistics' })
  @ApiResponse({ status: 200, description: 'Examiner statistics retrieved successfully' })
  async getExaminerStatistics() {
    return this.examinerService.getExaminerStatistics();
  }

  @Post('cleanup-sessions')
  @Roles(Role.SUPER_ADMIN, Role.TENANT_ADMIN)
  @ApiOperation({ summary: 'Clean up expired sessions' })
  @ApiResponse({ status: 200, description: 'Session cleanup completed' })
  @HttpCode(HttpStatus.OK)
  async cleanupExpiredSessions() {
    return this.examinerService.cleanupExpiredSessions();
  }
}
