import { Module } from '@nestjs/common';
import { UniswapV3Integration } from './uniswap-v3.integration';
import { CurveIntegration } from './curve.integration';
import { BalancerIntegration } from './balancer.integration';
import { DexFactory } from './dex.factory';

@Module({
  providers: [
    UniswapV3Integration,
    CurveIntegration,
    BalancerIntegration,
    DexFactory,
  ],
  exports: [
    UniswapV3Integration,
    CurveIntegration,
    BalancerIntegration,
    DexFactory,
  ],
})
export class DexModule {}
