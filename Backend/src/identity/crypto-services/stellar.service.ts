import { Injectable } from '@nestjs/common';
import { StellarSdk } from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly server: StellarSdk.Horizon.Server;

  constructor() {
    this.server = new StellarSdk.Horizon.Server(
      'https://horizon-testnet.stellar.org'
    );
  }

  isValidAddress(address: string): boolean {
    try {
      StellarSdk.StrKey.decodeEd25519PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
      const messageHash = Buffer.from(message, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'base64');
      
      return keypair.verify(messageHash, signatureBuffer);
    } catch (error) {
      return false;
    }
  }

  async getAccount(publicKey: string) {
    try {
      return await this.server.loadAccount(publicKey);
    } catch (error) {
      throw new Error('Account not found');
    }
  }

  async getAccountBalance(publicKey: string): Promise<string[]> {
    try {
      const account = await this.getAccount(publicKey);
      return account.balances.map(balance => ({
        asset_type: balance.asset_type,
        asset_code: (balance as any).asset_code || 'XLM',
        balance: balance.balance,
      }));
    } catch (error) {
      throw new Error('Unable to fetch account balance');
    }
  }
}
