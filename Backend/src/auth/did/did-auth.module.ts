import { Module } from '@nestjs/common';
import { DIDAuthController } from './did/did-auth.controller';
import { DIDAuthService } from './did/did-auth.service';
import { DIDRegistryService } from '../did/did-registry.service';
import { StellarModule } from '../stellar/stellar.module';
import { CryptoModule } from '../crypto/crypto.module';

@Module({
  imports: [StellarModule, CryptoModule],
  controllers: [DIDAuthController],
  providers: [DIDAuthService, DIDRegistryService],
  exports: [DIDAuthService, DIDRegistryService],
})
export class DIDAuthModule {}
