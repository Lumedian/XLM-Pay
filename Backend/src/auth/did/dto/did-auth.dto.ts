import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString } from 'class-validator';

export class DIDAuthChallengeDto {
  @ApiProperty({
    description: 'Decentralized Identifier',
    example: 'did:stellar:public',
  })
  @IsString()
  did: string;

  @ApiProperty({
    description: 'Domain for the authentication challenge',
    example: 'stellara.io',
    required: false,
  })
  @IsOptional()
  @IsString()
  domain?: string;
}

export class DIDAuthVerifyDto {
  @ApiProperty({
    description: 'Authentication challenge received from server',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsString()
  challenge: string;

  @ApiProperty({
    description: 'Decentralized Identifier',
    example: 'did:stellar:public',
  })
  @IsString()
  did: string;

  @ApiProperty({
    description: 'Signature of the challenge message',
    example: 'base64_encoded_signature',
  })
  @IsString()
  signature: string;

  @ApiProperty({
    description: 'Verification method ID used for signing',
    example: 'did:stellar:public#key-1',
  })
  @IsString()
  verificationMethodId: string;
}

export class DIDAuthLoginDto extends DIDAuthVerifyDto {}

export class DIDAuthResponseDto {
  @ApiProperty({
    description: 'Authentication challenge for client to sign',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsString()
  challenge?: string;

  @ApiProperty({
    description: 'Challenge expiration time',
    example: '2023-12-01T12:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({
    description: 'Domain that issued the challenge',
    example: 'stellara.io',
  })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiProperty({
    description: 'Whether the signature was verified successfully',
    example: true,
  })
  @IsOptional()
  verified?: boolean;

  @ApiProperty({
    description: 'Decentralized Identifier',
    example: 'did:stellar:public',
  })
  @IsOptional()
  @IsString()
  did?: string;

  @ApiProperty({
    description: 'Verification method used',
    example: 'did:stellar:public#key-1',
  })
  @IsOptional()
  @IsString()
  verificationMethod?: string;

  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiProperty({
    description: 'User information',
    type: 'object',
  })
  @IsOptional()
  user?: {
    id: string;
    did: string;
    walletAddress?: string;
    email?: string;
    createdAt: string;
    lastLoginAt: string;
  };
}

export class CredentialCheckDto {
  @ApiProperty({
    description: 'Decentralized Identifier to check',
    example: 'did:stellar:public',
  })
  @IsString()
  did: string;

  @ApiProperty({
    description: 'Type of credential to check for',
    example: 'KYCVerifiedCredential',
  })
  @IsString()
  credentialType: string;

  @ApiProperty({
    description: 'Optional issuer DID to verify against',
    example: 'did:stellar:trusted-issuer',
    required: false,
  })
  @IsOptional()
  @IsString()
  issuer?: string;
}

export class CredentialCheckResponseDto {
  @ApiProperty({
    description: 'Whether the credential exists and is valid',
    example: true,
  })
  hasCredential: boolean;

  @ApiProperty({
    description: 'List of verified credentials',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        type: { type: 'array', items: { type: 'string' } },
        issuer: { type: 'string' },
        issuanceDate: { type: 'string' },
        expirationDate: { type: 'string' },
        claims: { type: 'object' },
      },
    },
  })
  credentials: any[];
}
