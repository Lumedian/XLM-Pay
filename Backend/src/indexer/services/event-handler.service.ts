import { Injectable, Logger } from '@nestjs/common';
import { NotificationService } from '../../notification/services/notification.service';
import { PrismaService } from '../../prisma.service';
import { ReputationService } from '../../reputation/reputation.service';
import { TenantManagementService } from '../../tenancy/tenant-management.service';
import { IEventHandler, IEventHandlerRegistry } from '../interfaces/event-handler.interface';
import {
  ContractEventType,
  ContributionMadeEvent,
  FundsReleasedEvent,
  MilestoneApprovedEvent,
  ParsedContractEvent,
  ProjectCreatedEvent,
  ProjectStatusEvent,
} from '../types/event-types';

class MilestoneRejectedHandler implements IEventHandler {
  readonly eventType = ContractEventType.MILESTONE_REJECTED;
  private readonly logger = new Logger(MilestoneRejectedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as Record<string, unknown>;
    return !!(data.projectId !== undefined && data.milestoneId !== undefined);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as Record<string, unknown>;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(
      `Processing MILESTONE_REJECTED: Milestone ${data.milestoneId} for project ${data.projectId}`,
    );

    const project = await this.prisma.project.findFirst({
      where: {
        tenantId: tenant.id,
        contractId: String(data.projectId),
      },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for milestone rejection`);
      return;
    }

    await this.prisma.milestone.updateMany({
      where: {
        tenantId: tenant.id,
        projectId: project.id,
      },
      data: {
        status: 'REJECTED',
      },
    });

    const contributors = await this.prisma.contribution.findMany({
      where: {
        tenantId: tenant.id,
        projectId: project.id,
      },
      select: { investorId: true },
      distinct: ['investorId'],
    });

    for (const contribution of contributors) {
      try {
        await this.notificationService.notify(
          contribution.investorId,
          'MILESTONE',
          'Project Milestone Failed',
          `A project you back (${project.title}) has a failed milestone!`,
          { projectId: project.id, milestoneId: data.milestoneId },
          tenant.id,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to notify investor ${contribution.investorId} of milestone: ${message}`,
        );
      }
    }

    if (project.creatorId) {
      await this.reputationService.updateTrustScore(project.creatorId, tenant.id);
      this.logger.log(`Updated trust score for creator ${project.creatorId}`);
    }
  }
}

class ProjectCreatedHandler implements IEventHandler {
  readonly eventType = ContractEventType.PROJECT_CREATED;
  private readonly logger = new Logger(ProjectCreatedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as ProjectCreatedEvent;
    return !!(
      data.projectId !== undefined &&
      data.creator &&
      data.fundingGoal &&
      data.deadline &&
      data.token
    );
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as ProjectCreatedEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(`Processing PROJECT_CREATED: Project ${data.projectId} by ${data.creator}`);

    const user = await this.prisma.user.upsert({
      where: {
        tenantId_walletAddress: {
          tenantId: tenant.id,
          walletAddress: data.creator,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        walletAddress: data.creator,
        reputationScore: 0,
      },
    });

    await this.prisma.project.upsert({
      where: {
        tenantId_contractId: {
          tenantId: tenant.id,
          contractId: data.projectId.toString(),
        },
      },
      update: {
        title: `Project ${data.projectId}`,
        goal: BigInt(data.fundingGoal),
        deadline: new Date(data.deadline * 1000),
        status: 'ACTIVE',
      },
      create: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
        creatorId: user.id,
        title: `Project ${data.projectId}`,
        category: 'uncategorized',
        goal: BigInt(data.fundingGoal),
        deadline: new Date(data.deadline * 1000),
        status: 'ACTIVE',
      },
    });

    this.logger.log(`Created/updated project ${data.projectId}`);
  }
}

class ContributionMadeHandler implements IEventHandler {
  readonly eventType = ContractEventType.CONTRIBUTION_MADE;
  private readonly logger = new Logger(ContributionMadeHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as ContributionMadeEvent;
    return !!(data.projectId !== undefined && data.contributor && data.amount);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as ContributionMadeEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(
      `Processing CONTRIBUTION_MADE: ${data.amount} to project ${data.projectId} from ${data.contributor}`,
    );

    const user = await this.prisma.user.upsert({
      where: {
        tenantId_walletAddress: {
          tenantId: tenant.id,
          walletAddress: data.contributor,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        walletAddress: data.contributor,
        reputationScore: 0,
      },
    });

    const project = await this.prisma.project.findFirst({
      where: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
      },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for contribution`);
      return;
    }

    await this.prisma.contribution.upsert({
      where: {
        tenantId_transactionHash: {
          tenantId: tenant.id,
          transactionHash: event.transactionHash,
        },
      },
      update: {},
      create: {
        tenantId: tenant.id,
        transactionHash: event.transactionHash,
        investorId: user.id,
        projectId: project.id,
        amount: BigInt(data.amount),
        timestamp: event.ledgerClosedAt,
      },
    });

    await this.prisma.project.updateMany({
      where: {
        id: project.id,
        tenantId: tenant.id,
      },
      data: {
        currentFunds: BigInt(data.totalRaised),
      },
    });

    try {
      await this.notificationService.notify(
        user.id,
        'CONTRIBUTION',
        'Contribution Successful!',
        `Your contribution of ${data.amount} to project ${project.title} was successful.`,
        { projectId: project.id, amount: data.amount },
        tenant.id,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send contribution notification to user ${user.id}: ${message}`);
    }

    this.logger.log(`Recorded contribution of ${data.amount} for project ${data.projectId}`);
  }
}

