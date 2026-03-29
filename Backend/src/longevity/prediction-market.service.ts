import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MarketStatus, PositionType } from '@prisma/client';
import { CreateMarketDto, PlacePositionDto } from './dto';
import { MarketPriceResult } from './interfaces/longevity.interfaces';

/**
 * Automated Market Maker (AMM) for longevity prediction markets.
 * Uses the CPMM (Constant Product Market Maker) model: x * y = k.
 */
@Injectable()
export class PredictionMarketService {
  private readonly logger = new Logger(PredictionMarketService.name);
  private readonly INITIAL_LIQUIDITY = 100; // $100 initial pool per side

  constructor(private readonly prisma: PrismaService) {}

  async createMarket(dto: CreateMarketDto, createdBy?: string) {
    return this.prisma.longevityMarket.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
        resolveDate: dto.resolveDate ? new Date(dto.resolveDate) : null,
        totalLiquidity: this.INITIAL_LIQUIDITY * 2,
        yesShares: this.INITIAL_LIQUIDITY,
        noShares: this.INITIAL_LIQUIDITY,
        yesPrice: 0.5,
        noPrice: 0.5,
        createdBy: createdBy ?? null,
      },
    });
  }

  async findAll(status?: string) {
    const where = status ? { status: status as MarketStatus } : {};
    return this.prisma.longevityMarket.findMany({
      where,
      include: { _count: { select: { positions: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const market = await this.prisma.longevityMarket.findUnique({
      where: { id },
      include: {
        positions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { positions: true } },
      },
    });
    if (!market) throw new NotFoundException(`Market ${id} not found`);
    return market;
  }

  /**
   * Place a YES or NO position using CPMM pricing.
   * Price = opposite_shares / (yes_shares + no_shares)
   */
  async placePosition(marketId: string, dto: PlacePositionDto, userId: string) {
    const market = await this.prisma.longevityMarket.findUnique({ where: { id: marketId } });
    if (!market) throw new NotFoundException(`Market ${marketId} not found`);
    if (market.status !== MarketStatus.OPEN) {
      throw new BadRequestException('Market is not open for trading');
    }

    const { yesShares, noShares } = market;
    const yS = Number(yesShares);
    const nS = Number(noShares);
    const k = yS * nS; // constant product

    const amount = dto.amount;
    const isYes = dto.position === 'YES';

    // New pool state after adding liquidity to the opposing side
    let newYesShares: number;
    let newNoShares: number;
    let sharesReceived: number;
    let priceAtTime: number;

    if (isYes) {
      priceAtTime = nS / (yS + nS);
      newNoShares = nS + amount;
      newYesShares = k / newNoShares;
      sharesReceived = yS - newYesShares;
    } else {
      priceAtTime = yS / (yS + nS);
      newYesShares = yS + amount;
      newNoShares = k / newYesShares;
      sharesReceived = nS - newNoShares;
    }

    if (sharesReceived <= 0) {
      throw new BadRequestException('Insufficient market liquidity for this position size');
    }

    const newYesPrice = newNoShares / (newYesShares + newNoShares);
    const newNoPrice = newYesShares / (newYesShares + newNoShares);

    // Persist in a transaction
    const [position] = await this.prisma.$transaction([
      this.prisma.marketPosition.create({
        data: {
          marketId,
          userId,
          position: dto.position as PositionType,
          amount,
          shares: sharesReceived,
          priceAtTime,
        },
      }),
      this.prisma.longevityMarket.update({
        where: { id: marketId },
        data: {
          yesShares: newYesShares,
          noShares: newNoShares,
          yesPrice: newYesPrice,
          noPrice: newNoPrice,
          totalLiquidity: Number(market.totalLiquidity) + amount,
        },
      }),
    ]);

    return {
      position,
      marketPrices: { yesPrice: newYesPrice, noPrice: newNoPrice },
    };
  }

  async resolveMarket(marketId: string, resolution: boolean) {
    const market = await this.prisma.longevityMarket.findUnique({ where: { id: marketId } });
    if (!market) throw new NotFoundException(`Market ${marketId} not found`);
    if (market.status !== MarketStatus.OPEN && market.status !== MarketStatus.CLOSED) {
      throw new BadRequestException('Market cannot be resolved in its current state');
    }

    // Calculate payouts for winning positions
    const winningPosition = resolution ? PositionType.YES : PositionType.NO;
    const positions = await this.prisma.marketPosition.findMany({
      where: { marketId, position: winningPosition },
    });

    const totalWinningShares = positions.reduce(
      (sum, p) => sum + Number(p.shares),
      0,
    );
    const totalPool = Number(market.totalLiquidity);

    const payoutUpdates = positions.map((p) => {
      const payout = totalWinningShares > 0
        ? (Number(p.shares) / totalWinningShares) * totalPool
        : 0;
      return this.prisma.marketPosition.update({
        where: { id: p.id },
        data: { payout },
      });
    });

    const [updatedMarket] = await this.prisma.$transaction([
      this.prisma.longevityMarket.update({
        where: { id: marketId },
        data: {
          status: MarketStatus.RESOLVED,
          resolution,
          resolvedAt: new Date(),
        },
      }),
      ...payoutUpdates,
    ]);

    this.logger.log(`Market ${marketId} resolved as ${resolution ? 'YES' : 'NO'}`);
    return updatedMarket;
  }

  getCurrentPrices(market: { yesShares: any; noShares: any }): MarketPriceResult {
    const yS = Number(market.yesShares);
    const nS = Number(market.noShares);
    const total = yS + nS;
    return {
      yesPrice: total > 0 ? nS / total : 0.5,
      noPrice: total > 0 ? yS / total : 0.5,
      yesShares: yS,
      noShares: nS,
    };
  }
}
