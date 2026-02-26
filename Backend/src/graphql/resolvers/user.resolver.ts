import { Resolver, Query, Args, ID } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserModel } from '../models/user.model';
import { User } from '../../auth/entities/user.entity';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Resolver(() => UserModel)
export class UserResolver {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  @Query(() => UserModel, { nullable: true })
  @UseGuards(JwtAuthGuard)
  async user(@Args('id', { type: () => ID }) id: string): Promise<UserModel | null> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['wallets'],
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      wallets: user.wallets.map((w) => ({
        id: w.id,
        publicKey: w.publicKey,
        userId: w.userId,
        isPrimary: w.isPrimary,
        boundAt: w.boundAt,
        lastUsed: w.lastUsed,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
    };
  }

  @Query(() => [UserModel])
  @UseGuards(JwtAuthGuard)
  async users(): Promise<UserModel[]> {
    const users = await this.userRepository.find({
      relations: ['wallets'],
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      wallets: user.wallets.map((w) => ({
        id: w.id,
        publicKey: w.publicKey,
        userId: w.userId,
        isPrimary: w.isPrimary,
        boundAt: w.boundAt,
        lastUsed: w.lastUsed,
      })),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
    }));
  }
}
