import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';
import { StepState } from '../../workflow/types/step-state.enum';

registerEnumType(StepState, {
  name: 'StepState',
});

@ObjectType()
export class WorkflowStepModel {
  @Field(() => ID)
  id: string;

  @Field()
  workflowId: string;

  @Field()
  stepName: string;

  @Field()
  stepIndex: number;

  @Field(() => StepState)
  state: StepState;

  @Field(() => GraphQLJSONObject, { nullable: true })
  input?: Record<string, any>;

  @Field(() => GraphQLJSONObject, { nullable: true })
  output?: Record<string, any>;

  @Field(() => GraphQLJSONObject, { nullable: true })
  config?: Record<string, any>;

  @Field()
  retryCount: number;

  @Field()
  maxRetries: number;

  @Field({ nullable: true })
  startedAt?: Date;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field({ nullable: true })
  failedAt?: Date;

  @Field({ nullable: true })
  failureReason?: string;

  @Field({ nullable: true })
  nextRetryAt?: Date;

  @Field()
  requiresCompensation: boolean;

  @Field()
  isCompensated: boolean;

  @Field({ nullable: true })
  compensatedAt?: Date;

  @Field({ nullable: true })
  compensationStepName?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  compensationConfig?: Record<string, any>;

  @Field()
  isIdempotent: boolean;

  @Field({ nullable: true })
  idempotencyKey?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
