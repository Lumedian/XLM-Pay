import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { 
  LinkedIdentity, 
  IdentityProvider, 
  IdentityStatus, 
  PrivacyLevel,
  IdentityVerificationChallenge,
  VerificationMethod,
  IdentitySecurityAlert
} from '@prisma/client';
import { NotificationService } from './mock-notification.service';

export interface LinkIdentityDto {
  provider: IdentityProvider;
  providerId: string;
  providerEmail?: string;
  providerUsername?: string;
  providerData?: any;
  isPrimary?: boolean;
  privacyLevel?: PrivacyLevel;
}

export interface VerifyIdentityDto {
  challengeId: string;
  response: string;
}

export interface CreateVerificationChallengeDto {
  method: VerificationMethod;
  expiresIn?: number; // minutes
  metadata?: any;
}

@Injectable()
export class IdentityService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private notificationService: NotificationService,
  ) {}

  async linkIdentity(userId: string, linkData: LinkIdentityDto): Promise<LinkedIdentity> {
    // Check if identity is already linked
    const existingIdentity = await this.prisma.linkedIdentity.findFirst({
      where: {
        userId,
        provider: linkData.provider,
        providerId: linkData.providerId,
      },
    });

    if (existingIdentity) {
      throw new ConflictException('This identity is already linked to your account');
    }

    // Check if email is already used by another identity
    if (linkData.providerEmail) {
      const existingEmail = await this.prisma.linkedIdentity.findFirst({
        where: {
          userId,
          providerEmail: linkData.providerEmail,
        },
      });

      if (existingEmail) {
        throw new ConflictException('This email is already linked to another identity');
      }
    }

    // If setting as primary, unset any existing primary identities for this provider
    if (linkData.isPrimary) {
      await this.prisma.linkedIdentity.updateMany({
        where: {
          userId,
          provider: linkData.provider,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    // Create the linked identity
    const identity = await this.prisma.linkedIdentity.create({
      data: {
        userId,
        provider: linkData.provider,
        providerId: linkData.providerId,
        providerEmail: linkData.providerEmail,
        providerUsername: linkData.providerUsername,
        providerData: linkData.providerData,
        isPrimary: linkData.isPrimary || false,
        privacyLevel: linkData.privacyLevel || PrivacyLevel.PRIVATE,
        status: IdentityStatus.PENDING_VERIFICATION,
      },
    });

    // Create security alert for new identity linkage
    await this.createSecurityAlert(
      identity.id,
      'NEW_IDENTITY_LINKED',
      'medium',
      `New ${linkData.provider} identity linked to your account`,
      {
        provider: linkData.provider,
        providerId: linkData.providerId,
        providerEmail: linkData.providerEmail,
      }
    );

    // Send notification to user
    await this.notificationService.sendNotification(userId, {
      type: 'SECURITY',
      title: 'New Identity Linked',
      message: `A new ${linkData.provider} identity has been linked to your account. Please verify it to complete the setup.`,
      data: {
        identityId: identity.id,
        provider: linkData.provider,
      },
    });

    return identity;
  }

  async unlinkIdentity(userId: string, identityId: string): Promise<void> {
    const identity = await this.prisma.linkedIdentity.findFirst({
      where: {
        id: identityId,
        userId,
      },
    });

    if (!identity) {
      throw new NotFoundException('Identity not found');
    }

    // Check if this is the primary identity and there are other identities
    if (identity.isPrimary) {
      const otherIdentities = await this.prisma.linkedIdentity.findMany({
        where: {
          userId,
          provider: identity.provider,
          id: { not: identityId },
        },
      });

      if (otherIdentities.length > 0) {
        // Promote another identity to primary
        await this.prisma.linkedIdentity.update({
          where: { id: otherIdentities[0].id },
          data: { isPrimary: true },
        });
      }
    }

    await this.prisma.linkedIdentity.delete({
      where: { id: identityId },
    });

    // Create security alert
    await this.createSecurityAlert(
      identityId,
      'IDENTITY_UNLINKED',
      'medium',
      `${identity.provider} identity unlinked from your account`,
      {
        provider: identity.provider,
        providerId: identity.providerId,
      }
    );
  }

  async createVerificationChallenge(
    userId: string,
    identityId: string,
    challengeData: CreateVerificationChallengeDto
  ): Promise<IdentityVerificationChallenge> {
    const identity = await this.prisma.linkedIdentity.findFirst({
      where: {
        id: identityId,
        userId,
      },
    });

    if (!identity) {
      throw new NotFoundException('Identity not found');
    }

    if (identity.isVerified) {
      throw new BadRequestException('Identity is already verified');
    }

    // Generate challenge based on method
    let challenge: string;
    const expiresIn = challengeData.expiresIn || 15; // 15 minutes default

    switch (challengeData.method) {
      case VerificationMethod.EMAIL_CODE:
        challenge = this.generateVerificationCode(6);
        await this.sendEmailVerification(identity.providerEmail, challenge);
        break;
      
      case VerificationMethod.SMS_CODE:
        challenge = this.generateVerificationCode(6);
        // TODO: Implement SMS sending
        break;
      
      case VerificationMethod.OAUTH_CHALLENGE:
        challenge = this.generateOAuthChallenge();
        break;
      
      case VerificationMethod.SIGNATURE_CHALLENGE:
        challenge = this.generateSignatureChallenge(userId);
        break;
      
      case VerificationMethod.TOTP:
        challenge = this.generateTOTPChallenge();
        break;
      
      default:
        throw new BadRequestException('Invalid verification method');
    }

    // Create challenge record
    const verificationChallenge = await this.prisma.identityVerificationChallenge.create({
      data: {
        linkedIdentityId: identityId,
        method: challengeData.method,
        challenge,
        expiresAt: new Date(Date.now() + expiresIn * 60 * 1000),
        metadata: challengeData.metadata,
      },
    });

    return verificationChallenge;
  }

  async verifyIdentity(
    userId: string,
    verifyData: VerifyIdentityDto
  ): Promise<LinkedIdentity> {
    const challenge = await this.prisma.identityVerificationChallenge.findFirst({
      where: {
        id: verifyData.challengeId,
        linkedIdentity: {
          userId,
        },
      },
      include: {
        linkedIdentity: true,
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

    // Verify the response based on method
    let isSuccessful = false;

    switch (challenge.method) {
      case VerificationMethod.EMAIL_CODE:
      case VerificationMethod.SMS_CODE:
        isSuccessful = challenge.challenge === verifyData.response;
        break;
      
      case VerificationMethod.OAUTH_CHALLENGE:
        isSuccessful = await this.verifyOAuthChallenge(challenge.challenge, verifyData.response);
        break;
      
      case VerificationMethod.SIGNATURE_CHALLENGE:
        isSuccessful = await this.verifySignatureChallenge(challenge.challenge, verifyData.response);
        break;
      
      case VerificationMethod.TOTP:
        isSuccessful = await this.verifyTOTPChallenge(challenge.challenge, verifyData.response);
        break;
    }

    // Update challenge
    await this.prisma.identityVerificationChallenge.update({
      where: { id: challenge.id },
      data: {
        response: verifyData.response,
        isCompleted: true,
        isSuccessful,
        attempts: { increment: 1 },
        completedAt: new Date(),
      },
    });

    if (!isSuccessful) {
      // Create security alert for failed verification
      await this.createSecurityAlert(
        challenge.linkedIdentityId,
        'VERIFICATION_FAILED',
        'high',
        'Identity verification failed',
        {
          method: challenge.method,
          attempts: challenge.attempts + 1,
        }
      );

      throw new BadRequestException('Verification failed');
    }

    // Update identity status
    const updatedIdentity = await this.prisma.linkedIdentity.update({
      where: { id: challenge.linkedIdentityId },
      data: {
        status: IdentityStatus.ACTIVE,
        isVerified: true,
        lastVerifiedAt: new Date(),
      },
    });

    // Create security alert for successful verification
    await this.createSecurityAlert(
      challenge.linkedIdentityId,
      'IDENTITY_VERIFIED',
      'low',
      'Identity successfully verified',
      {
        method: challenge.method,
      }
    );

    return updatedIdentity;
  }

  async getUserIdentities(userId: string): Promise<LinkedIdentity[]> {
    return this.prisma.linkedIdentity.findMany({
      where: { userId },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async updateIdentityPrivacy(
    userId: string,
    identityId: string,
    privacyLevel: PrivacyLevel
  ): Promise<LinkedIdentity> {
    const identity = await this.prisma.linkedIdentity.findFirst({
      where: {
        id: identityId,
        userId,
      },
    });

    if (!identity) {
      throw new NotFoundException('Identity not found');
    }

    return this.prisma.linkedIdentity.update({
      where: { id: identityId },
      data: { privacyLevel },
    });
  }

  async setPrimaryIdentity(userId: string, identityId: string): Promise<LinkedIdentity> {
    const identity = await this.prisma.linkedIdentity.findFirst({
      where: {
        id: identityId,
        userId,
      },
    });

    if (!identity) {
      throw new NotFoundException('Identity not found');
    }

    // Unset current primary for this provider
    await this.prisma.linkedIdentity.updateMany({
      where: {
        userId,
        provider: identity.provider,
        isPrimary: true,
      },
      data: {
        isPrimary: false,
      },
    });

    // Set new primary
    return this.prisma.linkedIdentity.update({
      where: { id: identityId },
      data: { isPrimary: true },
    });
  }

  private async createSecurityAlert(
    linkedIdentityId: string,
    alertType: string,
    severity: string,
    message: string,
    details?: any
  ): Promise<void> {
    await this.prisma.identitySecurityAlert.create({
      data: {
        linkedIdentityId,
        alertType,
        severity,
        message,
        details,
      },
    });
  }

  private generateVerificationCode(length: number): string {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private generateOAuthChallenge(): string {
    return randomBytes(32).toString('hex');
  }

  private generateSignatureChallenge(userId: string): string {
    const timestamp = Date.now().toString();
    const message = `Verify your identity for Stellara. Timestamp: ${timestamp}`;
    return createHash('sha256').update(message).digest('hex');
  }

  private generateTOTPChallenge(): string {
    return randomBytes(16).toString('hex');
  }

  private async sendEmailVerification(email: string, code: string): Promise<void> {
    // TODO: Implement email sending
    console.log(`Sending verification code ${code} to ${email}`);
  }

  private async verifyOAuthChallenge(challenge: string, response: string): Promise<boolean> {
    // TODO: Implement OAuth verification logic
    return true;
  }

  private async verifySignatureChallenge(challenge: string, signature: string): Promise<boolean> {
    // TODO: Implement signature verification logic
    return true;
  }

  private async verifyTOTPChallenge(challenge: string, response: string): Promise<boolean> {
    // TODO: Implement TOTP verification logic
    return true;
  }
}
