import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityService } from './identity.service';
import { WalletIdentityController } from './wallet-identity.controller';
import { WalletIdentityService } from './wallet-identity.service';
import { AccountRecoveryController } from './account-recovery.controller';
import { AccountRecoveryService } from './account-recovery.service';
import { PrismaModule } from '../prisma.module';
import { NotificationService } from './mock-notification.service';
import { StellarService, EthereumService, SolanaService } from './crypto-services';

@Module({
  imports: [PrismaModule],
  controllers: [IdentityController, WalletIdentityController, AccountRecoveryController],
  providers: [
    IdentityService,
    WalletIdentityService,
    AccountRecoveryService,
    NotificationService,
    StellarService,
    EthereumService,
    SolanaService,
  ],
  exports: [IdentityService, WalletIdentityService, AccountRecoveryService],
})
export class IdentityModule {}