class MilestoneApprovedHandler implements IEventHandler {
  readonly eventType = ContractEventType.MILESTONE_APPROVED;
  private readonly logger = new Logger(MilestoneApprovedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as MilestoneApprovedEvent;
    return !!(data.projectId !== undefined && data.milestoneId !== undefined);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as MilestoneApprovedEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(
      `Processing MILESTONE_APPROVED: Milestone ${data.milestoneId} for project ${data.projectId}`,
    );

    const project = await this.prisma.project.findFirst({
      where: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
      },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for milestone approval`);
      return;
    }

    await this.prisma.milestone.updateMany({
      where: {
        tenantId: tenant.id,
        projectId: project.id,
      },
      data: {
        status: 'APPROVED',
      },
    });

    const contributors = await this.prisma.contribution.findMany({
      where: {
        tenantId: tenant.id,
        projectId: project.id,
      },
      select: { investorId: true },
      distinct: ['investorId'],
    });

    for (const contribution of contributors) {
      try {
        await this.notificationService.notify(
          contribution.investorId,
          'MILESTONE',
          'Project Milestone Reached!',
          `A project you back (${project.title}) has reached a new milestone!`,
          { projectId: project.id, milestoneId: data.milestoneId },
          tenant.id,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to notify investor ${contribution.investorId} of milestone: ${message}`,
        );
      }
    }

    if (project.creatorId) {
      await this.reputationService.updateTrustScore(project.creatorId, tenant.id);
      this.logger.log(`Updated trust score for creator ${project.creatorId}`);
    }
  }
}

class FundsReleasedHandler implements IEventHandler {
  readonly eventType = ContractEventType.FUNDS_RELEASED;
  private readonly logger = new Logger(FundsReleasedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as FundsReleasedEvent;
    return !!(data.projectId !== undefined && data.amount);
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as FundsReleasedEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(
      `Processing FUNDS_RELEASED: ${data.amount} for project ${data.projectId}, milestone ${data.milestoneId}`,
    );

    const project = await this.prisma.project.findFirst({
      where: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
      },
    });

    if (!project) {
      this.logger.warn(`Project ${data.projectId} not found for funds release`);
      return;
    }

    await this.prisma.milestone.updateMany({
      where: {
        tenantId: tenant.id,
        projectId: project.id,
      },
      data: {
        status: 'FUNDED',
        completionDate: event.ledgerClosedAt,
      },
    });

    this.logger.log(`Released funds for project ${data.projectId}`);
  }
}

class ProjectCompletedHandler implements IEventHandler {
  readonly eventType = ContractEventType.PROJECT_COMPLETED;
  private readonly logger = new Logger(ProjectCompletedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as ProjectStatusEvent;
    return data.projectId !== undefined;
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as ProjectStatusEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(`Processing PROJECT_COMPLETED: Project ${data.projectId}`);

    await this.prisma.project.updateMany({
      where: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
      },
      data: { status: 'COMPLETED' },
    });
  }
}

class ProjectFailedHandler implements IEventHandler {
  readonly eventType = ContractEventType.PROJECT_FAILED;
  private readonly logger = new Logger(ProjectFailedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantManagementService: TenantManagementService,
  ) {}

  validate(event: ParsedContractEvent): boolean {
    const data = event.data as ProjectStatusEvent;
    return data.projectId !== undefined;
  }

  async handle(event: ParsedContractEvent): Promise<void> {
    const data = event.data as ProjectStatusEvent;
    const tenant = await this.tenantManagementService.getCurrentTenant();

    this.logger.log(`Processing PROJECT_FAILED: Project ${data.projectId}`);

    await this.prisma.project.updateMany({
      where: {
        tenantId: tenant.id,
        contractId: data.projectId.toString(),
      },
      data: { status: 'CANCELLED' },
    });
  }
}

@Injectable()
export class EventHandlerService implements IEventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerService.name);
  private readonly handlers = new Map<string, IEventHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly reputationService: ReputationService,
    private readonly tenantManagementService: TenantManagementService,
  ) {
    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.register(new ProjectCreatedHandler(this.prisma, this.tenantManagementService));
    this.register(
      new ContributionMadeHandler(
        this.prisma,
        this.notificationService,
        this.tenantManagementService,
      ),
    );
    this.register(
      new MilestoneApprovedHandler(
        this.prisma,
        this.notificationService,
        this.reputationService,
        this.tenantManagementService,
      ),
    );
    this.register(
      new MilestoneRejectedHandler(
        this.prisma,
        this.notificationService,
        this.reputationService,
        this.tenantManagementService,
      ),
    );
    this.register(new FundsReleasedHandler(this.prisma, this.tenantManagementService));
    this.register(new ProjectCompletedHandler(this.prisma, this.tenantManagementService));
    this.register(new ProjectFailedHandler(this.prisma, this.tenantManagementService));

    this.logger.log(`Registered ${this.handlers.size} event handlers`);
  }

  register(handler: IEventHandler): void {
    this.handlers.set(handler.eventType, handler);
    this.logger.debug(`Registered handler for ${handler.eventType}`);
  }

  getHandler(eventType: string): IEventHandler | undefined {
    return this.handlers.get(eventType);
  }

  getAllHandlers(): IEventHandler[] {
    return Array.from(this.handlers.values());
  }

  async processEvent(event: ParsedContractEvent): Promise<boolean> {
    const handler = this.getHandler(event.eventType);

    if (!handler) {
      this.logger.debug(`No handler registered for event type: ${event.eventType}`);
      return false;
    }

    try {
      if (!handler.validate(event)) {
        this.logger.warn(`Event validation failed for ${event.eventType}`);
        return false;
      }

      await handler.handle(event);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error processing event ${event.eventType}: ${message}`, stack);
      throw error;
    }
  }

  isSupported(eventType: string): boolean {
    return this.handlers.has(eventType);
  }
}
