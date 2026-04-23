import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { 
  AccountRecoveryMethod, 
  AccountRecoveryAttempt,
  VerificationMethod
} from '@prisma/client';
import { NotificationService } from './mock-notification.service';

export interface AddRecoveryMethodDto {
  method: VerificationMethod;
  identifier: string;
  isPrimary?: boolean;
}

export interface InitiateRecoveryDto {
  method: VerificationMethod;
  identifier: string;
}

export interface CompleteRecoveryDto {
  sessionId: string;
  response: string;
}

@Injectable()
export class AccountRecoveryService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationService: NotificationService,
  ) {}

  async addRecoveryMethod(userId: string, recoveryData: AddRecoveryMethodDto): Promise<AccountRecoveryMethod> {
    // Check if recovery method already exists
    const existingMethod = await this.prisma.accountRecoveryMethod.findFirst({
      where: {
        userId,
        method: recoveryData.method,
        identifier: recoveryData.identifier,
      },
    });

    if (existingMethod) {
      throw new ConflictException('This recovery method is already added to your account');
    }

    // If setting as primary, unset any existing primary methods
    if (recoveryData.isPrimary) {
      await this.prisma.accountRecoveryMethod.updateMany({
        where: {
          userId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    // Create the recovery method (initially unverified)
    const recoveryMethod = await this.prisma.accountRecoveryMethod.create({
      data: {
        userId,
        method: recoveryData.method,
        identifier: recoveryData.identifier,
        isPrimary: recoveryData.isPrimary || false,
      },
    });

    // Send verification notification
    await this.sendVerificationNotification(recoveryMethod);

    return recoveryMethod;
  }

  async removeRecoveryMethod(userId: string, methodId: string): Promise<void> {
    const method = await this.prisma.accountRecoveryMethod.findFirst({
      where: {
        id: methodId,
        userId,
      },
    });

    if (!method) {
      throw new NotFoundException('Recovery method not found');
    }

    // Check if this is the primary method and there are other methods
    if (method.isPrimary) {
      const otherMethods = await this.prisma.accountRecoveryMethod.findMany({
        where: {
          userId,
          id: { not: methodId },
        },
      });

      if (otherMethods.length > 0) {
        // Promote another method to primary
        await this.prisma.accountRecoveryMethod.update({
          where: { id: otherMethods[0].id },
          data: { isPrimary: true },
        });
      }
    }

    await this.prisma.accountRecoveryMethod.delete({
      where: { id: methodId },
    });
  }

  async initiateRecovery(recoveryData: InitiateRecoveryDto): Promise<AccountRecoveryAttempt> {
    // Find the recovery method
    const recoveryMethod = await this.prisma.accountRecoveryMethod.findFirst({
      where: {
        method: recoveryData.method,
        identifier: recoveryData.identifier,
        isVerified: true,
      },
      include: {
        user: true,
      },
    });

    if (!recoveryMethod) {
      throw new NotFoundException('Recovery method not found or not verified');
    }

    // Check if there's already an active recovery session
    const activeSession = await this.prisma.accountRecoveryAttempt.findFirst({
      where: {
        recoveryMethodId: recoveryMethod.id,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (activeSession) {
      throw new BadRequestException('Active recovery session already exists');
    }

    // Generate recovery session
    const sessionId = this.generateSessionId();
    const challenge = this.generateRecoveryChallenge(recoveryData.method);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Create recovery attempt
    const recoveryAttempt = await this.prisma.accountRecoveryAttempt.create({
      data: {
        recoveryMethodId: recoveryMethod.id,
        sessionId,
        challenge,
        expiresAt,
      },
    });

    // Send recovery notification
    await this.sendRecoveryNotification(recoveryMethod, sessionId, challenge);

    return recoveryAttempt;
  }

  async completeRecovery(recoveryData: CompleteRecoveryDto): Promise<{ success: boolean; message: string }> {
    const attempt = await this.prisma.accountRecoveryAttempt.findFirst({
      where: {
        sessionId: recoveryData.sessionId,
        status: 'pending',
      },
      include: {
        recoveryMethod: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Recovery session not found or expired');
    }

    if (attempt.expiresAt < new Date()) {
      throw new BadRequestException('Recovery session has expired');
    }

    if (attempt.attempts >= 3) {
      throw new BadRequestException('Maximum attempts exceeded');
    }

    // Verify the response
    let isSuccessful = false;

    switch (attempt.recoveryMethod.method) {
      case VerificationMethod.EMAIL_CODE:
        isSuccessful = attempt.challenge === recoveryData.response;
        break;
      
      case VerificationMethod.SMS_CODE:
        isSuccessful = attempt.challenge === recoveryData.response;
        break;
      
      case VerificationMethod.TOTP:
        isSuccessful = await this.verifyTOTP(attempt.challenge, recoveryData.response);
        break;
      
      default:
        throw new BadRequestException('Unsupported recovery method');
    }

    // Update attempt
    await this.prisma.accountRecoveryAttempt.update({
      where: { id: attempt.id },
      data: {
        response: recoveryData.response,
        status: isSuccessful ? 'successful' : 'failed',
        attempts: { increment: 1 },
        completedAt: new Date(),
      },
    });

    if (!isSuccessful) {
      return { success: false, message: 'Invalid recovery code' };
    }

    // Update last used timestamp
    await this.prisma.accountRecoveryMethod.update({
      where: { id: attempt.recoveryMethodId },
      data: { lastUsedAt: new Date() },
    });

    // Send success notification
    await this.notificationService.sendNotification(attempt.recoveryMethod.user.id, {
      type: 'SECURITY',
      title: 'Account Recovery Successful',
      message: 'Your account recovery was successful. If this wasn\'t you, please secure your account immediately.',
      data: {
        method: attempt.recoveryMethod.method,
        timestamp: new Date().toISOString(),
      },
    });

    return { success: true, message: 'Account recovery successful' };
  }

  async getUserRecoveryMethods(userId: string): Promise<AccountRecoveryMethod[]> {
    return this.prisma.accountRecoveryMethod.findMany({
      where: { userId },
      orderBy: [
        { isPrimary: 'desc' },
        { lastUsedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async setPrimaryRecoveryMethod(userId: string, methodId: string): Promise<AccountRecoveryMethod> {
    const method = await this.prisma.accountRecoveryMethod.findFirst({
      where: {
        id: methodId,
        userId,
      },
    });

    if (!method) {
      throw new NotFoundException('Recovery method not found');
    }

    // Unset current primary
    await this.prisma.accountRecoveryMethod.updateMany({
      where: {
        userId,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Set new primary
    return this.prisma.accountRecoveryMethod.update({
      where: { id: methodId },
      data: { isPrimary: true },
    });
  }

  async verifyRecoveryMethod(userId: string, methodId: string, code: string): Promise<AccountRecoveryMethod> {
    const method = await this.prisma.accountRecoveryMethod.findFirst({
      where: {
        id: methodId,
        userId,
      },
    });

    if (!method) {
      throw new NotFoundException('Recovery method not found');
    }

    if (method.isVerified) {
      throw new BadRequestException('Recovery method is already verified');
    }

    // For now, simple code verification (in production, this would be more secure)
    const expectedCode = this.generateVerificationCode();
    
    if (code !== expectedCode) {
      throw new BadRequestException('Invalid verification code');
    }

    return this.prisma.accountRecoveryMethod.update({
      where: { id: methodId },
      data: {
        isVerified: true,
        verificationData: {
          verifiedAt: new Date().toISOString(),
          verificationMethod: 'code',
        },
      },
    });
  }

  private generateSessionId(): string {
    return randomBytes(32).toString('hex');
  }

  private generateRecoveryChallenge(method: VerificationMethod): string {
    switch (method) {
      case VerificationMethod.EMAIL_CODE:
      case VerificationMethod.SMS_CODE:
        return this.generateVerificationCode();
      case VerificationMethod.TOTP:
        return this.generateTOTPChallenge();
      default:
        throw new BadRequestException('Unsupported recovery method');
    }
  }

  private generateVerificationCode(length: number = 6): string {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateTOTPChallenge(): string {
    return randomBytes(16).toString('hex');
  }

  private async verifyTOTP(challenge: string, response: string): Promise<boolean> {
    // TODO: Implement TOTP verification
    return true;
  }

  private async sendVerificationNotification(method: AccountRecoveryMethod): Promise<void> {
    const message = `A new recovery method (${method.method}) has been added to your account. Please verify it to enable account recovery.`;
    
    await this.notificationService.sendNotification(method.userId, {
      type: 'SECURITY',
      title: 'Recovery Method Added',
      message,
      data: {
        methodId: method.id,
        method: method.method,
      },
    });
  }

  private async sendRecoveryNotification(method: AccountRecoveryMethod, sessionId: string, challenge: string): Promise<void> {
    let message: string;
    
    switch (method.method) {
      case VerificationMethod.EMAIL_CODE:
        message = `Use this code to recover your account: ${challenge}`;
        break;
      case VerificationMethod.SMS_CODE:
        message = `Your recovery code is: ${challenge}`;
        break;
      default:
        message = `Account recovery initiated. Session ID: ${sessionId}`;
    }

    await this.notificationService.sendNotification(method.userId, {
      type: 'SECURITY',
      title: 'Account Recovery Initiated',
      message,
      data: {
        sessionId,
        method: method.method,
        challenge,
      },
    });
  }
}
