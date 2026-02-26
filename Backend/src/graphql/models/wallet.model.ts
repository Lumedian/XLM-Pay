import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class WalletModel {
  @Field(() => ID)
  id: string;

  @Field()
  publicKey: string;

  @Field()
  userId: string;

  @Field()
  isPrimary: boolean;

  @Field()
  boundAt: Date;

  @Field({ nullable: true })
  lastUsed?: Date;
}
