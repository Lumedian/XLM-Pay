import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CrossChainRouterService } from '../services/cross-chain-router.service';
import { ChainAdapterService } from '../services/chain-adapter.service';
import { CreateCrossChainMessageDto, QueryRouteDto, RegisterChainAdapterDto } from '../dto/create-cross-chain-message.dto';

@Controller('cross-chain-router')
@ApiTags('cross-chain-router')
export class CrossChainRouterController {
  private readonly logger = new Logger(CrossChainRouterController.name);

  constructor(
    private readonly routerService: CrossChainRouterService,
    private readonly chainAdapterService: ChainAdapterService,
  ) {}

  @Post('messages')
  @HttpCode(201)
  @ApiOperation({ summary: 'Initiate a cross-chain message' })
  @ApiResponse({
    status: 201,
    description: 'Message initiated successfully',
  })
  async initiateMessage(
    @Body() dto: CreateCrossChainMessageDto,
  ): Promise<any> {
    return await this.routerService.initiateMessage(dto);
  }

  @Get('messages/:messageId')
  @ApiOperation({ summary: 'Query message status' })
  async queryMessageStatus(@Param('messageId') messageId: string): Promise<any> {
    return await this.routerService.queryMessageStatus(messageId);
  }

  @Post('routes/query')
  @ApiOperation({ summary: 'Query a route between two chains' })
  async queryRoute(@Body() query: QueryRouteDto): Promise<any> {
    return await this.routerService.queryRoute(query);
  }

  @Get('routes')
  @ApiOperation({ summary: 'Get all active routes' })
  async getRoutes(): Promise<any> {
    return await this.routerService.getRoutes();
  }

  @Get('chains/supported')
  @ApiOperation({ summary: 'Get all supported blockchains' })
  async getSupportedChains(): Promise<any> {
    return await this.routerService.getSupportedChains();
  }

  @Post('chains/register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new chain adapter' })
  async registerChain(@Body() dto: RegisterChainAdapterDto): Promise<any> {
    return await this.chainAdapterService.registerChainAdapter({
      blockchain: dto.blockchain,
      rpcEndpoint: dto.rpcEndpoint,
      wsEndpoint: dto.wsEndpoint,
      chainId: dto.chainId,
      avgBlockTime: dto.avgBlockTime,
      finalityBlocks: dto.finalityBlocks,
    });
  }

  @Get('history/:address')
  @ApiOperation({ summary: 'Get message history for an address' })
  async getMessageHistory(
    @Param('address') address: string,
  ): Promise<any> {
    return await this.routerService.getMessageHistoryForAddress(address);
  }
}
