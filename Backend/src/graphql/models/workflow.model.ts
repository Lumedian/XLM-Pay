import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { WorkflowStepModel } from './workflow-step.model';
import { GraphQLJSONObject } from 'graphql-type-json';
import { WorkflowState } from '../../workflow/types/workflow-state.enum';
import { WorkflowType } from '../../workflow/types/workflow-type.enum';

registerEnumType(WorkflowState, {
  name: 'WorkflowState',
});

registerEnumType(WorkflowType, {
  name: 'WorkflowType',
});

@ObjectType()
export class WorkflowModel {
  @Field(() => ID)
  id: string;

  @Field()
  idempotencyKey: string;

  @Field(() => WorkflowType)
  type: WorkflowType;

  @Field(() => WorkflowState)
  state: WorkflowState;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  walletAddress?: string;

  @Field(() => GraphQLJSONObject)
  input: Record<string, any>;

  @Field(() => GraphQLJSONObject, { nullable: true })
  output?: Record<string, any>;

  @Field(() => GraphQLJSONObject, { nullable: true })
  context?: Record<string, any>;

  @Field()
  currentStepIndex: number;

  @Field()
  totalSteps: number;

  @Field({ nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  failedAt?: Date;

  @Field({ nullable: true })
  failureReason?: string;

  @Field()
  retryCount: number;

  @Field()
  maxRetries: number;

  @Field({ nullable: true })
  nextRetryAt?: Date;

  @Field()
  requiresCompensation: boolean;

  @Field()
  isCompensated: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => [WorkflowStepModel])
  steps: WorkflowStepModel[];
}
