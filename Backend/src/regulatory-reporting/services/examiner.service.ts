import { Injectable, Logger, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { 
  ExaminerAccessLevel, 
  ExaminerStatus,
  ExaminerAction,
  RegulatoryEntityType,
  RegulatoryAction 
} from '@prisma/client';
import { CreateExaminerAccessDto, UpdateExaminerAccessDto, ExaminerLoginDto } from '../dto';
import * as crypto from 'crypto';

@Injectable()
export class ExaminerService {
  private readonly logger = new Logger(ExaminerService.name);
  private readonly activeSessions = new Map<string, { examinerId: string; expiresAt: Date }>();

  constructor(private readonly prisma: PrismaService) {}

  async createExaminerAccess(createExaminerDto: CreateExaminerAccessDto) {
    this.logger.log(`Creating examiner access for ${createExaminerDto.examinerId} from ${createExaminerDto.organization}`);

    // Check if examiner already exists
    const existingExaminer = await this.prisma.examinerAccess.findUnique({
      where: { examinerId: createExaminerDto.examinerId },
    });

    if (existingExaminer) {
      throw new Error(`Examiner ${createExaminerDto.examinerId} already exists`);
    }

    // Validate access period
    if (createExaminerDto.validFrom >= createExaminerDto.validUntil) {
      throw new Error('Valid from date must be before valid until date');
    }

    const examiner = await this.prisma.examinerAccess.create({
      data: {
        examinerId: createExaminerDto.examinerId,
        examinerName: createExaminerDto.examinerName,
        organization: createExaminerDto.organization,
        accessLevel: createExaminerDto.accessLevel,
        permissions: createExaminerDto.permissions,
        validFrom: createExaminerDto.validFrom,
        validUntil: createExaminerDto.validUntil,
        status: ExaminerStatus.ACTIVE,
      },
    });

    // Log the creation
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.EXAMINER_ACCESS,
        entityId: examiner.id,
        action: RegulatoryAction.ACCESS_GRANTED,
        performedBy: 'system',
        previousState: null,
        newState: { examinerId: examiner.examinerId, accessLevel: examiner.accessLevel },
        reason: `Examiner access granted for ${examiner.organization}`,
      },
    });

    this.logger.log(`Examiner access created: ${examiner.id}`);
    return examiner;
  }

  async updateExaminerAccess(id: string, updateExaminerDto: UpdateExaminerAccessDto) {
    this.logger.log(`Updating examiner access ${id}`);

    const examiner = await this.prisma.examinerAccess.findUnique({
      where: { id },
    });

    if (!examiner) {
      throw new Error(`Examiner access ${id} not found`);
    }

    const updatedExaminer = await this.prisma.examinerAccess.update({
      where: { id },
      data: {
        ...updateExaminerDto,
        updatedAt: new Date(),
      },
    });

    // Log the update
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.EXAMINER_ACCESS,
        entityId: id,
        action: RegulatoryAction.UPDATE,
        performedBy: 'system',
        previousState: examiner,
        newState: updatedExaminer,
        reason: 'Examiner access updated',
      },
    });

    return updatedExaminer;
  }

  async examinerLogin(loginDto: ExaminerLoginDto) {
    this.logger.log(`Examiner login attempt for ${loginDto.examinerId} from ${loginDto.ipAddress}`);

    const examiner = await this.prisma.examinerAccess.findUnique({
      where: { examinerId: loginDto.examinerId },
    });

    if (!examiner) {
      await this.logExaminerAction(null, ExaminerAction.ACCESS_DENIED, 'EXAMINER', loginDto.examinerId, false, 'Examiner not found', loginDto.ipAddress, loginDto.userAgent);
      throw new UnauthorizedException('Invalid examiner credentials');
    }

    // Check if examiner is active
    if (examiner.status !== ExaminerStatus.ACTIVE) {
      await this.logExaminerAction(examiner.id, ExaminerAction.ACCESS_DENIED, 'EXAMINER', examiner.id, false, `Examiner status: ${examiner.status}`, loginDto.ipAddress, loginDto.userAgent);
      throw new ForbiddenException('Examiner access is not active');
    }

    // Check access period
    const now = new Date();
    if (now < examiner.validFrom || now > examiner.validUntil) {
      await this.logExaminerAction(examiner.id, ExaminerAction.ACCESS_DENIED, 'EXAMINER', examiner.id, false, 'Access period expired or not started', loginDto.ipAddress, loginDto.userAgent);
      throw new ForbiddenException('Access period is not valid');
    }

    // Validate access token (mock implementation)
    const isValidToken = await this.validateAccessToken(loginDto.examinerId, loginDto.accessToken);
    if (!isValidToken) {
      await this.logExaminerAction(examiner.id, ExaminerAction.ACCESS_DENIED, 'EXAMINER', examiner.id, false, 'Invalid access token', loginDto.ipAddress, loginDto.userAgent);
      throw new UnauthorizedException('Invalid access token');
    }

    // Generate session token
    const sessionToken = this.generateSessionToken(examiner.examinerId);
    const expiresAt = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 8 hours

    // Store session
    this.activeSessions.set(sessionToken, { examinerId: examiner.examinerId, expiresAt });

    // Update last login
    await this.prisma.examinerAccess.update({
      where: { id: examiner.id },
      data: { lastLoginAt: now },
    });

    // Log successful login
    await this.logExaminerAction(examiner.id, ExaminerAction.LOGIN, 'EXAMINER', examiner.id, true, null, loginDto.ipAddress, loginDto.userAgent);

    this.logger.log(`Examiner ${examiner.examinerId} logged in successfully`);
    
    return {
      sessionToken,
      examinerId: examiner.examinerId,
      examinerName: examiner.examinerName,
      accessLevel: examiner.accessLevel,
      permissions: examiner.permissions,
      expiresAt,
    };
  }

  async examinerLogout(sessionToken: string, ipAddress: string, userAgent?: string) {
    const session = this.activeSessions.get(sessionToken);
    
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    const examiner = await this.prisma.examinerAccess.findUnique({
      where: { examinerId: session.examinerId },
    });

    if (examiner) {
      await this.logExaminerAction(examiner.id, ExaminerAction.LOGOUT, 'EXAMINER', examiner.id, true, null, ipAddress, userAgent);
    }

    // Remove session
    this.activeSessions.delete(sessionToken);

    this.logger.log(`Examiner ${session.examinerId} logged out`);
  }

  async validateSession(sessionToken: string): Promise<any> {
    const session = this.activeSessions.get(sessionToken);
    
    if (!session) {
      throw new UnauthorizedException('Invalid session');
    }

    // Check if session expired
    if (new Date() > session.expiresAt) {
      this.activeSessions.delete(sessionToken);
      throw new UnauthorizedException('Session expired');
    }

    const examiner = await this.prisma.examinerAccess.findUnique({
      where: { examinerId: session.examinerId },
    });

    if (!examiner || examiner.status !== ExaminerStatus.ACTIVE) {
      this.activeSessions.delete(sessionToken);
      throw new ForbiddenException('Examiner access revoked');
    }

    // Check access period
    const now = new Date();
    if (now < examiner.validFrom || now > examiner.validUntil) {
      this.activeSessions.delete(sessionToken);
      throw new ForbiddenException('Access period expired');
    }

    return examiner;
  }

  async checkResourceAccess(
    sessionToken: string,
    resourceType: string,
    resourceId: string,
    action: string = 'VIEW'
  ): Promise<boolean> {
    try {
      const examiner = await this.validateSession(sessionToken);

      // Check if examiner has permission for this action
      const hasPermission = this.checkPermission(examiner, resourceType, action);

      if (hasPermission) {
        await this.logExaminerAction(examiner.id, ExaminerAction.VIEW_REPORT, resourceType, resourceId, true, null, 'system');
      } else {
        await this.logExaminerAction(examiner.id, ExaminerAction.ACCESS_DENIED, resourceType, resourceId, false, `Insufficient permissions for ${action}`, 'system');
      }

      return hasPermission;
    } catch (error) {
      // Log failed access attempt
      await this.logExaminerAction(null, ExaminerAction.ACCESS_DENIED, resourceType, resourceId, false, error.message, 'system');
      return false;
    }
  }

  async getExaminerAccessLogs(examinerId?: string, startDate?: Date, endDate?: Date) {
    const where: any = {};
    
    if (examinerId) {
      const examiner = await this.prisma.examinerAccess.findUnique({
        where: { examinerId },
      });
      if (examiner) {
        where.examinerAccessId = examiner.id;
      }
    }
    
    if (startDate && endDate) {
      where.timestamp = {
        gte: startDate,
        lte: endDate,
      };
    }

    return this.prisma.examinerAccessLog.findMany({
      where,
      include: {
        examinerAccess: true,
      },
      orderBy: { timestamp: 'desc' },
    });
  }

  async revokeExaminerAccess(id: string, reason: string) {
    this.logger.log(`Revoking examiner access ${id}: ${reason}`);

    const examiner = await this.prisma.examinerAccess.findUnique({
      where: { id },
    });

    if (!examiner) {
      throw new Error(`Examiner access ${id} not found`);
    }

    // Update status to revoked
    const updatedExaminer = await this.prisma.examinerAccess.update({
      where: { id },
      data: { status: ExaminerStatus.REVOKED },
    });

    // Invalidate all active sessions for this examiner
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.examinerId === examiner.examinerId) {
        this.activeSessions.delete(token);
      }
    }

    // Log the revocation
    await this.prisma.regulatoryAuditTrail.create({
      data: {
        entityType: RegulatoryEntityType.EXAMINER_ACCESS,
        entityId: id,
        action: RegulatoryAction.ACCESS_REVOKED,
        performedBy: 'system',
        previousState: examiner,
        newState: updatedExaminer,
        reason,
      },
    });

    return updatedExaminer;
  }

  async getActiveExaminers() {
    return this.prisma.examinerAccess.findMany({
      where: {
        status: ExaminerStatus.ACTIVE,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExaminerStatistics() {
    const [
      totalExaminers,
      activeExaminers,
      suspendedExaminers,
      expiredExaminers,
      revokedExaminers,
    ] = await Promise.all([
      this.prisma.examinerAccess.count(),
      this.prisma.examinerAccess.count({ where: { status: ExaminerStatus.ACTIVE } }),
      this.prisma.examinerAccess.count({ where: { status: ExaminerStatus.SUSPENDED } }),
      this.prisma.examinerAccess.count({ where: { status: ExaminerStatus.EXPIRED } }),
      this.prisma.examinerAccess.count({ where: { status: ExaminerStatus.REVOKED } }),
    ]);

    const activeSessions = this.activeSessions.size;

    return {
      total: totalExaminers,
      active: activeExaminers,
      suspended: suspendedExaminers,
      expired: expiredExaminers,
      revoked: revokedExaminers,
      activeSessions,
    };
  }

  // Private helper methods

  private async validateAccessToken(examinerId: string, token: string): Promise<boolean> {
    // Mock implementation - in production, this would validate against
    // the regulatory body's authentication system
    const expectedToken = `temp_${examinerId}_${new Date().toISOString().split('T')[0]}`;
    return token === expectedToken;
  }

  private generateSessionToken(examinerId: string): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private checkPermission(examiner: any, resourceType: string, action: string): boolean {
    // Check access level permissions
    switch (examiner.accessLevel) {
      case ExaminerAccessLevel.VIEW_ONLY:
        return action === 'VIEW';
      
      case ExaminerAccessLevel.DOWNLOAD:
        return ['VIEW', 'DOWNLOAD'].includes(action);
      
      case ExaminerAccessLevel.EXPORT:
        return ['VIEW', 'DOWNLOAD', 'EXPORT'].includes(action);
      
      case ExaminerAccessLevel.FULL_ACCESS:
        return true;
      
      default:
        return false;
    }
  }

  private async logExaminerAction(
    examinerAccessId: string | null,
    action: ExaminerAction,
    resourceType: string,
    resourceId: string,
    success: boolean,
    errorMessage: string | null,
    ipAddress: string,
    userAgent?: string
  ) {
    try {
      await this.prisma.examinerAccessLog.create({
        data: {
          examinerAccessId: examinerAccessId || undefined,
          action,
          resourceType,
          resourceId,
          ipAddress,
          userAgent,
          success,
          errorMessage,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to log examiner action: ${error.message}`);
    }
  }

  // Cleanup expired sessions
  async cleanupExpiredSessions() {
    const now = new Date();
    let cleanedCount = 0;

    for (const [token, session] of this.activeSessions.entries()) {
      if (now > session.expiresAt) {
        this.activeSessions.delete(token);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired examiner sessions`);
    }

    return cleanedCount;
  }
}
