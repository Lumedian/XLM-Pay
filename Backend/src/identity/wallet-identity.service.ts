import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { 
  WalletIdentity, 
  WalletVerificationChallenge,
  PrivacyLevel
} from '@prisma/client';
import { NotificationService } from './mock-notification.service';
import { 
  StellarService,
  EthereumService,
  SolanaService 
} from './crypto-services';

export interface LinkWalletDto {
  walletType: 'stellar' | 'ethereum' | 'solana';
  walletAddress: string;
  nickname?: string;
  privacyLevel?: PrivacyLevel;
}

export interface CreateWalletChallengeDto {
  expiresIn?: number; // minutes
}

export interface VerifyWalletDto {
  challengeId: string;
  signature: string;
}

@Injectable()
export class WalletIdentityService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationService: NotificationService,
    private stellarService: StellarService,
    private ethereumService: EthereumService,
    private solanaService: SolanaService,
  ) {}

  async linkWallet(userId: string, linkData: LinkWalletDto): Promise<WalletIdentity> {
    // Validate wallet address format
    if (!this.isValidWalletAddress(linkData.walletType, linkData.walletAddress)) {
      throw new BadRequestException('Invalid wallet address format');
    }

    // Check if wallet is already linked
    const existingWallet = await this.prisma.walletIdentity.findFirst({
      where: {
        userId,
        walletType: linkData.walletType,
        walletAddress: linkData.walletAddress,
      },
    });

    if (existingWallet) {
      throw new ConflictException('This wallet is already linked to your account');
    }

    // Create the wallet identity
    const walletIdentity = await this.prisma.walletIdentity.create({
      data: {
        userId,
        walletType: linkData.walletType,
        walletAddress: linkData.walletAddress,
        nickname: linkData.nickname,
        privacyLevel: linkData.privacyLevel || PrivacyLevel.PRIVATE,
      },
    });

    // Send notification for wallet linking
    await this.notificationService.sendNotification(userId, {
      type: 'SECURITY',
      title: 'New Wallet Linked',
      message: `A new ${linkData.walletType} wallet has been linked to your account. Please verify it to complete the setup.`,
      data: {
        walletId: walletIdentity.id,
        walletType: linkData.walletType,
        walletAddress: linkData.walletAddress,
      },
    });

    return walletIdentity;
  }

  async unlinkWallet(userId: string, walletId: string): Promise<void> {
    const wallet = await this.prisma.walletIdentity.findFirst({
      where: {
        id: walletId,
        userId,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    await this.prisma.walletIdentity.delete({
      where: { id: walletId },
    });

    // Send notification
    await this.notificationService.sendNotification(userId, {
      type: 'SECURITY',
      title: 'Wallet Unlinked',
      message: `Your ${wallet.walletType} wallet has been unlinked from your account.`,
      data: {
        walletType: wallet.walletType,
        walletAddress: wallet.walletAddress,
      },
    });
  }

  async createVerificationChallenge(
    userId: string,
    walletId: string,
    challengeData: CreateWalletChallengeDto = {}
  ): Promise<WalletVerificationChallenge> {
    const wallet = await this.prisma.walletIdentity.findFirst({
      where: {
        id: walletId,
        userId,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    if (wallet.isVerified) {
      throw new BadRequestException('Wallet is already verified');
    }

    // Generate challenge message
    const challengeMessage = this.generateChallengeMessage(userId);
    const expiresIn = challengeData.expiresIn || 15; // 15 minutes default

    // Create challenge record
    const verificationChallenge = await this.prisma.walletVerificationChallenge.create({
      data: {
        walletIdentityId: walletId,
        challengeMessage,
        publicKey: wallet.walletAddress,
        expiresAt: new Date(Date.now() + expiresIn * 60 * 1000),
      },
    });

    return verificationChallenge;
  }

  async verifyWallet(
    userId: string,
    verifyData: VerifyWalletDto
  ): Promise<WalletIdentity> {
    const challenge = await this.prisma.walletVerificationChallenge.findFirst({
      where: {
        id: verifyData.challengeId,
        walletIdentity: {
          userId,
        },
      },
      include: {
        walletIdentity: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Verification challenge not found');
    }

    if (challenge.isCompleted) {
      throw new BadRequestException('Challenge has already been completed');
    }

    if (challenge.expiresAt < new Date()) {
      throw new BadRequestException('Challenge has expired');
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      throw new BadRequestException('Maximum attempts exceeded');
    }

    // Verify the signature based on wallet type
    let isSuccessful = false;

    switch (challenge.walletIdentity.walletType) {
      case 'stellar':
        isSuccessful = await this.stellarService.verifySignature(
          challenge.challengeMessage,
          verifyData.signature,
          challenge.publicKey
        );
        break;
      
      case 'ethereum':
        isSuccessful = await this.ethereumService.verifySignature(
          challenge.challengeMessage,
          verifyData.signature,
          challenge.publicKey
        );
        break;
      
      case 'solana':
        isSuccessful = await this.solanaService.verifySignature(
          challenge.challengeMessage,
          verifyData.signature,
          challenge.publicKey
        );
        break;
      
      default:
        throw new BadRequestException('Unsupported wallet type');
    }

    // Update challenge
    await this.prisma.walletVerificationChallenge.update({
      where: { id: challenge.id },
      data: {
        signature: verifyData.signature,
        isCompleted: true,
        isSuccessful,
        attempts: { increment: 1 },
        completedAt: new Date(),
      },
    });

    if (!isSuccessful) {
      throw new BadRequestException('Signature verification failed');
    }

    // Update wallet identity
    const updatedWallet = await this.prisma.walletIdentity.update({
      where: { id: challenge.walletIdentityId },
      data: {
        isVerified: true,
        verificationData: {
          challengeMessage: challenge.challengeMessage,
          signature: verifyData.signature,
          verifiedAt: new Date().toISOString(),
        },
        lastUsedAt: new Date(),
      },
    });

    // Send success notification
    await this.notificationService.sendNotification(userId, {
      type: 'SECURITY',
      title: 'Wallet Verified',
      message: `Your ${challenge.walletIdentity.walletType} wallet has been successfully verified.`,
      data: {
        walletId: challenge.walletIdentityId,
        walletType: challenge.walletIdentity.walletType,
      },
    });

    return updatedWallet;
  }

  async getUserWallets(userId: string): Promise<WalletIdentity[]> {
    return this.prisma.walletIdentity.findMany({
      where: { userId },
      orderBy: [
        { isVerified: 'desc' },
        { lastUsedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async updateWalletPrivacy(
    userId: string,
    walletId: string,
    privacyLevel: PrivacyLevel
  ): Promise<WalletIdentity> {
    const wallet = await this.prisma.walletIdentity.findFirst({
      where: {
        id: walletId,
        userId,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.prisma.walletIdentity.update({
      where: { id: walletId },
      data: { privacyLevel },
    });
  }

  async updateWalletNickname(
    userId: string,
    walletId: string,
    nickname: string
  ): Promise<WalletIdentity> {
    const wallet = await this.prisma.walletIdentity.findFirst({
      where: {
        id: walletId,
        userId,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return this.prisma.walletIdentity.update({
      where: { id: walletId },
      data: { nickname },
    });
  }

  private isValidWalletAddress(walletType: string, address: string): boolean {
    switch (walletType) {
      case 'stellar':
        return this.stellarService.isValidAddress(address);
      case 'ethereum':
        return this.ethereumService.isValidAddress(address);
      case 'solana':
        return this.solanaService.isValidAddress(address);
      default:
        return false;
    }
  }

  private generateChallengeMessage(userId: string): string {
    const timestamp = Date.now().toString();
    return `Verify your wallet ownership for Stellara. User ID: ${userId}. Timestamp: ${timestamp}`;
  }
}
