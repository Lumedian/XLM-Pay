import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DIDRegistryService {
  constructor(
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Resolve a DID to its document
   */
  async resolveDID(did: string): Promise<any> {
    if (did.startsWith('did:stellar:')) {
      return this.resolveStellarDID(did);
    } else if (did.startsWith('did:key:')) {
      return this.resolveKeyDID(did);
    } else {
      throw new BadRequestException(`Unsupported DID method: ${did.split(':')[1]}`);
    }
  }

  /**
   * Create a Stellar DID
   */
  async createStellarDID(
    stellarAddress: string,
    verificationMethods: any[],
    services: any[],
  ): Promise<string> {
    const did = `did:stellar:${stellarAddress}`;
    
    // Call smart contract to create DID
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'create_stellar_did',
        [stellarAddress, verificationMethods, services],
      );

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to create Stellar DID: ${error.message}`);
    }
  }

  /**
   * Create a Key DID
   */
  async createKeyDID(
    publicKey: string,
    verificationMethods: any[],
    services: any[],
  ): Promise<string> {
    const did = `did:key:${publicKey}`;
    
    // Call smart contract to create DID
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'create_key_did',
        [publicKey, verificationMethods, services],
      );

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to create Key DID: ${error.message}`);
    }
  }

  /**
   * Update DID document
   */
  async updateDIDDocument(
    did: string,
    verificationMethods?: any[],
    services?: any[],
  ): Promise<void> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      await this.stellarService.invokeContract(
        contractId,
        'update_did_document',
        [did, verificationMethods, services],
      );
    } catch (error) {
      throw new BadRequestException(`Failed to update DID document: ${error.message}`);
    }
  }

  /**
   * Add verification method to DID
   */
  async addVerificationMethod(
    did: string,
    verificationMethod: any,
  ): Promise<void> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      await this.stellarService.invokeContract(
        contractId,
        'add_verification_method',
        [did, verificationMethod],
      );
    } catch (error) {
      throw new BadRequestException(`Failed to add verification method: ${error.message}`);
    }
  }

  /**
   * Add service to DID
   */
  async addService(did: string, service: any): Promise<void> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      await this.stellarService.invokeContract(
        contractId,
        'add_service',
        [did, service],
      );
    } catch (error) {
      throw new BadRequestException(`Failed to add service: ${error.message}`);
    }
  }

  /**
   * Deactivate DID
   */
  async deactivateDID(did: string): Promise<void> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      await this.stellarService.invokeContract(
        contractId,
        'deactivate_did',
        [did],
      );
    } catch (error) {
      throw new BadRequestException(`Failed to deactivate DID: ${error.message}`);
    }
  }

  /**
   * Get credentials by subject DID
   */
  async getCredentialsBySubject(subjectDID: string): Promise<string[]> {
    try {
      const contractId = this.configService.get('VERIFIABLE_CREDENTIALS_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'get_credentials_by_subject',
        [subjectDID],
      );

      return result || [];
    } catch (error) {
      throw new BadRequestException(`Failed to get credentials: ${error.message}`);
    }
  }

  /**
   * Get credential details
   */
  async getCredentialDetails(credentialId: string): Promise<any> {
    try {
      const contractId = this.configService.get('VERIFIABLE_CREDENTIALS_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'get_credential_details',
        [credentialId],
      );

      if (!result) {
        throw new NotFoundException('Credential not found');
      }

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to get credential details: ${error.message}`);
    }
  }

  /**
   * Verify credential
   */
  async verifyCredential(credentialId: string): Promise<boolean> {
    try {
      const contractId = this.configService.get('VERIFIABLE_CREDENTIALS_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'verify_credential',
        [credentialId],
      );

      return Boolean(result);
    } catch (error) {
      throw new BadRequestException(`Failed to verify credential: ${error.message}`);
    }
  }

  /**
   * Issue verifiable credential
   */
  async issueCredential(
    issuerDID: string,
    subjectDID: string,
    credentialType: string,
    claims: Record<string, any>,
    expirationDate?: Date,
    proof: any,
  ): Promise<string> {
    try {
      const contractId = this.configService.get('VERIFIABLE_CREDENTIALS_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'issue_credential',
        [
          issuerDID,
          subjectDID,
          credentialType,
          claims,
          expirationDate ? expirationDate.getTime() : null,
          proof,
        ],
      );

      return result;
    } catch (error) {
      throw new BadRequestException(`Failed to issue credential: ${error.message}`);
    }
  }

  /**
   * Revoke verifiable credential
   */
  async revokeCredential(
    credentialId: string,
    revokerDID: string,
    reason: string,
    proof: string,
  ): Promise<void> {
    try {
      const contractId = this.configService.get('VERIFIABLE_CREDENTIALS_CONTRACT_ID');
      await this.stellarService.invokeContract(
        contractId,
        'revoke_credential',
        [credentialId, revokerDID, reason, proof],
      );
    } catch (error) {
      throw new BadRequestException(`Failed to revoke credential: ${error.message}`);
    }
  }

  /**
   * Resolve Stellar DID
   */
  private async resolveStellarDID(did: string): Promise<any> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'resolve_did',
        [did],
      );

      if (!result) {
        throw new NotFoundException('DID not found');
      }

      return this.formatDIDDocument(result);
    } catch (error) {
      throw new BadRequestException(`Failed to resolve Stellar DID: ${error.message}`);
    }
  }

  /**
   * Resolve Key DID
   */
  private async resolveKeyDID(did: string): Promise<any> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'resolve_did',
        [did],
      );

      if (!result) {
        throw new NotFoundException('DID not found');
      }

      return this.formatDIDDocument(result);
    } catch (error) {
      throw new BadRequestException(`Failed to resolve Key DID: ${error.message}`);
    }
  }

  /**
   * Format DID document from contract response
   */
  private formatDIDDocument(contractResult: any): any {
    return {
      '@context': ['https://www.w3.org/ns/did/v1'],
      id: contractResult.id,
      verificationMethod: contractResult.verificationMethods || [],
      authentication: contractResult.authentication || [],
      assertionMethod: contractResult.assertion_method || [],
      keyAgreement: contractResult.key_agreement || [],
      service: contractResult.service || [],
      created: new Date(contractResult.created_at * 1000).toISOString(),
      updated: new Date(contractResult.updated_at * 1000).toISOString(),
      deactivated: contractResult.deactivated || false,
    };
  }

  /**
   * Get DID count
   */
  async getDIDCount(): Promise<number> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'get_did_count',
        [],
      );

      return Number(result) || 0;
    } catch (error) {
      throw new BadRequestException(`Failed to get DID count: ${error.message}`);
    }
  }

  /**
   * Get all DIDs (admin only)
   */
  async getAllDIDs(): Promise<string[]> {
    try {
      const contractId = this.configService.get('DID_REGISTRY_CONTRACT_ID');
      const result = await this.stellarService.invokeContract(
        contractId,
        'get_all_dids',
        [],
      );

      return result || [];
    } catch (error) {
      throw new BadRequestException(`Failed to get all DIDs: ${error.message}`);
    }
  }
}
