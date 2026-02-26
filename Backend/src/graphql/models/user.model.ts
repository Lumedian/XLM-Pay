import { ObjectType, Field, ID } from '@nestjs/graphql';
import { WalletModel } from './wallet.model';

@ObjectType()
export class UserModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  username?: string;

  @Field(() => [WalletModel])
  wallets: WalletModel[];

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field()
  isActive: boolean;
}
