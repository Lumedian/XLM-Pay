import { Injectable, Logger } from '@nestjs/common';
import { EncryptionService } from '../../encryption/encryption.service';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionAndIntegrityService {
  private readonly logger = new Logger(EncryptionAndIntegrityService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;

  constructor(private readonly encryption: EncryptionService) {}

  async encryptReportData(data: any, additionalContext?: string): Promise<{ encryptedData: string; keyId: string; checksum: string }> {
    this.logger.log('Encrypting report data');

    try {
      // Generate a unique key for this report
      const key = crypto.randomBytes(this.keyLength);
      const keyId = this.generateKeyId();

      // Store the encrypted key in the encryption service
      await this.encryption.storeKey(keyId, key, additionalContext);

      // Generate IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(additionalContext || 'regulatory-report'));

      // Encrypt the data
      const dataString = JSON.stringify(data);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine IV, encrypted data, and tag
      const encryptedPayload = {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        tag: tag.toString('hex'),
      };

      const encryptedDataString = JSON.stringify(encryptedPayload);

      // Generate checksum
      const checksum = this.generateChecksum(encryptedDataString);

      this.logger.log(`Report data encrypted successfully with key ID: ${keyId}`);

      return {
        encryptedData: encryptedDataString,
        keyId,
        checksum,
      };
    } catch (error) {
      this.logger.error(`Failed to encrypt report data: ${error.message}`);
      throw error;
    }
  }

  async decryptReportData(encryptedData: string, keyId: string, expectedChecksum?: string): Promise<any> {
    this.logger.log(`Decrypting report data with key ID: ${keyId}`);

    try {
      // Validate checksum if provided
      if (expectedChecksum) {
        const actualChecksum = this.generateChecksum(encryptedData);
        if (actualChecksum !== expectedChecksum) {
          throw new Error('Data integrity check failed - checksum mismatch');
        }
      }

      // Retrieve the encryption key
      const key = await this.encryption.retrieveKey(keyId);
      if (!key) {
        throw new Error(`Encryption key not found for key ID: ${keyId}`);
      }

      // Parse encrypted payload
      const encryptedPayload = JSON.parse(encryptedData);

      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from('regulatory-report'));
      decipher.setAuthTag(Buffer.from(encryptedPayload.tag, 'hex'));

      // Decrypt the data
      let decrypted = decipher.update(encryptedPayload.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);

      this.logger.log(`Report data decrypted successfully with key ID: ${keyId}`);

      return data;
    } catch (error) {
      this.logger.error(`Failed to decrypt report data: ${error.message}`);
      throw error;
    }
  }

  async encryptSensitiveField(fieldValue: string, context: string): Promise<{ encryptedValue: string; keyId: string }> {
    this.logger.log(`Encrypting sensitive field for context: ${context}`);

    try {
      // Generate a unique key for this field
      const key = crypto.randomBytes(this.keyLength);
      const keyId = this.generateKeyId();

      // Store the encrypted key
      await this.encryption.storeKey(keyId, key, context);

      // Generate IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(context));

      // Encrypt the field value
      let encrypted = cipher.update(fieldValue, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine IV, encrypted data, and tag
      const encryptedPayload = {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        tag: tag.toString('hex'),
      };

      const encryptedValue = JSON.stringify(encryptedPayload);

      this.logger.log(`Sensitive field encrypted successfully with key ID: ${keyId}`);

      return {
        encryptedValue,
        keyId,
      };
    } catch (error) {
      this.logger.error(`Failed to encrypt sensitive field: ${error.message}`);
      throw error;
    }
  }

  async decryptSensitiveField(encryptedValue: string, keyId: string, context: string): Promise<string> {
    this.logger.log(`Decrypting sensitive field with key ID: ${keyId}`);

    try {
      // Retrieve the encryption key
      const key = await this.encryption.retrieveKey(keyId);
      if (!key) {
        throw new Error(`Encryption key not found for key ID: ${keyId}`);
      }

      // Parse encrypted payload
      const encryptedPayload = JSON.parse(encryptedValue);

      // Create decipher
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(encryptedPayload.tag, 'hex'));

      // Decrypt the field value
      let decrypted = decipher.update(encryptedPayload.encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      this.logger.log(`Sensitive field decrypted successfully with key ID: ${keyId}`);

      return decrypted;
    } catch (error) {
      this.logger.error(`Failed to decrypt sensitive field: ${error.message}`);
      throw error;
    }
  }

  generateChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  async verifyDataIntegrity(data: string, expectedChecksum: string): Promise<boolean> {
    const actualChecksum = this.generateChecksum(data);
    const isValid = actualChecksum === expectedChecksum;

    if (!isValid) {
      this.logger.warn(`Data integrity verification failed. Expected: ${expectedChecksum}, Actual: ${actualChecksum}`);
    }

    return isValid;
  }

  async generateDigitalSignature(data: any, privateKey?: string): Promise<{ signature: string; publicKey: string }> {
    this.logger.log('Generating digital signature');

    try {
      // Generate key pair if not provided
      let keyPair: crypto.KeyPairKeyObjectResult;
      if (privateKey) {
        // Use provided private key (in production, this would come from secure storage)
        keyPair = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
      } else {
        keyPair = crypto.generateKeyPairSync('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
      }

      // Create hash of the data
      const dataHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest();

      // Sign the hash
      const signature = crypto.sign('sha256', dataHash, keyPair.privateKey);

      const signatureBase64 = signature.toString('base64');
      const publicKeyBase64 = keyPair.publicKey.toString('base64');

      this.logger.log('Digital signature generated successfully');

      return {
        signature: signatureBase64,
        publicKey: publicKeyBase64,
      };
    } catch (error) {
      this.logger.error(`Failed to generate digital signature: ${error.message}`);
      throw error;
    }
  }

  async verifyDigitalSignature(data: any, signature: string, publicKey: string): Promise<boolean> {
    this.logger.log('Verifying digital signature');

    try {
      // Create hash of the data
      const dataHash = crypto.createHash('sha256').update(JSON.stringify(data)).digest();

      // Convert signature from base64
      const signatureBuffer = Buffer.from(signature, 'base64');
      const publicKeyBuffer = Buffer.from(publicKey, 'base64');

      // Verify the signature
      const isValid = crypto.verify('sha256', dataHash, publicKeyBuffer, signatureBuffer);

      if (!isValid) {
        this.logger.warn('Digital signature verification failed');
      } else {
        this.logger.log('Digital signature verified successfully');
      }

      return isValid;
    } catch (error) {
      this.logger.error(`Failed to verify digital signature: ${error.message}`);
      return false;
    }
  }

  async rotateEncryptionKey(oldKeyId: string, reason: string): Promise<string> {
    this.logger.log(`Rotating encryption key ${oldKeyId}: ${reason}`);

    try {
      // Generate new key
      const newKey = crypto.randomBytes(this.keyLength);
      const newKeyId = this.generateKeyId();

      // Store new key
      await this.encryption.storeKey(newKeyId, newKey, `Key rotation: ${reason}`);

      // Mark old key for rotation (in production, you'd need to re-encrypt data)
      await this.encryption.markKeyForRotation(oldKeyId);

      this.logger.log(`Key rotation completed. New key ID: ${newKeyId}`);

      return newKeyId;
    } catch (error) {
      this.logger.error(`Failed to rotate encryption key: ${error.message}`);
      throw error;
    }
  }

  async encryptBatch(dataItems: any[], batchContext: string): Promise<Array<{ encryptedData: string; keyId: string; checksum: string }>> {
    this.logger.log(`Encrypting batch of ${dataItems.length} items`);

    const results = [];

    for (let i = 0; i < dataItems.length; i++) {
      const item = dataItems[i];
      const context = `${batchContext}_item_${i}`;
      
      try {
        const encrypted = await this.encryptReportData(item, context);
        results.push(encrypted);
      } catch (error) {
        this.logger.error(`Failed to encrypt batch item ${i}: ${error.message}`);
        throw error;
      }
    }

    this.logger.log(`Batch encryption completed for ${results.length} items`);
    return results;
  }

  async decryptBatch(encryptedItems: Array<{ encryptedData: string; keyId: string; checksum: string }>): Promise<any[]> {
    this.logger.log(`Decrypting batch of ${encryptedItems.length} items`);

    const results = [];

    for (let i = 0; i < encryptedItems.length; i++) {
      const item = encryptedItems[i];
      
      try {
        const decrypted = await this.decryptReportData(
          item.encryptedData,
          item.keyId,
          item.checksum
        );
        results.push(decrypted);
      } catch (error) {
        this.logger.error(`Failed to decrypt batch item ${i}: ${error.message}`);
        throw error;
      }
    }

    this.logger.log(`Batch decryption completed for ${results.length} items`);
    return results;
  }

  private generateKeyId(): string {
    return `reg_key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  async generateSecureHash(data: any, salt?: string): Promise<{ hash: string; salt: string }> {
    const actualSalt = salt || crypto.randomBytes(32).toString('hex');
    const hash = crypto.pbkdf2Sync(JSON.stringify(data), actualSalt, 10000, 64, 'sha512').toString('hex');
    
    return { hash, salt: actualSalt };
  }

  async verifySecureHash(data: any, expectedHash: string, salt: string): Promise<boolean> {
    const { hash } = await this.generateSecureHash(data, salt);
    return hash === expectedHash;
  }

  async generateHMAC(data: string, secret: string): Promise<string> {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  async verifyHMAC(data: string, expectedHMAC: string, secret: string): Promise<boolean> {
    const actualHMAC = await this.generateHMAC(data, secret);
    return actualHMAC === expectedHMAC;
  }
}
