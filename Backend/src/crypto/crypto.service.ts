import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  /**
   * Generate a cryptographic nonce
   */
  generateNonce(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Verify Ed25519 signature
   */
  async verifySignature(
    message: string,
    signature: string,
    publicKey: string,
    keyType: string,
  ): Promise<boolean> {
    try {
      // Convert base64 signature to buffer
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      // Convert message to buffer
      const messageBuffer = Buffer.from(message, 'utf8');
      
      // Handle different key types
      if (keyType === 'Ed25519VerificationKey2018') {
        // For Ed25519, we need to verify using the public key
        // This is a simplified implementation - in production, use a proper crypto library
        const publicKeyBuffer = this.decodePublicKey(publicKey);
        
        // Verify signature (simplified - use proper Ed25519 verification)
        return crypto.verify(
          'sha256',
          messageBuffer,
          publicKeyBuffer,
          signatureBuffer,
        );
      }
      
      return false;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Decode public key from various formats
   */
  private decodePublicKey(publicKey: string): Buffer {
    // Handle multibase encoding (for did:key)
    if (publicKey.startsWith('z')) {
      // Remove multibase prefix and decode
      const base58btc = publicKey.slice(1);
      return Buffer.from(base58btc, 'base58');
    }
    
    // Handle hex encoding
    if (publicKey.startsWith('0x')) {
      return Buffer.from(publicKey.slice(2), 'hex');
    }
    
    // Handle base64
    try {
      return Buffer.from(publicKey, 'base64');
    } catch {
      // Assume raw hex
      return Buffer.from(publicKey, 'hex');
    }
  }

  /**
   * Hash data using SHA-256
   */
  hashData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate random bytes
   */
  generateRandomBytes(length: number): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Create HMAC signature
   */
  createHMAC(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHMAC(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex'),
    );
  }
}
