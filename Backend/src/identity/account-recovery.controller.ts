import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountRecoveryService, AddRecoveryMethodDto, InitiateRecoveryDto, CompleteRecoveryDto } from './account-recovery.service';
import { VerificationMethod } from '@prisma/client';

@ApiTags('account-recovery')
@ApiBearerAuth('JWT-auth')
@Controller('account-recovery')
export class AccountRecoveryController {
  constructor(private readonly accountRecoveryService: AccountRecoveryService) {}

  @Get('methods')
  @ApiOperation({
    summary: 'Get all recovery methods',
    description: 'Retrieve all account recovery methods for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery methods retrieved successfully',
  })
  async getRecoveryMethods(@CurrentUser() user: any) {
    return this.accountRecoveryService.getUserRecoveryMethods(user.id);
  }

  @Post('methods')
  @ApiOperation({
    summary: 'Add recovery method',
    description: 'Add a new account recovery method',
  })
  @ApiResponse({
    status: 201,
    description: 'Recovery method added successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Recovery method already exists',
  })
  async addRecoveryMethod(@CurrentUser() user: any, @Body() recoveryData: AddRecoveryMethodDto) {
    return this.accountRecoveryService.addRecoveryMethod(user.id, recoveryData);
  }

  @Delete('methods/:methodId')
  @ApiOperation({
    summary: 'Remove recovery method',
    description: 'Remove an account recovery method',
  })
  @ApiParam({
    name: 'methodId',
    description: 'ID of the recovery method to remove',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery method removed successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Recovery method not found',
  })
  async removeRecoveryMethod(@CurrentUser() user: any, @Param('methodId') methodId: string) {
    await this.accountRecoveryService.removeRecoveryMethod(user.id, methodId);
    return { message: 'Recovery method removed successfully' };
  }

  @Put('methods/:methodId/primary')
  @ApiOperation({
    summary: 'Set primary recovery method',
    description: 'Set a recovery method as the primary method',
  })
  @ApiParam({
    name: 'methodId',
    description: 'ID of the recovery method to set as primary',
  })
  @ApiResponse({
    status: 200,
    description: 'Primary recovery method updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Recovery method not found',
  })
  async setPrimaryRecoveryMethod(@CurrentUser() user: any, @Param('methodId') methodId: string) {
    return this.accountRecoveryService.setPrimaryRecoveryMethod(user.id, methodId);
  }

  @Post('methods/:methodId/verify')
  @ApiOperation({
    summary: 'Verify recovery method',
    description: 'Verify a recovery method with a code',
  })
  @ApiParam({
    name: 'methodId',
    description: 'ID of the recovery method to verify',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery method verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid verification code',
  })
  async verifyRecoveryMethod(
    @CurrentUser() user: any,
    @Param('methodId') methodId: string,
    @Body('code') code: string
  ) {
    return this.accountRecoveryService.verifyRecoveryMethod(user.id, methodId, code);
  }

  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate account recovery',
    description: 'Start the account recovery process',
  })
  @ApiResponse({
    status: 201,
    description: 'Account recovery initiated',
  })
  @ApiResponse({
    status: 404,
    description: 'Recovery method not found',
  })
  async initiateRecovery(@Body() recoveryData: InitiateRecoveryDto) {
    return this.accountRecoveryService.initiateRecovery(recoveryData);
  }

  @Post('complete')
  @ApiOperation({
    summary: 'Complete account recovery',
    description: 'Complete the account recovery process',
  })
  @ApiResponse({
    status: 200,
    description: 'Account recovery completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid recovery code or session',
  })
  async completeRecovery(@Body() recoveryData: CompleteRecoveryDto) {
    return this.accountRecoveryService.completeRecovery(recoveryData);
  }
}
