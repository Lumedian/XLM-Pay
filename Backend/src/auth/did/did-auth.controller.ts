import {
  Controller,
  Post,
  Body,
  Get,
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
  ApiBody,
} from '@nestjs/swagger';
import { DIDAuthService } from './did-auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  DIDAuthChallengeDto,
  DIDAuthVerifyDto,
  DIDAuthLoginDto,
  DIDAuthResponseDto,
  CredentialCheckDto,
  CredentialCheckResponseDto,
} from './dto/did-auth.dto';

@ApiTags('DID Authentication')
@Controller('auth/did')
export class DIDAuthController {
  constructor(private readonly didAuthService: DIDAuthService) {}

  @Post('challenge')
  @ApiOperation({
    summary: 'Generate authentication challenge',
    description: 'Generates a challenge for DID-based authentication that the client must sign',
  })
  @ApiBody({ type: DIDAuthChallengeDto })
  @ApiResponse({
    status: 201,
    description: 'Challenge generated successfully',
    type: DIDAuthResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'DID not found',
  })
  @ApiResponse({
    status: 401,
    description: 'DID is deactivated',
  })
  async generateChallenge(
    @Body() body: DIDAuthChallengeDto,
  ): Promise<DIDAuthResponseDto> {
    return this.didAuthService.generateChallenge(body.did, body.domain);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify DID signature',
    description: 'Verifies the signature of an authentication challenge',
  })
  @ApiBody({ type: DIDAuthVerifyDto })
  @ApiResponse({
    status: 200,
    description: 'Signature verified successfully',
    type: DIDAuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired challenge, or invalid signature',
  })
  @ApiResponse({
    status: 404,
    description: 'DID or verification method not found',
  })
  async verifySignature(
    @Body() body: DIDAuthVerifyDto,
  ): Promise<DIDAuthResponseDto> {
    return this.didAuthService.verifySignature(
      body.challenge,
      body.did,
      body.signature,
      body.verificationMethodId,
    );
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login with DID',
    description: 'Complete DID-based authentication and receive JWT tokens',
  })
  @ApiBody({ type: DIDAuthLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: DIDAuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed',
  })
  async loginWithDID(
    @Body() body: DIDAuthLoginDto,
  ): Promise<DIDAuthResponseDto> {
    return this.didAuthService.loginWithDID(
      body.challenge,
      body.did,
      body.signature,
      body.verificationMethodId,
    );
  }

  @Post('authenticate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Authenticate API request with DID',
    description: 'Authenticate an API request using DID signature (for service-to-service auth)',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Authentication failed',
  })
  async authenticateWithDID(
    @Body()
    body: {
      did: string;
      signature: string;
      message: string;
      verificationMethodId: string;
    },
  ): Promise<{ authenticated: boolean }> {
    const authenticated = await this.didAuthService.authenticateWithDID(
      body.did,
      body.signature,
      body.message,
      body.verificationMethodId,
    );

    return { authenticated };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('credentials')
  @ApiOperation({
    summary: 'Get user verified credentials',
    description: 'Retrieve all verified credentials for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Credentials retrieved successfully',
    type: CredentialCheckResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getVerifiedCredentials(
    @CurrentUser() user: any,
  ): Promise<CredentialCheckResponseDto> {
    const credentials = await this.didAuthService.getVerifiedCredentials(user.did);
    
    return {
      hasCredential: credentials.length > 0,
      credentials,
    };
  }

  @Post('check-credential')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Check if DID has specific credential',
    description: 'Check if a DID has a specific type of credential from a specific issuer',
  })
  @ApiBody({ type: CredentialCheckDto })
  @ApiResponse({
    status: 200,
    description: 'Credential check completed',
    type: CredentialCheckResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'DID not found',
  })
  async checkCredential(
    @Body() body: CredentialCheckDto,
  ): Promise<{ hasCredential: boolean }> {
    const hasCredential = await this.didAuthService.hasCredential(
      body.did,
      body.credentialType,
      body.issuer,
    );

    return { hasCredential };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('profile')
  @ApiOperation({
    summary: 'Get DID-based user profile',
    description: 'Get user profile information based on DID authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getDIDProfile(@CurrentUser() user: any): Promise<any> {
    const credentials = await this.didAuthService.getVerifiedCredentials(user.did);
    
    return {
      id: user.id,
      did: user.did,
      walletAddress: user.walletAddress,
      verifiedCredentials: credentials,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}
