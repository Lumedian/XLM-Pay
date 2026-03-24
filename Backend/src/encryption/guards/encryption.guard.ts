import { Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EncryptionService } from '../services/encryption.service';

@Injectable()
export class EncryptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly encryptionService: EncryptionService,
  ) { }

  async canActivate (context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const handler = context.getHandler();

    // Check if handler requires encryption
    const requiresEncryption = this.reflector.get<boolean>(
      'requires_encryption',
      handler,
    );

    if (!requiresEncryption) {
      return true;
    }

    // Validate encryption service is available
    try {
      const status = this.encryptionService.getEncryptionStatus();
      if (status.activeKeys === 0) {
        throw new Error('Encryption service unavailable - no active keys');
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown encryption error';
      throw new Error(`Encryption validation failed: ${message}`);
    }
  }
}

/**
 * Decorator to mark routes as requiring encryption
 */
export const RequiresEncryption = () => SetMetadata('requires_encryption', true);
