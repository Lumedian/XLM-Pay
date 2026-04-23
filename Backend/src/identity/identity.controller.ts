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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IdentityService, LinkIdentityDto, VerifyIdentityDto, CreateVerificationChallengeDto } from './identity.service';
import { IdentityProvider, PrivacyLevel, VerificationMethod } from '@prisma/client';

@ApiTags('identity')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('identity')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all linked identities',
    description: 'Retrieve all identities linked to the current user account',
  })
  @ApiResponse({
    status: 200,
    description: 'Linked identities retrieved successfully',
  })
  async getIdentities(@CurrentUser() user: any) {
    return this.identityService.getUserIdentities(user.id);
  }

  @Post('link')
  @ApiOperation({
    summary: 'Link a new identity',
    description: 'Link a new OAuth or social identity to the user account',
  })
  @ApiResponse({
    status: 201,
    description: 'Identity linked successfully',
  })
  @ApiResponse({
    status: 409,
    description: 'Identity already linked',
  })
  async linkIdentity(@CurrentUser() user: any, @Body() linkData: LinkIdentityDto) {
    return this.identityService.linkIdentity(user.id, linkData);
  }

  @Delete(':identityId')
  @ApiOperation({
    summary: 'Unlink an identity',
    description: 'Remove a linked identity from the user account',
  })
  @ApiParam({
    name: 'identityId',
    description: 'ID of the identity to unlink',
  })
  @ApiResponse({
    status: 200,
    description: 'Identity unlinked successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Identity not found',
  })
  async unlinkIdentity(@CurrentUser() user: any, @Param('identityId') identityId: string) {
    await this.identityService.unlinkIdentity(user.id, identityId);
    return { message: 'Identity unlinked successfully' };
  }

  @Post(':identityId/verify/challenge')
  @ApiOperation({
    summary: 'Create verification challenge',
    description: 'Create a verification challenge for an identity',
  })
  @ApiParam({
    name: 'identityId',
    description: 'ID of the identity to verify',
  })
  @ApiResponse({
    status: 201,
    description: 'Verification challenge created',
  })
  @ApiResponse({
    status: 404,
    description: 'Identity not found',
  })
  async createVerificationChallenge(
    @CurrentUser() user: any,
    @Param('identityId') identityId: string,
    @Body() challengeData: CreateVerificationChallengeDto
  ) {
    return this.identityService.createVerificationChallenge(user.id, identityId, challengeData);
  }

  @Post(':identityId/verify')
  @ApiOperation({
    summary: 'Verify identity',
    description: 'Complete identity verification using a challenge response',
  })
  @ApiParam({
    name: 'identityId',
    description: 'ID of the identity to verify',
  })
  @ApiResponse({
    status: 200,
    description: 'Identity verified successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Verification failed or challenge invalid',
  })
  async verifyIdentity(
    @CurrentUser() user: any,
    @Param('identityId') identityId: string,
    @Body() verifyData: VerifyIdentityDto
  ) {
    return this.identityService.verifyIdentity(user.id, verifyData);
  }

  @Put(':identityId/privacy')
  @ApiOperation({
    summary: 'Update identity privacy settings',
    description: 'Update the privacy level for a linked identity',
  })
  @ApiParam({
    name: 'identityId',
    description: 'ID of the identity',
  })
  @ApiResponse({
    status: 200,
    description: 'Privacy settings updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Identity not found',
  })
  async updateIdentityPrivacy(
    @CurrentUser() user: any,
    @Param('identityId') identityId: string,
    @Body('privacyLevel') privacyLevel: PrivacyLevel
  ) {
    return this.identityService.updateIdentityPrivacy(user.id, identityId, privacyLevel);
  }

  @Put(':identityId/primary')
  @ApiOperation({
    summary: 'Set primary identity',
    description: 'Set an identity as the primary identity for its provider',
  })
  @ApiParam({
    name: 'identityId',
    description: 'ID of the identity to set as primary',
  })
  @ApiResponse({
    status: 200,
    description: 'Primary identity updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Identity not found',
  })
  async setPrimaryIdentity(@CurrentUser() user: any, @Param('identityId') identityId: string) {
    return this.identityService.setPrimaryIdentity(user.id, identityId);
  }
}
