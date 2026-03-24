import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { TenantManagementService } from '../tenancy/tenant-management.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private tenantManagementService: TenantManagementService,
  ) {}

  async login(walletAddress: string) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    let user = await this.prisma.user.findFirst({
      where: {
        tenantId: tenant.id,
        walletAddress,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          tenantId: tenant.id,
          walletAddress,
          roles: [Role.USER],
        },
      });
    }

    const tokens = await this.getTokens(user.id, walletAddress, user.roles);
    await this.updateRefreshToken(user.id, tokens.refreshToken, tenant.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        roles: user.roles,
      },
    };
  }

  async logout(userId: string, accessToken?: string) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    if (accessToken) {
      try {
        const decoded: any = this.jwtService.decode(accessToken);
        if (decoded && decoded.exp) {
          const expiresAt = new Date(decoded.exp * 1000);
          await this.prisma.tokenBlacklist.create({
            data: {
              token: accessToken,
              expiresAt,
            },
          });
        }
      } catch {
      }
    }

    await this.prisma.user.updateMany({
      where: {
        id: userId,
        tenantId: tenant.id,
        hashedRefreshToken: {
          not: null,
        },
      },
      data: {
        hashedRefreshToken: null,
      },
    });
  }

  async refreshTokens(refreshToken: string) {
    const tenant = await this.tenantManagementService.getCurrentTenant();
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'super_refresh_secret_key_for_development'),
      });

      const user = await this.prisma.user.findFirst({
        where: {
          id: decoded.sub,
          tenantId: tenant.id,
        },
      });

      if (!user || !user.hashedRefreshToken) {
        throw new UnauthorizedException('Access Denied');
      }

      const refreshTokenMatches = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
      if (!refreshTokenMatches) {
        throw new UnauthorizedException('Access Denied');
      }

      const tokens = await this.getTokens(user.id, user.walletAddress, user.roles);
      await this.updateRefreshToken(user.id, tokens.refreshToken, tenant.id);

      return tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const isBlacklisted = await this.prisma.tokenBlacklist.findUnique({
      where: { token },
    });
    return !!isBlacklisted;
  }

  private async updateRefreshToken(userId: string, refreshToken: string, tenantId: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.updateMany({
      where: {
        id: userId,
        tenantId,
      },
      data: {
        hashedRefreshToken,
      },
    });
  }

  private async getTokens(userId: string, walletAddress: string, roles: Role[]) {
    const payload = {
      sub: userId,
      walletAddress,
      roles,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_SECRET', 'super_secret_key_for_development'),
        expiresIn: this.configService.get<any>('JWT_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'super_refresh_secret_key_for_development'),
        expiresIn: this.configService.get<any>('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
