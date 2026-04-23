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
  Query,
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
import { WalletIdentityService, LinkWalletDto, VerifyWalletDto, CreateWalletChallengeDto } from './wallet-identity.service';
import { PrivacyLevel } from '@prisma/client';

@ApiTags('wallet-identity')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('wallet-identity')
export class WalletIdentityController {
  constructor(private readonly walletIdentityService: WalletIdentityService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all linked wallets',
    description: 'Retrieve all wallet identities linked to the current user account',
  })
  @ApiResponse({
    status: 200,
    description: 'Linked wallets retrieved successfully',
  })
  async getWallets(@CurrentUser() user: any) {
    return this.walletIdentityService.getUserWallets(user.id);
  }

  @Post('link')
  @ApiOperation({
    summary: 'Link a new wallet',
    description: 'Link a new wallet address to the user account',
  })
  @ApiResponse({
    status: 201,
    description: 'Wallet linked successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Wallet already linked',
  })
  async linkWallet(@CurrentUser() user: any, @Body() linkData: LinkWalletDto) {
    return this.walletIdentityService.linkWallet(user.id, linkData);
  }

  @Delete(':walletId')
  @ApiOperation({
    summary: 'Unlink a wallet',
    description: 'Remove a linked wallet from the user account',
  })
  @ApiParam({
    name: 'walletId',
    description: 'ID of the wallet to unlink',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet unlinked successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async unlinkWallet(@CurrentUser() user: any, @Param('walletId') walletId: string) {
    await this.walletIdentityService.unlinkWallet(user.id, walletId);
    return { message: 'Wallet unlinked successfully' };
  }

  @Post(':walletId/verify/challenge')
  @ApiOperation({
    summary: 'Create wallet verification challenge',
    description: 'Create a signature verification challenge for a wallet',
  })
  @ApiParam({
    name: 'walletId',
    description: 'ID of the wallet to verify',
  })
  @ApiResponse({
    status: 201,
    description: 'Verification challenge created',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async createVerificationChallenge(
    @CurrentUser() user: any,
    @Param('walletId') walletId: string,
    @Body() challengeData: CreateWalletChallengeDto
  ) {
    return this.walletIdentityService.createVerificationChallenge(user.id, walletId, challengeData);
  }

  @Post(':walletId/verify')
  @ApiOperation({
    summary: 'Verify wallet ownership',
    description: 'Complete wallet verification using a signature challenge response',
  })
  @ApiParam({
    name: 'walletId',
    description: 'ID of the wallet to verify',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Verification failed or challenge invalid',
  })
  async verifyWallet(
    @CurrentUser() user: any,
    @Param('walletId') walletId: string,
    @Body() verifyData: VerifyWalletDto
  ) {
    return this.walletIdentityService.verifyWallet(user.id, verifyData);
  }

  @Put(':walletId/privacy')
  @ApiOperation({
    summary: 'Update wallet privacy settings',
    description: 'Update the privacy level for a linked wallet',
  })
  @ApiParam({
    name: 'walletId',
    description: 'ID of the wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'Privacy settings updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async updateWalletPrivacy(
    @CurrentUser() user: any,
    @Param('walletId') walletId: string,
    @Body('privacyLevel') privacyLevel: PrivacyLevel
  ) {
    return this.walletIdentityService.updateWalletPrivacy(user.id, walletId, privacyLevel);
  }

  @Put(':walletId/nickname')
  @ApiOperation({
    summary: 'Update wallet nickname',
    description: 'Update the nickname for a linked wallet',
  })
  @ApiParam({
    name: 'walletId',
    description: 'ID of the wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'Nickname updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Wallet not found',
  })
  async updateWalletNickname(
    @CurrentUser() user: any,
    @Param('walletId') walletId: string,
    @Body('nickname') nickname: string
  ) {
    return this.walletIdentityService.updateWalletNickname(user.id, walletId, nickname);
  }
}
