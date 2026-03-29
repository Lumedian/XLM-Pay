import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  BuyerApprovalDto,
  ConnectAccountingProviderDto,
  CreateDiscountAuctionDto,
  CreateSupplyChainInvoiceDto,
  DistributeWaterfallDto,
  HandleDefaultDto,
  ImportAccountingInvoiceDto,
  ListSupplyChainInvoicesQueryDto,
  PlaceAuctionBidDto,
  TokenizeInvoiceDto,
  VerifySupplyChainInvoiceDto,
} from './dto/supply-chain-finance.dto';
import { SupplyChainFinanceService } from './supply-chain-finance.service';

@Controller('supply-chain-finance')
export class SupplyChainFinanceController {
  constructor(private readonly supplyChainFinanceService: SupplyChainFinanceService) {}

  @Post('invoices')
  createInvoice(@Body() dto: CreateSupplyChainInvoiceDto) {
    return this.supplyChainFinanceService.createInvoice(dto);
  }

  @Get('invoices')
  listInvoices(@Query() query: ListSupplyChainInvoicesQueryDto) {
    return this.supplyChainFinanceService.listInvoices(query);
  }

  @Get('invoices/:invoiceId')
  getInvoice(@Param('invoiceId') invoiceId: string) {
    return this.supplyChainFinanceService.getInvoice(invoiceId);
  }

  @Post('invoices/:invoiceId/verify')
  verifyInvoice(@Param('invoiceId') invoiceId: string, @Body() dto: VerifySupplyChainInvoiceDto) {
    return this.supplyChainFinanceService.verifyInvoice(invoiceId, dto);
  }

  @Post('invoices/:invoiceId/buyer-approval')
  approveInvoiceByBuyer(@Param('invoiceId') invoiceId: string, @Body() dto: BuyerApprovalDto) {
    return this.supplyChainFinanceService.approveInvoiceByBuyer(invoiceId, dto);
  }

  @Post('invoices/:invoiceId/tokenize')
  tokenizeInvoice(@Param('invoiceId') invoiceId: string, @Body() dto: TokenizeInvoiceDto) {
    return this.supplyChainFinanceService.tokenizeInvoice(invoiceId, dto);
  }

  @Post('invoices/:invoiceId/auctions')
  createAuction(@Param('invoiceId') invoiceId: string, @Body() dto: CreateDiscountAuctionDto) {
    return this.supplyChainFinanceService.createAuction(invoiceId, dto);
  }

  @Post('auctions/:auctionId/bids')
  placeBid(@Param('auctionId') auctionId: string, @Body() dto: PlaceAuctionBidDto) {
    return this.supplyChainFinanceService.placeBid(auctionId, dto);
  }

  @Post('auctions/:auctionId/award')
  awardAuction(@Param('auctionId') auctionId: string) {
    return this.supplyChainFinanceService.awardAuction(auctionId);
  }

  @Post('invoices/:invoiceId/waterfall/distribute')
  distributePaymentWaterfall(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: DistributeWaterfallDto,
  ) {
    return this.supplyChainFinanceService.distributePaymentWaterfall(invoiceId, dto);
  }

  @Post('invoices/:invoiceId/default')
  handleDefault(@Param('invoiceId') invoiceId: string, @Body() dto: HandleDefaultDto) {
    return this.supplyChainFinanceService.handleDefault(invoiceId, dto);
  }

  @Post('accounting/connections')
  connectAccountingProvider(@Body() dto: ConnectAccountingProviderDto) {
    return this.supplyChainFinanceService.connectAccountingProvider(dto);
  }

  @Post('accounting/import')
  importInvoiceFromAccounting(@Body() dto: ImportAccountingInvoiceDto) {
    return this.supplyChainFinanceService.importInvoiceFromAccounting(dto);
  }
}
