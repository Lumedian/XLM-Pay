import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Patch,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { LongevityService } from './longevity.service';
import { PredictionMarketService } from './prediction-market.service';
import {
  CreateMarketDto,
  PlacePositionDto,
  ResolveMarketDto,
  CreateExpertRatingDto,
  CreateFundingAllocationDto,
  CreateDiscussionDto,
  CreateReplyDto,
  ResearchQueryDto,
  TrialQueryDto,
} from './dto';

@ApiTags('longevity')
@ApiBearerAuth()
@Controller('longevity')
export class LongevityController {
  constructor(
    private readonly longevityService: LongevityService,
    private readonly predictionMarketService: PredictionMarketService,
  ) {}

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Get longevity platform dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Platform-wide stats' })
  getStats() {
    return this.longevityService.getStats();
  }

  // ─── Research Papers ───────────────────────────────────────────────────────

  @Get('research')
  @ApiOperation({ summary: 'List longevity research papers (PubMed, bioRxiv, medRxiv)' })
  @ApiResponse({ status: 200, description: 'Paginated research papers' })
  getResearch(@Query() query: ResearchQueryDto) {
    return this.longevityService.findAllResearch(query);
  }

  @Get('research/:id')
  @ApiOperation({ summary: 'Get a specific research paper with ratings and discussions' })
  @ApiParam({ name: 'id', description: 'Research paper ID' })
  getResearchById(@Param('id') id: string) {
    return this.longevityService.findOneResearch(id);
  }

  @Post('research/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger sync of longevity research from PubMed, bioRxiv, and medRxiv',
  })
  @ApiResponse({ status: 200, description: 'Sync results' })
  syncResearch() {
    return this.longevityService.syncResearch();
  }

  // ─── Clinical Trials ───────────────────────────────────────────────────────

  @Get('trials')
  @ApiOperation({
    summary: 'List clinical trials tracking metformin, rapamycin, senolytics and 20+ other longevity interventions',
  })
  getTrials(@Query() query: TrialQueryDto) {
    return this.longevityService.getTrials({
      intervention: query.intervention,
      status: query.status,
      phase: query.phase,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  @Get('trials/:id')
  @ApiOperation({ summary: 'Get a specific clinical trial' })
  @ApiParam({ name: 'id', description: 'Trial ID' })
  getTrial(@Param('id') id: string) {
    return this.longevityService.getTrial(id);
  }

  @Post('trials/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger sync of clinical trials from ClinicalTrials.gov' })
  syncTrials() {
    return this.longevityService.syncTrials();
  }

  // ─── Prediction Markets ────────────────────────────────────────────────────

  @Get('markets')
  @ApiOperation({ summary: 'List longevity prediction markets' })
  getMarkets(@Query('status') status?: string) {
    return this.predictionMarketService.findAll(status);
  }

  @Get('markets/:id')
  @ApiOperation({ summary: 'Get a specific prediction market with recent positions' })
  @ApiParam({ name: 'id', description: 'Market ID' })
  getMarket(@Param('id') id: string) {
    return this.predictionMarketService.findOne(id);
  }

  @Post('markets')
  @ApiOperation({
    summary: 'Create a longevity prediction market (e.g. "First person to 150", "Mouse lifespan record")',
  })
  @ApiResponse({ status: 201, description: 'Market created' })
  createMarket(
    @Body() dto: CreateMarketDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.predictionMarketService.createMarket(dto, userId);
  }

  @Post('markets/:id/position')
  @ApiOperation({ summary: 'Place a YES or NO position on a prediction market' })
  @ApiParam({ name: 'id', description: 'Market ID' })
  @ApiResponse({ status: 201, description: 'Position placed with updated market prices' })
  placePosition(
    @Param('id') id: string,
    @Body() dto: PlacePositionDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.predictionMarketService.placePosition(id, dto, userId ?? 'anonymous');
  }

  @Patch('markets/:id/resolve')
  @ApiOperation({ summary: 'Resolve a prediction market and calculate payouts' })
  @ApiParam({ name: 'id', description: 'Market ID' })
  resolveMarket(@Param('id') id: string, @Body() dto: ResolveMarketDto) {
    return this.predictionMarketService.resolveMarket(id, dto.resolution);
  }

  // ─── Expert Ratings ────────────────────────────────────────────────────────

  @Get('expert-ratings')
  @ApiOperation({ summary: 'List expert consensus ratings (optionally filtered by research)' })
  getExpertRatings(@Query('researchId') researchId?: string) {
    return this.longevityService.getExpertRatings(researchId);
  }

  @Post('expert-ratings')
  @ApiOperation({ summary: 'Submit an expert rating for a research paper' })
  @ApiResponse({ status: 201, description: 'Rating submitted and impact score updated' })
  submitExpertRating(@Body() dto: CreateExpertRatingDto) {
    return this.longevityService.createExpertRating(dto);
  }

  // ─── Funding ───────────────────────────────────────────────────────────────

  @Get('funding')
  @ApiOperation({ summary: 'List funding allocations for promising longevity research' })
  getFunding(@Query('researchId') researchId?: string) {
    return this.longevityService.getFundingAllocations(researchId);
  }

  @Post('funding')
  @ApiOperation({ summary: 'Allocate funding to a longevity research paper' })
  @ApiResponse({ status: 201, description: 'Funding allocation created (PENDING approval)' })
  allocateFunding(
    @Body() dto: CreateFundingAllocationDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.longevityService.createFundingAllocation(dto, userId ?? 'anonymous');
  }

  @Patch('funding/:id/approve')
  @ApiOperation({ summary: 'Approve a pending funding allocation' })
  @ApiParam({ name: 'id', description: 'Funding allocation ID' })
  approveFunding(@Param('id') id: string) {
    return this.longevityService.approveFunding(id);
  }

  // ─── Community Discussions ─────────────────────────────────────────────────

  @Get('discussions')
  @ApiOperation({ summary: 'List community discussions and debates' })
  getDiscussions(
    @Query('researchId') researchId?: string,
    @Query('category') category?: string,
  ) {
    return this.longevityService.getDiscussions(researchId, category);
  }

  @Get('discussions/:id')
  @ApiOperation({ summary: 'Get a discussion thread with all replies' })
  @ApiParam({ name: 'id', description: 'Discussion ID' })
  getDiscussion(@Param('id') id: string) {
    return this.longevityService.getDiscussion(id);
  }

  @Post('discussions')
  @ApiOperation({ summary: 'Create a new community discussion or debate' })
  @ApiResponse({ status: 201, description: 'Discussion created' })
  createDiscussion(
    @Body() dto: CreateDiscussionDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.longevityService.createDiscussion(dto, userId ?? 'anonymous');
  }

  @Post('discussions/:id/replies')
  @ApiOperation({ summary: 'Reply to a discussion thread' })
  @ApiParam({ name: 'id', description: 'Discussion ID' })
  @ApiResponse({ status: 201, description: 'Reply posted' })
  replyToDiscussion(
    @Param('id') id: string,
    @Body() dto: CreateReplyDto,
    @Headers('x-user-id') userId: string,
  ) {
    return this.longevityService.createReply(id, dto, userId ?? 'anonymous');
  }

  @Patch('discussions/:id/upvote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upvote a discussion' })
  upvoteDiscussion(@Param('id') id: string) {
    return this.longevityService.upvoteDiscussion(id);
  }

  @Patch('discussions/replies/:id/upvote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upvote a reply' })
  upvoteReply(@Param('id') id: string) {
    return this.longevityService.upvoteReply(id);
  }
}
