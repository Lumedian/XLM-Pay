import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ValidatorService } from '../services/validator.service';
import { RegisterValidatorDto, SlashValidatorDto } from '../dto/create-cross-chain-message.dto';

@Controller('validators')
@ApiTags('validators')
export class ValidatorController {
  private readonly logger = new Logger(ValidatorController.name);

  constructor(private readonly validatorService: ValidatorService) {}

  @Post('register')
  @HttpCode(201)
  @ApiOperation({ summary: 'Register a new validator' })
  async registerValidator(@Body() dto: RegisterValidatorDto): Promise<any> {
    return await this.validatorService.registerValidator(dto);
  }

  @Post('stake/add')
  @HttpCode(200)
  @ApiOperation({ summary: 'Add stake to a validator' })
  async addStake(@Body() dto: RegisterValidatorDto): Promise<any> {
    return await this.validatorService.addStake(dto);
  }

  @Post('exit')
  @HttpCode(200)
  @ApiOperation({ summary: 'Exit a validator' })
  async exitValidator(
    @Body() body: { validatorAddress: string; chainId: string },
  ): Promise<any> {
    return await this.validatorService.exitValidator(
      body.validatorAddress,
      body.chainId,
    );
  }

  @Post('slash')
  @HttpCode(200)
  @ApiOperation({ summary: 'Slash a validator for misbehavior' })
  async slashValidator(@Body() dto: SlashValidatorDto): Promise<any> {
    return await this.validatorService.slashValidator(dto);
  }

  @Get('set/:chainId')
  @ApiOperation({ summary: 'Get validator set for a chain' })
  async getValidatorSet(@Param('chainId') chainId: string): Promise<any> {
    return await this.validatorService.getValidatorSet(chainId);
  }

  @Get(':validatorAddress/:chainId')
  @ApiOperation({ summary: 'Get validator details' })
  async getValidator(
    @Param('validatorAddress') validatorAddress: string,
    @Param('chainId') chainId: string,
  ): Promise<any> {
    return await this.validatorService.getValidator(validatorAddress, chainId);
  }
}
