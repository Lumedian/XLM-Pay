import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Subscription,
} from '@nestjs/graphql';
import { UseGuards, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PubSub } from 'graphql-subscriptions';
import { WorkflowModel } from '../models/workflow.model';
import { WorkflowState } from '../../workflow/types/workflow-state.enum';
import { Workflow } from '../../workflow/entities/workflow.entity';
import { WorkflowService } from '../../workflow/services/workflow.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateWorkflowInput } from '../inputs/create-workflow.input';

const pubSub = new PubSub() as any;

@Resolver(() => WorkflowModel)
export class WorkflowResolver {
  constructor(
    @InjectRepository(Workflow)
    private workflowRepository: Repository<Workflow>,
    @Inject(WorkflowService)
    private workflowService: WorkflowService,
  ) {}

  @Query(() => WorkflowModel, { nullable: true })
  @UseGuards(JwtAuthGuard)
  async workflow(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WorkflowModel | null> {
    const workflow = await this.workflowService.getWorkflow(id);

    if (!workflow) return null;

    return this.mapWorkflowToModel(workflow);
  }

  @Query(() => [WorkflowModel])
  @UseGuards(JwtAuthGuard)
  async workflows(
    @Args('state', { nullable: true }) state?: WorkflowState,
    @Args('userId', { nullable: true }) userId?: string,
  ): Promise<WorkflowModel[]> {
    let workflows: Workflow[];

    if (userId) {
      const result = await this.workflowService.getUserWorkflows(userId);
      workflows = result.workflows;
    } else if (state) {
      const result = await this.workflowService.getWorkflowsByState(state);
      workflows = result.workflows;
    } else {
      const result = await this.workflowService.getWorkflowsByState(
        WorkflowState.PENDING,
      );
      workflows = result.workflows;
    }

    return workflows.map((w) => this.mapWorkflowToModel(w));
  }

  @Mutation(() => WorkflowModel)
  @UseGuards(JwtAuthGuard)
  async createWorkflow(
    @Args('input') input: CreateWorkflowInput,
  ): Promise<WorkflowModel> {
    const workflow = await this.workflowService.startWorkflow(
      input.type,
      input.input,
      input.userId,
      input.walletAddress,
      input.context,
    );

    const result = this.mapWorkflowToModel(workflow);

    // Publish subscription event
    await pubSub.publish('workflowCreated', { workflowCreated: result });

    return result;
  }

  @Mutation(() => WorkflowModel)
  @UseGuards(JwtAuthGuard)
  async retryWorkflow(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WorkflowModel> {
    await this.workflowService.retryWorkflow(id);

    const workflow = await this.workflowService.getWorkflow(id);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = this.mapWorkflowToModel(workflow);

    // Publish subscription event
    await pubSub.publish('workflowUpdated', { workflowUpdated: result });

    return result;
  }

  @Mutation(() => WorkflowModel)
  @UseGuards(JwtAuthGuard)
  async cancelWorkflow(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WorkflowModel> {
    await this.workflowService.cancelWorkflow(id);

    const workflow = await this.workflowService.getWorkflow(id);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = this.mapWorkflowToModel(workflow);

    // Publish subscription event
    await pubSub.publish('workflowUpdated', { workflowUpdated: result });

    return result;
  }

  @Subscription(() => WorkflowModel)
  workflowCreated() {
    return pubSub.asyncIterator('workflowCreated');
  }

  @Subscription(() => WorkflowModel, {
    filter: (payload, variables) => {
      return payload.workflowUpdated.id === variables.id;
    },
  })
  workflowUpdated(@Args('id', { type: () => ID }) id: string) {
    return pubSub.asyncIterator('workflowUpdated');
  }

  private mapWorkflowToModel(workflow: Workflow): WorkflowModel {
    return {
      id: workflow.id,
      idempotencyKey: workflow.idempotencyKey,
      type: workflow.type,
      state: workflow.state,
      userId: workflow.userId,
      walletAddress: workflow.walletAddress,
      input: workflow.input,
      output: workflow.output,
      context: workflow.context,
      currentStepIndex: workflow.currentStepIndex,
      totalSteps: workflow.totalSteps,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      failedAt: workflow.failedAt,
      failureReason: workflow.failureReason,
      retryCount: workflow.retryCount,
      maxRetries: workflow.maxRetries,
      nextRetryAt: workflow.nextRetryAt,
      requiresCompensation: workflow.requiresCompensation,
      isCompensated: workflow.isCompensated,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      steps: (workflow.steps || [])
        .sort((a, b) => a.stepIndex - b.stepIndex)
        .map((step) => ({
          id: step.id,
          workflowId: step.workflowId,
          stepName: step.stepName,
          stepIndex: step.stepIndex,
          state: step.state,
          input: step.input,
          output: step.output,
          config: step.config,
          retryCount: step.retryCount,
          maxRetries: step.maxRetries,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
          failedAt: step.failedAt,
          failureReason: step.failureReason,
          nextRetryAt: step.nextRetryAt,
          requiresCompensation: step.requiresCompensation,
          isCompensated: step.isCompensated,
          compensatedAt: step.compensatedAt,
          compensationStepName: step.compensationStepName,
          compensationConfig: step.compensationConfig,
          isIdempotent: step.isIdempotent,
          idempotencyKey: step.idempotencyKey,
          createdAt: step.createdAt,
          updatedAt: step.updatedAt,
        })),
    };
  }
}
