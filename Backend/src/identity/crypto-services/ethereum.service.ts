import { Injectable } from '@nestjs/common';
import { ethers } from 'ethers';

@Injectable()
export class EthereumService {
  private readonly provider: ethers.providers.Provider;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(
      'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161'
    );
  }

  isValidAddress(address: string): boolean {
    return ethers.utils.isAddress(address);
  }

  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      const recoveredAddress = ethers.utils.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === publicKey.toLowerCase();
    } catch (error) {
      return false;
    }
  }

  async getAccountBalance(address: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(address);
      return ethers.utils.formatEther(balance);
    } catch (error) {
      throw new Error('Unable to fetch account balance');
    }
  }

  async getTransactionCount(address: string): Promise<number> {
    try {
      return await this.provider.getTransactionCount(address);
    } catch (error) {
      throw new Error('Unable to fetch transaction count');
    }
  }

  async getAccountInfo(address: string) {
    try {
      const [balance, nonce] = await Promise.all([
        this.getAccountBalance(address),
        this.getTransactionCount(address),
      ]);

      return {
        address,
        balance,
        nonce,
        network: 'sepolia',
      };
    } catch (error) {
      throw new Error('Unable to fetch account info');
    }
  }
}
