import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(walletAddress: string) {
    // For this implementation, we simply find or mock-create a user based on the wallet address.
    // In production, you would verify a wallet signature here.
    let user = await this.prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          walletAddress,
          roles: ['USER'],
        },
      });
    }

    const tokens = await this.getTokens(user.id, walletAddress, user.roles);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

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
    if (accessToken) {
      // Decode to get expiration and blacklist it
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
      } catch (e) {
        // Ignored
      }
    }

    // Clear the refresh token
    await this.prisma.user.updateMany({
      where: {
        id: userId,
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
    try {
      const decoded = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET', 'super_refresh_secret_key_for_development'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || !user.hashedRefreshToken) {
        throw new UnauthorizedException('Access Denied');
      }

      const refreshTokenMatches = await bcrypt.compare(refreshToken, user.hashedRefreshToken);
      if (!refreshTokenMatches) {
        throw new UnauthorizedException('Access Denied');
      }

      const tokens = await this.getTokens(user.id, user.walletAddress, user.roles);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

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

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        hashedRefreshToken,
      },
    });
  }

  private async getTokens(userId: string, walletAddress: string, roles: string[]) {
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
