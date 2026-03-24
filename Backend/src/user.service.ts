import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, User } from '@prisma/client';
import { CreateUserDto, UpdateUserDto, UserResponseDto } from './api/v1/dto/user.dto';
import { CreateUserDtoV2, UpdateUserDtoV2, UserResponseDtoV2 } from './api/v2/dto/user-v2.dto';
import { PrismaService } from './prisma.service';

@Injectable()
export class UserService {
  private readonly cache = new Map<string, UserResponseDtoV2>();

  constructor(private readonly prisma: PrismaService) { }

  async findAll (): Promise<UserResponseDto[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((user) => this.toV1Response(user));
  }

  async findOne (id: string): Promise<UserResponseDto> {
    return this.toV1Response(await this.getRequiredUser(id));
  }

  async create (createUserDto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.create({
      data: {
        walletAddress: createUserDto.walletAddress ?? this.generateWalletAddress(),
        profileData: this.buildProfileData(createUserDto.name, createUserDto.profileData),
        emailEncrypted: createUserDto.email ? { value: createUserDto.email } : undefined,
      },
    });

    await this.invalidateUserCache(user.id);
    return this.toV1Response(user);
  }

  async update (id: string, updateUserDto: UpdateUserDto): Promise<UserResponseDto> {
    await this.getRequiredUser(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.walletAddress ? { walletAddress: updateUserDto.walletAddress } : {}),
        ...(updateUserDto.profileData || updateUserDto.name
          ? {
            profileData: this.buildProfileData(updateUserDto.name, updateUserDto.profileData),
          }
          : {}),
        ...(updateUserDto.email ? { emailEncrypted: { value: updateUserDto.email } } : {}),
      },
    });

    await this.invalidateUserCache(id);
    return this.toV1Response(user);
  }

  async findAllV2 (): Promise<UserResponseDtoV2[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
    return users.map((user) => this.toV2Response(user));
  }

  async findOneV2 (id: string): Promise<UserResponseDtoV2> {
    return this.toV2Response(await this.getRequiredUser(id));
  }

  async createV2 (createUserDto: CreateUserDtoV2): Promise<UserResponseDtoV2> {
    const user = await this.prisma.user.create({
      data: {
        walletAddress: createUserDto.walletAddress,
        profileData: this.buildProfileData(createUserDto.name, createUserDto.profileData, createUserDto.preferences),
        roles: this.toRoles(createUserDto.roles),
        emailEncrypted: createUserDto.email ? { value: createUserDto.email } : undefined,
      },
    });

    await this.invalidateUserCache(user.id);
    return this.toV2Response(user);
  }

  async updateV2 (id: string, updateUserDto: UpdateUserDtoV2): Promise<UserResponseDtoV2> {
    await this.getRequiredUser(id);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(updateUserDto.walletAddress ? { walletAddress: updateUserDto.walletAddress } : {}),
        ...(updateUserDto.profileData || updateUserDto.preferences || updateUserDto.name
          ? {
            profileData: this.buildProfileData(
              updateUserDto.name,
              updateUserDto.profileData,
              updateUserDto.preferences,
            ),
          }
          : {}),
        ...(updateUserDto.roles ? { roles: this.toRoles(updateUserDto.roles) } : {}),
        ...(updateUserDto.email ? { emailEncrypted: { value: updateUserDto.email } } : {}),
      },
    });

    await this.invalidateUserCache(id);
    return this.toV2Response(user);
  }

  async remove (id: string): Promise<void> {
    await this.getRequiredUser(id);
    await this.prisma.user.delete({ where: { id } });
    await this.invalidateUserCache(id);
  }

  async getUserById (id: string) {
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      return null;
    }

    const response = this.toV2Response(user);
    this.cache.set(id, response);
    return response;
  }

  async invalidateUserCache (id: string) {
    this.cache.delete(id);
  }

  private async getRequiredUser (id: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return user;
  }

  private toV1Response (user: User): UserResponseDto {
    return {
      id: user.id,
      email: this.extractJsonString(user.emailEncrypted) ?? '',
      name: this.extractName(user),
      walletAddress: user.walletAddress,
      profileData: user.profileData,
      reputationScore: user.reputationScore,
      trustScore: user.trustScore,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private toV2Response (user: User): UserResponseDtoV2 {
    const profileData = this.extractObject(user.profileData);
    const preferences = this.extractObject(profileData.preferences);

    return {
      id: user.id,
      email: this.extractJsonString(user.emailEncrypted) ?? '',
      name: this.extractName(user),
      walletAddress: user.walletAddress,
      profileData,
      reputationScore: user.reputationScore,
      trustScore: user.trustScore,
      roles: user.roles,
      preferences,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private buildProfileData (
    name?: string,
    profileData?: unknown,
    preferences?: unknown,
  ): Prisma.InputJsonValue {
    const baseProfile = this.extractObject(profileData);

    return JSON.parse(JSON.stringify({
      ...baseProfile,
      ...(name ? { name } : {}),
      ...(preferences ? { preferences } : {}),
    })) as Prisma.InputJsonValue;
  }

  private extractName (user: User): string {
    const profileData = this.extractObject(user.profileData);
    const candidate = profileData.name ?? profileData.fullName;
    return typeof candidate === 'string' ? candidate : user.walletAddress;
  }

  private extractObject (value: unknown): Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, any>)
      : {};
  }

  private extractJsonString (value: unknown): string | null {
    if (!value) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'object' && value !== null && 'value' in value) {
      const nestedValue = (value as { value?: unknown }).value;
      return typeof nestedValue === 'string' ? nestedValue : null;
    }

    return null;
  }

  private toRoles (values?: string[]): Role[] {
    const allowedRoles = new Set<Role>(Object.values(Role));
    const roles = (values ?? ['USER']).filter((value): value is Role =>
      allowedRoles.has(value as Role),
    );

    return roles.length > 0 ? roles : [Role.USER];
  }

  private generateWalletAddress (): string {
    return `wallet_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
