import { Module } from '@nestjs/common';
import { DIDRegistryService } from './did-registry.service';
import { DIDRegistryController } from './did-registry.controller';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [StellarModule],
  controllers: [DIDRegistryController],
  providers: [DIDRegistryService],
  exports: [DIDRegistryService],
})
export class DIDModule {}
