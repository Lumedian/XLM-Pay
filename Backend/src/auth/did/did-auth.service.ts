import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StellarService } from '../stellar/stellar.service';
import { DIDRegistryService } from '../did/did-registry.service';
import { CryptoService } from '../crypto/crypto.service';
import { 
  DIDAuthChallengeDto, 
  DIDAuthVerifyDto, 
  DIDAuthLoginDto,
  DIDAuthResponseDto 
} from './dto/did-auth.dto';

@Injectable()
export class DIDAuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly didRegistryService: DIDRegistryService,
    private readonly cryptoService: CryptoService,
  ) {}

  /**
   * Generate authentication challenge for DID
   */
  async generateChallenge(did: string, domain?: string): Promise<DIDAuthResponseDto> {
    // Resolve DID document
    const didDocument = await this.didRegistryService.resolveDID(did);
    
    if (!didDocument) {
      throw new NotFoundException('DID not found');
    }

    if (didDocument.deactivated) {
      throw new UnauthorizedException('DID is deactivated');
    }

    // Generate random challenge
    const challenge = this.cryptoService.generateNonce();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store challenge (in production, use Redis with TTL)
    const challengeData = {
      did,
      challenge,
      domain: domain || this.configService.get('APP_DOMAIN'),
      expiresAt,
      createdAt: new Date(),
    };

    // Store challenge temporarily
    await this.storeChallenge(challenge, challengeData);

    return {
      challenge,
      expiresAt: expiresAt.toISOString(),
      domain: challengeData.domain,
    };
  }

  /**
   * Verify DID signature and authenticate
   */
  async verifySignature(
    challenge: string,
    did: string,
    signature: string,
    verificationMethodId: string,
  ): Promise<DIDAuthResponseDto> {
    // Retrieve stored challenge
    const challengeData = await this.getChallenge(challenge);
    
    if (!challengeData) {
      throw new UnauthorizedException('Invalid or expired challenge');
    }

    if (challengeData.did !== did) {
      throw new UnauthorizedException('DID mismatch');
    }

    if (new Date() > challengeData.expiresAt) {
      throw new UnauthorizedException('Challenge expired');
    }

    // Resolve DID document
    const didDocument = await this.didRegistryService.resolveDID(did);
    
    if (!didDocument) {
      throw new NotFoundException('DID not found');
    }

    // Find verification method
    const verificationMethod = didDocument.verificationMethods.find(
      vm => vm.id === verificationMethodId
    );

    if (!verificationMethod) {
      throw new NotFoundException('Verification method not found');
    }

    // Verify signature
    const message = this.buildChallengeMessage(challenge, challengeData.domain);
    const isValid = await this.cryptoService.verifySignature(
      message,
      signature,
      verificationMethod.publicKey,
      verificationMethod.type
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Clean up challenge
    await this.deleteChallenge(challenge);

    return {
      verified: true,
      did,
      verificationMethod: verificationMethodId,
    };
  }

  /**
   * Complete DID-based login
   */
  async loginWithDID(
    challenge: string,
    did: string,
    signature: string,
    verificationMethodId: string,
  ): Promise<DIDAuthResponseDto> {
    // Verify signature first
    const verificationResult = await this.verifySignature(
      challenge,
      did,
      signature,
      verificationMethodId
    );

    if (!verificationResult.verified) {
      throw new UnauthorizedException('Authentication failed');
    }

    // Get or create user account
    const user = await this.findOrCreateUserByDID(did);

    // Generate JWT tokens
    const tokens = await this.generateTokens(user);

    // Update last login
    await this.updateLastLogin(user.id);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        did: user.did,
        walletAddress: user.walletAddress,
        email: user.email,
        createdAt: user.createdAt,
        lastLoginAt: new Date(),
      },
      verified: true,
      did,
    };
  }

  /**
   * Authenticate with DID for API access
   */
  async authenticateWithDID(
    did: string,
    signature: string,
    message: string,
    verificationMethodId: string,
  ): Promise<boolean> {
    // Resolve DID document
    const didDocument = await this.didRegistryService.resolveDID(did);
    
    if (!didDocument || didDocument.deactivated) {
      return false;
    }

    // Find verification method
    const verificationMethod = didDocument.verificationMethods.find(
      vm => vm.id === verificationMethodId
    );

    if (!verificationMethod) {
      return false;
    }

    // Verify signature
    return await this.cryptoService.verifySignature(
      message,
      signature,
      verificationMethod.publicKey,
      verificationMethod.type
    );
  }

  /**
   * Check if DID has specific credential
   */
  async hasCredential(
    did: string,
    credentialType: string,
    issuer?: string,
  ): Promise<boolean> {
    const credentials = await this.didRegistryService.getCredentialsBySubject(did);
    
    for (const credentialId of credentials) {
      const credential = await this.didRegistryService.getCredentialDetails(credentialId);
      
      if (this.matchesCredentialType(credential, credentialType) &&
          this.matchesIssuer(credential, issuer) &&
          await this.didRegistryService.verifyCredential(credentialId)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get user's verified credentials
   */
  async getVerifiedCredentials(did: string): Promise<any[]> {
    const credentials = await this.didRegistryService.getCredentialsBySubject(did);
    const verifiedCredentials = [];

    for (const credentialId of credentials) {
      if (await this.didRegistryService.verifyCredential(credentialId)) {
        const credential = await this.didRegistryService.getCredentialDetails(credentialId);
        verifiedCredentials.push({
          id: credential.id,
          type: credential.type,
          issuer: credential.issuer,
          issuanceDate: credential.issuanceDate,
          expirationDate: credential.expirationDate,
          claims: credential.credentialSubject.claims,
        });
      }
    }

    return verifiedCredentials;
  }

  /**
   * Build challenge message for signing
   */
  private buildChallengeMessage(challenge: string, domain: string): string {
    return `${domain} wants you to sign in with your DID. Challenge: ${challenge}`;
  }

  /**
   * Store challenge temporarily
   */
  private async storeChallenge(challenge: string, data: any): Promise<void> {
    // In production, use Redis with TTL
    // For now, use in-memory storage
    const key = `did_challenge:${challenge}`;
    await this.setCache(key, data, 300); // 5 minutes TTL
  }

  /**
   * Get stored challenge
   */
  private async getChallenge(challenge: string): Promise<any> {
    const key = `did_challenge:${challenge}`;
    return await this.getCache(key);
  }

  /**
   * Delete stored challenge
   */
  private async deleteChallenge(challenge: string): Promise<void> {
    const key = `did_challenge:${challenge}`;
    await this.deleteCache(key);
  }

  /**
   * Find or create user by DID
   */
  private async findOrCreateUserByDID(did: string): Promise<any> {
    // Implementation depends on your user repository
    // This is a placeholder
    let user = await this.findUserByDID(did);
    
    if (!user) {
      user = await this.createUserWithDID(did);
    }

    return user;
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: any): Promise<any> {
    // Implementation depends on your JWT service
    // This is a placeholder
    return {
      accessToken: 'jwt_access_token',
      refreshToken: 'jwt_refresh_token',
    };
  }

  /**
   * Update last login timestamp
   */
  private async updateLastLogin(userId: string): Promise<void> {
    // Implementation depends on your user repository
    // This is a placeholder
  }

  /**
   * Check if credential matches type
   */
  private matchesCredentialType(credential: any, type: string): boolean {
    return credential.type.includes(type);
  }

  /**
   * Check if credential matches issuer
   */
  private matchesIssuer(credential: any, issuer?: string): boolean {
    if (!issuer) return true;
    return credential.issuer === issuer;
  }

  // Placeholder methods for cache and user operations
  private async setCache(key: string, value: any, ttl: number): Promise<void> {
    // Implement cache set operation
  }

  private async getCache(key: string): Promise<any> {
    // Implement cache get operation
    return null;
  }

  private async deleteCache(key: string): Promise<void> {
    // Implement cache delete operation
  }

  private async findUserByDID(did: string): Promise<any> {
    // Implement user lookup by DID
    return null;
  }

  private async createUserWithDID(did: string): Promise<any> {
    // Implement user creation with DID
    return {
      id: 'user_id',
      did,
      createdAt: new Date(),
    };
  }
}
