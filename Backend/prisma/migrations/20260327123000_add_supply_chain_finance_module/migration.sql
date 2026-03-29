-- CreateEnum
CREATE TYPE "SupplyChainFinanceInvoiceStatus" AS ENUM ('DRAFT', 'PENDING_VERIFICATION', 'VERIFIED', 'TOKENIZED', 'AUCTION_LIVE', 'FUNDED', 'SETTLED', 'DEFAULTED', 'COLLECTIONS', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplyChainVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "SupplyChainVerificationType" AS ENUM ('DOCUMENT_REVIEW', 'ACCOUNTING_MATCH', 'BUYER_CONFIRMATION', 'AML_SCREENING');

-- CreateEnum
CREATE TYPE "SupplyChainApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SupplyChainComplianceStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "SupplyChainAccountingProvider" AS ENUM ('QUICKBOOKS', 'XERO');

-- CreateEnum
CREATE TYPE "SupplyChainRiskGrade" AS ENUM ('A', 'B', 'C', 'D', 'E');

-- CreateEnum
CREATE TYPE "SupplyChainAuctionStatus" AS ENUM ('DRAFT', 'LIVE', 'CLOSED', 'AWARDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplyChainBidStatus" AS ENUM ('ACTIVE', 'WINNING', 'OUTBID', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SupplyChainWaterfallStatus" AS ENUM ('PENDING', 'DISTRIBUTED', 'SETTLED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "SupplyChainCollectionStatus" AS ENUM ('OPEN', 'NEGOTIATING', 'ESCALATED', 'RECOVERED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "SupplyChainIntegrationStatus" AS ENUM ('CONNECTED', 'DEGRADED', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "scf_invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "seller_user_id" TEXT NOT NULL,
    "buyer_user_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "debtor_email" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "uploaded_document_url" TEXT NOT NULL,
    "document_hash" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "status" "SupplyChainFinanceInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "verification_status" "SupplyChainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "buyer_approval_status" "SupplyChainApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "compliance_status" "SupplyChainComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "accounting_provider" "SupplyChainAccountingProvider",
    "accounting_reference" TEXT,
    "external_invoice_id" TEXT,
    "nft_token_id" TEXT,
    "nft_metadata_uri" TEXT,
    "smart_contract_address" TEXT,
    "risk_score" INTEGER NOT NULL DEFAULT 50,
    "risk_grade" "SupplyChainRiskGrade" NOT NULL DEFAULT 'C',
    "advance_rate_bps" INTEGER NOT NULL DEFAULT 8000,
    "reserve_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "financed_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "expected_yield_bps" INTEGER NOT NULL DEFAULT 0,
    "regulatory_flags" JSONB,
    "verified_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "tokenized_at" TIMESTAMP(3),
    "funded_at" TIMESTAMP(3),
    "settled_at" TIMESTAMP(3),
    "defaulted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_invoice_verifications" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "verification_type" "SupplyChainVerificationType" NOT NULL DEFAULT 'DOCUMENT_REVIEW',
    "status" "SupplyChainVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewer_user_id" TEXT,
    "notes" TEXT,
    "verification_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_invoice_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_discount_auctions" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "reserve_discount_bps" INTEGER NOT NULL DEFAULT 1200,
    "minimum_bid_amount" DECIMAL(18,2) NOT NULL,
    "funding_target_amount" DECIMAL(18,2) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "status" "SupplyChainAuctionStatus" NOT NULL DEFAULT 'DRAFT',
    "winning_bid_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_discount_auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_auction_bids" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "investor_user_id" TEXT NOT NULL,
    "investor_wallet" TEXT,
    "discount_rate_bps" INTEGER NOT NULL,
    "bid_amount" DECIMAL(18,2) NOT NULL,
    "expected_yield_bps" INTEGER NOT NULL,
    "status" "SupplyChainBidStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_auction_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_payment_waterfalls" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "auction_id" TEXT,
    "gross_payment_amount" DECIMAL(18,2) NOT NULL,
    "servicing_fee_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "platform_fee_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "investor_payout_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "seller_residual_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "SupplyChainWaterfallStatus" NOT NULL DEFAULT 'PENDING',
    "distribution_transaction_id" TEXT,
    "distribution_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_payment_waterfalls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_collection_cases" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "status" "SupplyChainCollectionStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_agency" TEXT,
    "outstanding_amount" DECIMAL(18,2) NOT NULL,
    "recovered_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_action_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "scf_collection_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scf_accounting_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "seller_user_id" TEXT NOT NULL,
    "provider" "SupplyChainAccountingProvider" NOT NULL,
    "external_organization_id" TEXT NOT NULL,
    "status" "SupplyChainIntegrationStatus" NOT NULL DEFAULT 'CONNECTED',
    "credentials" JSONB,
    "metadata" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scf_accounting_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scf_invoices_nft_token_id_key" ON "scf_invoices"("nft_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "scf_invoices_seller_user_id_invoice_number_key" ON "scf_invoices"("seller_user_id", "invoice_number");

-- CreateIndex
CREATE INDEX "scf_invoices_tenant_id_created_at_idx" ON "scf_invoices"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "scf_invoices_seller_user_id_status_idx" ON "scf_invoices"("seller_user_id", "status");

-- CreateIndex
CREATE INDEX "scf_invoices_buyer_user_id_buyer_approval_status_idx" ON "scf_invoices"("buyer_user_id", "buyer_approval_status");

-- CreateIndex
CREATE INDEX "scf_invoices_verification_status_compliance_status_idx" ON "scf_invoices"("verification_status", "compliance_status");

-- CreateIndex
CREATE INDEX "scf_invoice_verifications_invoice_id_status_idx" ON "scf_invoice_verifications"("invoice_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scf_discount_auctions_winning_bid_id_key" ON "scf_discount_auctions"("winning_bid_id");

-- CreateIndex
CREATE INDEX "scf_discount_auctions_invoice_id_status_idx" ON "scf_discount_auctions"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "scf_discount_auctions_status_ends_at_idx" ON "scf_discount_auctions"("status", "ends_at");

-- CreateIndex
CREATE INDEX "scf_auction_bids_auction_id_status_idx" ON "scf_auction_bids"("auction_id", "status");

-- CreateIndex
CREATE INDEX "scf_auction_bids_investor_user_id_created_at_idx" ON "scf_auction_bids"("investor_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scf_payment_waterfalls_auction_id_key" ON "scf_payment_waterfalls"("auction_id");

-- CreateIndex
CREATE INDEX "scf_payment_waterfalls_invoice_id_status_idx" ON "scf_payment_waterfalls"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "scf_collection_cases_invoice_id_status_idx" ON "scf_collection_cases"("invoice_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scf_accounting_connections_seller_user_id_provider_key" ON "scf_accounting_connections"("seller_user_id", "provider");

-- CreateIndex
CREATE INDEX "scf_accounting_connections_tenant_id_provider_idx" ON "scf_accounting_connections"("tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "scf_invoice_verifications" ADD CONSTRAINT "scf_invoice_verifications_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "scf_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_discount_auctions" ADD CONSTRAINT "scf_discount_auctions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "scf_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_discount_auctions" ADD CONSTRAINT "scf_discount_auctions_winning_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "scf_auction_bids"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_auction_bids" ADD CONSTRAINT "scf_auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "scf_discount_auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_payment_waterfalls" ADD CONSTRAINT "scf_payment_waterfalls_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "scf_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_payment_waterfalls" ADD CONSTRAINT "scf_payment_waterfalls_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "scf_discount_auctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scf_collection_cases" ADD CONSTRAINT "scf_collection_cases_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "scf_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
