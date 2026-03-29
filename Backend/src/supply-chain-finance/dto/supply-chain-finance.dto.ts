import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum SupplyChainAccountingProviderDto {
  QUICKBOOKS = 'QUICKBOOKS',
  XERO = 'XERO',
}

export enum SupplyChainVerificationStatusDto {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
}

export enum SupplyChainApprovalStatusDto {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum SupplyChainAuctionStatusDto {
  DRAFT = 'DRAFT',
  LIVE = 'LIVE',
  CLOSED = 'CLOSED',
  AWARDED = 'AWARDED',
  CANCELLED = 'CANCELLED',
}

export enum SupplyChainCollectionStatusDto {
  OPEN = 'OPEN',
  NEGOTIATING = 'NEGOTIATING',
  ESCALATED = 'ESCALATED',
  RECOVERED = 'RECOVERED',
  WRITTEN_OFF = 'WRITTEN_OFF',
}

export class CreateSupplyChainInvoiceDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @IsNotEmpty()
  sellerUserId: string;

  @IsOptional()
  @IsString()
  buyerUserId?: string;

  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @IsString()
  @IsNotEmpty()
  debtorName: string;

  @IsOptional()
  @IsEmail()
  debtorEmail?: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string = 'USD';

  @IsDateString()
  issueDate: string;

  @IsDateString()
  dueDate: string;

  @IsString()
  @IsNotEmpty()
  uploadedDocumentUrl: string;

  @IsOptional()
  @IsString()
  documentHash?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SupplyChainAccountingProviderDto)
  accountingProvider?: SupplyChainAccountingProviderDto;

  @IsOptional()
  @IsString()
  accountingReference?: string;

  @IsOptional()
  @IsString()
  externalInvoiceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class VerifySupplyChainInvoiceDto {
  @IsEnum(SupplyChainVerificationStatusDto)
  status: SupplyChainVerificationStatusDto;

  @IsOptional()
  @IsString()
  reviewerUserId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  verificationData?: Record<string, unknown>;
}

export class BuyerApprovalDto {
  @IsEnum(SupplyChainApprovalStatusDto)
  status: SupplyChainApprovalStatusDto;

  @IsOptional()
  @IsString()
  approverUserId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class TokenizeInvoiceDto {
  @IsOptional()
  @IsString()
  smartContractAddress?: string;

  @IsOptional()
  @IsString()
  metadataBaseUri?: string;
}

export class CreateDiscountAuctionDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  reserveDiscountBps: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  minimumBidAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  fundingTargetAmount?: number;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;
}

export class PlaceAuctionBidDto {
  @IsString()
  @IsNotEmpty()
  investorUserId: string;

  @IsOptional()
  @IsString()
  investorWallet?: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  discountRateBps: number;

  @IsNumber()
  @Min(1)
  bidAmount: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DistributeWaterfallDto {
  @IsNumber()
  @Min(1)
  grossPaymentAmount: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  servicingFeeBps?: number = 150;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  platformFeeBps?: number = 50;
}

export class HandleDefaultDto {
  @IsOptional()
  @IsString()
  assignedAgency?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  recoveredAmount?: number = 0;

  @IsOptional()
  @IsEnum(SupplyChainCollectionStatusDto)
  collectionStatus?: SupplyChainCollectionStatusDto = SupplyChainCollectionStatusDto.OPEN;
}

export class ConnectAccountingProviderDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsString()
  @IsNotEmpty()
  sellerUserId: string;

  @IsEnum(SupplyChainAccountingProviderDto)
  provider: SupplyChainAccountingProviderDto;

  @IsString()
  @IsNotEmpty()
  externalOrganizationId: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ImportAccountingInvoiceDto {
  @IsString()
  @IsNotEmpty()
  sellerUserId: string;

  @IsEnum(SupplyChainAccountingProviderDto)
  provider: SupplyChainAccountingProviderDto;

  @IsString()
  @IsNotEmpty()
  externalInvoiceId: string;

  @IsString()
  @IsNotEmpty()
  invoiceNumber: string;

  @IsString()
  @IsNotEmpty()
  debtorName: string;

  @IsOptional()
  @IsEmail()
  debtorEmail?: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsDateString()
  issueDate: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  uploadedDocumentUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ListSupplyChainInvoicesQueryDto {
  @IsOptional()
  @IsString()
  sellerUserId?: string;

  @IsOptional()
  @IsString()
  buyerUserId?: string;

  @IsOptional()
  @IsEnum(SupplyChainVerificationStatusDto)
  verificationStatus?: SupplyChainVerificationStatusDto;

  @IsOptional()
  @IsEnum(SupplyChainApprovalStatusDto)
  buyerApprovalStatus?: SupplyChainApprovalStatusDto;

  @IsOptional()
  @IsBoolean()
  onlyOpen?: boolean;
}
