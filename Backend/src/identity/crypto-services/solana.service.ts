import { Injectable } from '@nestjs/common';
import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

@Injectable()
export class SolanaService {
  private readonly connection: Connection;

  constructor() {
    this.connection = new Connection('https://api.devnet.solana.com');
  }

  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch (error) {
      return false;
    }
  }

  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      const pubKey = new PublicKey(publicKey);
      const messageBytes = Buffer.from(message, 'utf8');
      const signatureBytes = Buffer.from(signature, 'base64');
      
      return PublicKey.verifyProgramMessage(
        messageBytes,
        signatureBytes,
        pubKey.toBytes()
      );
    } catch (error) {
      return false;
    }
  }

  async getAccountBalance(address: string): Promise<number> {
    try {
      const pubKey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      throw new Error('Unable to fetch account balance');
    }
  }

  async getAccountInfo(address: string) {
    try {
      const pubKey = new PublicKey(address);
      const [balance, accountInfo] = await Promise.all([
        this.getAccountBalance(address),
        this.connection.getAccountInfo(pubKey),
      ]);

      return {
        address,
        balance,
        owner: accountInfo?.owner.toString(),
        executable: accountInfo?.executable || false,
        lamports: accountInfo?.lamports || 0,
        network: 'devnet',
      };
    } catch (error) {
      throw new Error('Unable to fetch account info');
    }
  }

  async getTransactionHistory(address: string, limit: number = 10) {
    try {
      const pubKey = new PublicKey(address);
      const signatures = await this.connection.getSignaturesForAddress(pubKey, { limit });
      
      return signatures.map(sig => ({
        signature: sig.signature,
        slot: sig.slot,
        blockTime: sig.blockTime,
        confirmationStatus: sig.confirmationStatus,
      }));
    } catch (error) {
      throw new Error('Unable to fetch transaction history');
    }
  }
}
