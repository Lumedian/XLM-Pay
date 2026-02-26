import { InputType, Field } from '@nestjs/graphql';
import { GraphQLJSONObject } from 'graphql-type-json';

@InputType()
export class CreateWorkflowInput {
  @Field()
  type: string;

  @Field(() => GraphQLJSONObject)
  input: Record<string, any>;

  @Field({ nullable: true })
  userId?: string;

  @Field({ nullable: true })
  walletAddress?: string;

  @Field(() => GraphQLJSONObject, { nullable: true })
  context?: Record<string, any>;
}
